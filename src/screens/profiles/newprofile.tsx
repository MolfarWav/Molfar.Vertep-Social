// "New profile", as Roleplay's "New persona" is laid out: a choice (write it
// yourself, short interview, from a file, import from Roleplay); the interview
// (step 1: the idea, an optional picture, examples, a link to the questions;
// step 2: three drafts, quick questions, a wish, the detail level); five plain
// questions with no model; and a text file. Create makes an own profile and
// hands it to the screen; no second model call. The model is reached through
// model-api.ts only. Limits and wording follow Roleplay's persona-new.ts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { currentLang, useT } from "@/i18n/index";
import { plain, type MockProfile } from "@/mock/profiles";
import { suggest, type Draft, type PickedText, type Question } from "./model-api";
import { Dialog } from "./dialog";
import { Field } from "./ui";
import { NoModelLine } from "./fill-ui";
import { NewDrafts, type Detail } from "./newprofile-drafts";
import { ideaExamples, seededRandom, takeIdeas } from "./idea-examples";

export type NewStage = "choose" | "ask" | "questions" | "file" | "drafts";
export type AskPhase = "idle" | "busy" | "fail" | "nomodel";

/** Where the flow starts (the preview parameters use this). */
export interface NewStart {
  stage: NewStage;
  phase?: AskPhase;
  drafts?: Draft[];
  questions?: Question[];
  file?: PickedText;
}

export interface NewProfileProps {
  phone: boolean;
  start?: NewStart;
  onClose: () => void;
  onRoleplay: () => void;
  /** Creates the own profile and closes the flow. */
  onCreate: (p: MockProfile) => void;
  /** The blank profile's name until the user saves a nick. */
  unnamed: string;
  /** Seeds the example ideas (the `seed` preview parameter); default: random. */
  seed?: number;
}

/** Roleplay's limits for a picked file and a description. */
export const MAX_FILE_BYTES = 200 * 1024;
export const MAX_TEXT_CHARS = 12000;
const PICTURE_MAX = 10 * 1024 * 1024;
const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IDEA_MAX = 1500;
const SHOWN = 4;

/** The five plain questions; every answer is optional. */
export const QUESTION_KEYS = ["q1", "q2", "q3", "q4", "q5"] as const;
export type QAnswers = Record<(typeof QUESTION_KEYS)[number], string>;
const NO_ANSWERS: QAnswers = { q1: "", q2: "", q3: "", q4: "", q5: "" };


/** A blank own profile: the editor opens on it with every field empty. */
export function blankProfile(id: string, unnamed: string): MockProfile {
  return plain(id, unnamed, 200, "own", "");
}

/** An own profile from one draft. `lines` (the answered questions and the wish) are added to About. */
export function profileFromDraft(d: Draft, detail: Detail, lines: string[], id: string): MockProfile {
  const p = plain(id, d.name, d.hue, "own", d.about);
  return {
    ...p,
    about: [d.about, ...lines].filter((x) => x.trim()).join("\n"),
    voice: { ...p.voice, text: d.voiceText },
    interests: detail === "brief" ? [] : d.interests,
    forum: {
      ...p.forum,
      rank: detail === "brief" ? "" : d.rank,
      signature: detail === "detailed" ? d.signature : "",
    },
  };
}

/** An own profile from the five answers: the name is the first answer; About is the other answers, as lines. */
export function profileFromAnswers(a: QAnswers, id: string, unnamed: string, labels: Record<(typeof QUESTION_KEYS)[number], string>): MockProfile {
  const name = a.q1.trim() || unnamed;
  const about = QUESTION_KEYS.slice(1)
    .filter((k) => a[k].trim())
    .map((k) => `${labels[k]}: ${a[k].trim()}`)
    .join("\n");
  return { ...plain(id, name, 200, "own", about) };
}

/** An own profile from a picked text file: the text is the About. */
export function profileFromText(f: PickedText, name: string, id: string): MockProfile {
  return plain(id, name.trim() || f.name.replace(/\.[^.]+$/, "") || "Profile", 200, "own", f.text);
}

export function NewProfileFlow({ phone, start, onClose, onRoleplay, onCreate, unnamed, seed }: NewProfileProps) {
  const t = useT();
  const rand = useRef(seed === undefined ? Math.random : seededRandom(seed));
  const [ideas, setIdeas] = useState(() => takeIdeas(ideaExamples(currentLang()), [], SHOWN, rand.current));
  const [stage, setStage] = useState<NewStage>(start?.stage ?? "choose");
  const [text, setText] = useState("");
  const [picture, setPicture] = useState<{ url: string; data: string; mimeType: string } | null>(null);
  const [problem, setProblem] = useState("");
  const [phase, setPhase] = useState<AskPhase>(start?.phase ?? "idle");
  const [drafts, setDrafts] = useState<Draft[]>(start?.drafts ?? []);
  const [questions, setQuestions] = useState<Question[]>(start?.questions ?? []);
  const [answers, setAnswers] = useState<(number | null)[]>(() => (start?.questions ?? []).map(() => null));
  const [tab, setTab] = useState(0);
  const [wish, setWish] = useState("");
  const [detail, setDetail] = useState<Detail>("normal");
  const [qa, setQa] = useState<QAnswers>(NO_ANSWERS);
  const [file, setFile] = useState<PickedText | null>(start?.file ?? null);
  const [fileName, setFileName] = useState(() => start?.file?.name.replace(/\.[^.]+$/, "") ?? "");
  // Each call takes a number; only the latest may change the screen (Stop and unmount move it on).
  const ask = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const pictureInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      ask.current += 1;
    },
    [],
  );

  // A stage change removes the focused control: move focus into the new step
  // (the first mount is left to the dialog, which focuses its first control).
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    document.querySelector<HTMLElement>(".pf-dlg .nw-scroll")?.querySelector<HTMLElement>("textarea, input, [role=tab][aria-selected=true], button")?.focus();
  }, [stage]);

  const blank = () => onCreate(blankProfile(`own-${Date.now()}`, unnamed));

  const pickPicture = (f: File | undefined) => {
    if (!f) return;
    setProblem("");
    if (!PICTURE_TYPES.includes(f.type)) return setProblem(t("profiles.new.pictureType"));
    if (f.size > PICTURE_MAX) return setProblem(t("profiles.new.pictureSize"));
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      setPicture({ url, data: url.slice(url.indexOf(",") + 1), mimeType: f.type });
    };
    reader.onerror = () => setProblem(t("profiles.new.pictureRead"));
    reader.readAsDataURL(f);
  };

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    setProblem("");
    setFile(null);
    if (f.size > MAX_FILE_BYTES) return setProblem(t("profiles.new.fileTooBig"));
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      if (raw.includes("\u0000")) return setProblem(t("profiles.new.fileBinary"));
      const body = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
      const cut = body.length > MAX_TEXT_CHARS;
      setFileName(f.name.replace(/\.[^.]+$/, ""));
      setFile({ name: f.name, text: cut ? body.slice(0, MAX_TEXT_CHARS) : body, cut });
    };
    reader.onerror = () => setProblem(t("profiles.new.fileRead"));
    reader.readAsText(f);
  };

  const showDrafts = async () => {
    const mine = ask.current + 1;
    ask.current = mine;
    setPhase("busy");
    setProblem("");
    let res;
    try {
      res = await suggest({
        idea: text.trim(),
        ...(picture ? { image: { mimeType: picture.mimeType, data: picture.data } } : {}),
      });
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
    setAnswers(res.questions.map(() => null));
    setTab(0);
    setStage("drafts");
    setPhase("idle");
  };

  /** Stop waiting: the call's answer is ignored when it comes. */
  const stopWaiting = () => {
    ask.current += 1;
    setPhase("idle");
  };

  const goStage = (s: NewStage) => {
    setProblem("");
    setStage(s);
  };

  const createFromDraft = () => {
    const d = drafts[tab];
    if (!d) return;
    const lines = [
      ...questions.flatMap((q, i) => {
        const a = answers[i];
        return a === null || a === undefined ? [] : [`${q.q} ${q.options[a]}`];
      }),
      ...(wish.trim() ? [`${t("profiles.new.wishLine")} ${wish.trim()}`] : []),
    ];
    onCreate(profileFromDraft(d, detail, lines, `own-${Date.now()}`));
  };

  const busy = phase === "busy";
  const labels = {
    q1: t("profiles.new.q1"),
    q2: t("profiles.new.q2"),
    q3: t("profiles.new.q3"),
    q4: t("profiles.new.q4"),
    q5: t("profiles.new.q5"),
  };

  let title = t("profiles.new");
  let width = 640;
  let body: ReactNode;
  let foot: ReactNode;

  if (stage === "choose") {
    body = (
      <>
        <p className="pf-sub">{t("profiles.new.sub")}</p>
        <div className="choices" role="group" aria-label={t("profiles.new")}>
          <Row icon={<PencilIcon />} title={t("profiles.new.blank")} hint={t("profiles.new.blankHint")} onClick={blank} />
          <Row icon={<ChatIcon />} title={t("profiles.new.interview")} hint={t("profiles.new.interviewHint")} onClick={() => goStage("ask")} />
          <Row icon={<PageIcon />} title={t("profiles.new.file")} hint={t("profiles.new.fileHint")} onClick={() => goStage("file")} />
          <Row icon={<DownloadIcon />} title={t("profiles.import")} hint={t("profiles.new.importHint")} onClick={onRoleplay} />
        </div>
      </>
    );
    foot = (
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
      </div>
    );
  } else if (stage === "ask") {
    title = t("profiles.new.step1Title");
    body = (
      <>
        <p className="pf-sub">{t("profiles.new.step1Hint")}</p>
        <Field label={t("profiles.new.ask")}>
          {(id) => (
            <textarea
              id={id}
              className="inp inp-area"
              rows={4}
              maxLength={IDEA_MAX}
              value={text}
              disabled={busy}
              placeholder={t("profiles.new.askPlaceholder")}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
        <div className="f">
          <span className="lb">{t("profiles.new.pictureTitle")}</span>
          <input ref={pictureInput} type="file" accept={PICTURE_TYPES.join(",")} className="hidden" onChange={(e) => { pickPicture(e.target.files?.[0]); e.target.value = ""; }} />
          {picture ? (
            <div className="pic-row">
              <img src={picture.url} alt="" className="pic-thumb" />
              <span className="k grow">{t("profiles.new.pictureOn")}</span>
              <button type="button" className="btn btn-icon" aria-label={t("profiles.new.pictureRemove")} onClick={() => setPicture(null)}>×</button>
            </div>
          ) : (
            <button
              type="button"
              className="drop"
              onClick={() => pictureInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickPicture(e.dataTransfer.files?.[0]); }}
            >
              {t("profiles.new.pictureDrop")}
            </button>
          )}
        </div>
        <div className="f">
          <span className="lb">{t("profiles.new.examplesTitle")}</span>
          <div className="chips">
            {ideas.picks.map((x) => (
              <button key={x} type="button" className="chip chip-tap" onClick={() => setText(x)}>{x}</button>
            ))}
            <button
              type="button"
              className="chip chip-tap chip-icon"
              aria-label={t("profiles.new.shuffle")}
              onClick={() => setIdeas((prev) => takeIdeas(ideaExamples(currentLang()), prev.used, SHOWN, rand.current))}
            >
              ↻
            </button>
          </div>
        </div>
        <button type="button" className="linkbtn link-left" onClick={() => goStage("questions")}>{t("profiles.new.questionsLink")}</button>
        {problem && <p className="fill-msg" role="alert">{problem}</p>}
        {phase === "fail" && (
          <div className="fill-msg" role="alert">
            <span>{t("profiles.new.failMsg")}</span>
            <span className="fill-msg-acts">
              <button type="button" className="btn" onClick={() => goStage("questions")}>{t("profiles.new.questionsShort")}</button>
              <button type="button" className="btn" onClick={blank}>{t("profiles.new.blank")}</button>
              <button type="button" className="btn" onClick={showDrafts}>{t("profiles.model.retry")}</button>
            </span>
          </div>
        )}
        {phase === "nomodel" && <NoModelLine />}
        {busy && (
          <div className="fill-run" role="status">
            <span className="spin" aria-hidden="true" />
            <span>{t("profiles.model.thinking")}</span>
            <button type="button" className="btn" onClick={stopWaiting}>{t("profiles.new.stopWaiting")}</button>
          </div>
        )}
      </>
    );
    foot = (
      <div className="pf-foot nw-foot">
        <span className="k nw-note">{t("profiles.new.step1Foot")}</span>
        <button type="button" className="btn" onClick={() => goStage("choose")} disabled={busy}>{t("profiles.new.back")}</button>
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
        <button type="button" className="btn cta" disabled={busy || (text.trim() === "" && !picture)} onClick={showDrafts}>{t("profiles.new.showDrafts")}</button>
      </div>
    );
  } else if (stage === "questions") {
    title = t("profiles.new.qTitle");
    body = (
      <>
        <p className="pf-sub">{t("profiles.new.qHint")}</p>
        {QUESTION_KEYS.map((k) => (
          <Field key={k} label={labels[k]}>
            {(id) =>
              k === "q1" ? (
                <input id={id} className="inp" value={qa[k]} onChange={(e) => setQa((a) => ({ ...a, [k]: e.target.value }))} />
              ) : (
                <textarea id={id} className="inp inp-area" rows={2} value={qa[k]} onChange={(e) => setQa((a) => ({ ...a, [k]: e.target.value }))} />
              )
            }
          </Field>
        ))}
      </>
    );
    foot = (
      <div className="pf-foot nw-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={() => goStage("ask")}>{t("profiles.new.back")}</button>
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
        <button type="button" className="btn cta" onClick={() => onCreate(profileFromAnswers(qa, `own-${Date.now()}`, unnamed, labels))}>{t("profiles.new.create")}</button>
      </div>
    );
  } else if (stage === "file") {
    body = (
      <>
        <p className="pf-sub">{t("profiles.new.fileHint")}</p>
        <input ref={fileInput} type="file" accept=".txt,.md,.markdown,.json,text/*,application/json" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
        <button
          type="button"
          className="drop drop-tall"
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
        >
          {file ? file.name : t("profiles.new.fileDrop")}
        </button>
        {problem && <p className="fill-msg" role="alert">{problem}</p>}
        {file && (
          <div className="file-sum">
            <Field label={t("profiles.new.fileName")}>
              {(id) => <input id={id} className="inp" value={fileName} onChange={(e) => setFileName(e.target.value)} />}
            </Field>
            <span className="k">{t("profiles.new.fileInfo", { n: file.text.length })}</span>
            {file.cut && <span className="cut-note" data-testid="profiles-new-cut">{t("profiles.new.cut", { n: MAX_TEXT_CHARS })}</span>}
          </div>
        )}
        <p className="k">{t("profiles.new.fileNote")}</p>
      </>
    );
    foot = (
      <div className="pf-foot nw-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={() => goStage("choose")}>{t("profiles.new.back")}</button>
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
        <button
          type="button"
          className="btn cta"
          disabled={!file}
          onClick={() => file && onCreate(profileFromText(file, fileName, `own-${Date.now()}`))}
        >
          {t("profiles.new.create")}
        </button>
      </div>
    );
  } else {
    title = t("profiles.new.step2Title");
    width = 760;
    body = (
      <>
      <p className="pf-sub">{t("profiles.new.step2Hint")}</p>
      <NewDrafts
        drafts={drafts}
        questions={questions}
        answers={answers}
        onAnswer={(i, j) => setAnswers((a) => a.map((x, k) => (k === i ? (x === j ? null : j) : x)))}
        tab={tab}
        onTab={setTab}
        wish={wish}
        onWish={setWish}
        detail={detail}
        onDetail={setDetail}
      />
      </>
    );
    foot = (
      <div className="pf-foot nw-foot">
        <span className="k nw-note">{t("profiles.new.step2Foot")}</span>
        <button type="button" className="btn" onClick={() => goStage("ask")}>{t("profiles.new.back")}</button>
        <button type="button" className="btn" onClick={onClose}>{t("profiles.new.cancel")}</button>
        <button type="button" className="btn cta" disabled={!drafts[tab]} onClick={createFromDraft}>{t("profiles.new.createProfile")}</button>
      </div>
    );
  }

  return (
    <Dialog title={title} width={width} sheet={phone} onClose={onClose}>
      <div className="nw-scroll">
        <div className="pf-body">{body}</div>
      </div>
      {foot}
    </Dialog>
  );
}


/** The choice rows' icons: 20 px strokes in a 40 px square (the CSS draws the square). */
const ICON_PROPS = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const PencilIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);
const ChatIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M4 6.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3.5 3v-3H6a2 2 0 0 1-2-2z" />
    <path d="M18 9.5h.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H19v2.5l-2.8-2.5H12" />
  </svg>
);
const PageIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M10 12h6M10 16h6M10 8h2" />
  </svg>
);
const DownloadIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);

function Row({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" className="choice" onClick={onClick}>
      <span className="choice-ico">{icon}</span>
      <span className="choice-main">
        <span className="choice-t">{title}</span>
        <span className="choice-h">{hint}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="choice-chev">
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
