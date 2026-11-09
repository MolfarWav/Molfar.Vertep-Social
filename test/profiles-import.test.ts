import { expect, test } from "bun:test";
import path from "node:path";

// The Roleplay import in the profiles plugin, driven with a fake host: a Map as Social's data folder, a fake
// `host.peer` over a Map of Roleplay files, canned model results.
const plugin = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));

type Files = Record<string, unknown>;

function makeHost(rp: Files | null, results: Record<string, unknown> = {}) {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
  const reads: string[] = [];
  const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const host: any = {
    fs: {
      read: (p: string) => {
        if (!files.has(p)) throw new Error("ENOENT");
        return files.get(p)!;
      },
      write: (p: string, c: string) => void files.set(p, c),
      remove: (p: string) => void files.delete(p),
      list: (d: string) => {
        const out = [...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1));
        if (!out.length) throw new Error("ENOENT");
        return out.sort();
      },
    },
    llm: { results, request: (key: string, req: any) => void requests.push({ key, req }) },
  };
  if (rp) {
    host.peer = {
      apps: () => [{ app: "roleplay", paths: ["characters/*/card.json", "personas/*.json"] }],
      read: (app: string, rel: string) => {
        reads.push(rel);
        if (app !== "roleplay") throw new Error("peer read refused: no access to app " + app);
        if (!(rel in rp)) throw new Error("peer read: not found");
        return text(rp[rel]);
      },
      list: (app: string, dir: string) => {
        if (app !== "roleplay") throw new Error("peer read refused: no access");
        const names = new Set<string>();
        for (const k of Object.keys(rp)) {
          if (!k.startsWith(dir + "/")) continue;
          names.add(k.slice(dir.length + 1).split("/")[0]!);
        }
        if (!names.size) throw new Error("peer read: not found");
        return [...names].sort();
      },
    };
  }
  return { host, files, requests, reads };
}

const route = (host: any, method: string, p: string, body?: unknown, extra: object = {}) => plugin.handleRoute({ method, path: p, body, ...extra }, host);

const soul = (extra: object = {}) => ({ v: 1, characters: extra });
const card = (name: string, ext: object = {}, more: object = {}) => ({ spec: "chara_card_v2", name, description: "", personality: "", scenario: "", extensions: ext, ...more });

const ROLEPLAY: Files = {
  "characters/mavka/card.json": card("Мавка з озера v3", { molfar_soul: soul({ Мавка: { pronouns: "she", class: "ally", traits: { shyness: 80, curiosity: 20 }, coping: "goes quiet" } }) }, {
    description: "Мешканка озера. Говорить повільно.",
    personality: "Тиха, уважна.",
    scenario: "Берег, ранок.",
    first_mes: "*Вона дивиться на воду.*",
    mes_example: "<START>\n{{char}}: SECRET-EXAMPLE",
    system_prompt: "SECRET-SYSTEM",
    creator_notes: "SECRET-NOTES",
    avatar: "data:image/png;base64,AAAA" + "A".repeat(5000),
  }),
  "characters/berehynia/card.json": card("Берегиня", {}, { description: "Охоронниця берега." }),
  "characters/verhy/card.json": card(
    "Хроніки Верхи",
    { molfar_card_type: "narrator", molfar_soul: soul({ Горпина: { pronouns: "she" }, Чугайстер: { pronouns: "he" } }) },
    { description: "Світ Верхи.\n\n### Горпина\nЗнахарка, живе при млині.\n\n### Чугайстер\nЛісовий пастух, мовчазний.", personality: "" },
  ),
  "characters/crowd/card.json": card("Натовп", { molfar_card_type: "group" }, { description: "x" }),
  "characters/helper/card.json": card("Помічник", { molfar_card_type: "assistant" }, { description: "x" }),
  "characters/broken/card.json": "{ not json",
  "personas/wanderer.json": { name: "Мандрівник", title: "Gentleman", pronouns: "he", description: "Іде зі сходу." },
  "personas/nameless.json": { description: "no name" },
};

test("closed: no peer, or Roleplay not among the allowed apps", () => {
  const a = makeHost(null);
  expect(route(a.host, "GET", "/profiles/roleplay/status").json).toEqual({ ok: true, state: "closed" });
  expect(route(a.host, "GET", "/profiles/roleplay").json.state).toBe("closed");
  const b = makeHost({});
  b.host.peer.apps = () => [{ app: "other", paths: ["x"] }];
  expect(route(b.host, "GET", "/profiles/roleplay").json.state).toBe("closed");
  const r = route(b.host, "POST", "/profiles/import", { kind: "card", id: "mavka" });
  expect(r.json.ok).toBe(false);
  expect(r.json.code).toBe("no-access");
  expect(b.requests).toHaveLength(0);
});

test("the scan splits a narrator by its Souls and hides groups and assistants", () => {
  const { host } = makeHost(ROLEPLAY);
  expect(route(host, "GET", "/profiles/roleplay/status").json.state).toBe("ready");
  const out = route(host, "GET", "/profiles/roleplay").json;
  expect(out.state).toBe("ready");
  expect(out.hidden).toEqual({ group: 1, assistant: 1, unreadable: 1 });
  const rows = out.characters;
  const by = (n: string) => rows.find((r: any) => r.name === n);
  // a card with a Soul: the Soul's name, not the card's title
  expect(by("Мавка")).toMatchObject({ card: "Мавка з озера v3", soul: true, kind: "character", ref: { kind: "card", id: "mavka" } });
  // no Soul: the card's title, flagged
  expect(by("Берегиня")).toMatchObject({ soul: false, kind: "character" });
  // the narrator row and its members
  const narrator = by("Хроніки Верхи");
  expect(narrator.kind).toBe("narrator");
  const members = rows.filter((r: any) => r.parent === narrator.id);
  expect(members.map((m: any) => m.name)).toEqual(["Горпина", "Чугайстер"]);
  expect(members[0].ref).toEqual({ kind: "card", id: "verhy", key: "Горпина" });
  expect(out.characters.some((r: any) => r.name === "Натовп" || r.name === "Помічник")).toBe(false);
  // personas are not profiles: they are offered on Your profile (/you/roleplay) only
  expect(out.personas).toBeUndefined();
  // every id is a valid profile id and they are all different
  const ids = rows.map((r: any) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,60}$/);
  // the scan carries no card text
  expect(JSON.stringify(out)).not.toContain("SECRET");
  expect(JSON.stringify(out)).not.toContain("повільно");
});

test("import ids are stable, safe and different for different sources", () => {
  const { importId } = plugin;
  expect(importId("card", "mavka")).toBe("rp-mavka");
  expect(importId("card", "mavka")).toBe(importId("card", "mavka"));
  expect(importId("persona", "mavka")).toBe("pe-mavka");
  expect(importId("card", "verhy", "Горпина")).not.toBe(importId("card", "verhy", "Чугайстер"));
  expect(importId("card", "Mavka")).not.toBe(importId("card", "mavka"));
  expect(importId("card", "a b/../c")).toMatch(/^[A-Za-z0-9_-]{1,60}$/);
  expect(importId("card", "x".repeat(120), "y".repeat(80)).length).toBeLessThanOrEqual(60);
  expect(importId("card", "ш".repeat(100))).toMatch(/^[A-Za-z0-9_-]{1,60}$/);
});

test("the material holds the card text and the Soul, and nothing else of the card", () => {
  const { buildMaterial } = plugin;
  const m = buildMaterial({ kind: "card", id: "mavka" }, ROLEPLAY["characters/mavka/card.json"]);
  expect(m.name).toBe("Мавка");
  expect(m.title).toBe("Мавка з озера v3");
  expect(m.text).toContain("Мешканка озера");
  expect(m.text).toContain("Тиха, уважна");
  expect(m.text).toContain("Берег, ранок");
  expect(m.text).toContain("Вона дивиться на воду");
  expect(m.text).toContain("pronouns she/her");
  expect(m.text).toContain("an ally");
  expect(m.text).toContain("shy");
  expect(m.text).toContain("goes quiet");
  expect(m.text).not.toContain("SECRET");
  expect(m.text).not.toContain("base64");
});

test("a narrator's member gets its own part and is told about the cast", () => {
  const { buildMaterial } = plugin;
  const doc = ROLEPLAY["characters/verhy/card.json"];
  const m = buildMaterial({ kind: "card", id: "verhy", key: "Горпина" }, doc);
  expect(m.name).toBe("Горпина");
  expect(m.text).toContain("Знахарка, живе при млині");
  expect(m.text).toContain("Світ Верхи");
  expect(m.text).not.toContain("Ліс");
  expect(m.text).toContain("Describe only Горпина");
  const other = buildMaterial({ kind: "card", id: "verhy", key: "Чугайстер" }, doc);
  expect(other.text).toContain("Лісовий пастух");
  expect(other.text).not.toContain("Знахарка");
});

test("the structured profile adds only what the text does not already say", () => {
  const { buildMaterial } = plugin;
  const doc = card(
    "Ярина",
    { molfar_profile: { identity: { first: "Ярина", occupation: "ткаля" }, behaviors: { speech: "тихо й коротко", hobbies: "пряжа" }, sexuality: { enabled: true, kinks: ["PRIVATE-KINK"] }, trauma: { experiences: ["PRIVATE-WOUND"] } } },
    { description: "Ярина працює щодня. Вона ткаля.", personality: "Хоче спокою." },
  );
  const m = buildMaterial({ kind: "card", id: "yaryna" }, doc);
  expect(m.text).toContain("hobbies: пряжа");
  expect(m.text).toContain("speech: тихо й коротко");
  expect(m.text).not.toContain("occupation: ткаля");
  expect(m.text).not.toContain("PRIVATE");
});

test("long card text is cut to a bounded material", () => {
  const { buildMaterial } = plugin;
  const big = "слово ".repeat(40000);
  const m = buildMaterial({ kind: "card", id: "big" }, card("Велика", {}, { description: big, personality: big, scenario: big, first_mes: big }));
  expect(m.text.length).toBeLessThan(12000);
  expect(m.text).toContain("…");
  expect(buildMaterial({ kind: "card", id: "empty" }, card("Порожня"))).toBeNull();
});

const GOOD = JSON.stringify({
  about: "Мешканка озера. Говорить повільно.",
  interests: ["вода", "очерет", "чутки"],
  habits: ["Пише вечорами", "Мовчить, коли її перебивають"],
  voiceText: "Повільна, тиха, крапки замість окликів.",
  never: ["капслок"],
  length: 0,
  formality: 55,
  rank: "Мешканка озера",
  signature: "очерет, вода, чутки",
});

test("import: pass A asks the model with the card text in the user message, pass B files the profile", () => {
  const a = makeHost(ROLEPLAY);
  const first = route(a.host, "POST", "/profiles/import", { kind: "card", id: "mavka" });
  expect(first.__llmPending).toBe(true);
  expect(a.requests).toHaveLength(1);
  const req = a.requests[0]!.req;
  expect(a.requests[0]!.key).toBe("digest");
  expect(req.systemPrompt).not.toContain("Мешканка");
  expect(req.messages[0].content).toContain("Мешканка озера");
  expect(req.model).toBeUndefined();
  // nothing is filed before the model answered
  expect(a.files.size).toBe(0);

  const b = makeHost(ROLEPLAY, { digest: { text: GOOD } });
  const done = route(b.host, "POST", "/profiles/import", { kind: "card", id: "mavka" }, { stash: first.stash });
  expect(done.json.ok).toBe(true);
  const p = done.json.profile;
  expect(p.id).toBe("rp-mavka");
  expect(p).toMatchObject({ name: "Мавка", nick: "Мавка", source: "roleplay", card: "Мавка з озера v3", from: { kind: "card", id: "mavka" } });
  expect(p.cardDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(p.about).toContain("Мешканка озера");
  expect(p.interests).toEqual(["вода", "очерет", "чутки"]);
  expect(p.habits.map((h: any) => [h.text, h.by])).toEqual([["Пише вечорами", "self"], ["Мовчить, коли її перебивають", "self"]]);
  expect(p.voice).toMatchObject({ length: 0, formality: 55, emoji: 0, never: ["капслок"] });
  expect(p.forum).toMatchObject({ rank: "Мешканка озера", frequency: 35, opensOwn: true });
  expect(p.schedule).toHaveLength(8);
  // filed, and the list shows it
  expect(b.files.has("profiles/rp-mavka.json")).toBe(true);
  expect(route(b.host, "GET", "/profiles").json.profiles.map((x: any) => x.id)).toEqual(["rp-mavka"]);
  // no card text anywhere in what was stored
  expect([...b.files.values()].join("")).not.toContain("SECRET");
});

test("import: a member of a narrator; a persona is refused (it goes to Your profile)", () => {
  const { host: h1 } = makeHost(ROLEPLAY, { digest: { text: GOOD } });
  const m = route(h1, "POST", "/profiles/import", { kind: "card", id: "verhy", key: "Горпина" }, { stash: { name: "Горпина", title: "Хроніки Верхи" } });
  expect(m.json.profile).toMatchObject({ name: "Горпина", card: "Хроніки Верхи", from: { kind: "card", id: "verhy", key: "Горпина" } });
  expect(m.json.profile.id).toMatch(/^rp-verhy--/);
  const h2 = makeHost(ROLEPLAY, { digest: { text: GOOD } });
  const p = route(h2.host, "POST", "/profiles/import", { kind: "persona", id: "wanderer" }, { stash: { name: "Мандрівник", title: "" } });
  expect(p.status).toBe(400);
  expect(h2.files.size).toBe(0);
  expect(h2.requests).toHaveLength(0);
});

test("import: failures say what happened and file nothing", () => {
  const gone = makeHost(ROLEPLAY);
  expect(route(gone.host, "POST", "/profiles/import", { kind: "card", id: "deleted" }).json).toMatchObject({ ok: false, code: "gone" });
  const empty = makeHost(ROLEPLAY);
  expect(route(empty.host, "POST", "/profiles/import", { kind: "card", id: "broken" }).json).toMatchObject({ ok: false, code: "unreadable" });
  for (const text of ["I cannot do that", "{ \"about\": ", "{\"interests\":[\"a\"]}"]) {
    const h = makeHost(ROLEPLAY, { digest: { text } });
    const r = route(h.host, "POST", "/profiles/import", { kind: "card", id: "mavka" }, { stash: { name: "Мавка", title: "x" } });
    expect(r.json.ok).toBe(false);
    expect(h.files.size).toBe(0);
  }
  const noModel = makeHost(ROLEPLAY, { digest: { error: "No model providers are configured" } });
  expect(route(noModel.host, "POST", "/profiles/import", { kind: "card", id: "mavka" }, { stash: { name: "Мавка", title: "x" } }).json.code).toBe("no-model");
  // bad requests
  expect(route(gone.host, "POST", "/profiles/import", { kind: "card", id: "../x" }).status).toBe(400);
  expect(route(gone.host, "POST", "/profiles/import", { kind: "card", id: "a/b" }).status).toBe(400);
  expect(route(gone.host, "POST", "/profiles/import", { kind: "other", id: "a" }).status).toBe(400);
});

test("import: an already imported source is not read again", () => {
  const h = makeHost(ROLEPLAY, { digest: { text: GOOD } });
  route(h.host, "POST", "/profiles/import", { kind: "card", id: "mavka" }, { stash: { name: "Мавка", title: "t" } });
  h.host.llm.results = {};
  h.reads.length = 0;
  const again = route(h.host, "POST", "/profiles/import", { kind: "card", id: "mavka" });
  expect(again.json).toMatchObject({ ok: true, existed: true });
  expect(h.reads).toEqual([]);
  expect(h.requests).toHaveLength(0);
});

test("import: the model picked for this run is used, and the default is dropped", () => {
  const h = makeHost(ROLEPLAY);
  route(h.host, "POST", "/profiles/import", { kind: "card", id: "mavka", model: "openrouter/some-model" });
  expect(h.requests[0]!.req.model).toBe("openrouter/some-model");
  const d = makeHost(ROLEPLAY);
  route(d.host, "POST", "/profiles/import", { kind: "card", id: "mavka", model: "default" });
  expect(d.requests[0]!.req.model).toBeUndefined();
  const s = makeHost(ROLEPLAY);
  s.files.set("settings.json", JSON.stringify({ models: { import: "p/settings-model" } }));
  route(s.host, "POST", "/profiles/import", { kind: "card", id: "mavka" });
  expect(s.requests[0]!.req.model).toBe("p/settings-model");
});

test("refresh: a proposal from a new reading, nothing saved; only imported profiles", () => {
  const h = makeHost(ROLEPLAY);
  route(h.host, "PUT", "/profiles/own-1", { name: "Own", source: "own" });
  expect(route(h.host, "POST", "/profiles/refresh", { profileId: "own-1" }).status).toBe(400);
  expect(route(h.host, "POST", "/profiles/refresh", { profileId: "nope" }).status).toBe(404);
  route(h.host, "PUT", "/profiles/rp-mavka", { name: "Мавка", source: "roleplay", card: "Мавка з озера v3", from: { kind: "card", id: "mavka" } });
  const before = h.files.get("profiles/rp-mavka.json");
  const a = route(h.host, "POST", "/profiles/refresh", { profileId: "rp-mavka" });
  expect(a.__llmPending).toBe(true);
  expect(h.requests[0]!.req.messages[0].content).toContain("Мешканка озера");
  h.host.llm.results = { digest: { text: GOOD } };
  const b = route(h.host, "POST", "/profiles/refresh", { profileId: "rp-mavka" });
  expect(b.json.ok).toBe(true);
  expect(b.json.proposal.about).toContain("Мешканка");
  expect(b.json.cardDate).toMatch(/^\d{4}-/);
  expect(h.files.get("profiles/rp-mavka.json")).toBe(before);
  // the card was deleted in Roleplay
  const g = makeHost({});
  g.host.peer.apps = makeHost(ROLEPLAY).host.peer.apps;
  g.files.set("profiles/rp-mavka.json", before!);
  expect(route(g.host, "POST", "/profiles/refresh", { profileId: "rp-mavka" }).json.code).toBe("gone");
});

test("the source reference is kept for imported profiles and dropped for own ones", () => {
  const { host } = makeHost(null);
  const a = route(host, "PUT", "/profiles/rp-x", { name: "X", source: "roleplay", from: { kind: "card", id: "x", key: "K" } }).json.profile;
  expect(a.from).toEqual({ kind: "card", id: "x", key: "K" });
  const b = route(host, "PUT", "/profiles/own-x", { name: "X", source: "own", from: { kind: "card", id: "x" } }).json.profile;
  expect(b.from).toBeUndefined();
  const c = route(host, "PUT", "/profiles/rp-y", { name: "Y", source: "roleplay", from: { kind: "card", id: "../y" } }).json.profile;
  expect(c.from).toBeUndefined();
});

test("the plugin asks for the peer permission and the app declares what it reads", async () => {
  const root = path.resolve(import.meta.dir, "..");
  const pm = JSON.parse(await Bun.file(path.join(root, "plugins/profiles/manifest.json")).text());
  expect(pm.permissions).toContain("peer");
  for (const other of ["messenger", "forum"]) {
    const m = JSON.parse(await Bun.file(path.join(root, `plugins/${other}/manifest.json`)).text());
    expect(m.permissions).not.toContain("peer");
  }
  const app = JSON.parse(await Bun.file(path.join(root, "manifest.json")).text());
  expect(app.reads).toHaveLength(1);
  expect(app.reads[0].app).toBe("roleplay");
  expect(app.reads[0].paths).toEqual(["characters/*/card.json", "personas/*.json", "litopys/portraits.json"]);
  expect(app.reads[0].why.length).toBeGreaterThan(20);
  expect(app.reads[0].why.length).toBeLessThanOrEqual(200);
});

// ---------- the picture that comes along ----------

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const WEBP = "data:image/webp;base64,UklGRg==";
const profileFrom = (host: any, id: string, name: string, from: object) =>
  route(host, "PUT", "/profiles/" + id, { name, source: "roleplay", from }).json.profile;

test("avatar: the card's own avatar comes first, the Soul portrait of the name only after it", () => {
  const rp: Files = {
    "characters/a/card.json": card("A", {}, { avatar: PNG }),
    "characters/b/card.json": card("B", {}, { avatar: "" }),
    "characters/c/card.json": card("C", {}, { studio: { avatar: WEBP } }),
    "litopys/portraits.json": { a: { name: "A", url: WEBP }, b: { name: "B", url: WEBP } },
  };
  const { host } = makeHost(rp);
  for (const id of ["a", "b", "c"]) profileFrom(host, "rp-" + id, id.toUpperCase(), { kind: "card", id });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-a" }).json).toEqual({ ok: true, avatar: { url: PNG, from: "card" } });
  // no avatar on the card: the Soul-tab portrait of the (Soul) name, matched without case
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-b" }).json).toEqual({ ok: true, avatar: { url: WEBP, from: "soul" } });
  // the studio copy of the avatar counts as the card's own
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-c" }).json.avatar).toEqual({ url: WEBP, from: "card" });
});

test("avatar: a narrator's member takes the portrait of their name, never the narrator card's avatar", () => {
  const rp: Files = {
    "characters/verhy/card.json": card("Хроніки", { molfar_card_type: "narrator" }, { avatar: PNG }),
    "litopys/portraits.json": { горпина: { name: "Горпина", url: WEBP } },
  };
  const { host } = makeHost(rp);
  profileFrom(host, "rp-v1", "Горпина", { kind: "card", id: "verhy", key: "Горпина" });
  profileFrom(host, "rp-v2", "Чугайстер", { kind: "card", id: "verhy", key: "Чугайстер" });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-v1" }).json.avatar).toEqual({ url: WEBP, from: "soul" });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-v2" }).json).toEqual({ ok: true, avatar: null });
});

test("avatar: only images the screen can store are handed over", () => {
  const rp: Files = {
    "characters/a/card.json": card("A", {}, { avatar: "https://evil.example/x.png" }),
    "characters/b/card.json": card("B", {}, { avatar: "data:image/svg+xml;base64,PHN2Zz4=" }),
    "characters/c/card.json": card("C", {}, { avatar: "/v1/assets/" + "ab12".repeat(16) }),
    "characters/d/card.json": card("D", {}, { avatar: "data:image/png;base64," + "A".repeat(1600000) }),
    "litopys/portraits.json": { a: { name: "A", url: "javascript:alert(1)" } },
  };
  const { host } = makeHost(rp);
  for (const id of ["a", "b", "c", "d"]) profileFrom(host, "rp-" + id, id.toUpperCase(), { kind: "card", id });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-a" }).json.avatar).toBeNull();
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-b" }).json.avatar).toBeNull();
  // an address in the asset store is passed on (the screen decides whether it can read it)
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-c" }).json.avatar).toEqual({ url: "/v1/assets/" + "ab12".repeat(16), from: "card" });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-d" }).json.avatar).toBeNull();
});

test("avatar: a persona brings its avatar, else the portrait of its name; an own profile has none", () => {
  const rp: Files = {
    "personas/w.json": { name: "Мандрівник", description: "x", avatar: PNG },
    "personas/n.json": { name: "Нема", description: "x" },
    "litopys/portraits.json": { нема: { name: "Нема", url: WEBP } },
  };
  const { host } = makeHost(rp);
  for (const id of ["w", "n"]) route(host, "POST", "/you/import", { id });
  expect(route(host, "POST", "/profiles/avatar", { personaId: "pe-w" }).json.avatar).toEqual({ url: PNG, from: "persona" });
  expect(route(host, "POST", "/profiles/avatar", { personaId: "pe-n" }).json.avatar).toEqual({ url: WEBP, from: "soul" });
  route(host, "PUT", "/profiles/own-1", { name: "Own", source: "own" });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "own-1" }).json).toEqual({ ok: true, avatar: null });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "nope" }).status).toBe(404);
  expect(route(host, "POST", "/profiles/avatar", { personaId: "nope" }).status).toBe(404);
  expect(route(host, "POST", "/profiles/avatar", {}).status).toBe(400);
});

test("avatar: closed Roleplay, a missing portraits file or a refused read is a quiet miss", () => {
  const closed = makeHost(null);
  profileFrom(closed.host, "rp-a", "A", { kind: "card", id: "a" });
  expect(route(closed.host, "POST", "/profiles/avatar", { profileId: "rp-a" }).json.code).toBe("no-access");
  // the user allowed Roleplay before the portraits path was declared: the read is refused, the card's avatar still works
  const { host } = makeHost({ "characters/a/card.json": card("A", {}, {}) });
  const read = host.peer.read;
  host.peer.read = (app: string, rel: string) => {
    if (rel.startsWith("litopys/")) throw new Error("peer read refused: path not declared");
    return read(app, rel);
  };
  profileFrom(host, "rp-a", "A", { kind: "card", id: "a" });
  expect(route(host, "POST", "/profiles/avatar", { profileId: "rp-a" }).json).toEqual({ ok: true, avatar: null });
});
