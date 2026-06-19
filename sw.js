/* Grimoire service worker — offline-first cache.
   Bump CACHE when any cached file changes, or phones serve stale copies. */
const CACHE = "grimoire-v45";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/rules.js",
  "./js/util.js",
  "./js/media.js",
  "./js/views.js",
  "./js/state.js",
  "./js/calc.js",
  "./js/app.js",
  "./js/link.js",
  "./manifest.json",
  "./data/spells-2014.json",
  "./data/spells-2024.json",
  "./data/spell-index.json",
  "./data/summons.json",
  "./data/creature-index.json",
  "./icons/types/beast.svg",
  "./icons/types/undead.svg",
  "./icons/types/elemental.svg",
  "./icons/types/fey.svg",
  "./icons/types/fiend.svg",
  "./icons/types/dragon.svg",
  "./icons/types/construct.svg",
  "./icons/types/monstrosity.svg",
  "./icons/types/plant.svg",
  "./icons/types/ooze.svg",
  "./icons/types/aberration.svg",
  "./icons/types/celestial.svg",
  "./icons/types/giant.svg",
  "./icons/types/humanoid.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  // do NOT skipWaiting automatically — the page shows an update prompt and asks us to.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

// page tells us to activate the new version when the user taps "Reload"
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      // cache same-origin successful responses for next time
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit))
  );
});

