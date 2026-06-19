/* Grimoire — media store (IndexedDB) for session-book photos & drawings.
   Big images don't fit in localStorage (~5 MB cap), so they live here, keyed by id,
   while the character JSON only keeps the lightweight {id,type,caption} references.
   Stored value: { id, charId, type:'photo'|'drawing', data:<dataURL>, created }. */
"use strict";

const Media = (() => {
  const DB = "grimoire-media", STORE = "media", VER = 1;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      if (!("indexedDB" in window)) return reject(new Error("no-indexeddb"));
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("charId", "charId", { unique: false });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }
  function store(mode) { return open().then((db) => db.transaction(STORE, mode).objectStore(STORE)); }
  const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  const _cache = new Map(); // id -> dataURL, so we don't re-read IndexedDB on every render

  return {
    async put(rec) { const os = await store("readwrite"); await wrap(os.put(rec)); _cache.set(rec.id, rec.data); return rec; },
    async get(id) { if (_cache.has(id)) return { id, data: _cache.get(id) }; const os = await store("readonly"); const rec = (await wrap(os.get(id))) || null; if (rec) _cache.set(id, rec.data); return rec; },
    peek(id) { return _cache.has(id) ? _cache.get(id) : null; },   // sync cache hit (null if not loaded yet)
    async del(id) { _cache.delete(id); const os = await store("readwrite"); return wrap(os.delete(id)); },
    // all media records for a character (used by export + cleanup on delete)
    async forChar(charId) {
      const os = await store("readonly");
      return new Promise((res, rej) => {
        const out = [], r = os.index("charId").openCursor(IDBKeyRange.only(charId));
        r.onsuccess = () => { const c = r.result; if (c) { out.push(c.value); c.continue(); } else res(out); };
        r.onerror = () => rej(r.error);
      });
    },
  };
})();
window.Media = Media;
