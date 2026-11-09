// "Free packs": the catalog of packs by other artists, inside the pack manager's dialog. One card per pack: a preview, the name, who made
// it and under what licence, and one button. A pack that was added shows "Added" and cannot be added twice.
import { useEffect, useState } from "react";
import { useT } from "@/i18n/index";
import { addCatalogPack, isAdded, loadCatalog, loadPreview, type CatalogPack } from "./catalog";
import { savePacks, usePacks } from "./packs";
import "./stickers.css";

function Card({ entry, added, busy, onAdd }: { entry: CatalogPack; added: boolean; busy: boolean; onAdd: () => void }) {
  const t = useT();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadPreview(entry.id).then((p) => live && setPreview(p));
    return () => {
      live = false;
    };
  }, [entry.id]);
  return (
    <div className="stm-pack stm-card">
      <div className="stm-prev" aria-hidden="true">
        {preview ? <img src={preview} alt="" /> : <span className="stm-prev-wait" />}
      </div>
      <div className="lb">{entry.name}</div>
      <div className="stm-count">
        {t("stk.cat.by", { author: entry.author, license: entry.licenseLabel })}
        {entry.source && (
          <>
            {" · "}
            <a href={entry.source} target="_blank" rel="noopener noreferrer">{t("stk.cat.source")}</a>
          </>
        )}
      </div>
      {entry.description && <p className="stm-intro">{entry.description}</p>}
      <div className="stm-row">
        <span className="stm-count">{entry.kind === "emoji" ? t("stk.cat.countEmoji", { n: entry.items.length }) : t("stk.cat.countStickers", { n: entry.items.length })}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className={added ? "btn" : "btn cta"} disabled={added || busy} onClick={onAdd}>
          {added ? t("stk.cat.added") : t("stk.cat.add")}
        </button>
      </div>
    </div>
  );
}

export function CatalogView({ busy, setBusy, setNotes }: { busy: string; setBusy: (s: string) => void; setNotes: (n: string[]) => void }) {
  const t = useT();
  const packs = usePacks();
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [list, setList] = useState<CatalogPack[]>([]);
  const [error, setError] = useState("");

  const load = () => {
    setState("loading");
    void loadCatalog().then((r) => {
      if (r.ok) {
        setList(r.packs);
        setState("ready");
      } else {
        setError(r.error);
        setState("failed");
      }
    });
  };
  useEffect(load, []);

  const add = (entry: CatalogPack) => {
    setBusy(t("stk.working"));
    setNotes([]);
    void (async () => {
      const r = await addCatalogPack(entry, packs, (done, total) => setBusy(t("stk.uploading", { done, total })));
      if (r.packs.length > packs.length) {
        const err = await savePacks(r.packs);
        if (err) setNotes([t("stk.saveFailed", { error: err })]);
        else if (r.failed.length) setNotes([t("stk.cat.failed", { n: r.failed.length })]);
      } else setNotes([t("stk.cat.allFailed", { name: entry.name })]);
    })().finally(() => setBusy(""));
  };

  return (
    <>
      <p className="stm-intro">{t("stk.cat.intro")}</p>
      {state === "loading" && <div className="k" role="status">{t("stk.cat.loading")}</div>}
      {state === "failed" && (
        <div className="stm-pack" role="alert">
          <p className="stm-err">{t("stk.cat.error", { error })}</p>
          <div className="stm-row">
            <button type="button" className="btn" onClick={load}>{t("stk.cat.retry")}</button>
          </div>
        </div>
      )}
      {state === "ready" && list.length === 0 && <p className="stm-intro">{t("stk.cat.empty")}</p>}
      {state === "ready" && list.map((entry) => <Card key={entry.id} entry={entry} added={isAdded(entry, packs)} busy={!!busy} onAdd={() => add(entry)} />)}
    </>
  );
}
