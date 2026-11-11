// "Стосунки" (Relationships): who this character knows and how, in one place the user can find: the people list with the editor of the chosen
// person (`PeopleSection`) and two buttons to see them all drawn: the relationship map and the family tree (#366, redesigned in #369).
import { useT } from "@/i18n/index";
import { PeopleSection } from "./PeopleSection";
import type { TabProps } from "./types";

export function RelationsTab({ name, profileId, onView }: TabProps) {
  const t = useT();
  if (!profileId) {
    return (
      <div className="relsplit single">
        <p className="k rel-unsaved">{t("profiles.relations.unsaved")}</p>
      </div>
    );
  }
  return <PeopleSection profileId={profileId} name={name} onView={onView} />;
}
