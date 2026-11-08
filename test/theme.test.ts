import { expect, test } from "bun:test";
import { themeFromShell } from "../src/lib/theme";

test("the shell's three themes map to Social's three, a custom one by its scheme", () => {
  expect(themeFromShell({ id: "vertep", scheme: "dark" })).toBe("vertep");
  expect(themeFromShell({ id: "dark", scheme: "dark" })).toBe("dark");
  expect(themeFromShell({ id: "light", scheme: "light" })).toBe("light");
  expect(themeFromShell({ id: "sunset", scheme: "light" })).toBe("light");
  expect(themeFromShell({ id: "midnight", scheme: "dark" })).toBe("dark");
});

test("nothing or garbage from the shell changes nothing", () => {
  expect(themeFromShell(null)).toBeNull();
  expect(themeFromShell(undefined)).toBeNull();
  expect(themeFromShell({ id: "x" })).toBeNull();
  expect(themeFromShell({ id: 5 as unknown as string, scheme: "purple" as unknown as "dark" })).toBeNull();
});
