// The plugins run schedules in the user's own time, but their sandbox does not reliably know the machine's
// time zone. The browser does: it tells the app's settings its UTC offset (minutes, UTC minus local) on every
// open, so a change of zone or of summer time is picked up. Real mode only.
import { PREVIEW, call } from "@/lib/api";

export function reportTimeZone(): void {
  if (PREVIEW) return;
  const tzOffset = new Date().getTimezoneOffset();
  call("PUT", "/settings", { tzOffset }).catch(() => undefined);
}
