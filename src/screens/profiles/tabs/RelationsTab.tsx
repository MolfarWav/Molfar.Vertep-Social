// "Стосунки" (Relationships): who this character knows and how, in one place the user can find: the closeness to each person, family, work and
// romantic ties (the people list, `PeopleSection`), and two buttons to see them all drawn: the relationship map and the family tree (#366).
// It used to sit at the bottom of the Life tab, where nobody looked for family.
import { useT } from "@/i18n/index";
import { PeopleSection } from "./PeopleSection";
import type { TabProps } from "./types";

export function RelationsTab({ name, profileId, onView }: TabProps) {
  const t = useT();
  if (!profileId) {
    return (
      <div className="tab-stack">
        <p className="k">{t("profiles.relations.unsaved")}</p>
      </div>
    );
  }
  return (
    <div className="tab-stack tab-relations">
      <p className="k">{t("profiles.relations.intro", { name })}</p>
      {onView && (
        <div className="relations-views">
          <button type="button" className="btn" onClick={() => onView("map")}>{t("profiles.relations.map")}</button>
          <button type="button" className="btn" onClick={() => onView("family")}>{t("profiles.relations.family")}</button>
        </div>
      )}
      <PeopleSection profileId={profileId} />
    </div>
  );
}
