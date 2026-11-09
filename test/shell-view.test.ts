import { expect, test } from "bun:test";
import { onShellView, viewSubscriber } from "../src/lib/shell-view";

test("the shell's onView is used when the engine has it, and an older engine has none", () => {
  const sub = () => () => undefined;
  expect(viewSubscriber({ molfarShell: { onView: sub } })).toBe(sub);
  expect(viewSubscriber({ molfarShell: {} })).toBeNull();
  expect(viewSubscriber({ molfarShell: { onView: "no" } })).toBeNull();
  expect(viewSubscriber({})).toBeNull();
  expect(viewSubscriber(undefined)).toBeNull();
});

test("a view name reaches the listener until it stops", () => {
  let listener: ((v: string) => void) | null = null;
  const win = { molfarShell: { onView: (fn: (v: string) => void) => { listener = fn; return () => { listener = null; }; } } };
  const heard: string[] = [];
  const off = onShellView((v) => heard.push(v), win);
  listener!("settings");
  expect(heard).toEqual(["settings"]);
  off();
  expect(listener).toBeNull();
});

test("without engine support, or when it throws, listening is a harmless no-op", () => {
  expect(() => onShellView(() => undefined, {})()).not.toThrow();
  expect(() => onShellView(() => undefined, { molfarShell: { onView: () => { throw new Error("no"); } } })()).not.toThrow();
  const blocked = { get molfarShell(): never { throw new Error("blocked"); } };
  expect(() => onShellView(() => undefined, blocked)()).not.toThrow();
});
