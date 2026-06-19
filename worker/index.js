/* Grimoire sync Worker — tiny key-value relay for character linking.
   One record per link code: { version, updatedAt, updatedBy, payload }.
   Newest-wins (players never play simultaneously). The link code is the only
   secret, so it must be long & random. CORS-open so the GitHub Pages PWA can call it. */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, service: "grimoire-sync" });

    const m = url.pathname.match(/^\/link\/([A-Za-z0-9-]{4,40})$/);
    if (!m) return json({ error: "not_found" }, 404);
    const code = m[1].toUpperCase();
    const key = "link:" + code;

    if (req.method === "GET") {
      const since = parseInt(url.searchParams.get("since") || "0", 10);
      const raw = await env.LINKS.get(key);
      if (!raw) return json({ version: 0, changed: false, empty: true });
      const data = JSON.parse(raw);
      if (data.version <= since) return json({ version: data.version, changed: false });
      return json({ version: data.version, updatedAt: data.updatedAt, updatedBy: data.updatedBy, payload: data.payload, changed: true });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.payload !== "object" || body.payload === null) return json({ error: "bad_payload" }, 400);
      const raw = await env.LINKS.get(key);
      const prev = raw ? JSON.parse(raw) : { version: 0 };
      const data = {
        version: prev.version + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: String(body.updatedBy || "someone").slice(0, 40),
        payload: body.payload,
      };
      // keep for a year after last write; each write refreshes the TTL
      await env.LINKS.put(key, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 365 });
      return json({ version: data.version, updatedAt: data.updatedAt });
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
