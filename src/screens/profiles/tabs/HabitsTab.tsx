// "Звички": habits the profile wrote (by her) and the ones the user added
// (yours). Adding and removing work on the draft; the limits are mock numbers.
// With no habits yet, the tab says so and offers to add one.
import { useState } from "react";
import { useT } from "@/i18n/index";
import type { Habit } from "@/mock/profiles";
import { Switch } from "../ui";
import { Cross } from "./AboutTab";
import type { TabProps } from "./types";

const TODAY_WRITTEN = 1;
const DAILY_LIMIT = 2;
const TOTAL_LIMIT = 20;

let seq = 0;
const nextId = () => `new-${++seq}`;

export function HabitsTab({ form, set }: TabProps) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const habit: Habit = { id: nextId(), text, by: "you" };
    set({ habits: [...form.habits, habit] });
    setDraft("");
  };
  const remove = (id: string) => set({ habits: form.habits.filter((h) => h.id !== id) });

  const auto = (
    <>
      <Switch on={form.habitsAuto} onChange={(habitsAuto) => set({ habitsAuto })}>{t("profiles.habits.auto")}</Switch>
      <div className="k">{t("profiles.habits.autoNote")}</div>
    </>
  );

  if (form.habits.length === 0 && !adding) {
    return (
      <div className="tab-stack">
        <div className="habits-empty">
          <h3 className="empty-h">{t("profiles.habits.emptyTitle")}</h3>
          <p className="k empty-text">{t("profiles.habits.emptyText")}</p>
          <button type="button" className="btn" onClick={() => setAdding(true)}>{t("profiles.habits.emptyAdd")}</button>
        </div>
        {auto}
      </div>
    );
  }

  return (
    <div className="cols">
      <div className="tab-stack">
        {form.habits.map((h) => (
          <div key={h.id} className="hab hab-lg">
            <span className="hab-text">{h.text}</span>
            <span className="src">{h.by === "you" ? t("profiles.habit.you") : t("profiles.habit.self", { date: h.date ?? "" })}</span>
            <button type="button" className="x" aria-label={t("profiles.habit.remove")} onClick={() => remove(h.id)}>
              <Cross />
            </button>
          </div>
        ))}
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="inp inp-flex"
            value={draft}
            placeholder={t("profiles.habit.placeholder")}
            aria-label={t("profiles.habit.placeholder")}
            autoFocus={adding}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn cta" disabled={!draft.trim()}>{t("profiles.habit.add")}</button>
        </form>
      </div>

      <div className="tab-stack">
        <div className="pv">
          <div className="pvh">{t("profiles.habits.limits")}</div>
          <div className="log">
            <div>
              {t("profiles.habits.today")} <b>{TODAY_WRITTEN} {t("profiles.habits.of")} {DAILY_LIMIT}</b>
            </div>
            <div>
              {t("profiles.habits.total")} <b>{form.habits.length} {t("profiles.habits.of")} {TOTAL_LIMIT}</b>
            </div>
            <div className="k">{t("profiles.habits.yoursNote")}</div>
          </div>
        </div>
        {auto}
      </div>
    </div>
  );
}
