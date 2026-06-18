/* Grimoire — bootstrap.
   Foundation only: registers the offline worker and loads the bundled SRD
   spell data for both editions, proving the data pipeline end-to-end. The
   full character sheet + spellbook UI is built on top of this. */
"use strict";

const Grimoire = {
  spells: { "2014": [], "2024": [] },
};

async function loadSpells() {
  const [s2014, s2024] = await Promise.all([
    fetch("data/spells-2014.json?v=1").then((r) => r.json()),
    fetch("data/spells-2024.json?v=1").then((r) => r.json()),
  ]);
  Grimoire.spells["2014"] = s2014;
  Grimoire.spells["2024"] = s2024;
  return { n2014: s2014.length, n2024: s2024.length };
}

async function boot() {
  const status = document.getElementById("status");
  try {
    const { n2014, n2024 } = await loadSpells();
    status.textContent = `${n2014} spells (2014) · ${n2024} spells (2024) ready, offline.`;
    status.classList.add("ready");
  } catch (err) {
    status.textContent = "Could not load spell data — check your connection once to install offline.";
    console.error(err);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=1").catch(() => {}));
}

boot();
