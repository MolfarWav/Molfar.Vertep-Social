/**
 * Social messenger: stub. Routes will live under /v1/apps/social/messenger/. Nothing is
 * implemented yet; the UI runs on mock data (see src/mock/).
 */
const ok = (json, status) => ({ status: status || 200, json });

export function handleRoute(req) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/messenger")) return null;
  return ok({ error: "not implemented" }, 501);
}
