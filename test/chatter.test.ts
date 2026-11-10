// Characters talk to each other (#358, idea 3): a switch per pair, a daily cap, both around, the relationship in the prompt.
import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const chatter = await import(path.join(root, "plugins/chatter/plugin.js"));

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const never = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "off"));
const noon = Date.UTC(2026, 10, 10, 12, 0, 0);

function memFs(files: Map<string, string>) {
  return {
    read: (p: string) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p)!;
    },
    write: (p: string, c: string) => void files.set(p, c),
    remove: (p: string) => void files.delete(p),
    list: (d: string) => {
      const o = [...files.keys()].filter((k) => k.startsWith(d + "/") && !k.slice(d.length + 1).includes("/")).map((k) => k.slice(d.length + 1));
      if (!o.length) throw new Error("ENOENT");
      return o;
    },
  } as any;
}

function world(settings: object = {}, schedB: unknown = always) {
  const files = new Map<string, string>();
  files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { chats: true, chatsPerDay: 2 }, models: { messenger: "prov/chat" }, ...settings }));
  files.set("profiles/anna.json", JSON.stringify({ name: "Anna", hue: 10, about: "A weaver.", schedule: always }));
  files.set("profiles/boris.json", JSON.stringify({ name: "Boris", hue: 200, about: "A fisher.", schedule: schedB, model: "prov/boris" }));
  const requests: { key: string; req: any }[] = [];
  let results: Record<string, unknown> = {};
  const host: any = { fs: memFs(files), llm: { get results() { return results; }, request: (key: string, req: any) => void requests.push({ key, req }) } };
  const route = (method: string, p: string, body?: unknown, query?: unknown) => chatter.handleRoute({ method, path: p, body, query }, host);
  return { files, requests, host, route, setResults: (r: Record<string, unknown>) => (results = r) };
}
const at = <T,>(ms: number, fn: () => T): T => {
  const n = Date.now;
  const r = Math.random;
  Date.now = () => ms;
  Math.random = () => 0;
  try {
    return fn();
  } finally {
    Date.now = n;
    Math.random = r;
  }
};
const pairFile = (w: ReturnType<typeof world>) => JSON.parse(w.files.get("chatter/anna__boris.json")!);

test("keyOf sorts the two ids, whichever way round", () => {
  expect(chatter.keyOf("boris", "anna")).toBe("anna__boris");
  expect(chatter.keyOf("anna", "boris")).toBe("anna__boris");
});

test("a pair is made by the user, listed with the two characters, switched, and removed; the cap of pairs on holds", () => {
  const w = world();
  expect(w.route("GET", "/chatter").json).toMatchObject({ on: true, pairs: [] });
  expect(w.route("POST", "/chatter/pair", { a: "boris", b: "anna" }).json.pair).toMatchObject({ key: "anna__boris", on: true, count: 0, a: { id: "anna", name: "Anna" }, b: { id: "boris", name: "Boris" } });
  expect(w.route("POST", "/chatter/pair", { a: "anna", b: "anna" }).status).toBe(400);
  expect(w.route("POST", "/chatter/pair", { a: "anna", b: "ghost" }).status).toBe(400);
  expect(w.route("POST", "/chatter/pair", { a: "anna", b: "boris", on: false }).json.pair.on).toBe(false);
  expect(w.route("GET", "/chatter").json.pairs).toHaveLength(1);
  expect(w.route("POST", "/chatter/remove", { key: "anna__boris" }).json.ok).toBe(true);
  expect(w.route("GET", "/chatter").json.pairs).toEqual([]);
  expect(w.route("POST", "/chatter/remove", { key: "bad key" }).status).toBe(404);
  // nine characters: the ninth pair on is refused
  for (let i = 0; i < 10; i++) w.files.set(`profiles/c${i}.json`, JSON.stringify({ name: "C" + i, schedule: always }));
  for (let i = 0; i < 8; i++) expect(w.route("POST", "/chatter/pair", { a: "c" + i, b: "c" + (i + 1) }).json.ok).toBe(true);
  expect(w.route("POST", "/chatter/pair", { a: "c8", b: "c9" }).status).toBe(409);
  expect(w.route("POST", "/chatter/pair", { a: "c0", b: "c1", on: false }).json.ok).toBe(true); // switching off is always allowed
});

test("nothing is written unless the switch is on, the pair is on, and both are around", () => {
  const off = world({ community: { chats: false } });
  off.route("POST", "/chatter/pair", { a: "anna", b: "boris" });
  at(noon, () => chatter.onTick({}, off.host));
  expect(off.requests).toHaveLength(0);
  const pairOff = world();
  pairOff.route("POST", "/chatter/pair", { a: "anna", b: "boris", on: false });
  at(noon, () => chatter.onTick({}, pairOff.host));
  expect(pairOff.requests).toHaveLength(0);
  const asleep = world({}, never);
  asleep.route("POST", "/chatter/pair", { a: "anna", b: "boris" });
  at(noon, () => chatter.onTick({}, asleep.host));
  expect(asleep.requests).toHaveLength(0);
});

test("the tick asks one model call: the first line is a greeting, the next speaker is the other one, the prompt carries the relationship", () => {
  const w = world();
  w.route("POST", "/chatter/pair", { a: "anna", b: "boris" });
  w.files.set("life/people/anna.json", JSON.stringify({ people: [{ key: "c:boris", name: "Boris", seen: 3, toMe: 1, fromMe: 1, said: [], note: "Gruff but kind.", feel: -8 }] }));
  w.files.set("life/diary/anna.json", JSON.stringify({ entries: [{ id: "e1", day: "2026-11-10", text: "Wove a blue cloth.", by: "model" }] }));
  at(noon, () => chatter.onTick({}, w.host));
  expect(w.requests).toHaveLength(1);
  expect(w.requests[0].key).toBe("ch:anna__boris:anna"); // Math.random() = 0 picks the first
  expect(w.requests[0].req.model).toBe("prov/chat");
  expect(w.requests[0].req.systemPrompt).toContain("You are Anna");
  expect(w.requests[0].req.systemPrompt).toContain("Gruff but kind.");
  expect(w.requests[0].req.systemPrompt).toContain("open conflict");
  expect(w.requests[0].req.systemPrompt).not.toContain("Boris, a fisher"); // the other's card is not in it
  expect(w.requests[0].req.messages[0].content).toContain("Wove a blue cloth.");
  // a request is out: no second one
  at(noon + 60000, () => chatter.onTick({}, w.host));
  expect(w.requests).toHaveLength(1);
  w.setResults({ "ch:anna__boris:anna": { text: "Anna: Boris, the lake is frozen again." } });
  at(noon + 120000, () => chatter.onTick({}, w.host));
  expect(pairFile(w).messages).toEqual([{ id: expect.any(String), by: "anna", at: noon + 120000, text: "Boris, the lake is frozen again." }]);
  expect(pairFile(w).today).toBe(1);
  // five minutes later Boris answers, on his own model, with the chat so far
  w.setResults({});
  at(noon + 120000 + 6 * 60000, () => chatter.onTick({}, w.host));
  expect(w.requests).toHaveLength(2);
  expect(w.requests[1].key).toBe("ch:anna__boris:boris");
  expect(w.requests[1].req.model).toBe("prov/boris");
  expect(w.requests[1].req.messages[0].content).toContain("Anna: Boris, the lake is frozen again.");
});

test("a pair keeps its gap and its daily cap, and a failure waits", () => {
  const w = world();
  w.route("POST", "/chatter/pair", { a: "anna", b: "boris" });
  const say = (ms: number, by: string, text: string) => {
    w.setResults({ [`ch:anna__boris:${by}`]: { text } });
    at(ms, () => chatter.onTick({}, w.host));
    w.setResults({});
  };
  say(noon, "anna", "One.");
  at(noon + 60000, () => chatter.onTick({}, w.host));
  expect(w.requests).toHaveLength(0); // inside the five minute gap
  say(noon + 10 * 60000, "boris", "Two.");
  at(noon + 20 * 60000, () => chatter.onTick({}, w.host));
  expect(w.requests).toHaveLength(0); // the cap of two a day is used
  expect(pairFile(w).messages.map((m: any) => m.text)).toEqual(["One.", "Two."]);
  // the next day it goes on
  at(noon + DAYMS, () => chatter.onTick({}, w.host));
  expect(w.requests).toHaveLength(1);
  // a failed call waits half an hour
  w.setResults({ [w.requests[0].key]: { error: "boom" } });
  at(noon + DAYMS + 60000, () => chatter.onTick({}, w.host));
  expect(pairFile(w).failedAt).toBe(noon + DAYMS + 60000);
  w.setResults({});
  at(noon + DAYMS + 10 * 60000, () => chatter.onTick({}, w.host));
  expect(w.requests).toHaveLength(1);
});
const DAYMS = 86400000;

test("the chat route lists the messages; an answer for a pair switched off meanwhile is dropped", () => {
  const w = world();
  w.route("POST", "/chatter/pair", { a: "anna", b: "boris" });
  at(noon, () => chatter.onTick({}, w.host));
  w.route("POST", "/chatter/pair", { a: "anna", b: "boris", on: false });
  w.setResults({ "ch:anna__boris:anna": { text: "Late line." } });
  at(noon + 1000, () => chatter.onTick({}, w.host));
  expect(pairFile(w).messages).toEqual([]);
  w.route("POST", "/chatter/pair", { a: "anna", b: "boris", on: true });
  w.setResults({ "ch:anna__boris:boris": { text: "Hello, Anna.\n\n<b>bold</b>" } });
  at(noon + 2000, () => chatter.onTick({}, w.host));
  const chat = w.route("GET", "/chatter/chat", undefined, { key: "anna__boris" }).json;
  expect(chat.messages.map((m: any) => [m.by, m.text])).toEqual([["boris", "Hello, Anna.\n\n bold"]]);
  expect(chat.pair.last.text).toBe("Hello, Anna.\n\n bold");
  expect(w.route("GET", "/chatter/chat", undefined, { key: "zzz" }).status).toBe(404);
});

test("the manifest asks only for what the plugin uses", () => {
  const m = JSON.parse(require("node:fs").readFileSync(path.join(root, "plugins/chatter/manifest.json"), "utf8"));
  expect(m.permissions).toEqual(["routes", "fs", "llm", "schedule"]);
});
