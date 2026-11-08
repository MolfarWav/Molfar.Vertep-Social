/**
 * Social profiles: stub. Routes will live under /v1/apps/social/profiles/. Nothing is
 * implemented yet; the UI runs on mock data (see src/mock/).
 */
const ok = (json, status) => ({ status: status || 200, json });

export function handleRoute(req) {
  const path = String((req && req.path) || "").split("?")[0];
  if (!path.startsWith("/profiles")) return null;
  return ok({ error: "not implemented" }, 501);
}
