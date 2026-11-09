// A profile's choice of sticker and custom emoji packs (issue #329, step 2): the packs this character may use. None by default.
// The Voice tab shows it; the list comes from the shared packs (add or change them in the emoji picker's manager).
import { useT } from "@/i18n/index";
import { Switch } from "@/screens/profiles/ui";
import { usePacks } from "./packs";
import "./stickers.css";

export function ProfilePacks({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const t = useT();
  const packs = usePacks().filter((p) => p.items.length > 0);
  const toggle = (id: string, on: boolean) => onChange(on ? [...value.filter((x) => x !== id), id] : value.filter((x) => x !== id));
  return (
    <div className="f f-wide stk-profile">
      <span className="lb">{t("stk.profile.title")}</span>
      {packs.length === 0 ? (
        <div className="k">{t("stk.profile.none")}</div>
      ) : (
        <>
          <div className="stk-picks">
            {packs.map((p) => (
              <div key={p.id} className="stk-pick">
                <img className="stk-thumb" src={p.items[0]!.url} alt="" draggable={false} />
                <Switch on={value.includes(p.id)} onChange={(on) => toggle(p.id, on)}>
                  {p.name} <span className="k">{t(`stk.kind.${p.kind}`)} · {p.items.length}</span>
                </Switch>
              </div>
            ))}
          </div>
          <div className="k">{t("stk.profile.hint")}</div>
        </>
      )}
    </div>
  );
}
