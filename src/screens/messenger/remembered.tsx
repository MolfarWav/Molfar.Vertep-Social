// "Remembered" under a character's reply (issue #446, M2): what went into the prompt of that reply besides the latest messages:
// facts, pinned messages, recalled older messages and the note. Closed it is one line with the counts; open it lists them
// (the facts are looked up when it opens, by id; a fact deleted since is counted as gone). Read only: facts are edited in the Memory dialog.
import { useState } from "react";
import { useT } from "@/i18n/index";
import type { LogItem } from "@/mock/messenger";
import { loadFacts, type Fact } from "./facts-api";

export interface Used {
  f?: string[];
  r?: string[];
  p?: string[];
  n?: 1;
}

type Msg = Extract<LogItem, { kind: "msg" }>;

export function Remembered({ used, chatId, name, items, onFacts }: { used: Used; chatId: string; name: string; items: LogItem[]; onFacts: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [failed, setFailed] = useState(false);
  const nf = used.f?.length ?? 0;
  const np = used.p?.length ?? 0;
  const nr = used.r?.length ?? 0;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && nf > 0) {
      setFailed(false);
      loadFacts(chatId)
        .then((l) => setFacts([...l.facts, ...l.archive]))
        .catch(() => setFailed(true));
    }
  };
  const msgOf = (id: string): Msg | undefined => items.find((x): x is Msg => x.kind === "msg" && x.mid === id);
  const found = (used.f ?? []).map((id) => facts?.find((f) => f.id === id)).filter((f): f is Fact => !!f);
  const quote = (id: string) => {
    const m = msgOf(id);
    return m ? (
      <li key={id}>
        <span className="k">{m.time}</span> {m.text.length > 160 ? m.text.slice(0, 160) + "…" : m.text}
      </li>
    ) : null;
  };

  const parts = [
    nf > 0 && t("messenger.rem.facts", { n: nf }),
    np > 0 && t("messenger.rem.pinned", { n: np }),
    nr > 0 && t("messenger.rem.recalled", { n: nr }),
    used.n === 1 && t("messenger.rem.note"),
  ].filter(Boolean);

  return (
    <div className="rem">
      <button type="button" className="rem-btn" aria-expanded={open} onClick={toggle}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className={open ? "open" : ""}>
          <path d="M8 10l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="rem-t">{t("messenger.rem.title")}</span>
        <span className="k">{parts.join(" · ")}</span>
      </button>
      {open && (
        <div className="rem-body">
          {nf > 0 && (
            <div>
              <div className="lb">{t("messenger.rem.factsTitle")}</div>
              {failed ? (
                <div className="k">{t("messenger.rem.failed")}</div>
              ) : facts === null ? (
                <div className="k" role="status">{t("messenger.facts.loading")}</div>
              ) : (
                <>
                  <ul>{found.map((f) => <li key={f.id}>{f.text}</li>)}</ul>
                  {found.length < nf && <div className="k">{t("messenger.rem.gone", { n: nf - found.length })}</div>}
                </>
              )}
            </div>
          )}
          {np > 0 && (
            <div>
              <div className="lb">{t("messenger.rem.pinnedTitle")}</div>
              <ul>{used.p!.map(quote)}</ul>
            </div>
          )}
          {nr > 0 && (
            <div>
              <div className="lb">{t("messenger.rem.recalledTitle")}</div>
              <ul>{used.r!.map(quote)}</ul>
            </div>
          )}
          {used.n === 1 && <div className="k">{t("messenger.rem.noteLine", { name })}</div>}
          <button type="button" className="btn" onClick={onFacts}>{t("messenger.rem.open")}</button>
        </div>
      )}
    </div>
  );
}
