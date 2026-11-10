// Stories and "Characters talk" in the messenger (issue #358).
// StoriesBar: a row of the characters who posted a story in the last day (a ring marks unseen ones), a tap opens the viewer.
// ChatterEntry: a row under the contacts that opens a dialog where the user lets two characters talk and reads what they wrote.
// Both draw nothing when there is nothing to show (no stories; the feature switched off in Settings > Community).
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { currentLang, useT } from "@/i18n/index";
import { MsgPicture } from "@/pictures/MsgPicture";
import { refreshImages } from "@/pictures/worker";
import { Dialog } from "@/screens/profiles/dialog";
import { themColor } from "@/components/Avatar";
import { loadPairChat, loadPairs, loadStories, markSeen, removePair, removeStory, setPair, type Pair, type PairMessage, type Story } from "./community-api";

const POLL_MS = 60000;

/** Polls a loader now and every minute; `reload` asks again at once. */
function usePolled<T>(load: () => Promise<T>, initial: T): [T, () => void] {
  const [data, setData] = useState<T>(initial);
  const alive = useRef(true);
  const reload = useCallback(() => {
    void load().then((v) => alive.current && setData(v));
  }, [load]);
  useEffect(() => {
    alive.current = true;
    reload();
    const timer = setInterval(reload, POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [reload]);
  return [data, reload];
}

const hoursLeft = (until: number): number => Math.max(1, Math.ceil((until - Date.now()) / 3600e3));

// ---------- stories ----------

interface Who {
  id: string;
  name: string;
  hue: number;
  picture: string;
  list: Story[];
  unseen: number;
}

/** The stories by character: the one with something unseen first, then the newest. */
function byCharacter(all: Story[]): Who[] {
  const map = new Map<string, Who>();
  for (const s of all.slice().sort((a, b) => a.at - b.at)) {
    const w = map.get(s.by) ?? { id: s.by, name: s.name, hue: s.hue, picture: s.picture, list: [], unseen: 0 };
    w.list.push(s);
    if (!s.seen) w.unseen++;
    map.set(s.by, w);
  }
  return [...map.values()].sort((a, b) => (a.unseen > 0 === b.unseen > 0 ? b.list[b.list.length - 1].at - a.list[a.list.length - 1].at : a.unseen > 0 ? -1 : 1));
}

export function StoriesBar({ phone }: { phone: boolean }) {
  const t = useT();
  const [data, reload] = usePolled(loadStories, { on: false, stories: [] as Story[] });
  const [open, setOpen] = useState<{ who: string; index: number } | null>(null);
  const people = byCharacter(data.stories);
  // a story that waits for its picture asks the page's drawing worker to look
  const waiting = data.stories.some((s) => s.image?.state === "pending");
  useEffect(() => {
    if (waiting) refreshImages();
  }, [waiting]);
  if (people.length === 0) return null;
  const opened = open ? people.find((p) => p.id === open.who) : undefined;
  return (
    <>
      <div className={`stories${phone ? " p" : ""}`} role="group" aria-label={t("messenger.stories.title")}>
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`story-b${p.unseen > 0 ? " new" : ""}`}
            aria-label={t(p.unseen > 0 ? "messenger.stories.open.new" : "messenger.stories.open", { name: p.name, n: p.list.length })}
            onClick={() => setOpen({ who: p.id, index: Math.max(0, p.list.findIndex((s) => !s.seen)) })}
          >
            <span className="story-ring">
              <Avatar name={p.name} hue={p.hue} size={phone ? 52 : 44} radius={999} picture={p.picture || undefined} />
            </span>
            <span className="story-name">{p.name}</span>
          </button>
        ))}
      </div>
      {opened && open && (
        <StoryViewer
          who={opened}
          start={open.index}
          phone={phone}
          onClose={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function StoryViewer({ who, start, phone, onClose }: { who: Who; start: number; phone: boolean; onClose: () => void }) {
  const t = useT();
  const lang = currentLang();
  const [i, setI] = useState(Math.min(start, who.list.length - 1));
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [gone, setGone] = useState<string[]>([]);
  const list = who.list.filter((s) => !gone.includes(s.id));
  const s = list[Math.min(i, list.length - 1)];
  useEffect(() => {
    if (s && !s.seen) void markSeen(s.id);
  }, [s]);
  useEffect(() => {
    if (!s) onClose();
  }, [s, onClose]);
  if (!s) return null;
  const left = hoursLeft(s.until);
  const when = new Date(s.at).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  const remove = async () => {
    const err = await removeStory(s.id);
    if (err) {
      setError(err);
      return;
    }
    setAsking(false);
    setError("");
    setGone((g) => [...g, s.id]);
    setI((x) => Math.max(0, Math.min(x, list.length - 2)));
  };
  return (
    <Dialog title={who.name} width={420} sheet={phone} onClose={onClose}>
      <div className="pf-body story-view">
        <div className="story-head">
          <Avatar name={who.name} hue={who.hue} size={36} picture={who.picture || undefined} />
          <div className="story-meta">
            <b style={{ color: themColor(who.hue) }}>{who.name}</b>
            <span className="k">{t("messenger.stories.meta", { time: when, n: left })}</span>
          </div>
          <span className="k story-count" aria-live="polite">{i + 1} / {list.length}</span>
        </div>
        <div className="story-bars" aria-hidden="true">
          {list.map((x, n) => (
            <span key={x.id} className={n <= i ? "on" : ""} />
          ))}
        </div>
        {s.image ? (
          <>
            <MsgPicture image={s.image} />
            <p className="story-text">{s.text}</p>
          </>
        ) : (
          // a story with no picture is its line on a card of the character's colour
          <div className="story-card" style={{ background: `hsl(${who.hue} 40% 28%)` }}>
            <p className="story-text big">{s.text}</p>
          </div>
        )}
        <div className="story-nav">
          <button type="button" className="btn" disabled={i <= 0} onClick={() => setI(i - 1)} aria-label={t("messenger.stories.prev")}>‹</button>
          <button type="button" className="btn" disabled={i >= list.length - 1} onClick={() => setI(i + 1)} aria-label={t("messenger.stories.next")}>›</button>
          <span className="story-gap" />
          {asking ? (
            <span className="story-ask" role="alertdialog" aria-label={t("messenger.stories.removeAsk")}>
              <span>{t("messenger.stories.removeAsk")}</span>
              <button type="button" className="btn danger" onClick={() => void remove()}>{t("messenger.stories.removeYes")}</button>
              <button type="button" className="btn" onClick={() => setAsking(false)}>{t("messenger.stories.keep")}</button>
            </span>
          ) : (
            <button type="button" className="btn danger" onClick={() => setAsking(true)}>{t("messenger.stories.remove")}</button>
          )}
        </div>
        {error && <div className="k story-err" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}

// ---------- characters talk ----------

export function ChatterEntry({ contacts, phone }: { contacts: { id: string; name: string }[]; phone: boolean }) {
  const t = useT();
  const [data, reload] = usePolled(loadPairs, { on: false, max: 8, pairs: [] as Pair[] });
  const [open, setOpen] = useState(false);
  if (!data.on || contacts.length < 2) return null;
  const active = data.pairs.filter((p) => p.on).length;
  return (
    <>
      <button type="button" className={`chatter-row${phone ? " p" : ""}`} onClick={() => setOpen(true)}>
        <span className="chatter-ic" aria-hidden="true">💬</span>
        <span className="chatter-tx">
          <b>{t("messenger.chatter.title")}</b>
          <span className="k">{data.pairs.length === 0 ? t("messenger.chatter.none") : t("messenger.chatter.some", { n: active })}</span>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {open && (
        <ChatterDialog
          contacts={contacts}
          pairs={data.pairs}
          max={data.max}
          phone={phone}
          onChanged={reload}
          onClose={() => {
            setOpen(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function ChatterDialog({ contacts, pairs, max, phone, onChanged, onClose }: { contacts: { id: string; name: string }[]; pairs: Pair[]; max: number; phone: boolean; onChanged: () => void; onClose: () => void }) {
  const t = useT();
  const lang = currentLang();
  const [reading, setReading] = useState<Pair | null>(null);
  const [lines, setLines] = useState<PairMessage[] | null>(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!reading) return;
    setLines(null);
    void loadPairChat(reading.key).then(setLines);
  }, [reading]);

  const run = async (job: () => Promise<string>) => {
    setBusy(true);
    setError("");
    const err = await job();
    setBusy(false);
    if (err) setError(err);
    else onChanged();
    return err;
  };
  const add = async () => {
    if (!a || !b || a === b) {
      setError(t("messenger.chatter.pick"));
      return;
    }
    const err = await run(() => setPair(a, b, true));
    if (!err) {
      setA("");
      setB("");
    }
  };
  const day = (ms: number) => new Date(ms).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const nameOf = (p: Pair, id: string) => (p.a.id === id ? p.a.name : p.b.name);

  if (reading) {
    return (
      <Dialog title={t("messenger.chatter.reading", { a: reading.a.name, b: reading.b.name })} width={520} sheet={phone} onClose={onClose}>
        <div className="pf-body chatter-read">
          <button type="button" className="btn" onClick={() => setReading(null)}>‹ {t("messenger.chatter.back")}</button>
          {lines === null && <p className="k">{t("messenger.chatter.loading")}</p>}
          {lines?.length === 0 && <p className="k">{t("messenger.chatter.empty")}</p>}
          <ul className="chatter-log">
            {(lines ?? []).map((m) => {
              const hue = reading.a.id === m.by ? reading.a.hue : reading.b.hue;
              return (
                <li key={m.id}>
                  <span className="chatter-who" style={{ color: themColor(hue) }}>{nameOf(reading, m.by)}</span>
                  <span className="k"> · {day(m.at)}</span>
                  <p>{m.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={t("messenger.chatter.title")} width={520} sheet={phone} onClose={onClose}>
      <div className="pf-body chatter-dlg">
        <p className="k">{t("messenger.chatter.hint", { max })}</p>
        {pairs.length === 0 && <p className="k">{t("messenger.chatter.none.long")}</p>}
        <ul className="chatter-pairs">
          {pairs.map((p) => (
            <li key={p.key} className="chatter-pair">
              <div className="chatter-names">
                <Avatar name={p.a.name} hue={p.a.hue} size={28} picture={p.a.picture || undefined} />
                <Avatar name={p.b.name} hue={p.b.hue} size={28} picture={p.b.picture || undefined} />
                <b>{p.a.name} & {p.b.name}</b>
              </div>
              <p className="k chatter-last">{p.last ? `${nameOf(p, p.last.by)}: ${p.last.text}` : t("messenger.chatter.noLines")}</p>
              {asking === p.key ? (
                <div className="chatter-act" role="alertdialog" aria-label={t("messenger.chatter.removeAsk")}>
                  <span>{t("messenger.chatter.removeAsk")}</span>
                  <button type="button" className="btn danger" disabled={busy} onClick={() => void run(() => removePair(p.key)).then(() => setAsking(""))}>{t("messenger.chatter.removeYes")}</button>
                  <button type="button" className="btn" onClick={() => setAsking("")}>{t("messenger.chatter.keep")}</button>
                </div>
              ) : (
                <div className="chatter-act">
                  <label className="chatter-sw">
                    <input type="checkbox" checked={p.on} disabled={busy} onChange={(e) => void run(() => setPair(p.a.id, p.b.id, e.target.checked))} />
                    <span>{t(p.on ? "messenger.chatter.on" : "messenger.chatter.off")}</span>
                  </label>
                  <button type="button" className="btn" disabled={p.count === 0} onClick={() => setReading(p)}>{t("messenger.chatter.read", { n: p.count })}</button>
                  <button type="button" className="btn danger" onClick={() => setAsking(p.key)}>{t("messenger.chatter.remove")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="chatter-new">
          <b>{t("messenger.chatter.add")}</b>
          <div className="chatter-sel">
            <select className="sel" aria-label={t("messenger.chatter.first")} value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">{t("messenger.chatter.first")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="sel" aria-label={t("messenger.chatter.second")} value={b} onChange={(e) => setB(e.target.value)}>
              <option value="">{t("messenger.chatter.second")}</option>
              {contacts.filter((c) => c.id !== a).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="button" className="btn cta" disabled={busy} onClick={() => void add()}>{t("messenger.chatter.start")}</button>
          </div>
          {error && <div className="k chatter-err" role="alert">{error}</div>}
        </div>
      </div>
    </Dialog>
  );
}
