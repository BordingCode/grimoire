/* Grimoire — character linking (cloud sync).
   Link 2+ devices with a shared CODE; choose per-parameter GROUPS to share.
   Newest-wins (players never play at the same time). Talks to the Cloudflare
   Worker (worker/index.js). Shares app.js's globals (Store, modal, render…). */
"use strict";

const LINK = {
  // Production Worker URL. Overridable for local testing via localStorage 'grimoire.worker'.
  WORKER: (window.localStorage && localStorage.getItem("grimoire.worker")) || "https://grimoire-sync.mathiasjob.workers.dev",

  // which character fields each group covers (paths into the character object)
  GROUPS: {
    physical: ["combat", "conditions"],
    resources: ["spells.slots", "spells.pact", "spells.concentratingOn", "resources"],
    mental: ["abilities", "saveProf", "skillProf", "proficiencies", "overrides", "features", "subSpells", "spells.known", "spells.prepared", "spells.favorites", "spells.abilityOverride", "customSpells", "summonKnown", "summonFav"],
    identity: ["name", "cls", "level", "multiclass", "subclass", "portrait", "accent", "scene", "edition", "notes"],
    gear: ["inventory", "weapons", "bag"], // NOT currency — coins are personal; syncing them let a linked partner's (often zero) coins overwrite yours on every pull
  },
  LABELS: {
    physical: "Physical — HP, hit dice, death saves, conditions, AC/armor, speed",
    resources: "Resources — spell slots, pact, trackers, concentration",
    mental: "Mental — abilities, saves, skills, known/prepared/favorite spells",
    identity: "Identity — name, class, level, edition, notes",
    gear: "Gear — inventory",
  },
  PRESETS: {
    shared: { physical: true, resources: true, mental: true, identity: true, gear: true },
    shapeshift: { physical: true, resources: true, mental: false, identity: false, gear: true },
  },

  _pushTimer: null,
  _merging: false,
};

function genCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = "";
  for (let i = 0; i < 8; i++) s += A[Math.floor(Math.random() * A.length)];
  return s.slice(0, 4) + "-" + s.slice(4);
}

LINK.buildPayload = function (ch) {
  const groups = ch.link.groups, out = {};
  Object.keys(groups).forEach((g) => {
    if (!groups[g]) return;
    (LINK.GROUPS[g] || []).forEach((path) => { out[path] = JSON.parse(JSON.stringify(getPath(ch, path) ?? null)); });
  });
  return out;
};

LINK.mergePayload = function (ch, payload) {
  const groups = ch.link.groups;
  Object.keys(groups).forEach((g) => {
    if (!groups[g]) return;
    (LINK.GROUPS[g] || []).forEach((path) => {
      if (Object.prototype.hasOwnProperty.call(payload, path) && payload[path] !== null) {
        setPath(ch, path, JSON.parse(JSON.stringify(payload[path])));
      }
    });
  });
};

LINK.push = async function (ch) {
  if (!ch || !ch.link) return;
  try {
    const r = await fetch(`${LINK.WORKER}/link/${ch.link.code}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updatedBy: ch.name, payload: LINK.buildPayload(ch) }),
    });
    const data = await r.json();
    if (data.version) { ch.link.lastPulledVersion = data.version; ch.link.lastPushedAt = data.updatedAt; Store.save(); }
    return data;
  } catch (e) { console.warn("link push failed", e); }
};

// read-only snapshot of whatever a link code currently holds (used by DM mode to pull a player's live HP/AC)
LINK.fetchSnapshot = async function (code) {
  const r = await fetch(`${LINK.WORKER}/link/${encodeURIComponent(code)}?since=0`);
  const data = await r.json();
  return (data && data.payload) ? data.payload : null;
};

LINK.pull = async function (ch, { announce = false } = {}) {
  if (!ch || !ch.link) return;
  try {
    const r = await fetch(`${LINK.WORKER}/link/${ch.link.code}?since=${ch.link.lastPulledVersion || 0}`);
    const data = await r.json();
    if (data.changed && data.payload) {
      LINK._merging = true;
      LINK.mergePayload(ch, data.payload);
      ch.link.lastPulledVersion = data.version;
      ch.link.lastUpdatedBy = data.updatedBy; ch.link.lastUpdatedAt = data.updatedAt;
      LINK._merging = false;
      Store.save();
      if (Store.activeId === ch.id) render();
      if (announce) toast(`Updated from ${esc(data.updatedBy || "the link")}.`);
    } else if (announce) {
      toast("Already up to date.");
    }
    return data;
  } catch (e) { console.warn("link pull failed", e); if (announce) toast("Couldn't reach the link server."); }
};

LINK.schedulePush = function (ch) {
  if (!ch || !ch.link || LINK._merging) return;
  clearTimeout(LINK._pushTimer);
  LINK._pushTimer = setTimeout(() => LINK.push(ch), 1500);
};

LINK.afterBoot = function () {
  const ch = Store.active && Store.active();
  if (ch && ch.link) LINK.pull(ch);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { const c = Store.active(); if (c && c.link) LINK.pull(c); }
  });
};

function relTime(iso) {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return Math.floor(s / 86400) + " d ago";
}

/* ---------- UI ---------- */
actions.linkOpen = function () {
  const ch = Store.active();
  if (!ch.link) {
    modal("Link this character", `
      <p class="muted small">Share this character with another player. You pick what's shared; updates sync when either of you opens the app. (You won't play at the same time.)</p>
      <button class="btn primary" data-act="linkCreate">Create a link &amp; get a code</button>
      <div class="or">or join an existing one</div>
      <div class="join-row"><input id="link-join" placeholder="CODE e.g. ABCD-2345" maxlength="9"><button class="btn" data-act="linkJoinGo">Join</button></div>`);
    return;
  }
  const L = ch.link;
  const toggles = Object.keys(LINK.GROUPS).map((g) => `
    <button class="grp ${L.groups[g] ? "on" : ""}" data-act="linkToggle" data-group="${g}">
      <span class="grp-dot"></span><span>${esc(LINK.LABELS[g])}</span></button>`).join("");
  modal("Linked character", `
    <div class="link-code">Code: <b>${esc(L.code)}</b> <button class="mini" data-act="linkCopy" data-code="${esc(L.code)}">copy</button></div>
    <p class="muted small">Last update: ${L.lastUpdatedBy ? esc(L.lastUpdatedBy) + " · " + relTime(L.lastUpdatedAt) : "from this device"}</p>
    <h3 class="sec">What's shared</h3>
    <div class="preset-row"><button class="mini" data-act="linkPreset" data-preset="shared">Share everything</button><button class="mini" data-act="linkPreset" data-preset="shapeshift">Shape-shift (body only)</button></div>
    <div class="grps">${toggles}</div>
    <div class="modal-btns"><button class="btn" data-act="linkPull">Pull now</button><button class="btn primary" data-act="linkPushNow">Push now</button></div>
    <button class="btn danger" data-act="linkUnlink" style="width:100%;margin-top:10px">Unlink this device</button>`);
};
actions.linkCreate = function () {
  const ch = Store.active();
  ch.link = { code: genCode(), role: "owner", groups: { ...LINK.PRESETS.shared }, lastPulledVersion: 0, lastPushedAt: null };
  Store.save(); LINK.push(ch).then(() => actions.linkOpen());
  toast("Link created — share the code with your partner.");
};
actions.linkJoinGo = function () {
  const ch = Store.active();
  const code = ($("#link-join").value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code)) { toast("Enter a code like ABCD-2345."); return; }
  ch.link = { code: code.includes("-") ? code : code.slice(0, 4) + "-" + code.slice(4), role: "member", groups: { ...LINK.PRESETS.shared }, lastPulledVersion: 0, lastPushedAt: null };
  Store.save(); LINK.pull(ch, { announce: true }).then(() => actions.linkOpen());
};
actions.linkToggle = function (el) { const ch = Store.active(); const g = el.dataset.group; ch.link.groups[g] = !ch.link.groups[g]; Store.save(); actions.linkOpen(); LINK.schedulePush(ch); };
actions.linkPreset = function (el) { const ch = Store.active(); ch.link.groups = { ...LINK.PRESETS[el.dataset.preset] }; Store.save(); actions.linkOpen(); LINK.schedulePush(ch); };
actions.linkPull = function () { LINK.pull(Store.active(), { announce: true }); };
actions.linkPushNow = function () { LINK.push(Store.active()).then(() => toast("Pushed your version to the link.")); };
actions.linkCopy = function (el) { const c = el.dataset.code; if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast("Code copied.")); else toast(c); };
actions.linkUnlink = function () { const ch = Store.active(); if (confirm("Unlink this device? Your character stays; it just stops syncing.")) { delete ch.link; Store.save(); closeModal(); render(); toast("Unlinked."); } };

/* ===================== Campaign party (live, auto-merging) =====================
   Everyone "connects" to ONE teammate (or the DM). Connected players are merged into a
   single group server-side (union-find), so the whole table ends up in one party — connect
   to anyone already in it and you're pulled in too. A member's personal code IS their link
   code, so the live-HP panel reads each member's link snapshot and DM gifts/HP-pull keep
   working. ch.party = { in:true, roster:[{code,name,role}] }. */
const _partyLive = {}; // code -> {hpCur,hpMax,hpTemp,conditions,ac}
const GROUP = {
  async req(body) {
    try { const r = await fetch(`${LINK.WORKER}/group`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return await r.json(); }
    catch (e) { console.warn("group req failed", e); return null; }
  },
  // a party member needs a personal publish channel — reuse the link code (created if absent, sharing physical so teammates see HP)
  ensureLink(ch) {
    if (!ch.link) { ch.link = { code: genCode(), role: "owner", groups: { ...LINK.PRESETS.shared }, lastPulledVersion: 0, lastPushedAt: null }; Store.save(); }
    return ch.link.code;
  },
  async sync(ch) {
    if (!ch || !ch.party) return null;
    const code = GROUP.ensureLink(ch);
    LINK.push(ch); // publish a fresh snapshot so teammates see current HP
    const r = await GROUP.req({ op: "sync", code, name: ch.name, role: "player" });
    if (r && r.members) { ch.party.roster = r.members; Store.save(); }
    if (Store.activeId === ch.id && document.querySelector("#modal .party-list")) { await partyRefreshLive(ch); renderParty(); }
    return r;
  },
  async connect(ch, otherCode) {
    const code = GROUP.ensureLink(ch);
    if (!ch.party) ch.party = { in: true, roster: [] };
    const r = await GROUP.req({ op: "connect", code, name: ch.name, role: "player", withCode: otherCode });
    if (r && r.members) { ch.party.roster = r.members; Store.save(); }
    return r;
  },
  async leave(ch) { if (ch.link) await GROUP.req({ op: "leave", code: ch.link.code }); delete ch.party; Store.save(); },
  afterBoot() {
    const ch = Store.active && Store.active(); if (ch && ch.party) GROUP.sync(ch);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { const c = Store.active(); if (c && c.party) GROUP.sync(c); } });
    setInterval(() => { const c = Store.active(); if (c && c.party && document.visibilityState === "visible") GROUP.sync(c); }, 25000);
  },
};
window.GROUP = GROUP;
// fetch each teammate's live snapshot (HP / conditions / AC) for the party panel
async function partyRefreshLive(ch) {
  const roster = (ch.party && ch.party.roster) || [];
  const me = ch.link && ch.link.code;
  await Promise.all(roster.map(async (mem) => {
    if (mem.role === "dm" || mem.code === me) return;
    try {
      const snap = await LINK.fetchSnapshot(mem.code);
      if (snap) { const c = snap.combat || {}; _partyLive[mem.code] = { name: snap.name, hpCur: c.hpCur, hpMax: c.hpMax, hpTemp: c.hpTemp, conditions: snap.conditions || [], ac: (typeof dmComputeAC === "function" ? dmComputeAC(snap) : null) }; }
    } catch (e) {}
  }));
}

/* DM gifts — the DM (who has a player's link code) drops items/images into a queue
   keyed by that code; the player's app polls its own link code and receives them. */
const GIFT = {
  async req(code, body) { try { const r = await fetch(`${LINK.WORKER}/gift/${encodeURIComponent(code)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return await r.json(); } catch (e) { return null; } },
  send(code, from, gift) { return GIFT.req(code, { op: "send", from, gift }); },
  async receive(ch, g) {
    const gift = g.gift || {}, from = g.from || "Your DM";
    if (gift.kind === "item" && gift.item) {
      if (!ch.inventory) ch.inventory = [];
      ch.inventory.push({ id: Gx.uid(), name: gift.item.name || "Item", qty: +gift.item.qty || 1, equipped: false, acBonus: 0, notes: gift.item.notes || "", bonuses: gift.item.bonuses || [], adv: gift.item.adv || [] });
      toast(`${esc(from)} gave you: ${esc(gift.item.name || "an item")}.`);
    } else if (gift.kind === "image" && gift.dataUrl && window.Media) {
      try { const mid = "m" + Gx.uid(); await Media.put({ id: mid, charId: ch.id, type: "dmgift", data: gift.dataUrl, created: nowStamp() }); if (!ch.dmGifts) ch.dmGifts = []; ch.dmGifts.push({ id: Gx.uid(), mediaId: mid, caption: gift.caption || "", from, at: g.at }); toast(`${esc(from)} sent you a ${gift.isDrawing ? "drawing" : "picture"}.`); }
      catch (e) { toast("A picture from your DM couldn't be saved (storage full?)."); }
    }
  },
  async pull(ch) {
    if (!ch || !ch.link || !ch.link.code) return;
    const r = await GIFT.req(ch.link.code, { op: "pull" });
    if (!r || !r.gifts || !r.gifts.length) return;
    for (const g of r.gifts) await GIFT.receive(ch, g);
    Store.save(); if (Store.activeId === ch.id) render();
  },
  afterBoot() {
    const ch = Store.active && Store.active(); if (ch && ch.link) GIFT.pull(ch);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { const c = Store.active(); if (c && c.link) GIFT.pull(c); } });
    setInterval(() => { const c = Store.active(); if (c && c.link && document.visibilityState === "visible") GIFT.pull(c); }, 30000);
  },
};
window.GIFT = GIFT;

function renderParty() {
  const ch = Store.active();
  const myCode = GROUP.ensureLink(ch);
  if (!ch.party) {
    modal("Campaign party", `
      <p class="muted small">Connect with your group so everyone sees each other's <b>live HP</b> — and your DM can reach the whole party. Connect to <b>any one</b> teammate (or your DM); you'll all be merged into one party automatically.</p>
      <div class="link-code">Your code: <b>${esc(myCode)}</b> <button class="mini" data-act="partyCopy" data-code="${esc(myCode)}">copy</button></div>
      <p class="muted small">Share your code, or enter a teammate's / your DM's:</p>
      <div class="join-row"><input id="party-join" placeholder="CODE e.g. ABCD-2345" maxlength="9"><button class="btn primary" data-act="partyConnectGo">Connect</button></div>`);
    return;
  }
  const roster = ch.party.roster || [];
  const others = roster.filter((mem) => mem.code !== myCode);
  const players = others.filter((m) => m.role !== "dm");
  const dm = others.find((m) => m.role === "dm");
  const rows = others.length ? others.map((mem) => {
    if (mem.role === "dm") return `<div class="party-row"><span class="party-name">${esc(mem.name || "DM")}</span><span class="party-hp muted">DM</span></div>`;
    const L = _partyLive[mem.code];
    const hp = L && L.hpMax != null ? `${L.hpCur != null ? L.hpCur : "?"}/${L.hpMax}${L.hpTemp ? " +" + L.hpTemp : ""} HP${L.ac ? " · AC " + L.ac : ""}` : "—";
    const conds = L && L.conditions && L.conditions.length ? `<div class="party-cond muted small">${L.conditions.map((c) => esc(c.name || c)).join(", ")}</div>` : "";
    return `<div class="party-row"><span class="party-name">${esc(mem.name || (L && L.name) || "Adventurer")}${conds}</span><span class="party-hp">${hp}</span></div>`;
  }).join("") : `<p class="muted small">Just you so far — share your code or connect to a teammate.</p>`;
  modal("Campaign party", `
    <div class="link-code">Your code: <b>${esc(myCode)}</b> <button class="mini" data-act="partyCopy" data-code="${esc(myCode)}">copy</button></div>
    <div class="party-list">${rows}</div>
    <div class="join-row"><input id="party-join" placeholder="connect another code" maxlength="9"><button class="btn" data-act="partyConnectGo">Connect</button></div>
    <div class="modal-btns"><button class="btn primary" data-act="partySendOpen" ${players.length ? "" : "disabled"}>Send an item…</button><button class="btn" data-act="partyRefresh">Refresh</button></div>
    <button class="btn danger" data-act="partyLeave" style="width:100%;margin-top:10px">Leave party</button>`);
}
actions.partyOpen = async () => {
  const ch = Store.active(); GROUP.ensureLink(ch); renderParty();
  if (ch.party) { await GROUP.sync(ch); await partyRefreshLive(ch); renderParty(); }
};
actions.partyConnectGo = async () => {
  const ch = Store.active(); const raw = ($("#party-join").value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(raw)) { toast("Enter a code like ABCD-2345."); return; }
  const other = raw.includes("-") ? raw : raw.slice(0, 4) + "-" + raw.slice(4);
  if (ch.link && other === ch.link.code) { toast("That's your own code."); return; }
  toast("Connecting…");
  const r = await GROUP.connect(ch, other);
  if (!r) { toast("Couldn't reach the party server."); return; }
  await partyRefreshLive(ch); renderParty(); toast("Connected to your party.");
};
actions.partyCopy = (el) => { const c = el.dataset.code; if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast("Code copied.")); else toast(c); };
actions.partyRefresh = async () => { const ch = Store.active(); await GROUP.sync(ch); await partyRefreshLive(ch); renderParty(); };
actions.partyLeave = async () => { const ch = Store.active(); if (!confirm("Leave the party? You can reconnect any time with a code.")) return; await GROUP.leave(ch); closeModal(); render(); toast("Left the party."); };
actions.partySendOpen = () => {
  const ch = Store.active(); const myCode = ch.link && ch.link.code;
  const others = ((ch.party && ch.party.roster) || []).filter((mem) => mem.code !== myCode && mem.role !== "dm");
  const items = [...(ch.inventory || []).map((i) => ({ ...i, _list: "inventory" })), ...(ch.bag || []).map((i) => ({ ...i, _list: "bag" }))];
  if (!others.length) { toast("No teammates to send to yet."); return; }
  if (!items.length) { toast("You have no items to send."); return; }
  modal("Send an item", `
    <label class="fld"><span>Item</span><select id="send-item">${items.map((i, idx) => `<option value="${idx}">${esc(i.name)}${i.qty > 1 ? " ×" + i.qty : ""}${i._list === "bag" ? " (bag)" : ""}</option>`).join("")}</select></label>
    <label class="fld"><span>To</span><select id="send-to">${others.map((mem) => `<option value="${esc(mem.code)}">${esc(mem.name || "Adventurer")}</option>`).join("")}</select></label>
    <p class="muted small">It's removed from your sheet and appears in theirs.</p>
    <div class="modal-btns"><button class="btn primary" data-act="partySendGo">Send</button></div>`);
  actions._sendItems = items;
};
actions.partySendGo = async () => {
  const ch = Store.active(); const items = actions._sendItems || []; const it = items[+$("#send-item").value]; const to = $("#send-to").value;
  if (!it || !to) return;
  const payload = { name: it.name, qty: it.qty, notes: it.notes || "", acBonus: it.acBonus || 0, bonuses: it.bonuses || [], adv: it.adv || [] };
  const r = await GIFT.send(to, ch.name, { kind: "item", item: payload });
  if (!r || !r.ok) { toast("Couldn't reach the server."); return; }
  ch[it._list] = ch[it._list].filter((x) => x.id !== it.id); actions._sendItems = null;
  Store.save(); renderParty(); render(); toast(`Sent ${it.name}.`);
};
