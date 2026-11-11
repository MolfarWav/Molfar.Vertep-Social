// Real-model check of a club (issue #368). Drives the clubs plugin's own tick and send route with three characters and a scripted user:
// the user writes twice, then the club talks on its own for a while. Prints the transcript and a summary: how many messages were filed,
// how many the ceiling net or an empty answer rejected, the average length, whether any message starts with a name label or an angle bracket,
// and whether the members stay near the interest.
//
//   CLUBS_API_KEY=... bun scripts/clubs-check.mjs <model> [messages]
//
// CLUBS_BASE_URL is any OpenAI-compatible base (default OpenRouter: https://openrouter.ai/api/v1), so a free model works:
//   CLUBS_API_KEY=sk-or-... bun scripts/clubs-check.mjs google/gemma-3-27b-it:free 12
// <messages> is how many club-written messages to ask for after the user's two (default 12). Writes clubs-<model>.json to CLUBS_OUT
// (default: the current folder). Nothing in the repo is changed; the data lives in memory.
import fs from "node:fs";
import path from "node:path";

const MODEL = process.argv[2];
if (!MODEL || !process.env.CLUBS_API_KEY) {
  console.error("usage: CLUBS_API_KEY=... [CLUBS_BASE_URL=...] bun scripts/clubs-check.mjs <model> [messages]");
  process.exit(2);
}
const TOTAL = Number(process.argv[3] || 12);
const SOCIAL = path.resolve(import.meta.dir, "..");
const OUT = process.env.CLUBS_OUT || process.cwd();
const BASE = (process.env.CLUBS_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const KEY = process.env.CLUBS_API_KEY;
const clubs = await import(path.join(SOCIAL, "plugins/clubs/plugin.js"));

const files = new Map();
const results = {};
let pendingReq = null;
const host = {
  fs: {
    read: (p) => { if (!files.has(p)) throw new Error("ENOENT"); return files.get(p); },
    write: (p, c) => void files.set(p, c),
    remove: (p) => void files.delete(p),
    list: (d) => { const o = [...new Set([...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1).split("/")[0]))]; if (!o.length) throw new Error("ENOENT"); return o.sort(); },
  },
  llm: { results, request: (key, req) => { pendingReq = { key, req }; } },
};

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
const cast = [
  ["mavka", "Mavka", "A quiet girl of the lake, curious about people, speaks softly and a little dreamily.", "mushrooms"],
  ["boris", "Boris", "A gruff fisher who has opinions about everything and is secretly kind.", "mushrooms"],
  ["clara", "Clara", "A talkative baker who loves gossip, food and long stories.", "mushrooms"],
];
for (const [id, name, about, interest] of cast) {
  files.set(`profiles/${id}.json`, JSON.stringify({ id, name, hue: 100, source: "own", about, interests: [interest, "weather"], schedule: always, voice: { length: 1, emoji: 1, formality: 20 } }));
}
files.set("settings.json", JSON.stringify({ tzOffset: 0, community: { clubs: true, clubsPerDay: 40, clubsMod: false } }));
files.set("you.json", JSON.stringify({ active: "u1", personas: [{ id: "u1", name: "Sergey", about: "A musician." }] }));

async function ask(req) {
  const messages = [{ role: "system", content: req.systemPrompt }, ...req.messages];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
        body: JSON.stringify({ model: MODEL, messages, temperature: req.presetParams?.temperature ?? 0.9, max_tokens: Math.max(req.presetParams?.max_tokens ?? 220, 600) }),
      });
      const j = await r.json().catch(() => ({}));
      const text = j?.choices?.[0]?.message?.content;
      if (text) return { text };
      console.error("empty answer", r.status, JSON.stringify(j).slice(0, 200));
      if (r.status === 401 || r.status === 403) { console.error("the key was rejected: stopping"); process.exit(1); }
      if (r.status === 429) await new Promise((ok) => setTimeout(ok, 15000));
    } catch (e) { console.error("call failed", String(e).slice(0, 150)); }
  }
  return { error: "failed" };
}

let t = 1_700_000_000_000;
Date.now = () => t; // the plugin reads the clock: every step is ten minutes, past the gap

const made = clubs.handleRoute({ method: "POST", path: "/clubs/club", body: { name: "Mushroom pickers", interest: "mushrooms", members: cast.map((c) => c[0]) } }, host).json.club;
const file = () => JSON.parse(files.get(`clubs/${made.id}.json`));
const USER = ["Hi everyone! I want to learn mushroom picking. Where do I start?", "Is it true that you should never pick them after rain?"];
let rejected = 0;

async function userSays(text) {
  t += 10 * 60 * 1000;
  const first = clubs.handleRoute({ method: "POST", path: "/clubs/send", body: { id: made.id, text } }, host);
  if (first && first.__llmPending && pendingReq) {
    const { req } = pendingReq;
    pendingReq = null;
    const a = await ask(req);
    results.reply = a;
    const second = clubs.handleRoute({ method: "POST", path: "/clubs/send", body: { id: made.id, text }, stash: first.stash }, host);
    delete results.reply;
    if (second.json && second.json.ok === false) rejected++;
  }
}

async function tickOnce() {
  t += 10 * 60 * 1000;
  pendingReq = null;
  const realRandom = Math.random;
  Math.random = () => 0; // the chance of a tick is met
  clubs.onTick({}, host);
  Math.random = realRandom;
  if (!pendingReq) return false;
  const { key, req } = pendingReq;
  pendingReq = null;
  results[key] = await ask(req);
  const before = file().messages.length;
  clubs.onTick({}, host);
  delete results[key];
  if (file().messages.length === before) rejected++;
  return true;
}

for (const text of USER) {
  await userSays(text);
  for (let i = 0; i < 2; i++) await tickOnce(); // the second owed answer, then idle talk
}
let guard = 0;
while (file().messages.filter((m) => m.by !== "me").length < TOTAL && guard++ < TOTAL * 3) await tickOnce();

const name = { me: "Sergey", mavka: "Mavka", boris: "Boris", clara: "Clara" };
const msgs = file().messages;
for (const m of msgs) console.log(`${name[m.by] || m.by}: ${m.text}`);
const theirs = msgs.filter((m) => m.by !== "me");
const avg = theirs.length ? Math.round(theirs.reduce((n, m) => n + m.text.length, 0) / theirs.length) : 0;
const labelled = theirs.filter((m) => /^(mavka|boris|clara)\s*[:\-]/i.test(m.text) || /[<>]/.test(m.text)).length;
const onTopic = theirs.filter((m) => /mushroom|forest|rain|pick|cap|basket|soup|fry|chanterelle|boletus|birch|damp/i.test(m.text)).length;
const ids = theirs.map((m) => m.by);
const repeats = ids.filter((x, i) => i > 0 && x === ids[i - 1]).length;
console.log("\n--- summary ---");
console.log(`model ${MODEL}: ${theirs.length} club messages, ${rejected} rejected or empty, average ${avg} characters`);
console.log(`name labels or tags left in: ${labelled}; same speaker twice in a row: ${repeats}; near the interest: ${onTopic} of ${theirs.length}`);
fs.writeFileSync(path.join(OUT, `clubs-${MODEL.replace(/[^A-Za-z0-9_.-]+/g, "_")}.json`), JSON.stringify({ model: MODEL, messages: msgs, rejected, avg, labelled, repeats, onTopic }, null, 2));
