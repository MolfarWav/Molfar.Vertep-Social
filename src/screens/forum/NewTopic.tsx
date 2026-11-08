// The form for a new topic: board, title, first post. A page on desktop, a full-screen page with the buttons in
// a bottom bar on phone (the thumb reaches them, they stay above the keyboard).
import { useState } from "react";
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
  onSubmit: (board: string, title: string, text: string) => Promise<string | null>;
}

export function NewTopic(p: NewTopicProps) {
  const t = useT();
  const [board, setBoard] = useState(p.boardId || p.boards[0]?.id || "");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = title.trim().length >= 3 && text.trim().length > 0 && !!board;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const err = await p.onSubmit(board, title.trim(), text.trim());
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
        <label htmlFor="nt-text">{t("forum.new.textLabel")}</label>
        <textarea
          id="nt-text"
          className="inp tall"
          value={text}
          placeholder={t("forum.new.textPh")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit();
          }}
        />
      </div>
      <div className="mut small">{t("forum.new.note")}</div>
      {error && <div className="form-err" role="alert">{error}</div>}
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
