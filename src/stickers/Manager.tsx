// "Sticker packs": add a pack by choosing several picture files, rename it, switch its kind, add or remove pictures, delete it.
// One dialog (a bottom sheet on a phone). Everything is saved as it happens: there is no Save button to forget.
import { useRef, useState, type ChangeEvent } from "react";
import { useT } from "@/i18n/index";
import { Dialog } from "@/screens/profiles/dialog";
import { addItems, FILE_TYPES, itemNameOf, MAX_ITEMS, MAX_PACKS, newPack, withoutItem, withoutPack, withPack, type PackKind, type StickerPack } from "./model";
import { savePacks, uploadItem, usePacks } from "./packs";
import "./stickers.css";

const ACCEPT = FILE_TYPES.join(",");

function KindToggle({ value, onChange, label }: { value: PackKind; onChange: (k: PackKind) => void; label: string }) {
  const t = useT();
  return (
    <div className="stm-kind" role="radiogroup" aria-label={label}>
      {(["sticker", "emoji"] as const).map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}>
          {t(`stk.kind.${k}`)}
        </button>
      ))}
    </div>
  );
}

/** Uploads the files one after another; resolves to what was added and a line per file that was left out. */
async function uploadAll(files: File[], kind: PackKind, say: (key: string, vars: Record<string, string | number>) => string, progress: (done: number, total: number) => void) {
  const added: { name: string; url: string }[] = [];
  const skipped: string[] = [];
  let done = 0;
  for (const f of files) {
    const name = itemNameOf(f.name) || "picture";
    progress(done, files.length);
    if (!FILE_TYPES.includes(f.type)) skipped.push(say("stk.skipType", { name: f.name }));
    else {
      try {
        added.push({ name, url: await uploadItem(f, kind) });
      } catch (e) {
        skipped.push(e instanceof Error && /too big/.test(e.message) ? say("stk.skipBig", { name: f.name }) : say("stk.skipFail", { name: f.name }));
      }
    }
    done++;
  }
  progress(done, files.length);
  return { added, skipped };
}

function PackCard({ pack, onChange, busy, run }: { pack: StickerPack; onChange: (next: StickerPack | null) => void; busy: boolean; run: (job: (progress: (done: number, total: number) => void) => Promise<string[]>) => void }) {
  const t = useT();
  const [name, setName] = useState(pack.name);
  const [ask, setAsk] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const commitName = () => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return setName(pack.name);
    if (clean !== pack.name) onChange({ ...pack, name: clean });
  };
  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    run(async (progress) => {
      const r = await uploadAll(files, pack.kind, t, progress);
      const out = addItems(pack, r.added);
      onChange(out.pack);
      return [...r.skipped, ...(out.dropped ? [t("stk.skipFull", { n: out.dropped })] : [])];
    });
  };
  return (
    <div className="stm-pack">
      <div className="stm-row">
        <input className="inp" aria-label={t("stk.name")} value={name} maxLength={60} disabled={busy} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <KindToggle value={pack.kind} label={t("stk.kind")} onChange={(k) => k !== pack.kind && onChange({ ...pack, kind: k })} />
      </div>
      {pack.items.length ? (
        <div className="stm-items">
          {pack.items.map((it) => (
            <div key={it.id} className="stm-item">
              <img src={it.url} alt={it.name} title={it.name} loading="lazy" />
              <button type="button" aria-label={t("stk.removeItem", { name: it.name })} title={t("stk.removeItem", { name: it.name })} disabled={busy} onClick={() => onChange(withoutItem(pack, it.id))}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="stm-count">{t("stk.empty")}</div>
      )}
      <div className="stm-row">
        <span className="stm-count">{pack.items.length === 1 ? t("stk.countOne") : t("stk.count", { n: pack.items.length })}</span>
        <span className="grow" style={{ flex: 1 }} />
        <input ref={file} type="file" accept={ACCEPT} multiple hidden onChange={pickFiles} />
        {!ask && (
          <>
            <button type="button" className="btn" disabled={busy || pack.items.length >= MAX_ITEMS} onClick={() => file.current?.click()}>{t("stk.addMore")}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsk(true)}>{t("stk.delete")}</button>
          </>
        )}
      </div>
      {ask && (
        <div className="stm-row" role="alert">
          <span style={{ flex: 1 }}>{t("stk.deleteAsk", { name: pack.name, n: pack.items.length })}</span>
          <button type="button" className="btn cta" disabled={busy} onClick={() => onChange(null)}>{t("stk.deleteYes")}</button>
          <button type="button" className="btn" onClick={() => setAsk(false)}>{t("stk.deleteNo")}</button>
        </div>
      )}
    </div>
  );
}

export function Manager({ phone, onClose }: { phone: boolean; onClose: () => void }) {
  const t = useT();
  const packs = usePacks();
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PackKind>("sticker");
  const file = useRef<HTMLInputElement>(null);

  const save = async (next: StickerPack[]) => {
    const err = await savePacks(next);
    if (err) setNotes((n) => [...n, t("stk.saveFailed", { error: err })]);
  };
  const run = (job: (progress: (done: number, total: number) => void) => Promise<string[]>) => {
    setBusy(t("stk.working"));
    setNotes([]);
    void job((done, total) => setBusy(t("stk.uploading", { done, total })))
      .then((skipped) => setNotes(skipped))
      .finally(() => setBusy(""));
  };
  const create = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !name.trim()) return;
    setBusy(t("stk.uploading", { done: 0, total: files.length }));
    setNotes([]);
    void (async () => {
      const r = await uploadAll(files, kind, t, (done, total) => setBusy(t("stk.uploading", { done, total })));
      const out = addItems(newPack(packs, name, kind), r.added);
      await save([...packs, out.pack]);
      setNotes([...r.skipped, ...(out.dropped ? [t("stk.skipFull", { n: out.dropped })] : [])]);
      setName("");
    })().finally(() => setBusy(""));
  };
  const change = (p: StickerPack, next: StickerPack | null) => void save(next ? withPack(packs, next) : withoutPack(packs, p.id));
  const full = packs.length >= MAX_PACKS;

  return (
    <Dialog title={t("stk.packs")} width={560} sheet={phone} onClose={onClose}>
      <div className="pf-body">
        <p className="stm-intro">{t("stk.intro")}</p>
        {packs.map((p) => (
          <PackCard key={p.id} pack={p} busy={!!busy} onChange={(next) => change(p, next)} run={run} />
        ))}
        <div className="stm-pack">
          <div className="lb">{t("stk.new")}</div>
          <div className="stm-row">
            <input className="inp" aria-label={t("stk.newName")} placeholder={t("stk.newName")} value={name} maxLength={60} disabled={!!busy || full} onChange={(e) => setName(e.target.value)} />
            <KindToggle value={kind} label={t("stk.kind")} onChange={setKind} />
          </div>
          <div className="stm-row">
            <input ref={file} type="file" accept={ACCEPT} multiple hidden onChange={create} />
            <button type="button" className="btn cta" disabled={!!busy || full || !name.trim()} onClick={() => file.current?.click()}>{t("stk.choose")}</button>
          </div>
          {full && <p className="stm-err">{t("stk.tooMany")}</p>}
        </div>
        {busy && <div className="k" role="status">{busy}</div>}
        {notes.map((n, i) => (
          <p key={i} className="stm-err" role="alert">{n}</p>
        ))}
      </div>
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn cta" onClick={onClose}>{t("stk.close")}</button>
      </div>
    </Dialog>
  );
}
