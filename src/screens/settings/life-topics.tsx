// Settings > Life > Subjects (issue #358): which subjects the outside feed keeps. A list of about fifty to pick from, grouped, and the
// user's own subjects (a name and a few words). Folded by default: nobody has to open it, and the summary says what is chosen.
import { useEffect, useRef, useState } from "react";
import { useT, currentLang } from "@/i18n/index";
import type { SettingsMock } from "@/mock/settings";
import { loadTopics, type WorldStatus } from "./life-api";
import { addCustom, inUse, removeCustom, toggleTopic, topicLabel, type TopicsCatalog } from "./topics";
import type { Patch } from "./parts";

const FOLD_KEY = "social.settings.topicsOpen";
const readOpen = (): boolean => {
  try {
    return window.localStorage.getItem(FOLD_KEY) === "1";
  } catch {
    return false;
  }
};
const writeOpen = (v: boolean) => {
  try {
    window.localStorage.setItem(FOLD_KEY, v ? "1" : "0");
  } catch {
    // not remembered; it still works
  }
};

export function TopicsPicker({ s, set, off, status }: { s: SettingsMock; set: Patch; off: boolean; status: WorldStatus | null }) {
  const t = useT();
  const lang = currentLang();
  const life = s.life;
  const topics = life.topics;
  const [open, setOpen] = useState(readOpen);
  const [cat, setCat] = useState<TopicsCatalog | null>(null);
  const [name, setName] = useState("");
  const [words, setWords] = useState("");
  const [problem, setProblem] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void loadTopics().then((c) => alive.current && setCat(c));
    return () => {
      alive.current = false;
    };
  }, []);

  const max = cat?.max ?? 12;
  const used = inUse(topics);
  const byId = new Map((cat?.topics ?? []).map((x) => [x.id, x]));
  const counts = status?.byTopic ?? cat?.byTopic ?? {};
  const chosen = [...topics.on.map((id) => byId.get(id)).filter((x) => !!x).map((x) => topicLabel(x!, lang)), ...topics.custom.map((c) => c.label)];
  const summary = used === 0 ? t("settings.life.topics.none") : t("settings.life.topics.some", { n: used, names: chosen.slice(0, 3).join(", ") + (chosen.length > 3 ? "…" : "") });
  const change = (next: typeof topics) => set({ life: { ...life, topics: next } });

  const add = () => {
    const r = addCustom(topics, name, words, max, cat?.customMax ?? 6);
    if ("error" in r) {
      setProblem(t(`settings.life.topics.err.${r.error}`));
      return;
    }
    setProblem("");
    setName("");
    setWords("");
    change(r.ok);
  };

  return (
    <div className="blk topics">
      <button
        type="button"
        className="fold"
        aria-expanded={open}
        aria-controls="settings-life-topics"
        onClick={() => {
          writeOpen(!open);
          setOpen(!open);
        }}
      >
        <span className="fold-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span className="fold-text">
          <b>{t("settings.life.topics")}</b>
          <span className="k">{summary}</span>
        </span>
      </button>
      {open && (
        <div id="settings-life-topics" className="fold-body">
          <div className="k hint">{t("settings.life.topics.hint")}</div>
          {used > 0 && status?.topicsStale && <div className="k life-note none" role="status">{t("settings.life.topics.stale")}</div>}
          {!cat && <div className="k">{t("settings.life.topics.loading")}</div>}
          {cat?.groups.map((g) => (
            <div key={g.id} className="tgroup">
              <div className="lbl" id={`settings-topics-${g.id}`}>{topicLabel(g, lang)}</div>
              <div className="cats" role="group" aria-labelledby={`settings-topics-${g.id}`}>
                {cat.topics
                  .filter((x) => x.group === g.id)
                  .map((x) => {
                    const on = topics.on.includes(x.id);
                    const n = counts[x.id];
                    return (
                      <button
                        key={x.id}
                        type="button"
                        className={`cat${on ? " on" : ""}`}
                        aria-pressed={on}
                        disabled={off || (!on && used >= max)}
                        onClick={() => change(toggleTopic(topics, x.id, max))}
                      >
                        {topicLabel(x, lang)}
                        {on && typeof n === "number" ? <span className="cnt"> · {n}</span> : null}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          <div className="tgroup">
            <div className="lbl" id="settings-topics-own">{t("settings.life.topics.own")}</div>
            {topics.custom.length > 0 && (
              <div className="cats" role="group" aria-labelledby="settings-topics-own">
                {topics.custom.map((c) => (
                  <span key={c.id} className="cat on own" title={c.words.join(", ")}>
                    {c.label}
                    {typeof counts[c.id] === "number" ? <span className="cnt"> · {counts[c.id]}</span> : null}
                    <button type="button" className="own-x" aria-label={t("settings.life.topics.remove", { name: c.label })} disabled={off} onClick={() => change(removeCustom(topics, c.id))}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="own-form">
              <input className="txt" aria-label={t("settings.life.topics.own.name")} value={name} maxLength={40} placeholder={t("settings.life.topics.own.name.ph")} disabled={off} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
              <input className="txt" aria-label={t("settings.life.topics.own.words")} value={words} maxLength={120} placeholder={t("settings.life.topics.own.words.ph")} disabled={off} onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
              <button type="button" className="btn" disabled={off} onClick={add}>{t("settings.life.topics.own.add")}</button>
            </div>
            {problem && <div className="k life-note none" role="alert">{problem}</div>}
            <div className="k hint">{t("settings.life.topics.own.hint")}</div>
          </div>
          <div className="k">{t("settings.life.topics.count", { n: used, max })}</div>
        </div>
      )}
    </div>
  );
}
