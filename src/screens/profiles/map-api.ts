// The relationship map's data: GET /life/graph (the Life plugin builds it from the people lists, nothing private in it). In the design preview
// (`?screen=`) a fixed mock stands in; `?n=<count>` makes a crowd of that many characters to look at the thinning-out rules.
import { PREVIEW, call } from "@/lib/api";
import type { GLink, GNode, Graph } from "./map-model";

export async function loadGraph(): Promise<Graph> {
  if (PREVIEW) return mockGraph();
  return call<Graph>("GET", "/life/graph");
}

const link = (from: string, to: string, level: GLink["level"], band: GLink["band"] = "", ties: GLink["ties"] = [], talks = 4): GLink => ({ from: "c:" + from, to, level, band, talks, ties });

function mockGraph(): Graph {
  let n = 0;
  let empty = "";
  try {
    const p = new URLSearchParams(location.search);
    n = Number(p.get("n") ?? 0) || 0;
    empty = p.get("mapstate") ?? "";
  } catch {
    // fixed mock
  }
  if (empty === "alone") return { nodes: [{ key: "c:mavka", name: "Мавка", kind: "character" }], links: [] };
  if (empty === "unmet") return { nodes: ["mavka", "yaryna", "lisovyk"].map((id, i) => ({ key: "c:" + id, name: ["Мавка", "Ярина", "Лісовик"][i], kind: "character" as const })), links: [] };
  if (n > 0) return crowd(n);
  const nodes: GNode[] = [
    { key: "c:mavka", name: "Мавка", kind: "character" },
    { key: "c:yaryna", name: "Ярина", kind: "character" },
    { key: "c:lisovyk", name: "Лісовик", kind: "character" },
    { key: "c:pereles", name: "Перелесник", kind: "character" },
    { key: "c:berehynia", name: "Берегиня", kind: "character" },
    { key: "c:domovyk", name: "Домовик", kind: "character" },
    { key: "u:u-yaroslav", name: "Ярослав", kind: "user" },
  ];
  const links: GLink[] = [
    link("mavka", "c:lisovyk", "close", "close", [{ type: "sibling" }], 14),
    link("lisovyk", "c:mavka", "close", "warm", [{ type: "sibling" }], 12),
    link("mavka", "c:yaryna", "acquaintance", "cold", [{ type: "rival" }], 5),
    link("yaryna", "c:mavka", "acquaintance", "hostile", [{ type: "rival" }], 5),
    link("mavka", "u:u-yaroslav", "friend", "warm", [{ type: "crush" }], 9),
    link("yaryna", "c:pereles", "friend", "warm", [{ type: "dating" }], 11),
    link("pereles", "c:yaryna", "friend", "close", [{ type: "partner" }], 11),
    link("berehynia", "c:domovyk", "penfriend", "", [{ type: "colleague" }], 6),
    link("domovyk", "c:berehynia", "acquaintance", "", [], 4),
    link("lisovyk", "c:berehynia", "acquaintance", "", [], 3),
    link("pereles", "u:u-yaroslav", "slight", "", [], 2),
  ];
  return { nodes, links };
}

/** A crowd of `n` characters in loose groups (the preview's `?n=14` or `?n=30`). */
function crowd(n: number): Graph {
  const nodes: GNode[] = Array.from({ length: n }, (_, i) => ({ key: "c:p" + i, name: "Персонаж " + (i + 1), kind: "character" as const }));
  const links: GLink[] = [];
  const levels: GLink["level"][] = ["slight", "acquaintance", "penfriend", "friend", "close"];
  for (let i = 0; i < n; i++) {
    for (const d of [1, 3]) {
      const j = (i + d) % n;
      if (j === i) continue;
      links.push(link("p" + i, "c:p" + j, levels[(i + d) % levels.length], i % 7 === 0 ? "cold" : "", i % 5 === 0 ? [{ type: "sibling" }] : i % 9 === 0 ? [{ type: "dating" }] : []));
    }
  }
  return { nodes, links };
}
