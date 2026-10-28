/* Grimoire — race / species picker.
   Free-rules (SRD 5.1 / 5.2) races fill in their traits, speed and limited-use trackers as a
   checklist; anything can be unticked or edited. Races from other books are name-only (their
   text is WotC-owned) and "Custom" is any homebrew name — add traits with "+ feature / + tracker".
   Data: data/species-2014/2024.json, built by tools/build_species.py. */
"use strict";

const SPECIES = {};
async function loadSpecies(ed) {
  if (!SPECIES[ed]) SPECIES[ed] = await fetch(`data/species-${ed}.json?v=91`).then((r) => r.json()).catch(() => []);
  return SPECIES[ed];
}
const raceLabel = (ch) => (ch && ch.race && ch.race.name) || "";

/* options: "Halfling", "Halfling|Lightfoot Halfling", "name:Firbolg", "custom" */
function speciesOptions(list) {
  const srd = list.map((r) => r.subs.length
    ? r.subs.map((s) => `<option value="${esc(r.n + "|" + s.n)}">${esc(s.n)}</option>`).join("") + `<option value="${esc(r.n)}">${esc(r.n)} (no subrace)</option>`
    : `<option value="${esc(r.n)}">${esc(r.n)}</option>`).join("");
  const have = new Set(list.map((r) => r.n));
  const extra = RULES.EXTRA_SPECIES.filter((n) => !have.has(n)).map((n) => `<option value="name:${esc(n)}">${esc(n)}</option>`).join("");
  return `<option value="">— pick one —</option>
    <optgroup label="Free rules — traits filled in">${srd}</optgroup>
    <optgroup label="Other books — name only, add traits yourself">${extra}</optgroup>
    <option value="custom">Custom / homebrew…</option>`;
}
// best option for a plain name typed on the new-character form
function speciesMatch(list, name) {
  if (!name) return "";
  if (name === "__custom") return "custom";
  const r = list.find((x) => x.n === name);
  if (r) return r.subs.length ? r.n + "|" + r.subs[0].n : r.n;
  return "name:" + name;
}

actions.speciesOpen = async (el) => {
  const ch = Store.active(); const ed = ch.edition === "2024" ? "2024" : "2014";
  const list = await loadSpecies(ed);
  const pre = el && el.dataset && el.dataset.pre ? speciesMatch(list, el.dataset.pre) : "";
  const create = !!(el && el.dataset && el.dataset.create);
  actions._spCreate = create;
  modal("Race / species", `
    <p class="muted small">${ed} rules. Pick a race to see its traits — tick what you want on your sheet. Nothing is locked: change any number, untick traits your table doesn't use, or add your own.</p>
    <label class="fld"><span>Race / species</span><select id="sp-pick" data-act="speciesPick">${speciesOptions(list)}</select></label>
    <label class="fld"><span>Name on your sheet</span><input id="sp-name" placeholder="e.g. Tiefling, Sea-elf, Dragonkin (homebrew)" value="${esc(raceLabel(ch))}"></label>
    <div id="sp-body"></div>
    <h3 class="sec">Your own (homebrew)</h3>
    <div id="cl-own" class="cl-list"></div>
    <div class="cl-own-btns"><button class="mini" data-act="clOwnFeat">+ trait</button><button class="mini" data-act="clOwnTrk">+ tracker</button></div>
    <div class="modal-btns"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="speciesSave">Save</button></div>`,
    (wrap) => {
      checklistWire(wrap, ch);
      if (pre) { const sel = wrap.querySelector("#sp-pick"); sel.value = pre; actions.speciesPick(sel); }
    },
    // new character: on to the class features whether the race was saved or skipped
    create ? () => { actions._spCreate = false; setTimeout(() => actions.classChecklist({ dataset: { create: "1" } }), 0); } : null);
};

actions.speciesPick = (el) => {
  const ch = Store.active(); const ed = ch.edition === "2024" ? "2024" : "2014";
  const v = el.value; const body = $("#sp-body"); if (!body) return;
  const nameIn = $("#sp-name");
  const old = (ch.features || []).filter((f) => (f.src || "").startsWith("race:")).length + (ch.resources || []).filter((r) => (r.src || "").startsWith("race:")).length;
  const oldRow = old && ch.race ? `<label class="cl-chk cl-row"><input type="checkbox" id="sp-remove" checked class="cl-on"><span>Remove the ${old} trait${old === 1 ? "" : "s"} from ${esc(ch.race.name)}</span></label>` : "";
  actions._sp = null;
  if (!v) { body.innerHTML = ""; return; }
  if (v === "custom" || v.startsWith("name:")) {
    const n = v.startsWith("name:") ? v.slice(5) : "";
    if (n || v === "custom") nameIn.value = n || (raceLabel(ch) || "");
    if (v === "custom") nameIn.focus();
    actions._sp = { name: n, traits: [], trackers: [], speed: null, asi: {} };
    body.innerHTML = `${oldRow}<p class="muted small">${n ? `${esc(n)} isn't in the free rules, so its traits aren't bundled` : "Homebrew"} — set your speed below and add the traits with “+ trait”.</p>
      <div class="cl-row"><label class="cl-chk"><input type="checkbox" class="cl-on" id="sp-speed-on"><span><b>Base walking speed</b></span></label>
      <div class="cl-edit"><label>Speed <input type="number" id="sp-speed" min="0" step="5" value="${ch.combat.speed || 30}"> ft</label></div></div>`;
    return;
  }
  const [rn, sn] = v.split("|");
  const r = (SPECIES[ed] || []).find((x) => x.n === rn); if (!r) return;
  const sub = sn ? r.subs.find((x) => x.n === sn) : null;
  const traits = [...r.traits, ...(sub ? sub.traits : [])];
  const asi = { ...r.asi }; if (sub) for (const k in sub.asi) asi[k] = (asi[k] || 0) + sub.asi[k];
  const lvl = Calc.totalLevel(ch);
  const trackers = ((RULES.SPECIES_TRACKERS[ed] || {})[rn] || []).map((t) => ({ ...t, ok: !t.from || lvl >= t.from }));
  nameIn.value = sub ? sub.n : r.n;
  actions._sp = { name: sub ? sub.n : r.n, traits, trackers, speed: r.speed, asi };
  const asiTxt = Object.entries(asi).map(([k, n]) => `${sign(n)} ${k.toUpperCase()}`).join(", ");
  body.innerHTML = `${oldRow}
    <div class="cl-row"><label class="cl-chk"><input type="checkbox" class="cl-on" id="sp-speed-on" checked><span><b>Base walking speed</b> <em class="cl-tag">${esc(r.size || "")}</em></span></label>
      <div class="cl-edit"><label>Speed <input type="number" id="sp-speed" min="0" step="5" value="${r.speed}"> ft</label></div></div>
    ${asiTxt ? `<div class="cl-row"><label class="cl-chk"><input type="checkbox" class="cl-on" id="sp-asi"${actions._spCreate ? " checked" : ""}><span><b>Ability score bonuses</b> <em class="cl-tag">${esc(asiTxt)}</em></span></label>
      <div class="cl-sub muted small">${actions._spCreate ? "Ticked: added to the scores you typed. Untick if you already included them." : "Leave unticked if your scores already include them."}</div></div>` : ""}
    <h3 class="sec">Traits</h3>
    <div class="cl-list">${traits.map((t, i) => `<div class="cl-row" data-sp-tr="${i}">
      <label class="cl-chk"><input type="checkbox" class="cl-on" checked><span><b>${esc(t.n)}</b></span></label>
      <details class="cl-desc"><summary>Read</summary><div class="feat-desc">${esc(mdPlain(t.d))}</div></details></div>`).join("") || `<p class="muted small">No special traits.</p>`}</div>
    ${trackers.length ? `<h3 class="sec">Trackers</h3><div class="cl-list">${trackers.map((t, i) => `<div class="cl-row" data-sp-tk="${i}">
      <label class="cl-chk"><input type="checkbox" class="cl-on" ${t.ok ? "checked" : ""}><span><b>${esc(t.n)}</b> <em class="cl-tag">${t.max === "prof" ? "uses = proficiency bonus" : t.max + " use" + (t.max === 1 ? "" : "s")} · ${t.reset} rest${t.from ? ` · from level ${t.from}` : ""}</em></span></label></div>`).join("")}</div>` : ""}`;
};

actions.speciesSave = () => {
  const ch = Store.active(); const ed = ch.edition === "2024" ? "2024" : "2014";
  const sp = actions._sp || { name: "", traits: [], trackers: [], speed: null, asi: {} };
  const name = ($("#sp-name").value || "").trim() || sp.name;
  if (!name) { toast("Pick a race or type a name."); return; }
  if (!ch.features) ch.features = []; if (!ch.resources) ch.resources = [];
  const hb = hpBase(ch);
  const rm = $("#sp-remove");
  if (rm && rm.checked) { ch.features = ch.features.filter((f) => !(f.src || "").startsWith("race:")); ch.resources = ch.resources.filter((r) => !(r.src || "").startsWith("race:")); }
  const speedOn = $("#sp-speed-on");
  if (speedOn && speedOn.checked) ch.combat.speed = Math.max(0, +$("#sp-speed").value || 30);
  const asiOn = $("#sp-asi");
  if (asiOn && asiOn.checked) for (const k in sp.asi) ch.abilities[k] = (ch.abilities[k] || 10) + sp.asi[k];
  const have = new Set(ch.features.map((f) => normTrk(f.name)));
  document.querySelectorAll("#modal [data-sp-tr]").forEach((row) => {
    const t = sp.traits[+row.dataset.spTr];
    if (row.querySelector(".cl-on").checked && !have.has(normTrk(t.n))) ch.features.push({ id: Gx.uid(), name: t.n, desc: mdPlain(t.d), bonuses: [], adv: [], src: `race:${ed}:${name}:${t.n}` });
  });
  document.querySelectorAll("#modal [data-sp-tk]").forEach((row) => {
    const t = sp.trackers[+row.dataset.spTk];
    if (!row.querySelector(".cl-on").checked || ch.resources.some((r) => normTrk(r.name) === normTrk(t.n))) return;
    const res = { id: Gx.uid(), name: t.n, max: 1, used: 0, resetOn: t.reset, regain: 0, note: "", src: `race:${ed}:${name}` };
    if (t.max === "prof") res.rule = { kind: "prof", mult: 1, add: 0 }; else res.max = t.max;
    ch.resources.push(res);
  });
  applyOwnRows(ch);
  ch.race = { name, ed };
  closeModal(); const dHp = hpFollow(ch, hb, true); commit(); if (window.LINK) LINK.schedulePush(ch);
  toast(`Race set to ${esc(name)}.${dHp ? ` Max HP ${sign(dHp)} — now ${Calc.maxHP(ch)}.` : ""}`, dHp ? 4500 : 2600);
};
