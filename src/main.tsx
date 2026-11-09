// Social: messenger and forum. A URL with ?screen= is a design preview on mock data; the installed app is real.
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/kurale";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./emoji/font.css";
import "./emoji/emoji.css";
import { AppShell } from "@/shell/app-shell";
import { applyTheme, followShell, initialTheme } from "@/lib/theme";
import { currentLang, followShellLanguage } from "@/i18n/index";
import { reportTimeZone } from "@/lib/tz";

applyTheme(initialTheme());
followShell();
document.documentElement.lang = currentLang();
followShellLanguage();
reportTimeZone();
createRoot(document.getElementById("app")!).render(<AppShell />);
