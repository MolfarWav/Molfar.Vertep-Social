// Real-model check of the messenger's recall (issue #368). Builds a long Ukrainian chat with planted facts, lets the plugin's own tick embed the older
// messages with a real embeddings model, then asks probe questions and prints which messages each matcher (keywords, vectors) would quote.
// No chat model is needed, only an embeddings endpoint.
//
//   RECALL_API_KEY=... RECALL_EMBED_MODEL=<model> bun scripts/recall-check.mjs
//
// RECALL_BASE_URL is any OpenAI-compatible base (default https://api.openai.com/v1). Some models want a prefix for queries and documents
// (e5 style): set RECALL_QUERY_PREFIX and RECALL_DOC_PREFIX (e.g. "query: " and "passage: "). Writes nothing in the repo; the answer is printed.
// Look at: does each probe bring the planted fact (marked >>), does a chit-chat probe bring nothing, and how far apart are the scores
// (the printed "median / bar" show where the plugin puts its threshold for this model).
import path from "node:path";

const MODEL = process.env.RECALL_EMBED_MODEL;
const KEY = process.env.RECALL_API_KEY;
if (!MODEL || !KEY) {
  console.error("usage: RECALL_API_KEY=... RECALL_EMBED_MODEL=<model> [RECALL_BASE_URL=...] bun scripts/recall-check.mjs");
  process.exit(2);
}
const BASE = (process.env.RECALL_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const QP = process.env.RECALL_QUERY_PREFIX || "";
const DP = process.env.RECALL_DOC_PREFIX || "";
const plugin = await import(path.resolve(import.meta.dir, "../plugins/messenger/plugin.js"));

async function embedApi(texts, kind) {
  const r = await fetch(BASE + "/embeddings", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
    body: JSON.stringify({ model: MODEL, input: texts.map((t) => (kind === "query" ? QP : DP) + t) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!Array.isArray(j.data)) throw new Error("embeddings failed: " + r.status + " " + JSON.stringify(j).slice(0, 200));
  return j.data.map((d) => d.embedding);
}

const files = new Map();
const embedResults = {};
const embedInfo = {};
let asked = null;
const host = {
  fs: {
    read: (p) => { if (!files.has(p)) throw new Error("ENOENT"); return files.get(p); },
    write: (p, c) => void files.set(p, c),
    remove: (p) => { for (const k of [...files.keys()]) if (k === p || k.startsWith(p + "/")) files.delete(k); },
    list: (d) => { const o = [...new Set([...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1).split("/")[0]))]; if (!o.length) throw new Error("ENOENT"); return o.sort(); },
  },
  llm: { results: {}, embedResults, embedInfo, request: () => {}, embed: (key, req) => { asked = { key, req }; } },
};

const PLANTED = [
  [2, "Вдома в мене пес Барсик, мальтіпу, смішний, тягає шкарпетки."],
  [6, "Репетиції в нас щочетверга о сьомій вечора."],
  [11, "Мій гурт зіграє на фестивалі 14 грудня в Харкові. Страшно і весело."],
  [17, "Ти обіцяла скинути мені добірку українського інді до п'ятниці. Не забудь!"],
  [23, "Працюю звукорежисером на радіо, а вдень граю на басі в гурті."],
];
const CHAT = [
  "Привіт! Як минув день?", "Та нічого особливого, багато роботи.", "Дощ усю дорогу, промок до нитки.", "Кава вже холодна, а я все ще за комп'ютером.",
  "Сьогодні знову запізнився автобус.", "Ха, у нас так щодня.", "Що будеш робити ввечері?", "Мабуть, просто відпочину.", "Подивлюсь якийсь старий фільм.",
  "А я погуляю в парку, якщо дощ закінчиться.", "Погода сьогодні дивна, то сонце, то злива.", "Вчора довго не міг заснути.", "Це через каву, певно.",
  "Можливо. Треба менше пити на ніч.", "Ти вже обрала, що читатимеш?", "Ще ні, вагаюсь між двома книжками.", "Бери ту, що тонша, ха.",
  "Добра порада, дякую.", "Ну що, до завтра?", "До завтра, гарного вечора!",
];
const messages = [];
let t = 1_700_000_000_000;
const push = (who, text) => { t += 7 * 60_000; messages.push({ id: who + "-" + messages.length, who, at: t, text }); };
for (let i = 0; i < 90; i++) {
  const planted = PLANTED.find(([k]) => k === i);
  if (planted) push("me", planted[1]);
  else push(i % 2 ? "them" : "me", CHAT[i % CHAT.length] + (i > 19 ? " (" + i + ")" : ""));
}
const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "off"));
files.set("profiles/lesya.json", JSON.stringify({ id: "lesya", name: "Леся", source: "own", schedule: always }));
files.set("settings.json", JSON.stringify({ messengerRecall: true, messengerSummary: false, messengerContext: 10, tzOffset: -120 }));
const chatFile = (extra = []) => JSON.stringify({ id: "lesya", messages: [...messages, ...extra], pending: null, failed: null, unread: false, shared: [] });
files.set("chats/lesya.json", chatFile());

// the plugin's own tick makes the vectors
let batches = 0;
for (let i = 0; i < 40; i++) {
  asked = null;
  plugin.onTick({}, host);
  if (!asked) break;
  const { key, req } = asked;
  embedResults[key] = await embedApi(req.texts, "document");
  embedInfo[key] = { model: MODEL, via: "check" };
  plugin.onTick({}, host);
  delete embedResults[key];
  batches++;
}
const meta = JSON.parse(files.get(".cache/recall/meta/lesya.json") || "{}");
console.log("batches:", batches, "vectors:", Object.keys(meta.have || {}).length, "model:", meta.model, "failAt:", meta.failAt || 0);

const PROBES = [
  "Ти пам'ятаєш, як звати мого пса?",
  "А коли в мене репетиції?",
  "Що за фестиваль і коли?",
  "Що ти мені обіцяла?",
  "Ким я працюю і на чому граю?",
  "Як справи, що нового?",
];
const planted = new Set(PLANTED.map(([, text]) => text));
for (const q of PROBES) {
  const extra = [{ id: "me-probe", who: "me", at: t + 60_000, text: q }];
  files.set("chats/lesya.json", chatFile(extra));
  const chat = { id: "lesya", persona: "", ...plugin.handleRoute({ method: "GET", path: "/messenger/chat", query: { id: "lesya" } }, host).json.chat };
  const keyword = plugin.recallFor(host.fs, chat, null);
  const [vec] = await embedApi([plugin.recallQuery(chat)], "query");
  const byVec = plugin.recallFor(host.fs, chat, { vec, model: MODEL });
  const show = (list) => (list.length ? list.map((x) => (planted.has(x.text) ? ">> " : "   ") + x.when + " " + x.text.slice(0, 70)).join("\n") : "   (nothing)");
  console.log("\n? " + q + "\nkeywords:\n" + show(keyword) + "\nvectors:\n" + show(byVec));
}
