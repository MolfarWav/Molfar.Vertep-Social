// "How you look from outside": a read-only block under a saved persona. A headline by the mood, how many characters have met it, who is warm and
// who is cool. It loads once per persona and says nothing while it loads or when the engine cannot answer (the editor stays as it was).
import { useEffect, useState } from "react";
import { useT } from "@/i18n/index";
import { loadReputation, type Group, type Reputation } from "./reputation-api";

function Names({ g }: { g: Group }) {
  const t = useT();
  const more = g.count - g.names.length;
  return (
    <>
      {g.names.join(", ")}
      {more > 0 ? ` ${t("you.rep.more", { n: more })}` : ""}
    </>
  );
}

export function ReputationBlock({ personaId }: { personaId: string }) {
  const t = useT();
  const [rep, setRep] = useState<{ characters: number; item: Reputation | null } | null>(null);
  useEffect(() => {
    let alive = true;
    setRep(null);
    loadReputation()
      .then((v) => alive && setRep({ characters: v.characters, item: v.personas.find((p) => p.id === personaId) ?? null }))
      .catch(() => alive && setRep({ characters: 0, item: null }));
    return () => {
      alive = false;
    };
  }, [personaId]);
  if (!rep || !rep.item) return null;
  const r = rep.item;
  return (
    <section className="you-rep" aria-labelledby="you-rep-h">
      <h2 id="you-rep-h" className="you-rep-h">{t("you.rep.title")}</h2>
      <p className={`you-rep-mood is-${r.mood}`}>{t(`you.rep.mood.${r.mood}` as never)}</p>
      {r.mood !== "unknown" && (
        <ul className="you-rep-list">
          <li>{t("you.rep.known", { n: r.known.count, all: rep.characters })}</li>
          {r.fond.count > 0 && (
            <li>
              <b>{t("you.rep.fond")}</b> <Names g={r.fond} />
            </li>
          )}
          {r.cool.count > 0 && (
            <li>
              <b>{t("you.rep.cool")}</b> <Names g={r.cool} />
            </li>
          )}
        </ul>
      )}
      <p className="k">{t("you.rep.hint")}</p>
    </section>
  );
}
