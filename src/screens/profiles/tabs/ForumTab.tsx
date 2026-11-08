// "Форум": how the profile posts on the forum. The preview shows its post with
// the rank and signature as they are typed.
import { useT } from "@/i18n/index";
import { Avatar } from "@/components/Avatar";
import type { ForumForm } from "@/mock/profiles";
import { Chip, Field, Slider, Switch } from "../ui";
import type { TabProps } from "./types";

export function ForumTab({ form, set, name, hue }: TabProps) {
  const t = useT();
  const f = form.forum;
  const setF = (patch: Partial<ForumForm>) => set({ forum: { ...f, ...patch } });

  return (
    <div className="cols">
      <div className="tab-stack">
        <div className="grid2">
          <Field label={t("profiles.forum.rank")}>
            {(id) => <input id={id} className="inp" value={f.rank} onChange={(e) => setF({ rank: e.target.value })} />}
          </Field>
          <Field label={t("profiles.forum.signature")}>
            {(id) => <input id={id} className="inp" value={f.signature} onChange={(e) => setF({ signature: e.target.value })} />}
          </Field>
        </div>

        <div className="f f-wide">
          <span className="lb">{t("profiles.forum.frequency")}</span>
          <Slider
            label={t("profiles.forum.frequency")}
            value={f.frequency}
            onChange={(frequency) => setF({ frequency })}
            left={t("profiles.forum.rare")}
            middle={t("profiles.forum.moderate")}
            right={t("profiles.forum.frequent")}
          />
        </div>

        <Switch on={f.opensOwn} onChange={(opensOwn) => setF({ opensOwn })}>{t("profiles.forum.opensOwn")}</Switch>
        <Switch on={f.repliesYou} onChange={(repliesYou) => setF({ repliesYou })}>{t("profiles.forum.repliesYou")}</Switch>
        <Switch on={f.repliesOthers} onChange={(repliesOthers) => setF({ repliesOthers })}>{t("profiles.forum.repliesOthers")}</Switch>

        <div className="f">
          <span className="lb">{t("profiles.forum.favourites")}</span>
          <div className="chips">
            {f.favourites.map((c, i) => (
              <Chip
                key={c.name}
                on={c.on}
                onClick={() => setF({ favourites: f.favourites.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })}
              >
                {c.name}
              </Chip>
            ))}
            <button type="button" className="chip">{t("profiles.about.addChip")}</button>
          </div>
        </div>
      </div>

      <div className="pv">
        <div className="pvh">{t("profiles.forum.preview")}</div>
        <div className="post-wrap">
          <div className="post">
            <div className="au">
              <Avatar name={name} hue={hue} size={48} />
              <b style={{ color: "var(--acct)" }}>{name}</b>
              <span className="k">{f.rank}</span>
            </div>
            <div className="bd">
              <div>Я бачила тінь на світанку.</div>
              <div className="sig">{f.signature}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
