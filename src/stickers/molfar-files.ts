// The Molfar pack's picture files, bundled with the app but loaded only on demand: `import.meta.glob` with `?inline` makes
// one lazy chunk per file (a base64 data URL), so nothing is fetched or parsed until the pack card opens or the button is
// pressed. The app frame has `connect-src 'none'`, so a data URL is the way a bundled file reaches the page. The design
// preview (`?screen=`, built by Bun, which has no glob) gets an empty list and the card stays hidden there.
let files: Record<string, () => Promise<string>> = {};
try {
  files = import.meta.glob<string>("./molfar/*.webp", { query: "?inline", import: "default" });
} catch {
  // Bun (preview, tests) has no glob
}

export const hasMolfarFiles = (): boolean => Object.keys(files).length > 0;

/** The data URL of one bundled file, or null when it is not in this build. */
export async function loadMolfarFile(key: string): Promise<string | null> {
  const load = files[key];
  if (!load) return null;
  try {
    return await load();
  } catch {
    return null;
  }
}
