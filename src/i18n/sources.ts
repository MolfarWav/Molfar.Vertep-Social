// Every screen's strings, merged by i18n/index.ts.
import type { Bundle } from "@/i18n/index";
import { strings as messenger } from "@/screens/messenger/strings";
import { strings as forum } from "@/screens/forum/strings";
import { strings as profiles } from "@/screens/profiles/strings";
import { strings as settings } from "@/screens/settings/strings";
import { strings as you } from "@/screens/you/strings";
import { strings as emoji } from "@/emoji/strings";

export const sources: Bundle[] = [messenger, forum, profiles, settings, you, emoji];
