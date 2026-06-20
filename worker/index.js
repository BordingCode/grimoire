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

    // ---- party item transfer: one record per party code { members:{id:name}, inbox:{id:[{from,item,at}]} } ----
    const pm = url.pathname.match(/^\/party\/([A-Za-z0-9-]{4,40})$/);
    if (pm) {
      const pkey = "party:" + pm[1].toUpperCase();
      const load = async () => { const r = await env.LINKS.get(pkey); return r ? JSON.parse(r) : { members: {}, inbox: {} }; };
      const save = (d) => env.LINKS.put(pkey, JSON.stringify(d), { expirationTtl: 60 * 60 * 24 * 180 });
      if (req.method === "GET") { const d = await load(); return json({ members: d.members }); }
      if (req.method === "POST") {
        const b = await req.json().catch(() => null); if (!b || !b.op) return json({ error: "bad_request" }, 400);
        const d = await load();
        if (b.op === "join") {
          if (!b.memberId) return json({ error: "bad_request" }, 400);
          d.members[b.memberId] = String(b.name || "Adventurer").slice(0, 40);
          await save(d); return json({ members: d.members });
        }
        if (b.op === "leave") { if (b.memberId) { delete d.members[b.memberId]; delete d.inbox[b.memberId]; await save(d); } return json({ members: d.members }); }
        if (b.op === "send") {
          if (!b.to || !b.item) return json({ error: "bad_request" }, 400);
          (d.inbox[b.to] = d.inbox[b.to] || []).push({ from: String(b.from || "someone").slice(0, 40), item: b.item, at: new Date().toISOString() });
          await save(d); return json({ ok: true });
        }
        if (b.op === "pull") {
          if (!b.memberId) return json({ error: "bad_request" }, 400);
          const items = d.inbox[b.memberId] || []; d.inbox[b.memberId] = [];
          await save(d); return json({ items, members: d.members });
        }
        return json({ error: "bad_op" }, 400);
      }
      return json({ error: "method_not_allowed" }, 405);
    }

    // ---- DM gifts: one queue per recipient's LINK code { gifts:[{from,gift,at}] } ----
    // the DM (who has the player's link code) drops items/images here; the player's app polls its own code.
    const gm = url.pathname.match(/^\/gift\/([A-Za-z0-9-]{4,40})$/);
    if (gm) {
      const gkey = "gift:" + gm[1].toUpperCase();
      const load = async () => { const r = await env.LINKS.get(gkey); return r ? JSON.parse(r) : { gifts: [] }; };
      const save = (d) => env.LINKS.put(gkey, JSON.stringify(d), { expirationTtl: 60 * 60 * 24 * 90 });
      if (req.method === "GET") { const d = await load(); return json({ count: (d.gifts || []).length }); }
      if (req.method === "POST") {
        const b = await req.json().catch(() => null); if (!b || !b.op) return json({ error: "bad_request" }, 400);
        const d = await load();
        if (b.op === "send") {
          if (!b.gift) return json({ error: "bad_request" }, 400);
          (d.gifts = d.gifts || []).push({ from: String(b.from || "Your DM").slice(0, 40), gift: b.gift, at: new Date().toISOString() });
          if (d.gifts.length > 40) d.gifts = d.gifts.slice(-40);
          await save(d); return json({ ok: true });
        }
        if (b.op === "pull") { const gifts = d.gifts || []; d.gifts = []; await save(d); return json({ gifts }); }
        return json({ error: "bad_op" }, 400);
      }
      return json({ error: "method_not_allowed" }, 405);
    }

    // ---- Campaign party groups: transitive membership over personal codes ----
    // Players/DM "connect" to one another; connected sets are merged (union-find) so the
    // whole table ends up in ONE group. gnode:CODE -> {groupId,name,role}; group:GID -> {codes:[...]}.
    // A member's personal code IS their link code, so live HP (link snapshot) & gifts keep working.
    if (url.pathname === "/group") {
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const b = await req.json().catch(() => null);
      if (!b || !b.op || !b.code) return json({ error: "bad_request" }, 400);
      const TTL = { expirationTtl: 60 * 60 * 24 * 180 };
      const nKey = (c) => "gnode:" + String(c).toUpperCase();
      const gKey = (g) => "group:" + g;
      const getN = async (c) => { const r = await env.LINKS.get(nKey(c)); return r ? JSON.parse(r) : null; };
      const getG = async (g) => { const r = await env.LINKS.get(gKey(g)); return r ? JSON.parse(r) : null; };
      const code = String(b.code).toUpperCase();

      const ensureNode = async (c, name, role) => {
        c = String(c).toUpperCase();
        let n = await getN(c);
        if (!n) {
          const gid = crypto.randomUUID();
          n = { groupId: gid, name: String(name || "").slice(0, 40), role: role === "dm" ? "dm" : "player" };
          await env.LINKS.put(nKey(c), JSON.stringify(n), TTL);
          await env.LINKS.put(gKey(gid), JSON.stringify({ codes: [c] }), TTL);
          return n;
        }
        let changed = false;
        if (name && n.name !== String(name).slice(0, 40)) { n.name = String(name).slice(0, 40); changed = true; }
        if (role === "dm" && n.role !== "dm") { n.role = "dm"; changed = true; } // DM identity is sticky once known
        if (changed) await env.LINKS.put(nKey(c), JSON.stringify(n), TTL);
        let g = await getG(n.groupId);
        if (!g) await env.LINKS.put(gKey(n.groupId), JSON.stringify({ codes: [c] }), TTL);
        else if (!g.codes.includes(c)) { g.codes.push(c); await env.LINKS.put(gKey(n.groupId), JSON.stringify(g), TTL); }
        return n;
      };
      const union = async (a, x) => {
        a = String(a).toUpperCase(); x = String(x).toUpperCase();
        const na = await getN(a), nx = await getN(x);
        if (!na || !nx || na.groupId === nx.groupId) return;
        let ga = (await getG(na.groupId)) || { codes: [a] };
        let gx = (await getG(nx.groupId)) || { codes: [x] };
        // merge the smaller set into the larger to keep churn low
        let targetGid = na.groupId, target = ga, source = gx, sourceGid = nx.groupId;
        if (gx.codes.length > ga.codes.length) { targetGid = nx.groupId; target = gx; source = ga; sourceGid = na.groupId; }
        for (const c of source.codes) {
          if (!target.codes.includes(c)) target.codes.push(c);
          const nc = await getN(c);
          if (nc) { nc.groupId = targetGid; await env.LINKS.put(nKey(c), JSON.stringify(nc), TTL); }
        }
        await env.LINKS.put(gKey(targetGid), JSON.stringify(target), TTL);
        if (sourceGid !== targetGid) await env.LINKS.delete(gKey(sourceGid));
      };
      const memberList = async (c) => {
        const n = await getN(c); if (!n) return [];
        const g = await getG(n.groupId); if (!g) return [];
        const out = [];
        for (const cc of g.codes) { const nc = await getN(cc); if (nc) out.push({ code: cc, name: nc.name, role: nc.role }); }
        return out;
      };

      if (b.op === "connect") {
        await ensureNode(code, b.name, b.role);
        if (b.withCode) { await ensureNode(b.withCode, "", "player"); await union(code, b.withCode); }
        return json({ members: await memberList(code) });
      }
      if (b.op === "sync") { await ensureNode(code, b.name, b.role); return json({ members: await memberList(code) }); }
      if (b.op === "leave") {
        const n = await getN(code);
        if (n) { const g = await getG(n.groupId); if (g) { g.codes = g.codes.filter((x) => x !== code); if (g.codes.length) await env.LINKS.put(gKey(n.groupId), JSON.stringify(g), TTL); else await env.LINKS.delete(gKey(n.groupId)); } await env.LINKS.delete(nKey(code)); }
        return json({ ok: true });
      }
      return json({ error: "bad_op" }, 400);
    }

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
