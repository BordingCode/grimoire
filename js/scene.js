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
    Sorcerer: () => ({
      sky: "radial-gradient(120% 70% at 70% 12%, #4a1530 0%, transparent 46%), radial-gradient(90% 60% at 20% 95%, #3a1020 0%, transparent 55%), linear-gradient(180deg, #1c0712 0%, #160810 55%, #0c040a 100%)",
      silhouette: hill("#0c0207", "40%", "M0 40 V22 L12 14 22 24 32 12 44 24 54 14 66 26 78 12 90 24 100 16 V40 Z"),
      layers: [
        { type: "fog", count: 5, color: "rgba(120,40,90,0.22)", sizeMin: 120, sizeMax: 240, speed: 6, dir: 1 },
        { type: "streak", count: 70, color: "rgba(220,140,255,0.5)", sizeMin: .6, sizeMax: 1.2, speed: 50, wind: .5 },
        { type: "drift", count: 14, color: "rgba(255,120,200,0.95)", sizeMin: 1, sizeMax: 2.4, speed: 14, dir: -1, glow: 1, sway: 1.6 },
      ],
      flash: { every: 6, color: "#e6b8ff", alpha: .2 },
    }),
    Warlock: () => ({
      sky: "radial-gradient(70% 55% at 50% 32%, #2a0f44 0%, transparent 50%), radial-gradient(120% 80% at 50% 100%, #10241a 0%, transparent 55%), linear-gradient(180deg, #0e0620 0%, #0a0418 60%, #060310 100%)",
      orb: { x: .5, y: .3, r: .26, color: "rgba(120,230,150,0.18)" },
      silhouette: hill("#05030f", "44%", "M0 40 V20 L8 26 14 12 20 26 28 16 36 28 44 14 52 28 60 16 68 28 76 12 84 26 92 16 100 24 V40 Z"),
      layers: [
        { type: "fog", count: 6, color: "rgba(60,140,90,0.16)", sizeMin: 110, sizeMax: 220, speed: 4, dir: -1 },
        { type: "drift", count: 26, color: "rgba(150,255,180,0.7)", sizeMin: 1, sizeMax: 2.6, speed: 7, dir: -1, glow: 1, sway: 1.1 },
        { type: "stars", count: 18, color: "#b58cff", sizeMin: .5, sizeMax: 1.4, twinkle: 1.4, glow: 1 },
      ],
    }),
    Rogue: () => ({
      sky: "radial-gradient(60% 45% at 80% 14%, #3a4366 0%, transparent 46%), linear-gradient(180deg, #0d1020 0%, #0b0e1c 55%, #070910 100%)",
      orb: { x: .8, y: .14, r: .14, color: "rgba(200,210,255,0.5)" },
      silhouette: hill("#05070f", "50%", "M0 40 V28 H10 V18 H16 V28 H26 V14 H34 V28 H46 V20 H50 V10 H54 V20 H64 V26 H74 V16 H82 V28 H92 V20 H100 V40 Z"),
      layers: [
        { type: "fog", count: 5, color: "rgba(80,90,130,0.18)", sizeMin: 120, sizeMax: 230, speed: 5, dir: 1 },
        { type: "stars", count: 30, color: "#aebbe0", sizeMin: .4, sizeMax: 1.2, twinkle: .9 },
        { type: "streak", count: 30, color: "rgba(150,165,210,0.35)", sizeMin: .5, sizeMax: 1, speed: 38, wind: .25 },
      ],
    }),
    Ranger: () => ({
      sky: "radial-gradient(80% 55% at 35% 12%, #233a30 0%, transparent 48%), linear-gradient(180deg, #0c1611 0%, #0b1410 55%, #070d0a 100%)",
      orb: { x: .68, y: .12, r: .18, color: "rgba(200,220,180,0.30)" },
      silhouette: hill("#060f0a", "52%", "M0 40 V24 L6 12 10 24 16 8 22 24 28 14 34 24 40 6 46 24 54 12 60 24 68 10 74 24 82 14 88 24 96 10 100 22 V40 Z"),
      layers: [
        { type: "fog", count: 7, color: "rgba(120,150,120,0.18)", sizeMin: 110, sizeMax: 230, speed: 5, dir: 1 },
        { type: "drift", count: 16, color: "rgba(180,210,140,0.85)", sizeMin: 1.2, sizeMax: 2.6, speed: 7, dir: 1, sway: 1 },
        { type: "drift", count: 12, color: "rgba(210,230,150,0.9)", sizeMin: 1, sizeMax: 1.8, speed: 5, dir: -1, glow: 1, sway: .8 },
      ],
    }),
    Paladin: () => ({
      sky: "radial-gradient(75% 60% at 50% -6%, #3a4f86 0%, transparent 52%), radial-gradient(90% 50% at 50% 100%, #2a2410 0%, transparent 55%), linear-gradient(180deg, #101a30 0%, #0d1424 55%, #080d18 100%)",
      orb: { x: .5, y: -.02, r: .4, color: "rgba(180,210,255,0.28)" },
      silhouette: hill("#070b16", "34%", "M0 40 V30 Q12 24 20 30 L22 12 24 30 Q34 24 44 30 L48 8 52 30 Q62 24 72 30 L76 12 78 30 Q88 24 100 30 V40 Z"),
      layers: [
        { type: "drift", count: 28, color: "rgba(200,220,255,0.8)", sizeMin: 1, sizeMax: 2.4, speed: 6, dir: -1, glow: 1, sway: .6 },
        { type: "stars", count: 20, color: "#e6d8a0", sizeMin: .5, sizeMax: 1.4, twinkle: 1 },
      ],
    }),
    Monk: () => ({
      sky: "radial-gradient(80% 55% at 50% 6%, #2a5a52 0%, transparent 50%), linear-gradient(180deg, #0c1f1c 0%, #0a1a18 55%, #061110 100%)",
      orb: { x: .5, y: .12, r: .22, color: "rgba(180,255,235,0.26)" },
      silhouette: hill("#06110f", "40%", "M0 40 V26 Q16 10 30 22 Q40 6 52 20 Q66 8 80 22 Q90 14 100 24 V40 Z"),
      layers: [
        { type: "fog", count: 8, color: "rgba(120,200,190,0.16)", sizeMin: 120, sizeMax: 250, speed: 4, dir: 1 },
        { type: "drift", count: 14, color: "rgba(180,240,225,0.85)", sizeMin: 1.2, sizeMax: 2.6, speed: 5, dir: -1, glow: 1, sway: 1.2 },
      ],
    }),
    Bard: () => ({
      sky: "radial-gradient(70% 50% at 30% 14%, #5a2050 0%, transparent 46%), radial-gradient(70% 50% at 78% 22%, #402060 0%, transparent 48%), linear-gradient(180deg, #1c0a22 0%, #160818 55%, #0d0512 100%)",
      silhouette: hill("#0c0410", "30%", "M0 40 V32 L6 30 6 24 8 24 8 30 18 30 18 22 20 22 20 30 32 30 32 26 34 26 34 30 46 30 46 22 48 22 48 30 60 30 60 26 62 26 62 30 74 30 74 22 76 22 76 30 88 30 88 26 90 26 90 30 100 30 V40 Z"),
      layers: [
        { type: "drift", count: 24, color: "rgba(255,170,220,0.9)", sizeMin: 1.6, sizeMax: 4, speed: 7, dir: -1, glow: 1, sway: 1.4, blob: 1 },
        { type: "drift", count: 18, color: "rgba(255,210,140,0.95)", sizeMin: 1, sizeMax: 2, speed: 10, dir: -1, glow: 1, sway: 1.6 },
        { type: "stars", count: 16, color: "#ffd0ec", sizeMin: .5, sizeMax: 1.4, twinkle: 1.4 },
      ],
    }),
    Fighter: () => ({
      sky: "radial-gradient(80% 55% at 50% 8%, #2c3850 0%, transparent 50%), radial-gradient(70% 40% at 32% 96%, #5a3318 0%, transparent 48%), linear-gradient(180deg, #101622 0%, #0d121c 55%, #080b12 100%)",
      silhouette: hill("#06090f", "44%", "M0 40 V26 H8 L10 18 12 26 H24 L26 20 28 26 H30 L30 10 32 10 32 26 H46 L48 16 50 26 H64 L66 20 68 26 H82 L84 18 86 26 H100 V40 Z"),
      layers: [
        { type: "fog", count: 5, color: "rgba(90,70,60,0.2)", sizeMin: 120, sizeMax: 240, speed: 5, dir: 1 },
        { type: "drift", count: 18, color: "rgba(255,160,80,0.9)", sizeMin: 1, sizeMax: 2.2, speed: 12, dir: -1, glow: 1, sway: 1.2 },
        { type: "stars", count: 24, color: "#b9c6e0", sizeMin: .4, sizeMax: 1.2, twinkle: 1 },
      ],
    }),
    Artificer: () => ({
      sky: "radial-gradient(85% 60% at 50% 100%, #4a3416 0%, transparent 52%), radial-gradient(60% 45% at 22% 18%, #3a2c4a 0%, transparent 50%), linear-gradient(180deg, #181208 0%, #140f0a 55%, #0c0806 100%)",
      orb: { x: .5, y: .95, r: .3, color: "rgba(220,160,70,0.22)" },
      silhouette: hill("#0a0703", "42%", "M0 40 V24 H6 V16 H10 V24 H18 L22 18 26 24 H34 V14 H38 V24 H50 V18 H54 V24 H66 L70 16 74 24 H84 V18 H88 V24 H100 V40 Z"),
      layers: [
        { type: "drift", count: 30, color: "rgba(255,190,90,0.95)", sizeMin: .8, sizeMax: 2, speed: 14, dir: -1, glow: 1, sway: 1 },
        { type: "fog", count: 5, color: "rgba(180,150,110,0.16)", sizeMin: 110, sizeMax: 220, speed: 5, dir: -1 },
        { type: "stars", count: 14, color: "#e8c98a", sizeMin: .5, sizeMax: 1.3, twinkle: 1.2 },
      ],
    }),
    _default: () => ({
      sky: "radial-gradient(110% 80% at 50% 0%, #241b3e 0%, transparent 55%), linear-gradient(180deg, #120c26 0%, #0a0718 100%)",
      layers: [{ type: "stars", count: 70, color: "#cfd0ff", sizeMin: .4, sizeMax: 1.6, twinkle: 1 }],
    }),
  };

  function vel(L) {
    const s = L.speed || 8;
    if (L.type === "streak") return { vx: (L.wind ?? .35) * s * .05, vy: s * .12 };
    if (L.type === "drift") return { vx: 0, vy: (L.dir || 1) * s * .06 };
    if (L.type === "fog") return { vx: (L.dir || 1) * s * .02, vy: 0 };
    return { vx: 0, vy: 0 }; // stars sit still and twinkle
  }
  function build(rec) {
    layers = []; shooters = [];
    (rec.layers || []).forEach((L) => {
      const ps = [], v = vel(L);
      for (let i = 0; i < L.count; i++) {
        ps.push({
          x: Math.random() * w, y: Math.random() * h,
          r: R(L.sizeMin || 1, L.sizeMax || 2),
          a: R(.3, 1), tw: R(0, Math.PI * 2), tws: R(.6, 1.8) * (L.twinkle || 0),
          vx: v.vx * R(.7, 1.3), vy: v.vy * R(.85, 1.15),
        });
      }
      layers.push({ cfg: L, ps });
    });
    rec._orb = rec.orb || null;
    rec._shoot = rec.shoot || null;
    rec._shootT = rec._shoot ? R(1, rec._shoot.every) : 0;
    rec._flash = rec.flash || null;
    rec._flashT = rec._flash ? R(1, rec._flash.every) : 0;
    rec._flashA = 0;
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

  function paint(p, cfg) {
    ctx.globalAlpha = Math.max(0, p.a * (p.tws ? .55 + .45 * Math.sin(t * p.tws + p.tw) : 1));
    if (cfg.glow) { ctx.shadowColor = cfg.color; ctx.shadowBlur = p.r * 4; } else ctx.shadowBlur = 0;
    if (cfg.type === "streak") {
      ctx.strokeStyle = cfg.color; ctx.lineWidth = p.r;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3.2, p.y - p.vy * 3.2); ctx.stroke();
    } else if (cfg.type === "fog" || cfg.blob) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, cfg.color); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    } else {
      ctx.fillStyle = cfg.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    }
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
    // lightning flash (lights the whole sky briefly)
    if (cur && cur._flash) {
      cur._flashT -= dt;
      if (cur._flashT <= 0) { cur._flashT = R(cur._flash.every * .5, cur._flash.every * 1.6); cur._flashA = cur._flash.alpha || .22; }
      if (cur._flashA > 0) { ctx.globalAlpha = cur._flashA; ctx.fillStyle = cur._flash.color || "#cdbdff"; ctx.fillRect(0, 0, w, h); cur._flashA -= dt * 1.7; }
    }
    // particle layers
    layers.forEach(({ cfg, ps }) => {
      const m = cfg.sway || 0;
      ps.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (m) p.x += Math.sin(t * m + p.tw) * .35;
        const pad = p.r + 4;
        if (p.y < -pad) { p.y = h + pad; p.x = Math.random() * w; }
        if (p.y > h + pad) { p.y = -pad; p.x = Math.random() * w; }
        if (p.x < -pad) p.x = w + pad; if (p.x > w + pad) p.x = -pad;
        paint(p, cfg);
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
