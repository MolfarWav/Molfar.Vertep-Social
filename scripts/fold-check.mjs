// Real-model check of the messenger memory fold (issue #336). Drives the messenger plugin's own routes and tick (a scripted 38-line
// conversation in Ukrainian with planted facts, replies and folds from a real model) and reports how the note behaves over many folds:
// its length, which planted facts survive, whether the final answers recall them.
//
//   FOLD_API_KEY=... bun scripts/fold-check.mjs <model> [window]
//
// FOLD_BASE_URL is any OpenAI-compatible base (default OpenRouter: https://openrouter.ai/api/v1), so a free model works:
//   FOLD_API_KEY=sk-or-... bun scripts/fold-check.mjs google/gemma-3-27b-it:free 8
// <window> is Settings > Messenger "Messages a character remembers" (default 8 here, so a fold happens every few messages).
// Writes fold-<model>.json to FOLD_OUT (default: the current folder) and prints a summary. Nothing in the repo is changed.
import path from "node:path";
import fs from "node:fs";

const MODEL = process.argv[2];
if (!MODEL || !process.env.FOLD_API_KEY) {
  console.error("usage: FOLD_API_KEY=... [FOLD_BASE_URL=...] bun scripts/fold-check.mjs <model> [window]");
  process.exit(2);
}
const WINDOW = Number(process.argv[3] || 8);
const SOCIAL = path.resolve(import.meta.dir, "..");
const OUT = process.env.FOLD_OUT || process.cwd();
const BASE = (process.env.FOLD_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const plugin = await import(path.join(SOCIAL, "plugins/messenger/plugin.js"));
const KEY = process.env.FOLD_API_KEY;

const files = new Map();
const results = {};
let pendingReq = null;
const host = {
  fs: {
    read: (p) => { if (!files.has(p)) throw new Error("ENOENT"); return files.get(p); },
    write: (p, c) => void files.set(p, c),
    remove: (p) => void files.delete(p),
    list: (d) => { const o = [...files.keys()].filter((k) => k.startsWith(d + "/")).map((k) => k.slice(d.length + 1)); if (!o.length) throw new Error("ENOENT"); return o.sort(); },
  },
  llm: { results, request: (key, req) => { pendingReq = { key, req }; } },
};

const always = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => "online"));
files.set("profiles/lesya.json", JSON.stringify({ id: "lesya", name: "Леся", hue: 150, source: "own", about: "Тепла, трохи іронічна дівчина з Полісся, любить фолк і дрібні деталі. Пише живо, без пафосу.", schedule: always, voice: { length: 1, emoji: 1, formality: 20 } }));
files.set("chats/lesya.json", JSON.stringify({ id: "lesya", messages: [], pending: null, failed: null, unread: false, shared: [] }));
files.set("settings.json", JSON.stringify({ messengerContext: WINDOW, language: "uk" }));
files.set("you.json", JSON.stringify({ active: "u1", personas: [{ id: "u1", name: "Сергій", about: "Музикант." }] }));

async function call(req) {
  const messages = [{ role: "system", content: req.systemPrompt }, ...req.messages];
  const t0 = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(BASE + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + KEY },
        body: JSON.stringify({ model: MODEL, messages, temperature: req.presetParams?.temperature ?? 0.8, max_tokens: Math.max(req.presetParams?.max_tokens ?? 500, 1500) }),
      });
      const j = await r.json().catch(() => ({}));
      const text = j?.choices?.[0]?.message?.content;
      if (text) return { text, ms: Date.now() - t0 };
      console.error("empty answer", r.status, JSON.stringify(j).slice(0, 200));
      if (r.status === 401 || r.status === 403) { console.error("the key was rejected: stopping"); process.exit(1); }
      if (r.status === 429) await new Promise((ok) => setTimeout(ok, 15000));
    } catch (e) { console.error("call failed", String(e).slice(0, 150)); }
  }
  return { error: "failed" };
}

const readChat = () => JSON.parse(files.get("chats/lesya.json"));
let t = 1_700_000_000_000;
const realNow = Date.now;
Date.now = () => t; // the plugin reads the clock: every step is a minute

const USER = [
  "Привіт! Я Сергій, щойно повернувся з репетиції, вуха ще дзвенять.",
  "Граю на басі в гурті. А вдень працюю звукорежисером на радіо.",
  "Вдома в мене пес Барсик, мальтіпу, смішний, тягає шкарпетки.",
  "Репетиції в нас щочетверга о сьомій вечора.",
  "Слухай, ти обіцяла скинути мені добірку українського інді до п'ятниці. Не забудь!",
  "Ха, у нас у гурті є жарт: мій бас звучить як бульба в мундирі. Бульбовий бас.",
  "А ти що сьогодні слухала?",
  "Цікаво. Я сьогодні цілий день зводив ефір, голова пухне.",
  "Живу я зараз у Львові, але думаю про переїзд.",
  "Львів гарний, але дорогий. Кава тут сто гривень, уявляєш?",
  "Що б ти порадила на вечір? Фільм чи музику?",
  "Давай музику. Але щось без слів.",
  "Новина! Я таки переїхав у Київ. Львів позаду.",
  "Квартира маленька, але з балконом. Барсик у захваті, бігає як навіжений.",
  "Перший день на новому місці, нічого не знаю де лежить.",
  "О, до речі, бульбовий бас тепер наша офіційна назва проєкту. Серйозно.",
  "Думаю, чи не завести собі ще й гітару для дому.",
  "Ти б яку взяла, електро чи акустику?",
  "Барсик захворів, ходили до ветеринара. Дали пігулки на тиждень.",
  "Переживаю, він не їсть нормально.",
  "Ветеринарка каже, нічого страшного, шлунок.",
  "Дякую, що підтримуєш. Справді легше.",
  "Тиждень минув, Барсик одужав, знову тягає шкарпетки!",
  "Слухай, а що з добіркою, яку ти мала скинути?",
  "Гаразд, нічого страшного. Скинеш, коли зможеш.",
  "Мій гурт зіграє на фестивалі 14 грудня в Харкові. Страшно і весело.",
  "Репетиції тепер у суботу, четвер не виходить, на радіо змінили графік.",
  "Треба вивчити нову партію баса до фестивалю.",
  "Ти приїдеш послухати? Хоч в уяві.",
  "Ха, домовились. Тоді в уяві в першому ряду.",
  "Ще забув сказати: мені подарували педаль ефектів, хорус.",
  "Бас з хорусом звучить як підводний човен.",
  "Ну що, перевірка. Ти пам'ятаєш, як звати мого пса?",
  "А де я зараз живу?",
  "А коли в мене репетиції?",
  "А що за фестиваль і коли?",
  "Що ти мені обіцяла і чи вже зробила?",
  "Ким я працюю і на чому граю?",
];

const log = [];
let folds = 0;
async function settle() {
  // run ticks until nothing is pending: replies are not due here, folds are
  for (let guard = 0; guard < 6; guard++) {
    pendingReq = null;
    plugin.onTick({}, host);
    if (!pendingReq) return;
    const { key, req } = pendingReq;
    const r = await call(req);
    results[key] = r;
    plugin.onTick({}, host);
    delete results[key];
    if (key.startsWith("sum:")) {
      folds++;
      const s = readChat().summary;
      log.push({ turn: log.length, fold: folds, noteLen: s ? s.text.length : 0, note: s ? s.text : null, failed: !!r.error, ms: r.ms });
    }
  }
}

const replies = [];
for (let i = 0; i < USER.length; i++) {
  t += 60_000;
  pendingReq = null;
  let res = plugin.handleRoute({ method: "POST", path: "/messenger/send", body: { id: "lesya", text: USER[i] } }, host);
  if (res && res.__llmPending && pendingReq) {
    const r = await call(pendingReq.req);
    host.llm.results.reply = r;
    t += 20_000;
    res = plugin.handleRoute({ method: "POST", path: "/messenger/send", body: { id: "lesya", text: USER[i] }, stash: res.stash }, host);
    delete host.llm.results.reply;
  }
  const chat = readChat();
  replies.push({ q: USER[i], a: chat.messages.at(-1)?.who === "them" ? chat.messages.at(-1).text : "(no reply) " + JSON.stringify(res).slice(0, 120) });
  await settle();
  process.stderr.write(".");
}
Date.now = realNow;

const final = readChat();
const note = final.summary ? final.summary.text : "";
const checks = { "Барсик": /Барсик/i, "Київ": /Ки[їє]в|Києв/i, "Львів(old)": /Льв/i, "Сергій": /Серг/i, "звукорежисер": /звукорежис/i, "бас": /бас/i, "добірка": /добірк|плейлист/i, "фестиваль": /фестивал/i, "Харків": /Харк/i, "14 грудня": /14 грудня|14\.12|грудн/i, "субота/четвер": /субот|четвер/i, "одужав": /одужа|здоров/i };
const hit = Object.fromEntries(Object.entries(checks).map(([k, re]) => [k, re.test(note)]));
const probes = replies.slice(-6);
const out = { model: MODEL, window: WINDOW, turns: USER.length, folds, finalNoteLen: note.length, noteMax: Math.max(0, ...log.map((l) => l.noteLen)), failedFolds: log.filter((l) => l.failed).length, hit, finalNote: note, probes, log: log.map((l) => ({ fold: l.fold, len: l.noteLen, note: l.note })), replies };
fs.writeFileSync(path.join(OUT, "fold-" + MODEL.replace(/[^a-z0-9.]+/gi, "_") + ".json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ model: MODEL, folds, finalNoteLen: out.finalNoteLen, noteMax: out.noteMax, failedFolds: out.failedFolds, hit }, null, 1));
console.log("\nFINAL NOTE:\n" + note);
console.log("\nPROBES:\n" + probes.map((p) => p.q + "\n  -> " + p.a).join("\n"));
