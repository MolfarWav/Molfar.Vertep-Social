import type { ProfileForm } from "@/mock/profiles";

/** Props every editor tab gets. `set` merges a patch into the draft form. */
export interface TabProps {
  form: ProfileForm;
  set: (patch: Partial<ProfileForm>) => void;
  /** The profile's name (from the Soul), for sentences that use it. */
  name: string;
  /** Hue of the profile's avatar, for the names in the previews. */
  hue: number;
  /** Opens the "update from Roleplay" dialog (About's note links to it). */
  onRefresh?: () => void;
}

export type TabId = "about" | "voice" | "statuses" | "forum" | "habits";
export const TAB_IDS: TabId[] = ["about", "voice", "statuses", "forum", "habits"];
export const isTab = (v: unknown): v is TabId => typeof v === "string" && (TAB_IDS as string[]).includes(v);
