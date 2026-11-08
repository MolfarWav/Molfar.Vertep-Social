import { expect, test } from "bun:test";
import { dictionary } from "@/i18n/index";
import { EMPTY_CHAT, chatView, clock, contactFromEngine, dayLabel, logItems, replyText, scheduleText, type EngineChat, type EngineContact, type Translate } from "@/screens/messenger/real";

// The English strings, with the same {name} substitution the app does.
const t: Translate = (key, vars) => {
  let s = dictionary.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
};

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime();

const engine = (over: Partial<EngineContact> = {}): EngineContact => ({
  id: "mavka",
  name: "Мавка",
  hue: 150,
  source: "own",
  status: "online",
  nextOnline: null,
  line: "слухає шелест очерету",
  unread: true,
  lastAt: 0,
  pending: false,
  ...over,
});

test("clock is the local HH:MM", () => {
  expect(clock(local(2026, 10, 8, 9, 5))).toBe("09:05");
  expect(clock(local(2026, 10, 8, 21, 30))).toBe("21:30");
});

test("the day line says Today only for a message from today, else the date", () => {
  const now = local(2026, 10, 8, 14);
  expect(dayLabel(local(2026, 10, 8, 1), now, "en", t)).toBe("Today");
  expect(dayLabel(null, now, "en", t)).toBe("Today");
  expect(dayLabel(local(2026, 10, 7, 23), now, "en", t)).toBe(new Date(local(2026, 10, 7, 23)).toLocaleDateString("en"));
});

test("the schedule line: online now, the next online time, or never this week", () => {
  const tue = local(2026, 10, 10, 12, 0); // Tuesday 12:00 (local)
  expect(scheduleText("online", null, "en", t)).toBe("Online now");
  expect(scheduleText("off", null, "en", t)).toBe("Not online this week");
  expect(scheduleText("off", tue, "en", t)).toBe("Back online Tuesday 12:00");
});

test("the reply line follows the status", () => {
  expect(replyText("online", t)).toBe("Answers within seconds");
  expect(replyText("away", t)).toBe("Answers in a few minutes");
  expect(replyText("dnd", t)).toBe("Answers when back online");
  expect(replyText("off", t)).toBe("Answers when back online");
});

test("an engine contact becomes the screen's contact, with no separator note and no typing line", () => {
  const c = contactFromEngine(engine({ status: "away", line: "повернусь за годину" }), "en", t);
  expect(c).toMatchObject({ id: "mavka", name: "Мавка", hue: 150, status: "away", line: "повернусь за годину", unread: true });
  expect(c).toMatchObject({ note: "", typing: false, to: "Мавка", of: "Мавка", first: "" });
  expect(c.reply).toBe("Answers in a few minutes");
});

test("messages become log lines: the user's as me, the character's as the contact id", () => {
  const items = logItems(
    [
      { id: "a", who: "them", at: local(2026, 10, 8, 21, 2), text: "Привіт" },
      { id: "b", who: "me", at: local(2026, 10, 8, 21, 3), text: "Агов" },
    ],
    "mavka",
  );
  expect(items).toEqual([
    { kind: "msg", who: "mavka", time: "21:02", text: "Привіт" },
    { kind: "msg", who: "me", time: "21:03", text: "Агов" },
  ]);
});

test("a chat from the engine: first message time, a pending reply, a failure", () => {
  const chat: EngineChat = {
    id: "mavka",
    status: "online",
    nextOnline: null,
    messages: [{ id: "a", who: "me", at: local(2026, 10, 8, 9, 0), text: "Привіт" }],
    pending: { at: 1, dueAt: null },
    failed: { error: "the model did not answer", code: undefined },
  };
  const v = chatView(chat, "mavka");
  expect(v.firstAt).toBe(local(2026, 10, 8, 9, 0));
  expect(v.pending).toBe(true);
  expect(v.failed?.error).toBe("the model did not answer");
  expect(v.busy).toBe(false);
  expect(v.loaded).toBe(true);
  expect(EMPTY_CHAT.items).toEqual([]);
  expect(chatView({ ...chat, messages: [], pending: null, failed: null }, "mavka")).toMatchObject({ firstAt: null, pending: false, failed: null });
});
