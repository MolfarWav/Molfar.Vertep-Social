import { afterEach, expect, test } from "bun:test";
import { AVATAR_MAX_BYTES, decodeData, readFound, storeAvatar } from "../src/lib/roleplay-avatar";

// The screen side of the import picture: reading the plugin's answer, decoding a data address, storing it as an asset.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const ID = "ab12".repeat(16);

test("readFound accepts only the shapes the plugin sends", () => {
  expect(readFound({ ok: true, avatar: { url: PNG, from: "soul" } })).toEqual({ url: PNG, from: "soul" });
  expect(readFound({ avatar: { url: `/v1/assets/${ID}` } })).toEqual({ url: `/v1/assets/${ID}`, from: "card" });
  expect(readFound({ avatar: null })).toBeNull();
  expect(readFound({ avatar: { url: "https://x.example/a.png" } })).toBeNull();
  expect(readFound({ avatar: { url: "data:image/svg+xml;base64,AAAA" } })).toBeNull();
  expect(readFound(null)).toBeNull();
});

test("decodeData gives the bytes and the type, and refuses what is not an image", () => {
  const d = decodeData(PNG)!;
  expect(d.mime).toBe("image/png");
  expect(Array.from(d.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(decodeData("data:text/html;base64,AAAA")).toBeNull();
  expect(decodeData("nope")).toBeNull();
});

test("storeAvatar uploads a data image and returns the asset address", async () => {
  const seen: { url: string; type: string | null; size: number }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, type: new Headers(init.headers).get("content-type"), size: (init.body as Uint8Array).length });
    return new Response(JSON.stringify({ id: ID }), { status: 200 });
  }) as typeof fetch;
  expect(await storeAvatar(PNG, "Мавка")).toBe(`/v1/assets/${ID}`);
  expect(seen).toHaveLength(1);
  expect(seen[0]!.url).toBe(`/v1/assets?name=${encodeURIComponent("Мавка")}`);
  expect(seen[0]!.type).toBe("image/png");
  expect(seen[0]!.size).toBe(8);
});

test("storeAvatar re-stores an asset it can read and gives up quietly when it cannot", async () => {
  let puts = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      puts++;
      return new Response(JSON.stringify({ id: ID }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/webp" } });
  }) as typeof fetch;
  expect(await storeAvatar(`/v1/assets/${ID}`, "A")).toBe(`/v1/assets/${ID}`);
  expect(puts).toBe(1);
  // Roleplay's own assets are not visible to Social: a 404 is a miss, not an error
  globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  expect(await storeAvatar(`/v1/assets/${ID}`, "A")).toBeNull();
  // an upload the engine refuses
  globalThis.fetch = (async () => new Response("{}", { status: 413 })) as typeof fetch;
  expect(await storeAvatar(PNG, "A")).toBeNull();
});

test("storeAvatar does not upload an image over the size limit", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const big = "data:image/png;base64," + btoa("x".repeat(AVATAR_MAX_BYTES + 10));
  expect(await storeAvatar(big, "A")).toBeNull();
  expect(called).toBe(false);
});
