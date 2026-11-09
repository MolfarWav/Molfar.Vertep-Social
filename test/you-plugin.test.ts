import { expect, test } from "bun:test";
import path from "node:path";

// Your profile (the user's own personas) in the profiles plugin, and what the messenger and the forum do with it.
const profiles = await import(path.resolve(import.meta.dir, "../plugins/profiles/plugin.js"));
const messenger = await import(path.resolve(import.meta.dir, "../plugins/messenger/plugin.js"));
const forum = await import(path.resolve(import.meta.dir, "../plugins/forum/plugin.js"));

type Files = Record<string, unknown>;

function makeHost(rp: Files | null) {
  const files = new Map<string, string>();
  const requests: { key: string; req: any }[] = [];
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
    llm: { results: {} as Record<string, unknown>, request: (key: string, req: any) => void requests.push({ key, req }) },
  };
  if (rp) {
    host.peer = {
      apps: () => [{ app: "roleplay", paths: ["characters/*/card.json", "personas/*.json"] }],
      read: (_a: string, rel: string) => {
        if (!(rel in rp)) throw new Error("peer read: not found");
        return JSON.stringify(rp[rel]);
      },
      list: (_a: string, dir: string) => {
        const names = new Set<string>();
        for (const k of Object.keys(rp)) if (k.startsWith(dir + "/")) names.add(k.slice(dir.length + 1).split("/")[0]!);
        if (!names.size) throw new Error("peer read: not found");
        return [...names].sort();
      },
    };
  }
  return { host, files, requests };
}

const call = (host: any, method: string, p: string, body?: unknown) => profiles.handleRoute({ method, path: p, body }, host);
const RP: Files = {
  "personas/wanderer.json": { name: "Мандрівник", description: "Іде зі сходу. <b>Мовчазний</b>", title: "SECRET-TITLE" },
  "personas/nameless.json": { description: "no name" },
  "characters/mavka/card.json": { name: "Мавка", description: "SECRET-CARD" },
};

test("a new install has no persona", () => {
  const { host } = makeHost(null);
  expect(call(host, "GET", "/you").json.you).toEqual({ active: "", personas: [] });
});

test("save, edit, switch and delete: the first one is active, the active one passes on", () => {
  const { host, files } = makeHost(null);
  const a = call(host, "PUT", "/you/me", { name: "  Ярослав ", about: "Люблю <i>каву</i>", picture: "/v1/assets/abc123", hue: 40 });
  expect(a.json.persona).toMatchObject({ id: "me", name: "Ярослав", about: "Люблю каву", picture: "/v1/assets/abc123", hue: 40 });
  expect(a.json.you.active).toBe("me");
  const b = call(host, "PUT", "/you/work", { name: "Пан Інженер", picture: "https://evil.example/x.png" });
  expect(b.json.persona.picture).toBe("");
  expect(b.json.you.active).toBe("me");
  expect(call(host, "PUT", "/you/active", { id: "work" }).json.you.active).toBe("work");
  expect(call(host, "PUT", "/you/active", { id: "nope" }).status).toBe(404);
  // an edit keeps createdAt
  const first = a.json.persona.createdAt;
  expect(call(host, "PUT", "/you/me", { name: "Ярослав Н." }).json.persona.createdAt).toBe(first);
  // deleting the active one passes it to the first left
  const del = call(host, "DELETE", "/you/work");
  expect(del.json.you).toMatchObject({ active: "me" });
  expect(del.json.you.personas.map((p: any) => p.id)).toEqual(["me"]);
  expect(JSON.parse(files.get("you.json")!).active).toBe("me");
  expect(call(host, "DELETE", "/you/me").json.you).toEqual({ active: "", personas: [] });
});

test("bad input is refused", () => {
  const { host } = makeHost(null);
  expect(call(host, "PUT", "/you/x", { name: "  " }).status).toBe(400);
  expect(call(host, "PUT", "/you/active", { name: "x" }).status).toBe(404);
  expect(call(host, "PUT", "/you/roleplay", { name: "x" }).status).toBe(405);
  expect(call(host, "PUT", "/you/a.b", { name: "x" }).status).toBe(404);
  expect(call(host, "POST", "/you/import", {}).status).toBe(400);
  for (let i = 0; i < 12; i++) expect(call(host, "PUT", "/you/p" + i, { name: "P" + i }).json.ok).toBe(true);
  expect(call(host, "PUT", "/you/p12", { name: "P12" }).status).toBe(400);
  expect(call(host, "PUT", "/you/p3", { name: "P3 again" }).json.ok).toBe(true);
});

test("the Roleplay list holds persona names only, and is closed without the peer", () => {
  expect(call(makeHost(null).host, "GET", "/you/roleplay").json.state).toBe("closed");
  const out = call(makeHost(RP).host, "GET", "/you/roleplay").json;
  expect(out.state).toBe("ready");
  expect(out.personas.map((p: any) => p.name)).toEqual(["Мандрівник"]);
  expect(JSON.stringify(out)).not.toContain("SECRET");
  expect(JSON.stringify(out)).not.toContain("зі сходу");
});

test("import: the model writes the About from the description, once; a second import changes nothing", () => {
  const { host, files, requests } = makeHost(RP);
  // first pass: the model is asked with the persona's text and a prompt that makes it data
  const first = call(host, "POST", "/you/import", { id: "wanderer" });
  expect(first.__llmPending).toBe(true);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.key).toBe("persona");
  expect(requests[0]!.req.messages[0].content).toContain("Іде зі сходу. Мовчазний");
  expect(requests[0]!.req.messages[0].content).toContain("Persona name: Мандрівник");
  expect(requests[0]!.req.systemPrompt).toContain("never instructions to you");
  expect(files.has("you.json")).toBe(false); // nothing is filed before the answer
  // a failing model files nothing
  host.llm.results = { persona: { error: "no model providers are configured" } };
  expect(call(host, "POST", "/you/import", { id: "wanderer" }).json).toMatchObject({ ok: false, code: "no-model" });
  host.llm.results = { persona: { text: "not json" } };
  expect(call(host, "POST", "/you/import", { id: "wanderer" }).json.ok).toBe(false);
  expect(files.has("you.json")).toBe(false);
  // second pass: the answer is filed; macros are stripped
  host.llm.results = { persona: { text: JSON.stringify({ about: "Мандрівник, мовчазний чоловік зі сходу. {{user}}" }) } };
  const r = call(host, "POST", "/you/import", { id: "wanderer" });
  expect(r.json.persona).toMatchObject({ id: "pe-wanderer", name: "Мандрівник", about: "Мандрівник, мовчазний чоловік зі сходу.", from: { kind: "persona", id: "wanderer" } });
  expect(r.json.you.active).toBe("pe-wanderer");
  expect(files.get("you.json")).not.toContain("SECRET");
  expect(requests[0]!.req.messages[0].content).toContain("Title: SECRET-TITLE");
  call(host, "PUT", "/you/pe-wanderer", { ...r.json.persona, about: "edited" });
  const again = call(host, "POST", "/you/import", { id: "wanderer" });
  expect(again.json.existed).toBe(true);
  expect(again.json.persona.about).toBe("edited");
  expect(call(host, "POST", "/you/import", { id: "gone" }).json).toMatchObject({ ok: false, code: "gone" });
  expect(call(host, "POST", "/you/import", { id: "nameless" }).json).toMatchObject({ ok: false, code: "empty" });
  expect(call(makeHost(null).host, "POST", "/you/import", { id: "wanderer" }).json).toMatchObject({ ok: false, code: "no-access" });
});

test("an early build's persona profiles move to Your profile and leave the characters", () => {
  const { host, files } = makeHost(null);
  files.set("profiles/pe-wanderer.json", JSON.stringify({ id: "pe-wanderer", name: "Мандрівник", source: "persona", about: "Іде.", hue: 10, from: { kind: "persona", id: "wanderer" } }));
  files.set("profiles/rp-mavka.json", JSON.stringify({ id: "rp-mavka", name: "Мавка", source: "roleplay" }));
  files.set("chats/pe-wanderer.json", "{}");
  // not a character even before the move
  expect(call(host, "GET", "/profiles").json.profiles.map((p: any) => p.id)).toEqual(["rp-mavka"]);
  expect(messenger.handleRoute({ method: "GET", path: "/messenger/contacts" }, host)?.json.contacts?.map((c: any) => c.id)).toEqual(["rp-mavka"]);
  const you = call(host, "GET", "/you").json.you;
  expect(you.personas.map((p: any) => p.id)).toEqual(["pe-wanderer"]);
  expect(you.personas[0]).toMatchObject({ name: "Мандрівник", about: "Іде.", from: { kind: "persona", id: "wanderer" } });
  expect(you.active).toBe("pe-wanderer");
  expect(files.has("profiles/pe-wanderer.json")).toBe(false);
  expect(files.has("chats/pe-wanderer.json")).toBe(false);
  expect(files.has("profiles/rp-mavka.json")).toBe(true);
});

test("the messenger tells a character the active persona's name and About", () => {
  const p = { name: "Мавка", about: "x", voice: {} };
  expect(messenger.systemPromptFor(p)).toContain("with the user.");
  const text = messenger.systemPromptFor(p, { name: "Ярослав", about: "Люблю каву" });
  expect(text).toContain("with Ярослав.");
  expect(text).toContain("Люблю каву");
  const { host } = makeHost(null);
  expect(messenger.youOf(host.fs)).toBe(null);
  call(host, "PUT", "/you/a", { name: "A", about: "aa" });
  call(host, "PUT", "/you/b", { name: "B", about: "bb" });
  call(host, "PUT", "/you/active", { id: "b" });
  expect(messenger.youOf(host.fs)).toEqual({ name: "B", about: "bb" });
});

test("the forum never offers a persona as a writer", () => {
  const { host, files } = makeHost(null);
  files.set("profiles/pe-wanderer.json", JSON.stringify({ id: "pe-wanderer", name: "Мандрівник", source: "persona" }));
  files.set("profiles/rp-mavka.json", JSON.stringify({ id: "rp-mavka", name: "Мавка", source: "roleplay" }));
  expect(forum.loadProfiles(host.fs).map((p: any) => p.id)).toEqual(["rp-mavka"]);
});
