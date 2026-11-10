// Draws the pictures characters asked for. A plugin can only write text, so a message or post a character wrote with a
// picture holds a `pending` image (its description). While Social is open this poll takes them one at a time, draws each with
// the engine's image model (the character's own, else Settings > Pictures, else the engine's default) and files the result.
// A picture whose drawing fails is filed as failed and is not tried again. Two windows of the same browser share a lock per
// picture, so one is drawn once; two devices are not covered (the second one's filing is refused and its drawing is wasted).
import { useEffect } from "react";
import { PREVIEW, call } from "@/lib/api";
import { generatePicture } from "@/screens/profiles/picture-api";

const POLL_MS = 20000;
const EVENT = "social:images";
const LOCK_MS = 5 * 60 * 1000;

/** Asks the worker to look for pictures to draw now (a chat or a topic just showed one that waits). */
export function refreshImages(): void {
  window.dispatchEvent(new Event(EVENT));
}

interface MessengerItem {
  id: string;
  /** The persona whose chat holds the message (absent for a chat made before personas had their own). */
  persona?: string;
  messageId: string;
  prompt: string;
  model: string;
}
interface StoryItem {
  id: string;
  prompt: string;
  model: string;
}
interface ForumItem {
  topic: string;
  post: string;
  prompt: string;
  model: string;
}

/** Takes the browser-wide lock of one picture; false when another window of this browser holds it. */
function lock(key: string): boolean {
  try {
    const k = `social:img-lock:${key}`;
    const at = Number(localStorage.getItem(k) ?? 0);
    if (at && Date.now() - at < LOCK_MS) return false;
    localStorage.setItem(k, String(Date.now()));
  } catch {
    // no storage: draw anyway
  }
  return true;
}

export function useImageWorker(): void {
  useEffect(() => {
    if (PREVIEW) return;
    let alive = true;
    let running = false;
    const draw = async (prompt: string, model: string): Promise<{ url: string } | { error: string }> => {
      try {
        return { url: await generatePicture(prompt, model, 200) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    };
    const run = async () => {
      if (running || !alive) return;
      running = true;
      try {
        const [m, f, st] = await Promise.all([
          call<{ items: MessengerItem[] }>("GET", "/messenger/images").catch(() => ({ items: [] as MessengerItem[] })),
          call<{ items: ForumItem[] }>("GET", "/forum/images").catch(() => ({ items: [] as ForumItem[] })),
          call<{ items: StoryItem[] }>("GET", "/stories/images").catch(() => ({ items: [] as StoryItem[] })),
        ]);
        for (const it of m.items) {
          if (!alive) break;
          if (!lock(`m:${it.id}:${it.messageId}`)) continue;
          const r = await draw(it.prompt, it.model);
          await call("POST", "/messenger/image", { id: it.id, ...(it.persona ? { persona: it.persona } : {}), messageId: it.messageId, ...r }).catch(() => undefined);
        }
        for (const it of f.items) {
          if (!alive) break;
          if (!lock(`f:${it.topic}:${it.post}`)) continue;
          const r = await draw(it.prompt, it.model);
          await call("POST", "/forum/image", { topic: it.topic, post: it.post, ...r }).catch(() => undefined);
        }
        for (const it of st.items) {
          if (!alive) break;
          if (!lock(`s:${it.id}`)) continue;
          const r = await draw(it.prompt, it.model);
          await call("POST", "/stories/image", { id: it.id, ...r }).catch(() => undefined);
        }
      } finally {
        running = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), POLL_MS);
    window.addEventListener(EVENT, run);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(EVENT, run);
    };
  }, []);
}
