// Social: messenger and forum. A URL with ?screen= is a design preview on mock data; the installed app is real.
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/kurale";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import { AppShell } from "@/shell/app-shell";
import { applyTheme, initialTheme } from "@/lib/theme";
import { currentLang } from "@/i18n/index";
import { reportTimeZone } from "@/lib/tz";

applyTheme(initialTheme());
document.documentElement.lang = currentLang();
reportTimeZone();
createRoot(document.getElementById("app")!).render(<AppShell />);
