// "Про себе": nick, the short About text, interests, and the habits the profile
// wrote itself. The user's own habits are in the Habits tab.
import { useT } from "@/i18n/index";
import type { Habit } from "@/mock/profiles";
import { PREVIEW } from "@/lib/api";
import { AddChip, Chip, Field, Switch, withItem } from "../ui";
import { FillActions } from "../fill-ui";
import { SectionPage } from "../sections";
import type { TabProps } from "./types";

export function AboutTab({ form, set, onRefresh, fill, source }: TabProps) {
  const t = useT();
  const selfHabits = form.habits.filter((h) => h.by === "self");
  const removeHabit = (h: Habit) => set({ habits: form.habits.filter((x) => x.id !== h.id) });

  return (
    <SectionPage
      tab="about"
      label={t("profiles.sec.menu")}
      sections={[
        {
          id: "who",
          title: t("profiles.sec.who"),
          icon: "user",
          tone: "cyan",
          children: (
            <>
              {PREVIEW || source === "roleplay" ? (
                <p className="note">
                  {t("profiles.about.note")}{" "}
                  <button type="button" className="linkbtn" onClick={onRefresh}>{t("profiles.editor.refresh")}</button>{" "}
                  {t("profiles.about.refreshHint")}
                </p>
              ) : (
                <p className="note">{t("profiles.about.noteOwn")}</p>
              )}
              {fill && <FillActions fill={fill} />}
              <Field label={t("profiles.about.nick")}>
                {(id) => <input id={id} className="inp" value={form.nick} onChange={(e) => set({ nick: e.target.value })} />}
              </Field>
              <Field label={t("profiles.about.about")}>
                {(id) => <textarea id={id} className="inp inp-area" rows={3} value={form.about} onChange={(e) => set({ about: e.target.value })} />}
              </Field>
              <div className="f">
                <Switch on={form.adult === true} onChange={(adult) => set({ adult })}>{t("profiles.about.adult")}</Switch>
                <p className="k">{t("profiles.about.adultHint")}</p>
              </div>
            </>
          ),
        },
        {
          id: "interests",
          title: t("profiles.about.interests"),
          icon: "star",
          tone: "amber",
          children: (
            <div className="chips">
              {form.interests.map((x) => (
                <Chip key={x} hued={x} onRemove={() => set({ interests: form.interests.filter((y) => y !== x) })} removeLabel={t("profiles.chip.remove", { name: x })}>{x}</Chip>
              ))}
              <AddChip label={t("profiles.about.addChip")} inputLabel={t("profiles.chip.new")} onAdd={(x) => set({ interests: withItem(form.interests, x) })} />
            </div>
          ),
        },
        {
          id: "tags",
          title: t("profiles.about.tags"),
          icon: "tag",
          tone: "violet",
          children: (
            <>
              <div className="chips">
                {form.tags.map((x) => (
                  <Chip key={x} hued={x} onRemove={() => set({ tags: form.tags.filter((y) => y !== x) })} removeLabel={t("profiles.chip.remove", { name: x })}>{x}</Chip>
                ))}
                <AddChip label={t("profiles.about.addChip")} inputLabel={t("profiles.chip.newTag")} onAdd={(x) => set({ tags: withItem(form.tags, x.slice(0, 24), 8) })} />
              </div>
              <p className="k">{t("profiles.about.tagsNote")}</p>
            </>
          ),
        },
        {
          id: "habits",
          title: t("profiles.about.habits"),
          icon: "sprout",
          tone: "emerald",
          children: (
            <>
              {selfHabits.map((h) => (
                <div key={h.id} className="hab">
                  <span className="hab-text">{h.text}</span>
                  <button type="button" className="x" aria-label={t("profiles.habit.remove")} onClick={() => removeHabit(h)}>
                    <Cross />
                  </button>
                </div>
              ))}
              <p className="k">{t("profiles.about.habitsNote")}</p>
            </>
          ),
        },
      ]}
    />
  );
}

export function Cross() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
