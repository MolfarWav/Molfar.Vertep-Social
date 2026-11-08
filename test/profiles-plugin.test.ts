import { expect, test } from "bun:test";
import path from "node:path";

// The plugin is plain JS for the engine's sandbox; the tests drive it with a fake host (a Map as the
// data folder, canned model results).
const plugin = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));

function makeHost(results: Record<string, unknown> = {}) {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
  const host = {
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
  return { host, files, requests };
}

const route = (host: any, method: string, p: string, body?: unknown, extra: object = {}) => plugin.handleRoute({ method, path: p, body, ...extra }, host);

test("only its own paths are answered", () => {
  const { host } = makeHost();
  expect(route(host, "GET", "/other")).toBeNull();
  expect(route(host, "GET", "/messenger/x")).toBeNull();
  expect(route(host, "GET", "/profiles/a/b").status).toBe(404);
});

test("a profile is saved, listed in creation order, replaced and removed", () => {
  const { host } = makeHost();
  expect(route(host, "GET", "/profiles").json.profiles).toEqual([]);
  const a = route(host, "PUT", "/profiles/own-1", { name: "Ярина", about: "Господиня хутора", source: "own" });
  expect(a.json.ok).toBe(true);
  expect(a.json.profile.nick).toBe("Ярина");
  expect(a.json.profile.schedule).toHaveLength(8);
  expect(a.json.profile.schedule[0]).toHaveLength(7);
  route(host, "PUT", "/profiles/own-2", { name: "Мавка" });
  const created = route(host, "GET", "/profiles").json.profiles[0].createdAt;
  const again = route(host, "PUT", "/profiles/own-1", { name: "Ярина", about: "Нове" });
  expect(again.json.profile.createdAt).toBe(created);
  const list = route(host, "GET", "/profiles").json.profiles;
  expect(list.map((p: any) => p.id)).toEqual(["own-1", "own-2"]);
  expect(list[0].about).toBe("Нове");
  expect(route(host, "DELETE", "/profiles/own-1").json.ok).toBe(true);
  expect(route(host, "GET", "/profiles").json.profiles.map((p: any) => p.id)).toEqual(["own-2"]);
});

test("a profile with no name or a bad id is refused; ids cannot climb out of the folder", () => {
  const { host, files } = makeHost();
  expect(route(host, "PUT", "/profiles/x", { about: "no name" }).status).toBe(400);
  expect(route(host, "PUT", "/profiles/x", "nope").status).toBe(400);
  expect(route(host, "PUT", "/profiles/..%2Fx", { name: "A" }).status).toBe(404);
  expect(route(host, "PUT", "/profiles/a.b", { name: "A" }).status).toBe(404);
  expect(files.size).toBe(0);
});

test("cleanProfile strips markup, caps lengths and fixes shapes", () => {
  const p = plugin.cleanProfile(
    {
      name: "<b>Ярина</b>\n",
      hue: 9999,
      source: "hacker",
      card: "should drop",
      about: "x".repeat(9000),
      interests: ["a", "", 3, "b".repeat(100)],
      habits: [{ text: "Встає рано", by: "self" }, { text: "" }, "str"],
      voice: { length: 7, emoji: -2, formality: 500, never: ["капс"] },
      forum: { frequency: "many", favourites: [{ name: "Мавка", on: 1 }] },
      schedule: [["online"]],
    },
    "p1",
    1000,
    null,
  );
  expect(p.name).toBe("Ярина");
  expect(p.hue).toBe(359);
  expect(p.source).toBe("own");
  expect(p.card).toBeUndefined();
  expect(p.about.length).toBe(4000);
  expect(p.interests).toEqual(["a", "b".repeat(40)]);
  expect(p.habits).toHaveLength(1);
  expect(p.habits[0].by).toBe("self");
  expect(p.voice).toMatchObject({ length: 2, emoji: 0, formality: 100 });
  expect(p.forum.frequency).toBe(35);
  expect(p.forum.favourites).toEqual([{ name: "Мавка", on: false }]);
  expect(p.schedule).toHaveLength(8);
});

test("settings: defaults, a partial patch, bad values dropped, models kept per task", () => {
  const { host } = makeHost();
  expect(route(host, "GET", "/settings").json.settings.postsPerDay).toBe(30);
  const put = route(host, "PUT", "/settings", { postsPerDay: 9999, quietFrom: "25:00", models: { import: "prov/some-model", forum: "has space" }, activity: "bogus", extra: 1 });
  const s = put.json.settings;
  expect(s.postsPerDay).toBe(200);
  expect(s.quietFrom).toBe("01:00");
  expect(s.activity).toBe("moderate");
  expect(s.models).toEqual({ messenger: "", forum: "", import: "prov/some-model" });
  expect("extra" in s).toBe(false);
  const next = route(host, "PUT", "/settings", { models: { messenger: "default" } }).json.settings;
  expect(next.models).toEqual({ messenger: "", forum: "", import: "prov/some-model" });
  expect(route(host, "GET", "/settings").json.settings.models.import).toBe("prov/some-model");
});

const IDEAS_REPLY = JSON.stringify({
  drafts: [
    { archetype: "Хатня", name: "Кікімора", summary: "Господиня болота.", traits: ["Цікава"], detail: "Клубок ниток", about: "Живе в очереті.", voiceText: "Шепоче.", interests: ["болото", "нитки"], rank: "Сусідка", signature: "болото, туман" },
    { name: "Полудниця", summary: "Дух полудня.", about: "", angle: "Польова" },
    { name: "", summary: "dropped" },
  ],
  questions: [{ q: "Наскільки говіркий?", options: ["Коротко", "Середньо", "Довго"] }, { q: "Bad", options: ["only", "two"] }],
});

test("suggest: asks the model once, then cleans the reply into drafts and questions", () => {
  const first = makeHost();
  const pending = route(first.host, "POST", "/profiles/suggest", { idea: "болотна сусідка" });
  expect(pending.__llmPending).toBe(true);
  expect(first.requests).toHaveLength(1);
  expect(first.requests[0].req.systemPrompt).toContain("character profile");
  expect(first.requests[0].req.model).toBeUndefined();
  const second = makeHost({ ideas: { text: "```json\n" + IDEAS_REPLY + "\n```" } });
  const done = route(second.host, "POST", "/profiles/suggest", { idea: "болотна сусідка" }).json;
  expect(done.ok).toBe(true);
  expect(done.drafts.map((d: any) => d.name)).toEqual(["Кікімора", "Полудниця"]);
  expect(done.drafts[0].hue).toBeGreaterThanOrEqual(0);
  expect(done.drafts[1].archetype).toBe("Польова");
  expect(done.drafts[1].about).toBe("Дух полудня.");
  expect(done.questions).toHaveLength(1);
});

test("suggest: the picked model is used for text; a picture leaves the model to the engine's Vision setting", () => {
  const a = makeHost();
  route(a.host, "PUT", "/settings", { models: { import: "prov/model-x" } });
  route(a.host, "POST", "/profiles/suggest", { idea: "idea" });
  expect(a.requests[0].req.model).toBe("prov/model-x");
  const b = makeHost();
  route(b.host, "PUT", "/settings", { models: { import: "prov/model-x" } });
  route(b.host, "POST", "/profiles/suggest", { image: { mimeType: "image/png", data: "AAAA" } });
  expect(b.requests[0].req.model).toBeUndefined();
  expect(b.requests[0].req.images).toHaveLength(1);
  expect(route(b.host, "POST", "/profiles/suggest", {}).status).toBe(400);
  expect(route(b.host, "POST", "/profiles/suggest", { image: { mimeType: "text/html", data: "x" } }).status).toBe(400);
});

test("suggest: failures keep their reason; a missing model has its own code", () => {
  const cut = route(makeHost({ ideas: { text: '{"drafts":[{"name":"A","summ' } }).host, "POST", "/profiles/suggest", { idea: "x" }).json;
  expect(cut).toMatchObject({ ok: false });
  expect(cut.error).toContain("cut off");
  const junk = route(makeHost({ ideas: { text: "sorry, no" } }).host, "POST", "/profiles/suggest", { idea: "x" }).json;
  expect(junk.error).toContain("JSON");
  const none = route(makeHost({ ideas: { error: 'No model providers configured for user "molfar". Add one.' } }).host, "POST", "/profiles/suggest", { idea: "x" }).json;
  expect(none).toMatchObject({ ok: false, code: "no-model" });
});

test("fill: only empty fields are asked for and proposed, from the stored profile", () => {
  const { host, requests } = makeHost();
  route(host, "PUT", "/profiles/own-1", { name: "Ярина", about: "Господиня хутора", interests: ["хутір"] });
  const pending = route(host, "POST", "/profiles/fill", { profileId: "own-1", fields: ["about", "interests", "habits", "voiceText", "rank", "bogus"] });
  expect(pending.__llmPending).toBe(true);
  expect(pending.stash.fields).toEqual(["habits", "voiceText", "rank"]);
  expect(requests[0].req.messages[0].content).toContain("Господиня хутора");
  expect(requests[0].req.messages[0].content).toContain("Empty fields to fill: habits, voiceText, rank");
  const reply = { text: JSON.stringify({ habits: ["Встає до півнів", ""], voiceText: "Коротко.", rank: "Господиня", about: "ignored: not asked", signature: "ignored" }) };
  const done = makeHost({ fill: reply });
  route(done.host, "PUT", "/profiles/own-1", { name: "Ярина", about: "Господиня хутора", interests: ["хутір"] });
  const out = route(done.host, "POST", "/profiles/fill", { profileId: "own-1", fields: ["habits", "voiceText", "rank"] }, { stash: pending.stash }).json;
  expect(out).toEqual({ ok: true, proposal: { habits: ["Встає до півнів"], voiceText: "Коротко.", rank: "Господиня" } });
});

test("fill: refuses a missing profile, a bad id, and a profile with nothing empty among the fields", () => {
  const { host } = makeHost();
  expect(route(host, "POST", "/profiles/fill", { profileId: "../x", fields: ["about"] }).status).toBe(400);
  expect(route(host, "POST", "/profiles/fill", { profileId: "nope", fields: ["about"] }).status).toBe(404);
  route(host, "PUT", "/profiles/p", { name: "A", about: "filled" });
  expect(route(host, "POST", "/profiles/fill", { profileId: "p", fields: ["about"] }).status).toBe(400);
});

test("fill: the model's no-answer and a no-model error are reported, not thrown", () => {
  const mk = (res: unknown) => {
    const m = makeHost({ fill: res });
    route(m.host, "PUT", "/profiles/p", { name: "A" });
    return route(m.host, "POST", "/profiles/fill", { profileId: "p", fields: ["rank"] }, { stash: { fields: ["rank"] } }).json;
  };
  expect(mk({ text: "{}" })).toMatchObject({ ok: true, proposal: {} });
  expect(mk({ error: "The model \"x\" is not available: its connection is missing" })).toMatchObject({ ok: false, code: "no-model" });
});
