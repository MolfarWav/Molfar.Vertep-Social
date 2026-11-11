// "Форум": how the profile posts on the forum. The preview shows its post with
// the rank and signature as they are typed.
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import type { ForumForm } from "@/mock/profiles";
import { useGet } from "@/screens/forum/data";
import { AddChip, Chip, Field, Slider, Switch } from "../ui";
import { SectionPage } from "../sections";
import type { TabProps } from "./types";

const MAX_FAVOURITES = 20;
/** The design preview (`?screen=`) never calls the engine: these boards stand in. */
const PREVIEW_BOARDS = { categories: [{ id: "c1", name: "General", boards: [{ id: "b1", name: "Guest" }, { id: "b2", name: "Tales" }, { id: "b3", name: "Music" }, { id: "b4", name: "Off-topic" }] }] };

/** The boards of the forum, as names (the picker under Favourite boards). */
interface BoardNames {
  categories: { id: string; name: string; boards: { id: string; name: string }[] }[];
}

export function ForumTab({ form, set, name, hue }: TabProps) {
  const t = useT();
  const f = form.forum;
  const setF = (patch: Partial<ForumForm>) => set({ forum: { ...f, ...patch } });
  // the boards that exist now and are not chosen yet; the engine matches a favourite to a board by name without regard to case
  const got = useGet<BoardNames>("/forum/boards").data;
  const boards = PREVIEW ? PREVIEW_BOARDS : got;
  const chosen = new Set(f.favourites.map((x) => x.name.toLowerCase()));
  const offered = (boards?.categories ?? []).flatMap((c) => c.boards.map((b) => b.name)).filter((n, i, all) => !chosen.has(n.toLowerCase()) && all.indexOf(n) === i);
  const addFavourite = (n: string) => {
    if (n && f.favourites.length < MAX_FAVOURITES && !chosen.has(n.toLowerCase())) setF({ favourites: [...f.favourites, { name: n, on: true }] });
  };

  return (
    <SectionPage
      tab="forum"
      label={t("profiles.sec.menu")}
      sections={[
        {
          id: "post",
          title: t("profiles.sec.post"),
          icon: "user",
          tone: "sky",
          children: (
            <div className="grid2">
              <Field label={t("profiles.forum.rank")}>
                {(id) => <input id={id} className="inp" value={f.rank} onChange={(e) => setF({ rank: e.target.value })} />}
              </Field>
              <Field label={t("profiles.forum.signature")}>
                {(id) => <input id={id} className="inp" value={f.signature} onChange={(e) => setF({ signature: e.target.value })} />}
              </Field>
            </div>
          ),
        },
        {
          id: "freq",
          title: t("profiles.forum.frequency"),
          icon: "pulse",
          tone: "teal",
          children: (
            <div className="f f-wide">
              <Slider
                label={t("profiles.forum.frequency")}
                value={f.frequency}
                onChange={(frequency) => setF({ frequency })}
                left={t("profiles.forum.rare")}
                middle={t("profiles.forum.moderate")}
                right={t("profiles.forum.frequent")}
              />
            </div>
          ),
        },
        {
          id: "beh",
          title: t("profiles.sec.behaviour"),
          icon: "chat",
          tone: "violet",
          children: (
            <>
              <Switch on={f.opensOwn} onChange={(opensOwn) => setF({ opensOwn })}>{t("profiles.forum.opensOwn")}</Switch>
              <Switch on={f.repliesYou} onChange={(repliesYou) => setF({ repliesYou })}>{t("profiles.forum.repliesYou")}</Switch>
              <Switch on={f.repliesOthers} onChange={(repliesOthers) => setF({ repliesOthers })}>{t("profiles.forum.repliesOthers")}</Switch>
            </>
          ),
        },
        {
          id: "boards",
          title: t("profiles.forum.favourites"),
          icon: "star",
          tone: "amber",
          children: (
            <div className="f">
              <div className="chips">
                {f.favourites.map((c, i) => (
                  <Chip
                    key={c.name}
                    on={c.on}
                    onClick={() => setF({ favourites: f.favourites.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })}
                    onRemove={() => setF({ favourites: f.favourites.filter((_, j) => j !== i) })}
                    removeLabel={t("profiles.chip.remove", { name: c.name })}
                  >
                    {c.name}
                  </Chip>
                ))}
                <AddChip
                  label={t("profiles.about.addChip")}
                  inputLabel={t("profiles.chip.new")}
                  onAdd={(text) => addFavourite(text.trim())}
                />
              </div>
              {offered.length > 0 && f.favourites.length < MAX_FAVOURITES && (
                <div className="board-pick">
                  <span className="hint">{t("profiles.forum.pickBoards")}</span>
                  <div className="chips">
                    {offered.map((n) => (
                      <button key={n} type="button" className="chip" aria-label={t("profiles.forum.addBoard", { name: n })} onClick={() => addFavourite(n)}>
                        + {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ),
        },
        {
          id: "prev",
          title: t("profiles.forum.preview"),
          icon: "eye",
          tone: "emerald",
          children: (
            <div className="pv">
              <div className="post-wrap">
                <div className="post">
                  <div className="au">
                    <Avatar name={name} hue={hue} size={48} picture={form.picture || undefined} />
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
          ),
        },
      ]}
    />
  );
}
