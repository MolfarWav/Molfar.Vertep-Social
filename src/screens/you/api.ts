// Your profile on the engine (the profiles plugin, /you routes). Preview mode never calls it.
import { call } from "@/lib/api";
import { readPersona, readScan, readYou, type Persona, type PersonaScan, type YouState } from "./model";

type Reply = { ok?: boolean; error?: string; you?: unknown; persona?: unknown };

/** A reply that says `ok: false` is a failure whatever the status was. */
function checked<T extends Reply>(json: T): T {
  if (json.ok === false) throw new Error(json.error || "the engine refused");
  return json;
}

export async function loadYou(): Promise<YouState> {
  const json = await call<{ you?: unknown }>("GET", "/you");
  return readYou(json.you);
}

export async function savePersona(p: Persona): Promise<YouState> {
  const json = checked(await call<Reply>("PUT", `/you/${encodeURIComponent(p.id)}`, p));
  return readYou(json.you);
}

export async function deletePersona(id: string): Promise<YouState> {
  const json = checked(await call<Reply>("DELETE", `/you/${encodeURIComponent(id)}`));
  return readYou(json.you);
}

export async function setActive(id: string): Promise<YouState> {
  const json = checked(await call<Reply>("PUT", "/you/active", { id }));
  return readYou(json.you);
}

export async function scanPersonas(): Promise<PersonaScan> {
  return readScan(await call<unknown>("GET", "/you/roleplay"));
}

/** One Roleplay persona brought in: the new (or already known) persona and the whole state. */
export async function importPersona(rpId: string): Promise<{ persona: Persona; you: YouState }> {
  const json = checked(await call<Reply>("POST", "/you/import", { id: rpId }));
  const persona = readPersona(json.persona);
  if (!persona) throw new Error("the engine sent no persona");
  return { persona, you: readYou(json.you) };
}
