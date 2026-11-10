// A poll under the opening post of a topic: each option is a button with its count and a bar; tap one to vote, tap yours again to take it
// back, tap another to change. A closed poll (the topic is locked) is read-only and shows the winner. Characters vote by rules in the plugin.
import { useState } from "react";
import { useT } from "@/i18n/index";
import type { PollData } from "./model";

export function PollCard({ poll, onVote }: { poll: PollData; onVote?: (optionId: string) => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState("");
  const top = Math.max(0, ...poll.options.map((o) => o.n));
  const vote = async (id: string) => {
    if (!onVote || poll.closed || busy) return;
    setBusy(id);
    try {
      await onVote(id);
    } finally {
      setBusy("");
    }
  };
  const mine = poll.options.find((o) => o.mine);
  return (
    <section className={`poll${poll.closed ? " is-closed" : ""}`} aria-label={t("forum.poll.title")}>
      <div className="poll-h">
        <b>{t("forum.poll.title")}</b>
        <span className="poll-state">{poll.closed ? t("forum.poll.closed") : t("forum.poll.open")}</span>
      </div>
      <div className="poll-opts" role="group" aria-label={t("forum.poll.title")}>
        {poll.options.map((o) => {
          const pct = poll.total ? Math.round((o.n / poll.total) * 100) : 0;
          const lead = poll.closed && top > 0 && o.n === top;
          return (
            <button
              key={o.id}
              type="button"
              className={`poll-opt${o.mine ? " is-mine" : ""}${lead ? " is-lead" : ""}`}
              aria-pressed={o.mine}
              disabled={poll.closed || !onVote}
              aria-busy={busy === o.id}
              onClick={() => void vote(o.id)}
            >
              <span className="poll-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className="poll-text">
                <span className="poll-mark" aria-hidden="true">{o.mine ? "◉" : "○"}</span>
                {o.text}
                {lead && <span className="poll-lead"> · {t("forum.poll.lead")}</span>}
              </span>
              <span className="poll-n">
                {o.n} · {pct}%
              </span>
              {o.who.length > 0 && <span className="poll-who">{o.who.join(", ")}</span>}
            </button>
          );
        })}
      </div>
      <div className="poll-f mut">
        {t("forum.poll.total", { n: poll.total })}
        {!poll.closed && onVote && ` · ${t(mine ? "forum.poll.hint.change" : "forum.poll.hint.vote")}`}
      </div>
    </section>
  );
}
