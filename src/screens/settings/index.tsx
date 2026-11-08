import "./settings.css";
import { useIsPhone } from "@/lib/use-phone";
import { useChrome } from "@/shell/nav";
import { useSettingsState } from "./state";
import { DesktopSettings } from "./desktop";
import { PhoneSettings } from "./phone";

// Settings screen: the approved boards Settings-desktop and Settings-phone, on mock state.
// Opens from the gear next to the user name (desktop) or the "More" tab (phone).
//
// Preview parameters (see AGENTS.md):
//   ?screen=settings              the whole screen. No `view` or `state` values: the
//                                 layout follows the viewport (desktop from 768 px,
//                                 phone below). Add `theme=vertep|dark|light` and
//                                 `lang=en|uk`; the boards are in Ukrainian (`lang=uk`).
//
// Notes: nothing is saved (a reload returns to the board's values). The phone rows
// Models, Notifications and Roleplay access open inline; the board shows them as
// plain rows. Quiet hours, share of new topics and "who writes more often" are on
// desktop only, as on the board.

export function Settings() {
  const phone = useIsPhone();
  // Phone: the screen has its own header, so the shell's top bar is hidden. Desktop
  // always shows the shell's bar, so this has no effect there.
  useChrome({ bar: false });
  const { s, set, models, error } = useSettingsState();
  return phone ? <PhoneSettings s={s} set={set} choices={models} error={error} /> : <DesktopSettings s={s} set={set} choices={models} error={error} />;
}
