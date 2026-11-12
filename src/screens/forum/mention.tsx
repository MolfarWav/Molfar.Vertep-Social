// "@" in the reply box (issue #393): a short list of the people to mention under the box while an "@word" is typed.
// Arrow keys move, Enter or Tab take, Esc closes; a tap takes too. The text keeps a plain "@Name": the forum reads it
// (the named character answers first), so nothing else has to be stored.
import { useEffect, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useT } from "@/i18n/index";
import { applyMention, mentionAt, mentionChoices } from "./mention-logic";

export interface MentionOptions {
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  /** Names already in the topic, then every name Social knows. */
  near: string[];
  all: string[];
}

export interface MentionHandle {
  /** The list, to draw right above or below the box; null when no "@word" is being typed. */
  list: ReactNode;
  /** Spread on the textarea; `onChange` and `onKeyDown` wrap the caller's own. */
  bind: {
    onSelect: () => void;
    onKeyDownCapture: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  };
}

export function useMention(o: MentionOptions): MentionHandle {
  const t = useT();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  // the caret as the box has it now: a render follows every change of the text, and `caret` (set on select) follows a click or an arrow
  const here = o.target.current && document.activeElement === o.target.current ? (o.target.current.selectionStart ?? caret) : caret;
  const at = mentionAt(o.value, here);
  const choices = at ? mentionChoices(at.query, o.near, o.all) : [];
  const open = !!at && choices.length > 0 && closedAt !== at.from;
  useEffect(() => setActive(0), [at?.query, at?.from]);

  const pick = (name: string) => {
    if (!at) return;
    const next = applyMention(o.value, at, name);
    o.onChange(next.text);
    // the name is in: the list stays shut for this "@" (a trailing space would otherwise match the same name again)
    setClosedAt(at.from);
    // the caret goes after the name once React has put the text in
    requestAnimationFrame(() => {
      const el = o.target.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  // a popup over the box, like the lists of other chats: a zero-height anchor sits where the box starts and the list stands on it
  const list = open ? (
    <div className="mention-anchor">
      <div className="mention-list" role="listbox" aria-label={t("forum.topic.mentionList")}>
        {choices.map((name, i) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={i === active}
            className={"mention-opt" + (i === active ? " on" : "")}
            // keep the focus in the box: a tap must not blur it before the click lands
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(name)}
          >
            <span className="mention-av" aria-hidden="true">{Array.from(name)[0]?.toUpperCase()}</span>
            <span className="mention-name">{name}</span>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return {
    list,
    bind: {
      onSelect: () => {
        const el = o.target.current;
        if (el) setCaret(el.selectionStart ?? 0);
      },
      onKeyDownCapture: (e) => {
        if (!open) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setActive((i) => (i + (e.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
        } else if ((e.key === "Enter" && !e.ctrlKey && !e.metaKey) || e.key === "Tab") {
          e.preventDefault();
          pick(choices[active] ?? choices[0]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          if (at) setClosedAt(at.from);
        }
      },
    },
  };
}
