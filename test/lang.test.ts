import { expect, test } from "bun:test";
import { langFromLocale, resolveLang } from "../src/i18n/index";

test("a shell locale reads as Ukrainian or English, garbage as nothing", () => {
  expect(langFromLocale("uk")).toBe("uk");
  expect(langFromLocale("uk-UA")).toBe("uk");
  expect(langFromLocale("en")).toBe("en");
  expect(langFromLocale("de")).toBe("en");
  expect(langFromLocale("ru")).toBe("en");
  expect(langFromLocale("")).toBeNull();
  expect(langFromLocale(null)).toBeNull();
  expect(langFromLocale(5)).toBeNull();
});

test("auto follows the app, the browser is never asked, a fixed choice wins over the app", () => {
  expect(resolveLang({ pinned: null, pref: "auto", appLang: "en" })).toBe("en");
  expect(resolveLang({ pinned: null, pref: "auto", appLang: "uk" })).toBe("uk");
  // the engine has not answered yet and nothing is cached: English, not the device language
  expect(resolveLang({ pinned: null, pref: "auto", appLang: null })).toBe("en");
  expect(resolveLang({ pinned: null, pref: "uk", appLang: "en" })).toBe("uk");
  expect(resolveLang({ pinned: null, pref: "en", appLang: "uk" })).toBe("en");
});

test("?lang= pins the language over everything", () => {
  expect(resolveLang({ pinned: "uk", pref: "en", appLang: "en" })).toBe("uk");
});
