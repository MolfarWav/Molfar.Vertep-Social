// Clubs (issue #368): the calls to the `clubs` plugin. In the design preview (`?screen=`) the same calls answer from a small fake
// (`src/mock/clubs.ts`), so the screen can be drawn and checked: `state=noclubs` has no clubs, `state=clubsoff` has the global switch off.
import { PREVIEW, call } from "@/lib/api";
import { MOCK_CLUBS, MOCK_CLUB_LOG } from "@/mock/clubs";
import type { Club, ClubChat, ClubList, ClubPerson, Pickable } from "./clubs-model";

const previewState = (): string => {
  try {
    return new URLSearchParams(location.search).get("state") ?? "";
  } catch {
    return "";
  }
};

let fake: Club[] | null = null;
const clubs = (): Club[] => (fake ??= previewState() === "noclubs" ? [] : MOCK_CLUBS.map((c) => ({ ...c })));
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const personsOf = (ids: string[], people: Pickable[]): ClubPerson[] =>
  ids.map((id) => people.find((p) => p.id === id)).filter((p): p is Pickable => !!p).map((p) => ({ id: p.id, name: p.name, hue: p.hue, picture: p.picture ?? "" }));

export async function loadClubs(): Promise<ClubList> {
  if (PREVIEW) return { on: previewState() !== "clubsoff", max: 3, clubs: clubs() };
  try {
    return await call<ClubList>("GET", "/clubs");
  } catch {
    return { on: false, max: 3, clubs: [] };
  }
}

export async function loadClubChat(id: string): Promise<ClubChat | null> {
  if (PREVIEW) {
    const club = clubs().find((c) => c.id === id);
    if (!club) return null;
    return { club, messages: id === "cl-1" ? MOCK_CLUB_LOG : [], multi: id === "cl-1", limited: previewState() === "limited", answersMax: 20, pending: false, failed: false };
  }
  try {
    return await call<ClubChat>("GET", `/clubs/chat?id=${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

/** Makes a club; resolves to {error: text or "", id of the new club}. `people` is only used by the preview's fake. */
export async function createClub(body: { name: string; interest: string; members: string[] }, people: Pickable[] = []): Promise<{ error: string; id: string }> {
  if (PREVIEW) {
    const id = `cl-new-${clubs().length + 1}`;
    clubs().push({ id, name: body.name, interest: body.interest, by: "user", on: true, count: 0, last: null, members: personsOf(body.members, people) });
    return { error: "", id };
  }
  try {
    const r = await call<{ club?: { id: string } }>("POST", "/clubs/club", { name: body.name, interest: body.interest, members: body.members, on: true });
    return { error: "", id: r.club?.id ?? "" };
  } catch (e) {
    return { error: errorText(e), id: "" };
  }
}

/** Changes a club; resolves to an error text or "". `people` is only used by the preview's fake. */
export async function editClub(id: string, patch: { name?: string; interest?: string; members?: string[]; on?: boolean }, people: Pickable[] = []): Promise<string> {
  if (PREVIEW) {
    fake = clubs().map((c) => (c.id !== id ? c : { ...c, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.interest !== undefined ? { interest: patch.interest } : {}), ...(patch.on !== undefined ? { on: patch.on } : {}), members: patch.members ? personsOf(patch.members, people) : c.members }));
    return "";
  }
  try {
    await call("POST", "/clubs/edit", { id, ...patch });
    return "";
  } catch (e) {
    return errorText(e);
  }
}

export async function removeClub(id: string): Promise<string> {
  if (PREVIEW) {
    fake = clubs().filter((c) => c.id !== id);
    return "";
  }
  try {
    await call("POST", "/clubs/remove", { id });
    return "";
  } catch (e) {
    return errorText(e);
  }
}

/** The user's message; the first reply may be written before this answers (the engine waits for the model). `queued`: nobody could be asked now. */
export async function sendToClub(id: string, text: string): Promise<{ error: string; queued: boolean; chat: ClubChat | null }> {
  if (PREVIEW) return { error: "", queued: false, chat: null };
  try {
    const r = await call<{ ok: boolean; queued?: boolean; error?: string; chat?: ClubChat }>("POST", "/clubs/send", { id, text });
    return { error: r.ok ? "" : (r.error ?? "failed"), queued: r.queued === true, chat: r.chat ?? null };
  } catch (e) {
    return { error: errorText(e), queued: false, chat: null };
  }
}
