// Step 2 of "New profile": the three drafts (tabs, each a small card) and the
// selected one as a card, with its other fields under "All fields"; on the
// right the quick questions (chips, tap again to clear), the wish and the
// detail level. Desktop: two columns, the right one scrolls by itself. Phone:
// one column in the order drafts, card, questions, wish, detail.
import { useT } from "@/i18n/index";
import type { Draft, Question } from "./model-api";
import { Chip, Seg } from "./ui";

export type Detail = "brief" | "normal" | "detailed";
export const DETAIL_HINT: Record<Detail, string> = {
  brief: "profiles.new.detail.briefHint",
  normal: "profiles.new.detail.normalHint",
  detailed: "profiles.new.detail.detailedHint",
};
export const WISH_MAX = 300;

export function NewDrafts({ drafts, questions, answers, onAnswer, tab, onTab, wish, onWish, detail, onDetail }: {
  drafts: Draft[];
  questions: Question[];
  answers: (number | null)[];
  onAnswer: (question: number, option: number) => void;
  tab: number;
  onTab: (i: number) => void;
  wish: string;
  onWish: (v: string) => void;
  detail: Detail;
  onDetail: (d: Detail) => void;
}) {
  const t = useT();
  const d = drafts[tab] ?? drafts[0];
  return (
    <div className="nw-cols">
      <div className="nw-left">
        <div className="dtabs" role="tablist" aria-label={t("profiles.new.draftsAria")}>
          {drafts.map((x, i) => (
            <button key={`${x.archetype}|${x.name}`} type="button" role="tab" aria-selected={tab === i} className={`dtab${tab === i ? " on" : ""}`} onClick={() => onTab(i)}>
              <span className="caps dtab-arch">{x.archetype}</span>
              <span className="dtab-name">{x.name}</span>
            </button>
          ))}
        </div>
        {d && (
          <div className="dcard" role="tabpanel">
            <span className="caps">{d.archetype}</span>
            <h3 className="dcard-name">{d.name}</h3>
            <p className="dcard-sum">{d.summary}</p>
            <div className="chips">
              {d.traits.map((x) => (
                <span key={x} className="chip">{x}</span>
              ))}
            </div>
            <p className="k">{d.detail}</p>
            <details className="all-fields">
              <summary>{t("profiles.new.allFields")}</summary>
              <dl className="dl">
                <dt>{t("profiles.about.about")}</dt>
                <dd>{d.about}</dd>
                <dt>{t("profiles.tab.voice")}</dt>
                <dd>{d.voiceText}</dd>
                <dt>{t("profiles.about.interests")}</dt>
                <dd className="chips">{d.interests.map((x) => <Chip key={x}>{x}</Chip>)}</dd>
                <dt>{t("profiles.fill.field.rank")}</dt>
                <dd>{d.rank}</dd>
                <dt>{t("profiles.fill.field.signature")}</dt>
                <dd>{d.signature}</dd>
              </dl>
            </details>
          </div>
        )}
      </div>
      <div className="nw-right">
        {questions.length > 0 && (
          <div className="nw-block">
            <h4 className="nw-h">{t("profiles.new.questionsTitle")}</h4>
            {questions.map((q, i) => (
              <div key={q.q} className="nw-q" role="group" aria-label={q.q}>
                <span className="lb">{q.q}</span>
                <div className="chips q-chips">
                  {q.options.map((o, j) => (
                    <button key={o} type="button" aria-pressed={answers[i] === j} className={`chip chip-tap${answers[i] === j ? " on" : ""}`} onClick={() => onAnswer(i, j)}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="nw-block">
          <h4 className="nw-h">{t("profiles.new.wishTitle")}</h4>
          <textarea
            className="inp inp-area"
            rows={2}
            maxLength={WISH_MAX}
            value={wish}
            aria-label={t("profiles.new.wishTitle")}
            placeholder={t("profiles.new.wishPlaceholder")}
            onChange={(e) => onWish(e.target.value)}
          />
        </div>
        <div className="nw-block">
          <h4 className="nw-h">{t("profiles.new.detail")}</h4>
          <Seg
            full
            label={t("profiles.new.detail")}
            value={detail}
            onChange={onDetail}
            options={[
              { value: "brief" as Detail, label: t("profiles.new.detail.brief") },
              { value: "normal" as Detail, label: t("profiles.new.detail.normal") },
              { value: "detailed" as Detail, label: t("profiles.new.detail.detailed") },
            ]}
          />
          <p className="k">{t(DETAIL_HINT[detail])}</p>
        </div>
      </div>
    </div>
  );
}
