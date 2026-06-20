/* Grimoire — illustrated class "worlds": an atmospheric scene painted behind the
   sheet. Pure canvas + CSS (no images, offline, phone-friendly). One particle
   engine driven by per-class recipes. Lives OUTSIDE #app so it survives re-renders.
   Global: Scene.  Hooked from applyTheme() in app.js. */
"use strict";

const Scene = (() => {
  let sky, fx, sil, ctx, raf = 0, w = 0, h = 0, dpr = 1, last = 0, t = 0;
  let layers = [], shooters = [], curKey = "", running = false;
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const R = (a, b) => a + Math.random() * (b - a);

  /* ---- per-class recipes: sky gradient + silhouette SVG + particle layers ---- */
  // colours read the live theme so a Wizard wearing the Druid theme gets a forest.
  function recipe(cls) {
    const r = RECIPES[cls] || RECIPES._default;
    return typeof r === "function" ? r() : r;
  }
  const hill = (fill, op, d) => `<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="position:absolute;bottom:0;left:0;width:100%;height:${op}"><path d="${d}" fill="${fill}"/></svg>`;
  const RECIPES = {
    Wizard: () => ({
      sky: "radial-gradient(120% 80% at 78% 12%, #2a2360 0%, transparent 45%), radial-gradient(90% 70% at 20% 85%, #1a1147 0%, transparent 55%), linear-gradient(180deg, #0a0a22 0%, #100a2e 55%, #07061a 100%)",
      orb: { x: .78, y: .16, r: .34, color: "rgba(150,140,255,0.30)" },
      silhouette: hill("#070617", "34%", "M0 40 V22 Q8 14 16 20 T34 16 Q44 8 54 18 T74 14 Q86 8 100 20 V40 Z"),
      layers: [
        { type: "stars", count: 90, color: "#cfd0ff", sizeMin: .4, sizeMax: 1.6, twinkle: 1 },
        { type: "stars", count: 20, color: "#b59bff", sizeMin: 1, sizeMax: 2.2, twinkle: 1.6, glow: 1 },
        { type: "drift", count: 16, color: "rgba(170,150,255,0.9)", sizeMin: 1, sizeMax: 2.6, speed: 10, dir: -1, glow: 1 },
      ],
      shoot: { every: 7, color: "#dfe0ff" },
    }),
    Druid: () => ({
      sky: "radial-gradient(90% 60% at 28% 8%, #2c4a2a 0%, transparent 48%), radial-gradient(80% 70% at 80% 92%, #11240f 0%, transparent 55%), linear-gradient(180deg, #0a1a0e 0%, #0a160c 55%, #050d07 100%)",
      orb: { x: .28, y: .1, r: .3, color: "rgba(180,210,120,0.18)" },
      silhouette: hill("#050f07", "46%", "M0 40 V26 L6 18 8 24 12 14 15 24 20 12 24 24 30 16 34 26 40 14 45 26 52 12 58 26 64 16 70 26 76 14 82 26 90 16 96 26 100 18 V40 Z"),
      layers: [
        { type: "stars", count: 26, color: "#bfe0a0", sizeMin: .5, sizeMax: 1.3, twinkle: .8 },
        { type: "drift", count: 22, color: "rgba(150,200,90,0.85)", sizeMin: 1.4, sizeMax: 3, speed: 8, dir: 1, sway: 1 },
        { type: "drift", count: 12, color: "rgba(190,230,130,0.9)", sizeMin: 1, sizeMax: 2, speed: 5, dir: -1, glow: 1, sway: 1 },
      ],
    }),
    Barbarian: () => ({
      sky: "radial-gradient(130% 60% at 50% 108%, #6b2310 0%, transparent 52%), radial-gradient(80% 50% at 50% 96%, #b4521a 0%, transparent 40%), linear-gradient(180deg, #1a0c08 0%, #140705 60%, #0c0504 100%)",
      silhouette: hill("#0a0403", "42%", "M0 40 V24 L10 12 18 22 26 10 36 24 46 14 56 26 66 12 76 24 86 14 94 24 100 18 V40 Z"),
      layers: [
        { type: "stars", count: 22, color: "#e8b48a", sizeMin: .4, sizeMax: 1.2, twinkle: 1 },
        { type: "drift", count: 30, color: "rgba(255,150,60,0.95)", sizeMin: 1, sizeMax: 2.6, speed: 16, dir: -1, glow: 1, sway: 1.4 },
        { type: "drift", count: 10, color: "rgba(255,210,120,1)", sizeMin: .8, sizeMax: 1.8, speed: 24, dir: -1, glow: 1 },
      ],
    }),
    Cleric: () => ({
      sky: "radial-gradient(85% 65% at 50% -8%, #7a6328 0%, transparent 52%), radial-gradient(120% 60% at 50% 100%, #2a2412 0%, transparent 55%), linear-gradient(180deg, #241c0f 0%, #1a140b 55%, #100b06 100%)",
      orb: { x: .5, y: -.04, r: .42, color: "rgba(255,225,150,0.30)" },
      silhouette: hill("#0c0904", "30%", "M0 40 V30 Q14 22 26 28 Q34 16 42 28 L44 10 46 28 Q58 22 72 28 Q84 20 100 28 V40 Z"),
      layers: [
        { type: "drift", count: 26, color: "rgba(255,225,150,0.85)", sizeMin: 1, sizeMax: 2.4, speed: 6, dir: -1, glow: 1, sway: .7 },
        { type: "stars", count: 24, color: "#ffe8b0", sizeMin: .5, sizeMax: 1.6, twinkle: 1.2, glow: 1 },
      ],
    }),
    _default: () => ({
      sky: "radial-gradient(110% 80% at 50% 0%, #241b3e 0%, transparent 55%), linear-gradient(180deg, #120c26 0%, #0a0718 100%)",
      layers: [{ type: "stars", count: 70, color: "#cfd0ff", sizeMin: .4, sizeMax: 1.6, twinkle: 1 }],
    }),
  };

  function build(rec) {
    layers = []; shooters = [];
    (rec.layers || []).forEach((L) => {
      const ps = [];
      for (let i = 0; i < L.count; i++) {
        ps.push({
          x: Math.random() * w, y: Math.random() * h,
          r: R(L.sizeMin || 1, L.sizeMax || 2),
          a: R(.3, 1), tw: R(0, Math.PI * 2), tws: R(.6, 1.8) * (L.twinkle || 0),
          vx: (L.dir === undefined ? R(-1, 1) : 0) * (L.speed || 0) * .04,
          vy: (L.dir !== undefined ? L.dir : 0) * (L.speed || 0) * .06 || (L.type === "drift" ? -(L.speed || 8) * .06 : 0),
        });
      }
      layers.push({ cfg: L, ps });
    });
    rec._orb = rec.orb || null;
    rec._shoot = rec.shoot || null;
    rec._shootT = rec._shoot ? R(1, rec._shoot.every) : 0;
    cur = rec;
  }
  let cur = null;

  function resize() {
    const el = fx; if (!el) return;
    w = el.clientWidth; h = el.clientHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cur) build(cur); // re-seed positions to new size
  }

  function dot(p, color, glow) {
    ctx.globalAlpha = p.a * (p.tws ? .55 + .45 * Math.sin(t * p.tws + p.tw) : 1);
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = p.r * 4; } else ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now; t += dt;
    ctx.clearRect(0, 0, w, h);
    ctx.shadowBlur = 0;
    // soft orb / moon
    if (cur && cur._orb) {
      const o = cur._orb, ox = o.x * w, oy = o.y * h, or = o.r * Math.min(w, h);
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, or);
      g.addColorStop(0, o.color); g.addColorStop(1, "transparent");
      ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ox, oy, or, 0, 6.2832); ctx.fill();
    }
    // particle layers
    layers.forEach(({ cfg, ps }) => {
      ps.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (cfg.sway) p.x += Math.sin(t * cfg.sway + p.tw) * .35;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        if (p.y > h + 4) { p.y = -4; p.x = Math.random() * w; }
        if (p.x < -4) p.x = w + 4; if (p.x > w + 4) p.x = -4;
        dot(p, cfg.color, cfg.glow);
      });
    });
    ctx.shadowBlur = 0;
    // shooting stars
    if (cur && cur._shoot) {
      cur._shootT -= dt;
      if (cur._shootT <= 0) { cur._shootT = R(cur._shoot.every * .6, cur._shoot.every * 1.6); shooters.push({ x: R(.1, .8) * w, y: R(.05, .4) * h, len: 0, life: 1 }); }
      shooters.forEach((s) => { s.x += 260 * dt; s.y += 120 * dt; s.len = Math.min(120, s.len + 420 * dt); s.life -= dt * .9; });
      shooters = shooters.filter((s) => s.life > 0 && s.x < w + 120);
      shooters.forEach((s) => {
        ctx.globalAlpha = Math.max(0, s.life);
        const g = ctx.createLinearGradient(s.x - s.len, s.y - s.len * .46, s.x, s.y);
        g.addColorStop(0, "transparent"); g.addColorStop(1, cur._shoot.color);
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath();
        ctx.moveTo(s.x - s.len, s.y - s.len * .46); ctx.lineTo(s.x, s.y); ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function ensureDom() {
    if (sky) return;
    const root = document.getElementById("scene");
    if (!root) return;
    sky = document.getElementById("scene-sky");
    fx = document.getElementById("scene-fx");
    sil = document.getElementById("scene-silhouette");
    ctx = fx.getContext("2d");
    window.addEventListener("resize", () => { clearTimeout(Scene._rt); Scene._rt = setTimeout(resize, 150); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(true); else if (curKey) start(); });
  }

  function start() {
    if (running) return; running = true; last = performance.now();
    if (reduce()) { running = true; frame(performance.now()); running = false; return; } // one static frame
    raf = requestAnimationFrame(frame);
  }
  function stop(soft) { running = false; cancelAnimationFrame(raf); if (!soft) { curKey = ""; } }

  return {
    set(cls, mode) {
      ensureDom(); if (!sky) return;
      const key = cls + "|" + (mode || "dark");
      const rec = recipe(cls);
      sky.style.background = rec.sky;
      sil.innerHTML = rec.silhouette || "";
      if (key !== curKey) { curKey = key; resize(); build(rec); }
      start();
    },
    stop() { stop(false); },
    _rt: 0,
  };
})();
window.Scene = Scene;
