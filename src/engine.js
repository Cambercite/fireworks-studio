/* ==========================================================================
   Engine: deterministic scene rendering. Every frame is a pure function of
   (project, time), so preview, scrubbing and export always agree.
   ========================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}

/* ---------- Shell definitions ----------
   Units are relative to the burst radius R (px), so a shell looks the same
   at any size. k = air drag, g = gravity (R/s²), spread = speed jitter. */
const SHELLS = {
  peony:         { label: 'Peony',         count: 120, life: [1.3, 1.9], k: 2.2, g: 0.32, trail: 0.07, spread: 0.12, head: 1.0 },
  chrysanthemum: { label: 'Chrysanthemum', count: 150, life: [1.6, 2.3], k: 2.0, g: 0.30, trail: 0.26, spread: 0.10, head: 0.8 },
  willow:        { label: 'Willow',        count: 110, life: [3.0, 4.0], k: 2.8, g: 0.62, trail: 0.75, spread: 0.18, head: 0.7 },
  ring:          { label: 'Ring',          count: 90,  life: [1.4, 1.8], k: 2.3, g: 0.26, trail: 0.08, spread: 0.02, head: 1.0 },
  palm:          { label: 'Palm',          count: 12,  life: [1.8, 2.4], k: 1.6, g: 0.55, trail: 0.45, spread: 0.08, head: 2.2 },
  crossette:     { label: 'Crossette',     count: 26,  life: [1.6, 2.0], k: 1.8, g: 0.30, trail: 0.10, spread: 0.10, head: 1.4, split: 0.55 },
  strobe:        { label: 'Strobe',        count: 130, life: [1.6, 2.4], k: 2.4, g: 0.28, trail: 0.03, spread: 0.30, head: 1.0, strobe: true },
  heart:         { label: 'Heart',         count: 110, life: [1.5, 1.9], k: 2.3, g: 0.18, trail: 0.06, spread: 0.02, head: 1.0 },
  crackle:       { label: 'Crackle',       count: 70,  life: [0.9, 1.3], k: 2.4, g: 0.25, trail: 0.05, spread: 0.25, head: 1.0, crackle: true },
};

const SHELL_PRESETS = [
  { id: 'red-peony',        name: 'Red Peony',            shell: 'peony',         color: '#ff3b4e', color2: '#ffb347', colorMode: 'fade' },
  { id: 'gold-willow',      name: 'Gold Willow',          shell: 'willow',        color: '#ffd27a', color2: '#ff7a1a', colorMode: 'fade' },
  { id: 'blue-ring',        name: 'Blue Ring',            shell: 'ring',          color: '#58b4ff', color2: '#ffffff', colorMode: 'fade' },
  { id: 'violet-mum',       name: 'Violet Chrysanthemum', shell: 'chrysanthemum', color: '#b47cff', color2: '#ff6bd6', colorMode: 'fade' },
  { id: 'green-palm',       name: 'Green Palm',           shell: 'palm',          color: '#6dff9a', color2: '#ffe066', colorMode: 'fade' },
  { id: 'silver-crossette', name: 'Silver Crossette',     shell: 'crossette',     color: '#eef1ff', color2: '#9fd0ff', colorMode: 'fade' },
  { id: 'white-strobe',     name: 'White Strobe',         shell: 'strobe',        color: '#ffffff', color2: '#cfe3ff', colorMode: 'single' },
  { id: 'pink-heart',       name: 'Pink Heart',           shell: 'heart',         color: '#ff5fa2', color2: '#ffd1e6', colorMode: 'fade' },
  { id: 'gold-crackle',     name: 'Gold Crackle',         shell: 'crackle',       color: '#ffe9a8', color2: '#ffb020', colorMode: 'fade' },
  { id: 'patriot-peony',    name: 'Two-colour Peony',     shell: 'peony',         color: '#ff4058', color2: '#4fc3ff', colorMode: 'mix' },
];

const burstModelCache = new Map();

function burstModel(it) {
  const key = `${it.shell}|${it.count}|${it.seed}`;
  let m = burstModelCache.get(key);
  if (m) return m;
  const def = SHELLS[it.shell] || SHELLS.peony;
  const rnd = mulberry32(it.seed || 1);
  const n = clamp(Math.round(it.count || def.count), 4, 400);
  const parts = [];
  const tilt = rnd() * TAU, squash = 0.35 + rnd() * 0.45;
  for (let i = 0; i < n; i++) {
    let dx, dy, spd;
    if (it.shell === 'ring') {
      const a = (i / n) * TAU;
      const x = Math.cos(a), y = Math.sin(a) * squash;
      dx = x * Math.cos(tilt) - y * Math.sin(tilt);
      dy = x * Math.sin(tilt) + y * Math.cos(tilt);
      spd = 1;
    } else if (it.shell === 'heart') {
      const a = (i / n) * TAU;
      const hx = 16 * Math.pow(Math.sin(a), 3);
      const hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      dx = hx / 17; dy = hy / 17 + 0.15;
      spd = 1;
    } else if (it.shell === 'palm' || it.shell === 'crossette') {
      const a = (i / n) * TAU + rnd() * 0.3;
      dx = Math.cos(a); dy = Math.sin(a);
      spd = 1;
    } else {
      // Uniform on a sphere, projected: dense centre, natural look.
      const u = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - u * u);
      dx = r * Math.cos(a); dy = r * Math.sin(a);
      spd = 1;
    }
    spd *= 1 - def.spread / 2 + rnd() * def.spread;
    const life = lerp(def.life[0], def.life[1], rnd());
    const children = [];
    if (def.split) {
      const base = rnd() * TAU;
      for (let c = 0; c < 4; c++) {
        const a = base + (c * TAU) / 4;
        children.push([Math.cos(a), Math.sin(a)]);
      }
    }
    parts.push({ dx, dy, spd, life, c: rnd(), ph: rnd() * 1000 | 0, children });
  }
  let maxLife = 0;
  for (const p of parts) maxLife = Math.max(maxLife, p.life);
  m = { def, parts, maxLife };
  if (burstModelCache.size > 400) burstModelCache.clear();
  burstModelCache.set(key, m);
  return m;
}

function riseTime(it, stageH) {
  if (!it.launch) return 0;
  const climb = clamp((stageH + 20 - it.y) / stageH, 0.1, 1.4);
  return clamp(0.55 + climb * 0.95, 0.6, 1.9);
}
function burstLength(it, stageH) {
  return riseTime(it, stageH) + burstModel(it).maxLife;
}

// Position (relative to burst point, in R units) under linear drag + gravity.
function ballistic(vx, vy, k, g, t) {
  const e = 1 - Math.exp(-k * t);
  return [(vx * e) / k, (vy * e) / k + g * (t / k - e / (k * k))];
}
function ballisticVel(vx, vy, k, g, t) {
  const e = Math.exp(-k * t);
  return [vx * e, g / k + (vy - g / k) * e];
}

const glowCache = new Map();
function glowSprite(hex) {
  let c = glowCache.get(hex);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const [r, gg, b] = hexToRgb(hex);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, `rgba(${r},${gg},${b},0.95)`);
  grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.28)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  if (glowCache.size > 300) glowCache.clear();
  glowCache.set(hex, c);
  return c;
}

const colorRampCache = new Map();
function colorRamp(a, b) {
  const key = a + b;
  let r = colorRampCache.get(key);
  if (!r) {
    r = [];
    for (let i = 0; i < 8; i++) r.push(mixHex(a, b, i / 7));
    if (colorRampCache.size > 200) colorRampCache.clear();
    colorRampCache.set(key, r);
  }
  return r;
}

/** Draw a burst item. s = output px per stage px. */
function drawBurst(ctx, it, t, s, stageH) {
  const lt = t - it.start;
  if (lt < 0) return;
  const R = (it.w / 2) * s;
  const ox = it.x * s, oy = it.y * s;
  const rise = riseTime(it, stageH);
  const m = burstModel(it);
  const def = m.def;
  const alpha = clamp(it.opacity ?? 1, 0, 1);
  ctx.save();
  ctx.globalCompositeOperation = it.blend === 'source-over' ? 'source-over' : it.blend || 'lighter';

  if (lt < rise) {
    drawRocket(ctx, it, lt, rise, s, stageH, alpha);
    ctx.restore();
    return;
  }
  const tau = lt - rise;
  if (tau > m.maxLife) { ctx.restore(); return; }

  // Initial flash.
  if (tau < 0.16) {
    const f = 1 - tau / 0.16;
    const fr = R * (0.1 + 0.16 * (1 - f));
    ctx.globalAlpha = alpha * f * f * 0.75;
    ctx.drawImage(glowSprite(it.color2 && it.colorMode !== 'single' ? mixHex(it.color, '#ffffff', 0.5) : '#ffffff'), ox - fr, oy - fr, fr * 2, fr * 2);
  }

  const rot = ((it.rot || 0) * Math.PI) / 180;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const k = def.k, g = def.g;
  const ramp = it.colorMode === 'fade' ? colorRamp(it.color, it.color2 || it.color) : null;
  const headBase = Math.max(1.2, R * 0.025 * def.head);
  ctx.lineCap = 'round';

  for (let i = 0; i < m.parts.length; i++) {
    const p = m.parts[i];
    if (tau > p.life) continue;
    const life = tau / p.life;
    let a = Math.pow(1 - life, 1.35);
    if (def.strobe && life > 0.35) a *= hash2(i, Math.floor(tau * 22) + p.ph) > 0.45 ? 1 : 0.05;
    if (a < 0.02) continue;
    const ddx = p.dx * cr - p.dy * sr, ddy = p.dx * sr + p.dy * cr;
    const vx = ddx * p.spd * k, vy = ddy * p.spd * k;
    let color;
    if (ramp) color = ramp[Math.min(7, Math.floor(life * 8))];
    else if (it.colorMode === 'mix') color = p.c < 0.5 ? it.color : it.color2 || it.color;
    else color = it.color;

    if (def.split && tau > def.split) {
      // Crossette: each star splits into four.
      const [sx, sy] = ballistic(vx, vy, k, g, def.split);
      const [svx, svy] = ballisticVel(vx, vy, k, g, def.split);
      const tt = tau - def.split;
      for (const [cx, cy] of p.children) {
        const cvx = svx * 0.35 + cx * 0.9, cvy = svy * 0.35 + cy * 0.9;
        drawStar(ctx, ox, oy, R, sx, sy, cvx, cvy, k * 1.4, g, tt, def.trail, a, color, headBase * 0.8);
      }
      continue;
    }
    drawStar(ctx, ox, oy, R, 0, 0, vx, vy, k, g, tau, def.trail, a, color, headBase);
    if (def.crackle && life > 0.55) {
      // Late glitter pops around the star.
      const [px, py] = ballistic(vx, vy, k, g, tau);
      for (let c = 0; c < 3; c++) {
        const h = hash2(i * 7 + c, Math.floor(tau * 30));
        if (h > 0.6) continue;
        const jx = (hash2(i, c * 13 + Math.floor(tau * 30)) - 0.5) * 0.12;
        const jy = (hash2(c, i * 17 + Math.floor(tau * 30)) - 0.5) * 0.12;
        const sz = headBase * 1.6;
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(glowSprite('#fff3c4'), ox + (px + jx) * R - sz, oy + (py + jy) * R - sz, sz * 2, sz * 2);
      }
    }
  }
  ctx.restore();

  function drawStar(ctx, ox, oy, R, bx, by, vx, vy, k, g, tt, trail, a, color, head) {
    const [px, py] = ballistic(vx, vy, k, g, tt);
    const x = ox + (bx + px) * R, y = oy + (by + py) * R;
    if (trail > 0) {
      const segs = trail > 0.3 ? 3 : 1;
      let lx = x, ly = y;
      ctx.strokeStyle = color;
      for (let sgi = 1; sgi <= segs; sgi++) {
        const t0 = Math.max(0, tt - (trail * sgi) / segs);
        const [qx, qy] = ballistic(vx, vy, k, g, t0);
        const nx = ox + (bx + qx) * R, ny = oy + (by + qy) * R;
        ctx.globalAlpha = alpha * a * (0.7 / sgi);
        ctx.lineWidth = Math.max(0.6, head * (0.9 - sgi * 0.18));
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        lx = nx; ly = ny;
        if (t0 === 0) break;
      }
    }
    const sz = head * 2.6;
    ctx.globalAlpha = alpha * a;
    ctx.drawImage(glowSprite(color), x - sz, y - sz, sz * 2, sz * 2);
  }
}

function drawRocket(ctx, it, lt, rise, s, stageH, alpha) {
  const y0 = stageH + 20;
  const pos = (tt) => {
    const u = clamp(tt / rise, 0, 1);
    const e = 1 - Math.pow(1 - u, 2.2);
    const wob = Math.sin(tt * 9 + (it.seed % 7)) * 3 * u;
    return [(it.x + wob) * s, lerp(y0, it.y, e) * s];
  };
  const [hx, hy] = pos(lt);
  const sz = Math.max(2, 5 * s * Math.sqrt(it.w / 300));
  for (let i = 1; i <= 14; i++) {
    const tt = lt - i * 0.022;
    if (tt < 0) break;
    const [x, y] = pos(tt);
    const j = hash2(it.seed + i, Math.floor(lt * 40));
    ctx.globalAlpha = alpha * (1 - i / 15) * 0.7;
    const r = sz * (1 - i / 18) * (0.6 + j * 0.6);
    ctx.drawImage(glowSprite('#ffb85c'), x - r + (j - 0.5) * 4 * s, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite('#fff1cc'), hx - sz * 1.4, hy - sz * 1.4, sz * 2.8, sz * 2.8);
}

/* ---------- Backgrounds ---------- */

const bgCache = { key: '', canvas: null };

function backgroundLayer(bg, W, H) {
  const key = `${W}x${H}|${bg.skyline}|${bg.seed}|${bg.skylineColor}`;
  if (bgCache.key === key) return bgCache.canvas;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (bg.skyline) {
    const rnd = mulberry32((bg.seed || 7) * 31 + 5);
    const base = H;
    const layers = [
      { col: bg.skylineColor || '#06050b', minH: 0.06, maxH: 0.2, wMin: 0.025, wMax: 0.07, lit: 0.18 },
    ];
    for (const L of layers) {
      let x = -10;
      g.fillStyle = L.col;
      const blds = [];
      while (x < W + 10) {
        const bw = W * lerp(L.wMin, L.wMax, rnd());
        const bh = H * lerp(L.minH, L.maxH, Math.pow(rnd(), 1.6));
        blds.push([x, base - bh, bw, bh]);
        g.fillRect(x, base - bh, bw + 1, bh);
        if (rnd() < 0.2) g.fillRect(x + bw * 0.45, base - bh - H * 0.03, Math.max(1, bw * 0.06), H * 0.03);
        x += bw;
      }
      // Lit windows.
      const cell = Math.max(3, Math.round(H * 0.0075));
      for (const [bx, by, bw, bh] of blds) {
        for (let wy = by + cell * 1.5; wy < base - cell; wy += cell * 2.2) {
          for (let wx = bx + cell; wx < bx + bw - cell; wx += cell * 1.9) {
            if (rnd() < L.lit) {
              g.fillStyle = rnd() < 0.7 ? 'rgba(255,206,120,0.55)' : 'rgba(170,210,255,0.4)';
              g.fillRect(wx, wy, cell * 0.9, cell * 1.1);
            }
          }
        }
      }
    }
  }
  bgCache.key = key;
  bgCache.canvas = c;
  return c;
}

const starCache = { key: '', stars: null };
function starField(seed, n) {
  const key = `${seed}|${n}`;
  if (starCache.key === key) return starCache.stars;
  const rnd = mulberry32(seed * 977 + 3);
  const stars = [];
  for (let i = 0; i < n; i++) {
    stars.push({ x: rnd(), y: Math.pow(rnd(), 1.4) * 0.85, r: 0.4 + Math.pow(rnd(), 3) * 1.4, w: 0.5 + rnd() * 2.5, ph: rnd() * TAU, b: 0.35 + rnd() * 0.65 });
  }
  starCache.key = key;
  starCache.stars = stars;
  return stars;
}

function drawBackground(ctx, bg, W, H, t, assetImage) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (bg.type === 'solid') {
    ctx.fillStyle = bg.c1;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.type === 'image' && assetImage) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const iw = assetImage.width, ih = assetImage.height;
    const sc = Math.max(W / iw, H / ih);
    ctx.drawImage(assetImage, (W - iw * sc) / 2, (H - ih * sc) / 2, iw * sc, ih * sc);
    if (bg.dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${clamp(bg.dim, 0, 1)})`;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bg.c1);
    grad.addColorStop(1, bg.c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
  if (bg.stars) {
    const stars = starField(bg.seed || 7, 260);
    const s = H / 1080;
    for (const st of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * st.w + st.ph);
      ctx.globalAlpha = st.b * tw;
      ctx.fillStyle = '#e9ecff';
      const r = Math.max(0.5, st.r * s);
      ctx.fillRect(st.x * W - r / 2, st.y * H - r / 2, r, r);
    }
    ctx.globalAlpha = 1;
  }
  if (bg.skyline) ctx.drawImage(backgroundLayer(bg, W, H), 0, 0);
}

/* ---------- Sprite timing ---------- */

function spriteFrameIndex(asset, it, t) {
  if (!asset || asset.frames.length <= 1) return 0;
  const lt = (t - it.start) * (it.speed || 1) * 1000;
  const dur = asset.duration;
  let ms;
  if (it.mode === 'loop') ms = ((lt % dur) + dur) % dur;
  else ms = Math.min(lt, dur - 0.001);
  const cum = asset.cumulative;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/* ---------- Audio ---------- */

class FireworksAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this.enabled = true;
    this.noise = null;
    this.recordDest = null;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch (e) {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.out = comp;
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    return true;
  }
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }
  recordStream() {
    if (!this.ensure()) return null;
    if (!this.ctx.createMediaStreamDestination) return null;
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.out.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }
  ready() {
    return this.enabled && this.ctx && this.ctx.state === 'running';
  }
  panner(pan) {
    const c = this.ctx;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      p.connect(this.master);
      return p;
    }
    return this.master;
  }
  boom(size = 0.5, pan = 0, crackle = false) {
    if (!this.ready()) return;
    const c = this.ctx, now = c.currentTime;
    const out = this.panner(pan);
    const vol = 0.35 + size * 0.65;
    // Body: filtered noise.
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400 - size * 600, now);
    lp.frequency.exponentialRampToValueAtTime(120, now + 1.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6 + size);
    src.connect(lp).connect(g).connect(out);
    src.start(now, Math.random() * 0.5);
    src.stop(now + 2.8);
    // Thump.
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90 - size * 30, now);
    o.frequency.exponentialRampToValueAtTime(32, now + 0.5);
    const og = c.createGain();
    og.gain.setValueAtTime(vol * 0.9, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    o.connect(og).connect(out);
    o.start(now);
    o.stop(now + 0.65);
    if (crackle) this.crackle(now + 0.4, 1.0, out);
  }
  crackle(start, len, out) {
    const c = this.ctx;
    for (let i = 0; i < 40; i++) {
      const t0 = start + Math.random() * len;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2500 + Math.random() * 3000;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25 + Math.random() * 0.2, t0 + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
      src.connect(hp).connect(g).connect(out || this.master);
      src.start(t0, Math.random());
      src.stop(t0 + 0.05);
    }
  }
  launch(duration, pan = 0) {
    if (!this.ready()) return;
    const c = this.ctx, now = c.currentTime;
    const out = this.panner(pan);
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(900, now);
    bp.frequency.exponentialRampToValueAtTime(2600, now + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(bp).connect(g).connect(out);
    src.start(now, Math.random());
    src.stop(now + duration + 0.05);
    // Launch thud.
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    const og = c.createGain();
    og.gain.setValueAtTime(0.25, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.connect(og).connect(out);
    o.start(now);
    o.stop(now + 0.2);
  }
}
