/* LOCAL DEV ONLY — not deployed. A plain Node http server that mirrors the
   Cloudflare Worker (index.js) API so the frontend can be tested without the
   workerd runtime (which won't run on the Pi). In-memory store. Run:
       node worker/dev-mock.js
   Production uses index.js on Cloudflare; this file just stands in for tests. */
const http = require("http");

const store = new Map(); // "link:CODE" -> { version, updatedAt, updatedBy, payload }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const send = (res, obj, status = 200) => res.writeHead(status, { "Content-Type": "application/json", ...CORS }).end(JSON.stringify(obj));

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return res.writeHead(204, CORS).end();
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/" || url.pathname === "/health") return send(res, { ok: true, service: "grimoire-sync-mock" });
  const m = url.pathname.match(/^\/link\/([A-Za-z0-9-]{4,40})$/);
  if (!m) return send(res, { error: "not_found" }, 404);
  const key = "link:" + m[1].toUpperCase();

  if (req.method === "GET") {
    const since = parseInt(url.searchParams.get("since") || "0", 10);
    const data = store.get(key);
    if (!data) return send(res, { version: 0, changed: false, empty: true });
    if (data.version <= since) return send(res, { version: data.version, changed: false });
    return send(res, { ...data, changed: true });
  }
  if (req.method === "POST") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body; try { body = JSON.parse(raw); } catch { return send(res, { error: "bad_payload" }, 400); }
      if (!body || typeof body.payload !== "object" || body.payload === null) return send(res, { error: "bad_payload" }, 400);
      const prev = store.get(key) || { version: 0 };
      const data = { version: prev.version + 1, updatedAt: new Date().toISOString(), updatedBy: String(body.updatedBy || "someone").slice(0, 40), payload: body.payload };
      store.set(key, data);
      send(res, { version: data.version, updatedAt: data.updatedAt });
    });
    return;
  }
  send(res, { error: "method_not_allowed" }, 405);
}).listen(8787, () => console.log("grimoire sync mock on http://localhost:8787"));
