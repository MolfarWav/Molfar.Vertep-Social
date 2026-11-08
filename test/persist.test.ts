import { describe, expect, test } from "bun:test";
import { PROFILES, type MockProfile } from "@/mock/profiles";
import { formOf } from "@/screens/profiles/editor";
import { ProfileSync, errorText, fullProfile, stableJson, stripStamps } from "@/screens/profiles/persist";

const base = PROFILES[0];
const other = PROFILES[1];

/** A fake engine that records the calls, can fail, and can hold every call until released. */
function fakeEngine() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let fail: string | null = null;
  let barrier: Promise<void> | null = null;
  let open: () => void = () => {};
  const send = async (method: "PUT" | "DELETE", path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (barrier) await barrier;
    if (fail) throw new Error(fail);
    return { ok: true };
  };
  return {
    calls,
    send,
    failWith(message: string | null) {
      fail = message;
    },
    hold() {
      barrier = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    release() {
      open();
      barrier = null;
    },
  };
}

describe("fullProfile and stripStamps", () => {
  test("the saved form replaces the form fields and keeps identity", () => {
    const full = fullProfile(base, { ...formOf(base), about: "Changed" });
    expect(full.id).toBe(base.id);
    expect(full.name).toBe(base.name);
    expect(full.source).toBe(base.source);
    expect(full.about).toBe("Changed");
  });

  test("server timestamps are removed", () => {
    const out = stripStamps({ ...base, createdAt: "2026-11-01", updatedAt: "2026-11-02" });
    expect("createdAt" in out).toBe(false);
    expect("updatedAt" in out).toBe(false);
    expect(out.id).toBe(base.id);
  });
});

describe("stableJson", () => {
  test("key order does not change the text", () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [1, { z: 1, y: 2 }] } })).toBe(stableJson({ a: { c: [1, { y: 2, z: 1 }], d: 2 }, b: 1 }));
  });

  test("a changed value changes the text", () => {
    expect(stableJson({ a: 1 })).not.toBe(stableJson({ a: 2 }));
  });
});

describe("errorText", () => {
  test("uses the message of an error, or the text of anything else", () => {
    expect(errorText(new Error("no route"))).toBe("no route");
    expect(errorText("plain")).toBe("plain");
  });
});

describe("ProfileSync", () => {
  test("loading does not save: the returned copy is confirmed", async () => {
    const eng = fakeEngine();
    const sync = new ProfileSync(eng.send);
    const full = fullProfile(base, formOf(base));
    sync.seed(stripStamps({ ...full }));
    await sync.save(full);
    expect(eng.calls.length).toBe(0);
  });

  test("a changed saved form is sent once, then confirmed", async () => {
    const eng = fakeEngine();
    const sync = new ProfileSync(eng.send);
    sync.seed(fullProfile(base, formOf(base)));
    const edited = fullProfile(base, { ...formOf(base), about: "New text" });
    expect(sync.isConfirmed(edited)).toBe(false);
    await sync.save(edited);
    await sync.save(edited);
    expect(eng.calls.length).toBe(1);
    expect(eng.calls[0].method).toBe("PUT");
    expect(eng.calls[0].path).toBe(`/profiles/${base.id}`);
    expect(sync.isConfirmed(edited)).toBe(true);
  });

  test("a failed save keeps the old confirmed copy, so the next save sends again", async () => {
    const eng = fakeEngine();
    const sync = new ProfileSync(eng.send);
    sync.seed(fullProfile(base, formOf(base)));
    const edited = fullProfile(base, { ...formOf(base), about: "Retry me" });
    eng.failWith("Engine is down");
    await expect(sync.save(edited)).rejects.toThrow("Engine is down");
    expect(sync.isConfirmed(edited)).toBe(false);
    eng.failWith(null);
    await sync.save(edited);
    expect(eng.calls.length).toBe(2);
    expect(sync.isConfirmed(edited)).toBe(true);
  });

  test("saves of one profile run in order, and a delete waits for them", async () => {
    const eng = fakeEngine();
    const sync = new ProfileSync(eng.send);
    sync.seed(fullProfile(base, formOf(base)));
    eng.hold();
    const a = sync.save(fullProfile(base, { ...formOf(base), about: "one" }));
    const b = sync.save(fullProfile(base, { ...formOf(base), about: "two" }));
    const c = sync.remove(base.id);
    eng.release();
    await Promise.all([a, b, c]);
    expect(eng.calls.map((x) => x.method)).toEqual(["PUT", "PUT", "DELETE"]);
    expect((eng.calls[1].body as MockProfile).about).toBe("two");
  });

  test("flush sends the latest tracked copy of a profile", async () => {
    const eng = fakeEngine();
    const sync = new ProfileSync(eng.send);
    sync.seed(fullProfile(base, formOf(base)));
    sync.track(fullProfile(base, { ...formOf(base), about: "tracked" }));
    await sync.flush(base.id);
    expect(eng.calls.length).toBe(1);
    expect((eng.calls[0].body as MockProfile).about).toBe("tracked");
  });

  test("flush of an unknown profile does nothing", async () => {
    const eng = fakeEngine();
    const sync = new ProfileSync(eng.send);
    await sync.flush("nobody");
    expect(eng.calls.length).toBe(0);
  });

  test("profiles keep separate queues", async () => {
    const eng = fakeEngine();
    const sync = new ProfileSync(eng.send);
    sync.seed(fullProfile(base, formOf(base)));
    sync.seed(fullProfile(other, formOf(other)));
    await Promise.all([sync.save(fullProfile(base, { ...formOf(base), about: "a" })), sync.save(fullProfile(other, { ...formOf(other), about: "b" }))]);
    expect(eng.calls.length).toBe(2);
  });
});
