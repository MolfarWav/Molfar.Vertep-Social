import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { dictionary } from "@/i18n/index";

const root = path.resolve(import.meta.dir, "..");

test("app manifest is a Social app", () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  expect(m.kind).toBe("app");
  expect(m.name).toBe("Social");
  expect(m.repository).toContain("Molfar.Vertep-Social");
});

test("each plugin has a manifest and answers only its own paths", async () => {
  for (const id of ["profiles", "messenger", "forum"]) {
    const m = JSON.parse(fs.readFileSync(path.join(root, "plugins", id, "manifest.json"), "utf8"));
    expect(m.permissions).toContain("routes");
    const mod = await import(path.join(root, "plugins", id, "plugin.js"));
    expect(mod.handleRoute({ path: "/other", method: "GET" })).toBeNull();
    expect(mod.handleRoute({ path: `/${id}/x`, method: "GET" }).status).toBe(501);
  }
});

test("English and Ukrainian strings have the same keys", () => {
  const en = Object.keys(dictionary.en).sort();
  const uk = Object.keys(dictionary.uk).sort();
  expect(uk).toEqual(en);
});

test("no model names or personal paths in repo text files", () => {
  const bad = /claude-(opus|sonnet|haiku|fable)|\bC:\\Users\\/i;
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") return [];
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  for (const f of walk(root)) {
    if (!/\.(ts|tsx|js|css|md|json|html|yml)$/.test(f) || f.endsWith("bun.lock") || f.endsWith("skeleton.test.ts")) continue;
    expect(bad.test(fs.readFileSync(f, "utf8")), f).toBe(false);
  }
});
