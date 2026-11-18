// The journal (issue #444): every character's posts and your own, newest first. A story that ran out after a day is filed here.
// One feed with a filter (Everyone / Mine); a post is written, edited and removed inline. Phone: reached from More (the Settings tab).
//
// Preview parameters (`?screen=journal&...`): state=empty, write=1 (the form is open).
import "../profiles/profiles.css";
import "./journal.css";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useLangPref, useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { useIsPhone } from "@/lib/use-phone";
import { refreshImages } from "@/pictures/worker";
import { useChrome, useNav } from "@/shell/nav";
import { useYou } from "../you/store";
import { editPost, loadFeed, removePost, writePost, type JournalPost, type PostInput } from "./api";

const param = (k: string): string => {
  if (!PREVIEW) return "";
  try {
    return new URLSearchParams(location.search).get(k) ?? "";
  } catch {
    return "";
  }
};

const BackIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BLANK: PostInput = { title: "", text: "", mood: "", tags: "" };

function Form({ initial, submitLabel, onSubmit, onCancel }: { initial: PostInput; submitLabel: string; onSubmit: (v: PostInput) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const [v, setV] = useState<PostInput>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (patch: Partial<PostInput>) => setV((x) => ({ ...x, ...patch }));
  const go = async () => {
    if (!v.title.trim() && !v.text.trim()) {
      setErr(t("journal.needText"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onSubmit(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <form className="jr-form" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <div className="f">
        <label className="lb" htmlFor="jr-title">{t("journal.form.title")}</label>
        <input id="jr-title" className="inp" maxLength={120} placeholder={t("journal.form.title.ph")} value={v.title} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="f">
        <label className="lb" htmlFor="jr-text">{t("journal.form.text")}</label>
        <textarea id="jr-text" className="inp inp-area jr-area" maxLength={8000} placeholder={t("journal.form.text.ph")} value={v.text} onChange={(e) => set({ text: e.target.value })} />
      </div>
      <div className="jr-two">
        <div className="f">
          <label className="lb" htmlFor="jr-mood">{t("journal.form.mood")}</label>
          <input id="jr-mood" className="inp" maxLength={24} placeholder={t("journal.form.mood.ph")} value={v.mood} onChange={(e) => set({ mood: e.target.value })} />
        </div>
        <div className="f">
          <label className="lb" htmlFor="jr-tags">{t("journal.form.tags")}</label>
          <input id="jr-tags" className="inp" placeholder={t("journal.form.tags.ph")} value={v.tags} onChange={(e) => set({ tags: e.target.value })} />
        </div>
      </div>
      {err && <div className="jr-err" role="alert">{err}</div>}
      <div className="jr-btns">
        <button type="submit" className="btn cta" disabled={busy}>{submitLabel}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>{t("journal.form.cancel")}</button>
      </div>
    </form>
  );
}

function Post({ p, name, when, onChanged, onRemoved }: { p: JournalPost; name: string; when: string; onChanged: (p: JournalPost) => void; onRemoved: (id: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState("");
  if (editing) {
    return (
      <Form
        initial={{ title: p.title, text: p.text, mood: p.mood ?? "", tags: p.tags.join(", ") }}
        submitLabel={t("journal.form.save")}
        onCancel={() => setEditing(false)}
        onSubmit={async (v) => {
          onChanged(await editPost(p.id, v));
          setEditing(false);
        }}
      />
    );
  }
  const remove = async () => {
    try {
      await removePost(p);
      onRemoved(p.id);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <article className="jr-post" aria-label={p.title || t("journal.untitled")}>
      <div className="jr-who">
        <Avatar name={name} hue={p.hue} size={36} picture={p.picture || undefined} />
        <div className="jr-who-t">
          <b>{name}</b>
          <span className="k">{when}{p.fromStory ? ` · ${t("journal.fromStory")}` : ""}{p.mood ? ` · ${p.mood}` : ""}</span>
        </div>
      </div>
      {p.title && <h2 className="jr-pt">{p.title}</h2>}
      {p.text && <p className="jr-text">{p.text}</p>}
      {p.image?.state === "ready" && <img className="jr-img" src={p.image.url} alt={p.image.alt || t("journal.picture.alt")} />}
      {p.image?.state === "pending" && <div className="k">{t("journal.picture.pending")}</div>}
      {p.image?.state === "failed" && <div className="k">{t("journal.picture.failed")}</div>}
      {p.tags.length > 0 && (
        <div className="jr-tags">
          {p.tags.map((x) => <span key={x} className="chip">#{x}</span>)}
        </div>
      )}
      {problem && <div className="jr-err" role="alert">{problem}</div>}
      {asking ? (
        <div className="jr-ask" role="alertdialog" aria-label={t("journal.removeAsk")}>
          <span>{p.mine ? t("journal.removeAsk") : t("journal.removeAsk.char", { name })}</span>
          <button type="button" className="btn danger" onClick={() => void remove()}>{t("journal.removeYes")}</button>
          <button type="button" className="btn" onClick={() => setAsking(false)}>{t("journal.keep")}</button>
        </div>
      ) : (
        <div className="jr-acts">
          {p.mine && <button type="button" className="btn" onClick={() => setEditing(true)}>{t("journal.edit")}</button>}
          <button type="button" className="btn" onClick={() => setAsking(true)}>{t("journal.remove")}</button>
        </div>
      )}
    </article>
  );
}

export function Journal() {
  const phone = useIsPhone();
  useChrome({ bar: false });
  const t = useT();
  const { lang } = useLangPref();
  const { go } = useNav();
  const you = useYou();
  const myName = you?.personas.find((p) => p.id === you.active)?.name || t("journal.you");
  const [owner, setOwner] = useState<"" | "you">("");
  const [posts, setPosts] = useState<JournalPost[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [writing, setWriting] = useState(() => param("write") === "1");

  const load = useCallback(async () => {
    try {
      const f = await loadFeed(owner);
      setPosts(param("state") === "empty" ? [] : f.posts);
      setMore(f.more);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [owner]);
  useEffect(() => {
    setState("loading");
    void load();
  }, [load]);

  // a picture waits for the page's drawing worker: look again now and then while one does
  const waiting = posts.some((p) => p.image?.state === "pending");
  useEffect(() => {
    if (!waiting || PREVIEW) return;
    refreshImages();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const olderPage = async () => {
    const last = posts[posts.length - 1];
    if (!last) return;
    try {
      const f = await loadFeed(owner, last.at);
      setPosts((x) => [...x, ...f.posts.filter((n) => !x.some((o) => o.id === n.id))]);
      setMore(f.more);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  const when = (ms: number) => new Date(ms).toLocaleString(lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const nameOf = (p: JournalPost) => (p.mine ? myName : p.by);

  const header = phone ? (
    <header className="hd">
      <button type="button" className="hbtn" aria-label={t("journal.back")} onClick={() => go("settings")}>
        <BackIcon />
      </button>
      <h1 className="hd-title jr-title">{t("journal.title")}</h1>
    </header>
  ) : (
    <div className="jr-head">
      <div>
        <h1 className="jr-h">{t("journal.title")}</h1>
        <p className="k">{t("journal.intro")}</p>
      </div>
    </div>
  );

  return (
    <div className={`s-profiles s-journal ${phone ? "is-phone" : "is-desk"}`}>
      {header}
      <div className="jr-scroll">
        <div className="jr-page">
          {phone && <p className="k">{t("journal.intro")}</p>}
          <div className="jr-bar">
            <div className="jr-filter" role="group" aria-label={t("journal.filter")}>
              <button type="button" className={`chip${owner === "" ? " on" : ""}`} aria-pressed={owner === ""} onClick={() => setOwner("")}>{t("journal.filter.all")}</button>
              <button type="button" className={`chip${owner === "you" ? " on" : ""}`} aria-pressed={owner === "you"} onClick={() => setOwner("you")}>{t("journal.filter.you")}</button>
            </div>
            {!writing && <button type="button" className="btn cta" onClick={() => setWriting(true)}>{t("journal.write")}</button>}
          </div>
          {writing && (
            <Form
              initial={BLANK}
              submitLabel={t("journal.form.post")}
              onCancel={() => setWriting(false)}
              onSubmit={async (v) => {
                const p = await writePost(v);
                setWriting(false);
                setPosts((x) => (owner === "" || owner === "you" ? [p, ...x] : x));
                setState("ready");
              }}
            />
          )}
          {state === "loading" && <p className="k" role="status">{t("journal.loading")}</p>}
          {state === "error" && (
            <div className="jr-empty" role="alert">
              <p>{t("journal.error", { message: error })}</p>
              <div className="jr-btns"><button type="button" className="btn" onClick={() => { setState("loading"); void load(); }}>{t("journal.retry")}</button></div>
            </div>
          )}
          {state === "ready" && posts.length === 0 && !writing && (
            <div className="jr-empty">
              <h2>{t("journal.empty.title")}</h2>
              <p className="k">{owner === "you" ? t("journal.empty.you.text") : t("journal.empty.text")}</p>
            </div>
          )}
          {state === "ready" &&
            posts.map((p) => (
              <Post key={p.id} p={p} name={nameOf(p)} when={when(p.at)} onChanged={(n) => setPosts((x) => x.map((o) => (o.id === n.id ? n : o)))} onRemoved={(id) => setPosts((x) => x.filter((o) => o.id !== id))} />
            ))}
          {state === "ready" && more && <button type="button" className="btn" onClick={() => void olderPage()}>{t("journal.more")}</button>}
        </div>
      </div>
    </div>
  );
}
