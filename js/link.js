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
    mental: ["abilities", "saveProf", "skillProf", "proficiencies", "overrides", "features", "subSpells", "spells.known", "spells.prepared", "spells.favorites", "spells.abilityOverride", "customSpells"],
    identity: ["name", "cls", "level", "multiclass", "subclass", "portrait", "accent", "edition", "notes"],
    gear: ["inventory", "weapons", "bag", "currency"],
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

/* ============================ Party — instant item transfer ============================ */
const PARTY = {
  async req(code, body) {
    try {
      const r = await fetch(`${LINK.WORKER}/party/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return await r.json();
    } catch (e) { console.warn("party req failed", e); return null; }
  },
  async pull(ch) {
    if (!ch || !ch.party) return;
    const res = await PARTY.req(ch.party.code, { op: "pull", memberId: ch.party.memberId });
    if (!res) return;
    if (res.members) ch.party.roster = res.members;
    if (res.items && res.items.length) {
      res.items.forEach((rec) => { const o = rec.item || {}; ch.inventory.push({ id: Gx.uid(), name: o.name || "Item", qty: +o.qty || 1, equipped: false, acBonus: +o.acBonus || 0, notes: o.notes || "", bonuses: o.bonuses || [], adv: o.adv || [] }); });
      Store.save();
      if (Store.activeId === ch.id) render();
      toast(`Received ${res.items.length} item(s): ${res.items.map((r) => esc((r.item || {}).name || "item")).join(", ")}.`);
    } else { Store.save(); }
  },
  afterBoot() {
    const ch = Store.active && Store.active(); if (ch && ch.party) PARTY.pull(ch);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { const c = Store.active(); if (c && c.party) PARTY.pull(c); } });
    setInterval(() => { const c = Store.active(); if (c && c.party && document.visibilityState === "visible") PARTY.pull(c); }, 25000);
  },
};

function renderParty() {
  const ch = Store.active();
  if (!ch.party) {
    modal("Party — item transfer", `
      <p class="muted small">Join a party with your group to hand items to each other instantly. (Separate from character linking.)</p>
      <button class="btn primary" data-act="partyCreate">Create a party &amp; get a code</button>
      <div class="or">or join one</div>
      <div class="join-row"><input id="party-join" placeholder="CODE e.g. ABCD-2345" maxlength="9"><button class="btn" data-act="partyJoinGo">Join</button></div>`);
    return;
  }
  const roster = ch.party.roster || {};
  const others = Object.entries(roster).filter(([id]) => id !== ch.party.memberId);
  modal("Party — item transfer", `
    <div class="link-code">Party: <b>${esc(ch.party.code)}</b> <button class="mini" data-act="partyCopy" data-code="${esc(ch.party.code)}">copy</button></div>
    <p class="muted small">Members: ${others.length ? others.map(([, n]) => esc(n)).join(", ") : "just you so far — share the code"}</p>
    <div class="modal-btns">
      <button class="btn primary" data-act="partySendOpen" ${others.length ? "" : "disabled"}>Send an item…</button>
      <button class="btn" data-act="partyRefresh">Refresh</button>
    </div>
    <button class="btn danger" data-act="partyLeave" style="width:100%;margin-top:10px">Leave party</button>`);
}
actions.partyOpen = () => { renderParty(); const ch = Store.active(); if (ch.party) PARTY.req(ch.party.code, { op: "join", memberId: ch.party.memberId, name: ch.name }).then((r) => { if (r && r.members) { ch.party.roster = r.members; Store.save(); renderParty(); } }); };
actions.partyCreate = async () => { const ch = Store.active(); ch.party = { code: genCode(), memberId: "m" + Gx.uid() }; Store.save(); const r = await PARTY.req(ch.party.code, { op: "join", memberId: ch.party.memberId, name: ch.name }); if (r && r.members) ch.party.roster = r.members; Store.save(); renderParty(); toast("Party created — share the code with your group."); };
actions.partyJoinGo = async () => {
  const ch = Store.active(); const raw = ($("#party-join").value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(raw)) { toast("Enter a code like ABCD-2345."); return; }
  ch.party = { code: raw.includes("-") ? raw : raw.slice(0, 4) + "-" + raw.slice(4), memberId: "m" + Gx.uid() };
  Store.save(); const r = await PARTY.req(ch.party.code, { op: "join", memberId: ch.party.memberId, name: ch.name }); if (r && r.members) ch.party.roster = r.members; Store.save(); renderParty(); toast("Joined the party.");
};
actions.partyCopy = (el) => { const c = el.dataset.code; if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast("Code copied.")); else toast(c); };
actions.partyRefresh = async () => { const ch = Store.active(); const r = await PARTY.req(ch.party.code, { op: "join", memberId: ch.party.memberId, name: ch.name }); if (r && r.members) { ch.party.roster = r.members; Store.save(); } await PARTY.pull(ch); renderParty(); };
actions.partyLeave = async () => { const ch = Store.active(); if (!confirm("Leave the party? You can rejoin with the code.")) return; await PARTY.req(ch.party.code, { op: "leave", memberId: ch.party.memberId }); delete ch.party; Store.save(); closeModal(); render(); toast("Left the party."); };
actions.partySendOpen = () => {
  const ch = Store.active(); const roster = ch.party.roster || {};
  const others = Object.entries(roster).filter(([id]) => id !== ch.party.memberId);
  const items = [...(ch.inventory || []).map((i) => ({ ...i, _list: "inventory" })), ...(ch.bag || []).map((i) => ({ ...i, _list: "bag" }))];
  if (!items.length) { toast("You have no items to send."); return; }
  modal("Send an item", `
    <label class="fld"><span>Item</span><select id="send-item">${items.map((i, idx) => `<option value="${idx}">${esc(i.name)}${i.qty > 1 ? " ×" + i.qty : ""}${i._list === "bag" ? " (bag)" : ""}</option>`).join("")}</select></label>
    <label class="fld"><span>To</span><select id="send-to">${others.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("")}</select></label>
    <p class="muted small">It's removed from your sheet and appears in theirs instantly.</p>
    <div class="modal-btns"><button class="btn primary" data-act="partySendGo">Send</button></div>`);
  actions._sendItems = items;
};
actions.partySendGo = async () => {
  const ch = Store.active(); const items = actions._sendItems || []; const it = items[+$("#send-item").value]; const to = $("#send-to").value;
  if (!it || !to) return;
  const payload = { name: it.name, qty: it.qty, notes: it.notes || "", acBonus: it.acBonus || 0, bonuses: it.bonuses || [], adv: it.adv || [] };
  const r = await PARTY.req(ch.party.code, { op: "send", to, from: ch.name, item: payload });
  if (!r || !r.ok) { toast("Couldn't reach the party server."); return; }
  ch[it._list] = ch[it._list].filter((x) => x.id !== it.id); actions._sendItems = null;
  Store.save(); closeModal(); render(); toast(`Sent ${it.name}.`);
};
