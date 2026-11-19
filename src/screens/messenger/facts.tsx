// The facts page of the Memory dialog (issue #446): the short facts a character remembers about the chat, one sentence each.
// Read them, add your own, correct one, pin it (never replaced by the model), mark it private, delete it; facts over the ceiling
// wait in the archive and can come back. Shown as a step of MemoryDialog, so it is a bottom sheet on a phone.
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/index";
import { FACT_KINDS, FACT_MAX, changeFacts, filterFacts, loadFacts, type Fact, type FactFilter, type FactKind, type FactOp, type Ledger } from "./facts-api";

const FILTERS: FactFilter[] = ["all", "pinned", "private", "archive"];

export function FactsPage(p: { id: string; name: string; onBack: () => void; onChanged: (l: Ledger) => void }) {
  const t = useT();
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FactFilter>("all");
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<FactKind>("about_you");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [asking, setAsking] = useState("");
  const [lastError, setLastError] = useState<FactOp | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setLedger(await loadFacts(p.id));
    } catch {
      setError(t("messenger.facts.loadFailed"));
    }
  }, [p.id, t]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (change: FactOp): Promise<boolean> => {
    setBusy(true);
    setError("");
    setLastError(null);
    try {
      const next = await changeFacts(p.id, change);
      setLedger(next);
      p.onChanged(next);
      return true;
    } catch {
      setError(t("messenger.facts.failed"));
      setLastError(change);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await run({ op: "add", text, kind })) setDraft("");
  };
  const saveEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    if (await run({ op: "update", factId: editing.id, text })) setEditing(null);
  };

  const shown = ledger ? filterFacts(ledger, filter) : [];
  const count = (f: FactFilter): number => (ledger ? filterFacts(ledger, f).length : 0);
  const kindLabel = (k: FactKind) => t(`messenger.facts.kind.${k}`, { name: p.name });

  const row = (f: Fact, archived: boolean) => {
    const isEditing = editing?.id === f.id;
    return (
      <li key={f.id} className={`fact${f.pinned ? " is-pinned" : ""}`}>
        <div className="fact-head">
          <span className="chip">{kindLabel(f.kind)}</span>
          {f.pinned && <span className="chip">{t("messenger.facts.pinned")}</span>}
          <span className="chip">{f.private ? t("messenger.facts.private") : t("messenger.facts.public")}</span>
          {f.by === "you" && <span className="k">{t("messenger.facts.byYou")}</span>}
        </div>
        {isEditing ? (
          <div className="fact-edit">
            <input
              className="inp"
              aria-label={t("messenger.facts.editLabel")}
              maxLength={FACT_MAX}
              value={editing.text}
              disabled={busy}
              onChange={(e) => setEditing({ id: f.id, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveEdit();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditing(null);
                }
              }}
            />
            <button type="button" className="btn cta" disabled={busy || !editing.text.trim()} onClick={() => void saveEdit()}>{t("messenger.facts.save")}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>{t("messenger.memory.cancel")}</button>
          </div>
        ) : (
          <p className="fact-text">{f.text}</p>
        )}
        {!isEditing && asking === f.id ? (
          <div className="fact-btns" role="group" aria-label={t("messenger.facts.deleteAsk")}>
            <span className="k">{t("messenger.facts.deleteAsk")}</span>
            <button type="button" className="btn danger" disabled={busy} onClick={() => void run({ op: "delete", factId: f.id }).then(() => setAsking(""))}>{t("messenger.facts.deleteYes")}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setAsking("")}>{t("messenger.memory.cancel")}</button>
          </div>
        ) : (
          !isEditing && (
            <div className="fact-btns">
              {archived ? (
                <button type="button" className="btn" disabled={busy} onClick={() => void run({ op: "restore", factId: f.id })}>{t("messenger.facts.restore")}</button>
              ) : (
                <>
                  <button type="button" className="btn" disabled={busy} onClick={() => void run({ op: "update", factId: f.id, pinned: !f.pinned })}>{f.pinned ? t("messenger.facts.unpin") : t("messenger.facts.pin")}</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void run({ op: "update", factId: f.id, private: !f.private })}>{f.private ? t("messenger.facts.makePublic") : t("messenger.facts.makePrivate")}</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setEditing({ id: f.id, text: f.text })}>{t("messenger.facts.edit")}</button>
                </>
              )}
              <button type="button" className="btn" disabled={busy} onClick={() => setAsking(f.id)}>{t("messenger.facts.delete")}</button>
            </div>
          )
        )}
      </li>
    );
  };

  return (
    <>
      <div className="pf-body">
        <p className="k">{t("messenger.facts.intro", { name: p.name })}</p>
        <div className="fact-add">
          <input
            className="inp"
            aria-label={t("messenger.facts.addLabel")}
            placeholder={t("messenger.facts.addPlaceholder")}
            maxLength={FACT_MAX}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
          <select className="inp fact-kind" aria-label={t("messenger.facts.kindLabel")} value={kind} onChange={(e) => setKind(e.target.value as FactKind)}>
            {FACT_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
          <button type="button" className="btn cta" disabled={busy || !draft.trim()} onClick={() => void add()}>{t("messenger.facts.add")}</button>
        </div>
        {ledger && (
          <div className="seg seg-small fact-seg" role="radiogroup" aria-label={t("messenger.facts.filter")}>
            {FILTERS.filter((f) => f !== "archive" || ledger.archive.length > 0 || filter === "archive").map((f) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {t(`messenger.facts.filter.${f}`)} {count(f)}
              </button>
            ))}
          </div>
        )}
        {!ledger && !error && <div className="k" role="status">{t("messenger.facts.loading")}</div>}
        {ledger && shown.length === 0 && (
          <p className="k fact-empty">{filter === "all" ? t("messenger.facts.empty", { name: p.name }) : t("messenger.facts.emptyFilter")}</p>
        )}
        {ledger && shown.length > 0 && <ul className="facts">{shown.map((f) => row(f, filter === "archive"))}</ul>}
        {ledger && filter === "archive" && <p className="k">{t("messenger.facts.archiveNote")}</p>}
        {ledger && ledger.dropped > 0 && filter === "archive" && <p className="k">{t("messenger.facts.dropped", { n: ledger.dropped })}</p>}
        {ledger && filter !== "archive" && ledger.learned.length > 0 && (
          <section className="fact-learned" aria-label={t("messenger.facts.learned.title")}>
            <h3 className="fact-learned-title">{t("messenger.facts.learned.title")}</h3>
            <p className="k">{t("messenger.facts.learned.intro", { name: p.name })}</p>
            <ul className="facts">
              {ledger.learned.map((f) => {
                const key = `${f.src}:${f.id}`;
                return (
                  <li key={key} className="fact">
                    <div className="fact-head">
                      <span className="chip">{t(f.src === "forum" ? "messenger.facts.learned.forum" : "messenger.facts.learned.clubs")}</span>
                      <span className="chip">{kindLabel(f.kind)}</span>
                    </div>
                    <p className="fact-text">{f.text}</p>
                    {asking === key ? (
                      <div className="fact-btns" role="group" aria-label={t("messenger.facts.learned.deleteAsk")}>
                        <span className="k">{t("messenger.facts.learned.deleteAsk")}</span>
                        <button type="button" className="btn danger" disabled={busy} onClick={() => void run({ op: "forget", src: f.src, factId: f.id }).then(() => setAsking(""))}>{t("messenger.facts.deleteYes")}</button>
                        <button type="button" className="btn" disabled={busy} onClick={() => setAsking("")}>{t("messenger.memory.cancel")}</button>
                      </div>
                    ) : (
                      <div className="fact-btns">
                        <button type="button" className="btn" disabled={busy} onClick={() => setAsking(key)}>{t("messenger.facts.delete")}</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {error && (
          <div className="form-err" role="alert">
            {error}{" "}
            <button type="button" className="btn btn-inline" onClick={() => void (lastError ? run(lastError) : load())}>{t("messenger.facts.retry")}</button>
          </div>
        )}
      </div>
      <div className="pf-foot">
        <button type="button" className="btn" onClick={p.onBack}>{t("messenger.facts.back")}</button>
      </div>
    </>
  );
}
