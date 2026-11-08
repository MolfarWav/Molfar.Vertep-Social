// "New profile": the choice (write it yourself, short interview, import from
// Roleplay), then the interview: step 1 describes the character, step 2 shows
// three drafts with the model's quick questions, an optional wish and a detail
// level. Create makes an own profile and hands it to the screen; no second
// model call. The model is reached through model-api.ts only.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import { plain, type MockProfile } from "@/mock/profiles";
import { suggest, type Draft, type Question } from "./model-api";
import { Dialog } from "./dialog";
import { Chip, Field, Seg } from "./ui";
import { NoModelLine } from "./fill-ui";

export type NewStage = "choose" | "ask" | "drafts";
export type AskPhase = "idle" | "busy" | "fail" | "nomodel";
export type Detail = "brief" | "normal" | "detailed";

/** Where the flow starts (the preview parameters use this). */
export interface NewStart {
  stage: NewStage;
  phase?: AskPhase;
  drafts?: Draft[];
  questions?: Question[];
}

export interface NewProfileProps {
  phone: boolean;
  start?: NewStart;
  onClose: () => void;
  onRoleplay: () => void;
  /** Creates the own profile (blank or from a draft) and closes the flow. */
  onCreate: (p: MockProfile) => void;
  /** The blank profile's name until the user saves a nick. */
  unnamed: string;
}

const MAX_TEXT = 600;
const DETAIL_HINT: Record<Detail, string> = {
  brief: "profiles.new.detail.briefHint",
  normal: "profiles.new.detail.normalHint",
  detailed: "profiles.new.detail.detailedHint",
};

/** The option each question starts on: the middle one. */
const startAnswers = (qs: Question[]): number[] => qs.map((q) => Math.floor(q.options.length / 2));

/** A blank own profile: the editor opens on it with every field empty. */
export function blankProfile(id: string, unnamed: string): MockProfile {
  return plain(id, unnamed, 200, "own", "");
}

/** An own profile from one draft, with the detail level and the wish applied. */
export function profileFromDraft(d: Draft, detail: Detail, wish: string, id: string): MockProfile {
  const p = plain(id, d.name, d.hue, "own", d.about);
  const w = wish.trim();
  return {
    ...p,
    about: w ? `${d.about} ${w}` : d.about,
    voice: { ...p.voice, text: d.voiceText },
    interests: detail === "brief" ? [] : d.interests,
    forum: {
      ...p.forum,
      rank: detail === "brief" ? "" : d.rank,
      signature: detail === "detailed" ? d.signature : "",
    },
  };
}

export function NewProfileFlow({ phone, start, onClose, onRoleplay, onCreate, unnamed }: NewProfileProps) {
  const t = useT();
  const [stage, setStage] = useState<NewStage>(start?.stage ?? "choose");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<AskPhase>(start?.phase ?? "idle");
  const [drafts, setDrafts] = useState<Draft[] | null>(start?.drafts ?? null);
  const [questions, setQuestions] = useState<Question[]>(start?.questions ?? []);
  const [answers, setAnswers] = useState<number[]>(() => startAnswers(start?.questions ?? []));
  const [tab, setTab] = useState(0);
  const [wish, setWish] = useState("");
  const [detail, setDetail] = useState<Detail>("normal");
  // Each call takes a number; only the latest one may change the screen (Stop and unmount move it on).
  const ask = useRef(0);

  useEffect(() => () => {
    ask.current += 1;
  }, []);

  // A stage change removes the focused button: move focus into the new step
  // (the first mount is left to the dialog, which focuses its first control).
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    document.querySelector<HTMLElement>(".pf-dlg .pf-body")?.querySelector<HTMLElement>("textarea, [role=tab][aria-selected=true], button")?.focus();
  }, [stage]);

  const blank = () => onCreate(blankProfile(`own-${Date.now()}`, unnamed));

  const showDrafts = async () => {
    const mine = ask.current + 1;
    ask.current = mine;
    setPhase("busy");
    let res;
    try {
      res = await suggest({ idea: text.trim() });
    } catch {
      res = { ok: false as const, error: "request failed" };
    }
    if (ask.current !== mine) return;
    if (!res.ok) {
      setPhase(res.code === "no-model" ? "nomodel" : "fail");
      return;
    }
    setDrafts(res.drafts);
    setQuestions(res.questions);
    setAnswers(startAnswers(res.questions));
    setTab(0);
    setStage("drafts");
    setPhase("idle");
  };

  /** Stop waiting: the call's answer is ignored when it comes. */
  const stopWaiting = () => {
    ask.current += 1;
    setPhase("idle");
  };

  const create = () => {
    const d = drafts?.[tab];
    if (!d) return;
    onCreate(profileFromDraft(d, detail, wish, `own-${Date.now()}`));
  };

  const busy = phase === "busy";

  let body: ReactNode;
  let foot: ReactNode;
  if (stage === "choose") {
    body = (
      <div className="pf-body">
        <div className="choices" role="group" aria-label={t("profiles.new")}>
          <button type="button" className="choice" onClick={blank}>
            <span className="choice-t">{t("profiles.new.blank")}</span>
            <span className="choice-h">{t("profiles.new.blankHint")}</span>
          </button>
          <button type="button" className="choice" onClick={() => setStage("ask")}>
            <span className="choice-t">{t("profiles.new.interview")}</span>
            <span className="choice-h">{t("profiles.new.interviewHint")}</span>
          </button>
          <button type="button" className="choice" onClick={onRoleplay}>
            <span className="choice-t">{t("profiles.import")}</span>
            <span className="choice-h">{t("profiles.new.importHint")}</span>
          </button>
        </div>
      </div>
    );
    foot = (
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
      </div>
    );
  } else if (stage === "ask") {
    body = (
      <div className="pf-body">
        <Field label={t("profiles.new.ask")}>
          {(id) => (
            <textarea
              id={id}
              className="inp inp-area"
              rows={4}
              maxLength={MAX_TEXT}
              value={text}
              disabled={busy}
              placeholder={t("profiles.new.askPlaceholder")}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <div className="counter k">{t("profiles.new.counter", { n: text.length, max: MAX_TEXT })}</div>
        {busy && (
          <div className="fill-run" role="status">
            <span className="spin" aria-hidden="true" />
            <span>{t("profiles.model.thinking")}</span>
            <button type="button" className="btn" onClick={stopWaiting}>{t("profiles.new.stopWaiting")}</button>
          </div>
        )}
        {phase === "fail" && (
          <div className="fill-msg" role="alert">
            <span>{t("profiles.new.failMsg")}</span>
            <span className="fill-msg-acts">
              <button type="button" className="btn" onClick={blank}>{t("profiles.new.blank")}</button>
              <button type="button" className="btn" onClick={showDrafts}>{t("profiles.model.retry")}</button>
            </span>
          </div>
        )}
        {phase === "nomodel" && <NoModelLine />}
      </div>
    );
    foot = (
      <div className="pf-foot">
        <button type="button" className="btn" onClick={() => setStage("choose")}>{t("profiles.new.back")}</button>
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
        <button type="button" className="btn cta" disabled={busy || text.trim() === ""} onClick={showDrafts}>{t("profiles.new.showDrafts")}</button>
      </div>
    );
  } else {
    const d = drafts?.[tab] ?? drafts?.[0];
    body = (
      <div className="pf-body">
        <div className="dtabs" role="tablist" aria-label={t("profiles.new.tabsAria")}>
          {(drafts ?? []).map((x, i) => (
            <button key={x.name} type="button" role="tab" aria-selected={tab === i} className={`pill${tab === i ? " on" : ""}`} onClick={() => setTab(i)}>
              {t("profiles.new.draftTab", { n: i + 1 })}
            </button>
          ))}
        </div>
        {d && (
          <div className="draft" role="tabpanel">
            <div className="draft-head">
              <Avatar name={d.name} hue={d.hue} size={40} />
              <div>
                <div className="draft-name">{d.name}</div>
                <div className="k">{d.summary}</div>
              </div>
            </div>
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
          </div>
        )}
        {questions.length > 0 && (
          <div className="q-grid">
            {questions.map((q, i) => (
              <div className="f" key={q.q}>
                <span className="lb">{q.q}</span>
                <Seg
                  full
                  label={q.q}
                  value={answers[i] ?? 0}
                  onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
                  options={q.options.map((o, j) => ({ value: j, label: o }))}
                />
              </div>
            ))}
          </div>
        )}
        <Field label={t("profiles.new.wish")}>
          {(id) => (
            <textarea id={id} className="inp inp-area" rows={2} value={wish} placeholder={t("profiles.new.wishPlaceholder")} onChange={(e) => setWish(e.target.value)} />
          )}
        </Field>
        <div className="f">
          <span className="lb">{t("profiles.new.detail")}</span>
          <Seg full label={t("profiles.new.detail")} value={detail} onChange={setDetail} options={[
            { value: "brief", label: t("profiles.new.detail.brief") },
            { value: "normal", label: t("profiles.new.detail.normal") },
            { value: "detailed", label: t("profiles.new.detail.detailed") },
          ]} />
          <p className="k">{t(DETAIL_HINT[detail])}</p>
        </div>
      </div>
    );
    foot = (
      <div className="pf-foot">
        <button type="button" className="btn" onClick={() => setStage("ask")}>{t("profiles.new.back")}</button>
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
        <button type="button" className="btn cta" onClick={create}>{t("profiles.new.create")}</button>
      </div>
    );
  }

  return (
    <Dialog title={t("profiles.new")} width={560} sheet={phone} onClose={onClose}>
      {body}
      {foot}
    </Dialog>
  );
}
