// The form for a new topic: board, title, first post. A page on desktop, a full-screen page with the buttons in
// a bottom bar on phone (the thumb reaches them, they stay above the keyboard).
import { useRef, useState } from "react";
import { useEmoji } from "@/emoji/use-emoji";
import { usePicture, type Attached } from "@/pictures/use-picture";
import { useT } from "@/i18n/index";
import { BackIcon } from "./Icons";

export interface BoardChoice {
  id: string;
  name: string;
  category: string;
}

export interface NewTopicProps {
  phone: boolean;
  boards: BoardChoice[];
  boardId: string;
  onCancel: () => void;
  /** Resolves to an error text, or null when the topic was posted (the screen then opens it). */
  onSubmit: (board: string, title: string, text: string, image?: Attached, poll?: string[]) => Promise<string | null>;
  /** The real forum: the topic may carry a picture (attach button). */
  pictures?: boolean;
  /** The topic may carry a poll of two to four options (issue #367). */
  polls?: boolean;
}

export function NewTopic(p: NewTopicProps) {
  const t = useT();
  const [board, setBoard] = useState(p.boardId || p.boards[0]?.id || "");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // null: no poll; else the option fields (two to four)
  const [poll, setPoll] = useState<string[] | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const emoji = useEmoji({ target: box, value: text, onChange: setText, phone: p.phone });
  const pic = usePicture({ phone: p.phone });
  const image = p.pictures ? pic.attached : null;
  const filled = (poll ?? []).map((o) => o.trim()).filter(Boolean);
  const pollOk = !poll || (filled.length >= 2 && new Set(filled.map((o) => o.toLowerCase())).size === filled.length);
  const ready = title.trim().length >= 3 && (text.trim().length > 0 || !!image) && !!board && pollOk;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const err = await p.onSubmit(board, title.trim(), text.trim(), image ?? undefined, poll ? filled : undefined);
    setBusy(false);
    if (err) setError(err);
  };
  const fields = (
    <>
      <div className="field">
        <label htmlFor="nt-board">{t("forum.new.board")}</label>
        <select id="nt-board" className="line" value={board} onChange={(e) => setBoard(e.target.value)}>
          {p.boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.category} › {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="nt-title">{t("forum.new.titleLabel")}</label>
        <input id="nt-title" className="line" value={title} maxLength={120} placeholder={t("forum.new.titlePh")} onChange={(e) => setTitle(e.target.value)} autoFocus={!p.phone} />
      </div>
      <div className="field">
        <div className="field-top">
          <label htmlFor="nt-text">{t("forum.new.textLabel")}</label>
          <span className="field-btns">
            {p.pictures && pic.button}
            {emoji.button}
          </span>
        </div>
        {p.pictures && pic.chip}
        <textarea
          id="nt-text"
          ref={box}
          className="inp tall"
          value={text}
          placeholder={t("forum.new.textPh")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
      </div>
      {p.polls && (
        <div className="field">
          {poll ? (
            <div className="npoll">
              <div className="field-top">
                <label htmlFor="nt-opt-0">{t("forum.new.poll.title")}</label>
                <button type="button" className="btn sm" onClick={() => setPoll(null)}>{t("forum.new.poll.remove")}</button>
              </div>
              {poll.map((o, i) => (
                <div key={i} className="npoll-row">
                  <input id={`nt-opt-${i}`} className="line" value={o} maxLength={60} placeholder={t("forum.new.poll.option", { n: i + 1 })} aria-label={t("forum.new.poll.option", { n: i + 1 })} onChange={(e) => setPoll(poll.map((x, j) => (j === i ? e.target.value : x)))} />
                  {poll.length > 2 && (
                    <button type="button" className="btn sm" aria-label={t("forum.new.poll.drop", { n: i + 1 })} onClick={() => setPoll(poll.filter((_, j) => j !== i))}>×</button>
                  )}
                </div>
              ))}
              {poll.length < 4 && <button type="button" className="btn sm" onClick={() => setPoll([...poll, ""])}>{t("forum.new.poll.more")}</button>}
              <div className="mut small">{filled.length < 2 ? t("forum.new.poll.need") : t("forum.new.poll.hint")}</div>
            </div>
          ) : (
            <button type="button" className="btn sm" onClick={() => setPoll(["", ""])}>{t("forum.new.poll.add")}</button>
          )}
        </div>
      )}
      <div className="mut small">{t("forum.new.note")}</div>
      {error && <div className="form-err" role="alert">{error}</div>}
      {p.pictures && pic.dialog}
    </>
  );

  if (p.phone) {
    return (
      <div className="s-forum is-phone is-topic">
        <header className="hd">
          <button type="button" className="hd-btn" aria-label={t("forum.new.cancel")} onClick={p.onCancel}>
            <BackIcon />
          </button>
          <div className="hd-text">
            <div className="hd-title">{t("forum.newTopic")}</div>
          </div>
        </header>
        <div className="fscroll pg newform">{fields}</div>
        <div className="rep">
          <button type="button" className="btn" onClick={p.onCancel}>{t("forum.new.cancel")}</button>
          <button type="button" className="btn cta grow" onClick={() => void submit()} disabled={!ready || busy}>{t("forum.new.submit")}</button>
        </div>
        {emoji.tray}
      </div>
    );
  }
  return (
    <div className="s-forum">
      <div className="fscroll">
        <div className="wrap tpage">
          <div className="ttl">
            <div className="ttl-title">{t("forum.newTopic")}</div>
          </div>
          <div className="qr">
            <div className="qr-body newform">{fields}</div>
            <div className="form-acts pad">
              <button type="button" className="btn" onClick={p.onCancel}>{t("forum.new.cancel")}</button>
              <button type="button" className="btn cta" onClick={() => void submit()} disabled={!ready || busy}>{t("forum.new.submit")}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
