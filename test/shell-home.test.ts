import { expect, test } from "bun:test";
import { homeOpener } from "../src/lib/shell-home";

test("the Home link needs the shell's openHome; an older engine has none", () => {
  const f = () => Promise.resolve(null);
  expect(homeOpener({ molfarShell: { openHome: f } })).toBe(f);
  expect(homeOpener({ molfarShell: {} })).toBeNull();
  expect(homeOpener({ molfarShell: { openHome: "no" } })).toBeNull();
  expect(homeOpener({})).toBeNull();
  expect(homeOpener(undefined)).toBeNull();
});

test("a window whose shell object throws on read has no Home link", () => {
  const win = {
    get molfarShell(): never {
      throw new Error("blocked");
    },
  };
  expect(homeOpener(win)).toBeNull();
});
