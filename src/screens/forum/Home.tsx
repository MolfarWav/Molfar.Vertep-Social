// The forum front page, shared by the design preview (mock data) and the real forum: the banner, the autonomy
// strip, the boards (a table on desktop, cards on phone), who is here and the statistics.
import { useState } from "react";
import { useT } from "@/i18n/index";
import { BarActions } from "@/shell/nav";
import { BoardCards, BoardTable } from "./Boards";
import { PlusIcon, SearchIcon } from "./Icons";
import type { ForumCategory, StripData, WriteNotice } from "./model";
import { NoticeLine, Strip } from "./Strip";

export interface HomeStats {
  posts: number;
  topics: number;
  members: number;
  newest: string;
}

export interface HomeProps {
  phone: boolean;
  /** false in the design preview: the search, "Ask Molfar" and the board buttons are mock there. */
  live: boolean;
  categories: ForumCategory[];
  strip: StripData;
  online: string[];
  selfName: string;
  stats: HomeStats;
  writing: boolean;
  notice: WriteNotice | null;
  onCloseNotice: () => void;
  onWriteNow: () => void;
  onSwitchOn: () => void;
  onBoard: (id: string) => void;
  onTopic: (id?: string) => void;
  onNewTopic: () => void;
  onDefaults: () => void;
  /** Adds a board; resolves to an error text, or null when it worked. */
  onAddBoard: (category: string, name: string, desc: string) => Promise<string | null>;
}

export function Home(p: HomeProps) {
  const t = useT();
  const has = p.categories.length > 0;
  const strip = <Strip data={p.strip} phone={p.phone} onSwitch={p.onSwitchOn} onWriteNow={p.onWriteNow} writing={p.writing} />;
  const notice = <NoticeLine notice={p.notice} onClose={p.onCloseNotice} />;
  const boards = has ? (
    <>
      {p.phone ? <BoardCards categories={p.categories} onBoard={p.onBoard} onTopic={p.onTopic} /> : <BoardTable categories={p.categories} onBoard={p.onBoard} onTopic={p.onTopic} />}
      {p.live && <NewBoard categories={p.categories.map((c) => c.name)} onAdd={p.onAddBoard} />}
    </>
  ) : (
    <Empty live={p.live} onDefaults={p.onDefaults} onAdd={p.onAddBoard} />
  );
  const newTopic = (has || !p.live) && (
    <button type="button" className="btn cta" onClick={p.onNewTopic}>
      <PlusIcon />
      {t("forum.newTopic")}
    </button>
  );

  if (p.phone) {
    return (
      <div className="s-forum is-phone">
        {!p.live && (
          <BarActions>
            <button type="button" className="ib" style={{ width: 44, height: 44 }} aria-label={t("forum.search")}>
              <SearchIcon size={20} />
            </button>
          </BarActions>
        )}
        <div key="home" className="fscroll pg">
          <div className="ban">
            <div className="ban-text">
              <div className="ban-title">{t("forum.title")}</div>
            </div>
            {newTopic}
          </div>
          {strip}
          {notice}
          {boards}
        </div>
      </div>
    );
  }
  return (
    <div className="s-forum">
      <div key="home" className="fscroll">
        <div className="wrap">
          <div className="ban">
            <div className="ban-text">
              <div className="ban-title">{t("forum.title")}</div>
              <div className="mut">{t("forum.intro")}</div>
            </div>
            {!p.live && <input className="search" aria-label={t("forum.search")} placeholder={t("forum.search.placeholder")} />}
            {newTopic}
          </div>
          {strip}
          {notice}
          {boards}
          {has && (
            <div className="two">
              <div className="box">
                <div className="h">{t("forum.online.title")}</div>
                <div className="b">
                  <div>
                    {t("forum.online.here")}{" "}
                    {p.online.map((n, i) => (
                      <span key={`${n}-${i}`}>
                        {i > 0 && ", "}
                        {i === 0 ? <b className="self">{p.selfName}</b> : n}
                      </span>
                    ))}
                  </div>
                  <div className="mut">{t("forum.online.note")}</div>
                </div>
              </div>
              <div className="box">
                <div className="h">{t("forum.stats.title")}</div>
                <div className="b">
                  <div>
                    {t("forum.stats.posts")}: <b>{p.stats.posts}</b> · {t("forum.stats.topics")}: <b>{p.stats.topics}</b> · {t("forum.stats.members")}: <b>{p.stats.members}</b>
                  </div>
                  {p.stats.newest && <div className="mut">{t("forum.stats.newest", { name: p.stats.newest })}</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small form that adds one board; closed it is a quiet button under the boards. */
function NewBoard({ categories, onAdd, open: initial = false }: { categories: string[]; onAdd: HomeProps["onAddBoard"]; open?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(initial);
  const [category, setCategory] = useState(categories[0] ?? t("forum.board.new.defaultCategory"));
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) {
    return (
      <div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          <PlusIcon />
          {t("forum.board.new")}
        </button>
      </div>
    );
  }
  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const err = await onAdd(category.trim() || t("forum.board.new.defaultCategory"), name.trim(), desc.trim());
    setBusy(false);
    if (err) setError(err);
    else {
      setName("");
      setDesc("");
      setError("");
      setOpen(false);
    }
  };
  return (
    <form
      className="newboard"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <div className="field">
        <label htmlFor="nb-cat">{t("forum.board.new.category")}</label>
        <input id="nb-cat" className="line" list="nb-cats" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} />
        <datalist id="nb-cats">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label htmlFor="nb-name">{t("forum.board.new.name")}</label>
        <input id="nb-name" className="line" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="nb-desc">{t("forum.board.new.desc")}</label>
        <input id="nb-desc" className="line" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={160} />
      </div>
      {error && <div className="form-err" role="alert">{error}</div>}
      <div className="form-acts">
        <button type="button" className="btn" onClick={() => setOpen(false)}>{t("forum.new.cancel")}</button>
        <button type="submit" className="btn cta" disabled={!name.trim() || busy}>{t("forum.board.new.add")}</button>
      </div>
    </form>
  );
}

/** Home with no boards yet: say what boards are, offer the defaults, or one board of your own. */
function Empty({ live, onDefaults, onAdd }: { live: boolean; onDefaults: () => void; onAdd: HomeProps["onAddBoard"] }) {
  const t = useT();
  const [form, setForm] = useState(false);
  return (
    <div className="empty">
      <div className="empty-title">{t("forum.empty.title")}</div>
      <div className="empty-text">{live ? t("forum.empty.textLive") : t("forum.empty.text")}</div>
      {form ? (
        <NewBoard categories={[]} onAdd={onAdd} open />
      ) : (
        <div className="empty-acts">
          {live && (
            <button type="button" className="btn cta" onClick={onDefaults}>
              {t("forum.empty.defaults")}
            </button>
          )}
          <button type="button" className={live ? "btn" : "btn cta"} onClick={() => (live ? setForm(true) : undefined)}>
            <PlusIcon />
            {t("forum.empty.newBoard")}
          </button>
          {!live && <button type="button" className="btn">{t("forum.empty.ask")}</button>}
        </div>
      )}
    </div>
  );
}
