// Social: messenger and forum. The UI runs on mock data until the plugins are wired.
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/kurale";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import { AppShell } from "@/shell/app-shell";
import { applyTheme, initialTheme } from "@/lib/theme";
import { currentLang } from "@/i18n/index";

applyTheme(initialTheme());
document.documentElement.lang = currentLang();
createRoot(document.getElementById("app")!).render(<AppShell />);
