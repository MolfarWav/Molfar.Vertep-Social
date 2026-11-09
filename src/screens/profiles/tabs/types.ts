import type { ProfileForm, ProfileSource } from "@/mock/profiles";
import type { FillProps } from "../fill-ui";

/** Props every editor tab gets. `set` merges a patch into the draft form. */
export interface TabProps {
  form: ProfileForm;
  set: (patch: Partial<ProfileForm>) => void;
  /** The profile's name (from the Soul), for sentences that use it. */
  name: string;
  /** Hue of the profile's avatar, for the names in the previews. */
  hue: number;
  /** Where the profile came from (the About note differs for a Roleplay profile). */
  source?: ProfileSource;
  /** Opens the "update from Roleplay" dialog (About's note links to it). */
  onRefresh?: () => void;
  /** "Fill empty" under the About note (absent in tabs that do not show it). */
  fill?: FillProps;
  /** The saved profile's id; the Life tab reads its diary by it (a profile not yet saved has none). */
  profileId?: string;
}

export type TabId = "about" | "voice" | "statuses" | "forum" | "habits" | "life" | "model";
export const TAB_IDS: TabId[] = ["about", "voice", "statuses", "forum", "habits", "life", "model"];
export const isTab = (v: unknown): v is TabId => typeof v === "string" && (TAB_IDS as string[]).includes(v);
