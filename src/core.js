/* ==========================================================================
   Core: helpers, project model, history, assets, persistence, playback,
   rendering and stage interaction.
   ========================================================================== */

/* ---------- DOM helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  toStart: '<path d="M19 20 9 12l10-8v16Z"/><path d="M5 19V5"/>',
  stepBack: '<path d="m15 18-6-6 6-6"/>',
  stepFwd: '<path d="m9 18 6-6-6-6"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  pointer: '<path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/>',
  burst: '<circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
  magnet: '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/><path d="m5 8 4 4"/><path d="m12 15 4 4"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  front: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  back: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  toFront: '<path d="M5 3h14"/><path d="m18 13-6-6-6 6"/><path d="M12 7v14"/>',
  toBack: '<path d="M5 21h14"/><path d="m6 11 6 6 6-6"/><path d="M12 17V3"/>',
  flipH: '<path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 20v2M12 14v2M12 8v2M12 2v2"/>',
  flipV: '<path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><path d="M4 12H2M10 12H8M16 12h-2M22 12h-2"/>',
  panelLeft: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  panelRight: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  zoomIn: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
  ghost: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
  dice: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  open: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alignL: '<path d="M4 2v20"/><rect x="8" y="6" width="12" height="4" rx="1"/><rect x="8" y="14" width="7" height="4" rx="1"/>',
  alignC: '<path d="M12 2v20"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  alignR: '<path d="M20 2v20"/><rect x="4" y="6" width="12" height="4" rx="1"/><rect x="9" y="14" width="7" height="4" rx="1"/>',
  alignT: '<path d="M2 4h20"/><rect x="6" y="8" width="4" height="12" rx="1"/><rect x="14" y="8" width="4" height="7" rx="1"/>',
  alignM: '<path d="M2 12h20"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  alignB: '<path d="M2 20h20"/><rect x="6" y="4" width="4" height="12" rx="1"/><rect x="14" y="9" width="4" height="7" rx="1"/>',
  distH: '<rect x="3" y="6" width="4" height="12" rx="1"/><rect x="10" y="8" width="4" height="8" rx="1"/><rect x="17" y="6" width="4" height="12" rx="1"/>',
  distV: '<rect x="6" y="3" width="12" height="4" rx="1"/><rect x="8" y="10" width="8" height="4" rx="1"/><rect x="6" y="17" width="12" height="4" rx="1"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9Z"/>',
};

function icon(name, size = 16) {
  return h('span', {
    class: 'ic',
    'aria-hidden': 'true',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`,
  });
}

let uidCounter = 0;
function uid(prefix = 'c') {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${uidCounter.toString(36)}`;
}

function fmtTime(t, withCs = true) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${withCs ? '.' + String(cs).padStart(2, '0') : ''}`;
}
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function slug(s) {
  return (s || 'fireworks-show').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fireworks-show';
}
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const nextTick = () => new Promise((r) => setTimeout(r, 0));

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, rel: 'noopener', style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function readFileAs(file, how) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('The file could not be read.'));
    if (how === 'text') r.readAsText(file);
    else if (how === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsDataURL(file);
  });
}

function dataUrlToBytes(url) {
  const comma = url.indexOf(',');
  const meta = url.slice(0, comma);
  const body = url.slice(comma + 1);
  if (!/;base64/.test(meta)) return new TextEncoder().encode(decodeURIComponent(body));
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const prefs = {
  data: {},
  load() {
    try { this.data = JSON.parse(localStorage.getItem('fw-studio-prefs') || '{}') || {}; } catch (e) { this.data = {}; }
  },
  get(k, d) { return k in this.data ? this.data[k] : d; },
  set(k, v) {
    this.data[k] = v;
    try { localStorage.setItem('fw-studio-prefs', JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
  },
};

/* ---------- Project model ---------- */

const STAGE_PRESETS = [
  { id: '1080p', label: '1920 × 1080 · HD', w: 1920, h: 1080 },
  { id: '720p', label: '1280 × 720 · HD', w: 1280, h: 720 },
  { id: '4k', label: '3840 × 2160 · 4K', w: 3840, h: 2160 },
  { id: 'vertical', label: '1080 × 1920 · Vertical', w: 1080, h: 1920 },
  { id: 'square', label: '1080 × 1080 · Square', w: 1080, h: 1080 },
  { id: 'classic', label: '1440 × 1080 · 4:3', w: 1440, h: 1080 },
];

const BLEND_MODES = [
  ['screen', 'Screen (soft glow)'],
  ['lighter', 'Add (bright glow)'],
  ['source-over', 'Normal'],
];

const MAX_DURATION = 300;

function defaultStage() {
  return {
    w: 1920, h: 1080, duration: 12,
    bg: { type: 'night', c1: '#070a1f', c2: '#2a1442', stars: true, skyline: true, skylineColor: '#05040a', seed: 7, imageId: null, dim: 0.25 },
  };
}

function normalizeStage(raw) {
  const d = defaultStage();
  const s = raw && typeof raw === 'object' ? raw : {};
  const bg = s.bg && typeof s.bg === 'object' ? s.bg : {};
  const hex = (v, f) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : f);
  return {
    w: clamp(Math.round(num(s.w, d.w)), 160, 4096),
    h: clamp(Math.round(num(s.h, d.h)), 160, 4096),
    duration: clamp(num(s.duration, d.duration), 1, MAX_DURATION),
    bg: {
      type: ['night', 'gradient', 'solid', 'image'].includes(bg.type) ? bg.type : d.bg.type,
      c1: hex(bg.c1, d.bg.c1),
      c2: hex(bg.c2, d.bg.c2),
      stars: typeof bg.stars === 'boolean' ? bg.stars : d.bg.stars,
      skyline: typeof bg.skyline === 'boolean' ? bg.skyline : d.bg.skyline,
      skylineColor: hex(bg.skylineColor, d.bg.skylineColor),
      seed: Math.round(num(bg.seed, d.bg.seed)),
      imageId: typeof bg.imageId === 'string' ? bg.imageId : null,
      dim: clamp(num(bg.dim, d.bg.dim), 0, 0.9),
    },
  };
}

function normalizeItem(raw, stage) {
  if (!raw || typeof raw !== 'object') return null;
  const hex = (v, f) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : f);
  const common = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '',
    x: num(raw.x, stage.w / 2),
    y: num(raw.y, stage.h / 3),
    w: clamp(num(raw.w, 300), 8, 8000),
    h: clamp(num(raw.h, 300), 8, 8000),
    rot: num(raw.rot, 0) % 360,
    opacity: clamp(num(raw.opacity, 1), 0, 1),
    start: clamp(num(raw.start, 0), 0, MAX_DURATION),
    visible: raw.visible !== false,
    locked: raw.locked === true,
    sound: raw.sound !== false,
  };
  if (raw.type === 'burst') {
    const shell = SHELLS[raw.shell] ? raw.shell : 'peony';
    const it = {
      ...common,
      type: 'burst',
      shell,
      color: hex(raw.color, '#ff3b4e'),
      color2: hex(raw.color2, '#ffffff'),
      colorMode: ['single', 'fade', 'mix'].includes(raw.colorMode) ? raw.colorMode : 'fade',
      count: clamp(Math.round(num(raw.count, SHELLS[shell].count)), 4, 400),
      seed: Math.round(num(raw.seed, (Math.random() * 1e9) | 0)) >>> 0 || 1,
      launch: raw.launch !== false,
      blend: BLEND_MODES.some((b) => b[0] === raw.blend) ? raw.blend : 'lighter',
    };
    it.h = it.w;
    if (!it.name) it.name = SHELLS[shell].label;
    return it;
  }
  if (typeof raw.assetId !== 'string') return null;
  return {
    ...common,
    type: 'sprite',
    assetId: raw.assetId,
    flipX: raw.flipX === true,
    flipY: raw.flipY === true,
    blend: BLEND_MODES.some((b) => b[0] === raw.blend) ? raw.blend : 'screen',
    hue: clamp(num(raw.hue, 0), -180, 180),
    speed: clamp(num(raw.speed, 1), 0.1, 4),
    len: clamp(num(raw.len, 0), 0, MAX_DURATION),
    mode: ['loop', 'once', 'hold'].includes(raw.mode) ? raw.mode : 'loop',
    sound: raw.sound === true,
    name: common.name || 'GIF',
  };
}

/* ---------- Application state ---------- */

const state = {
  name: 'Untitled show',
  stage: defaultStage(),
  items: [],
  customAssets: [], // ids of user assets, in library order
  sel: new Set(),
  t: 0,
  playing: true,
  loop: true,
  tool: 'select',
  firePreset: 'red-peony',
  snap: true,
  ghosts: true,
  clipboard: null,
  pasteCount: 0,
  exporting: false,
  modalOpen: false,
};

const assets = new Map(); // id -> runtime asset

const audio = new FireworksAudio();

const dirty = { scene: true, overlay: true };
function markDirty() { dirty.scene = true; dirty.overlay = true; }

/* ---------- History ---------- */

const history = {
  stack: [],
  index: -1,
  limit: 150,
  snapshot() {
    return JSON.stringify({ stage: state.stage, items: state.items });
  },
  reset() {
    this.stack = [this.snapshot()];
    this.index = 0;
    ui.updateUndo();
  },
  commit() {
    const snap = this.snapshot();
    if (this.stack[this.index] === snap) return false;
    this.stack.length = this.index + 1;
    this.stack.push(snap);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    ui.updateUndo();
    persist.schedule();
    return true;
  },
  restore(i) {
    const data = JSON.parse(this.stack[i]);
    this.index = i;
    state.stage = data.stage;
    state.items = data.items;
    for (const id of [...state.sel]) if (!state.items.some((it) => it.id === id)) state.sel.delete(id);
    // Keep any user asset that items reference in the library.
    for (const it of state.items) {
      if (it.type === 'sprite' && assets.has(it.assetId) && !assets.get(it.assetId).builtin && !state.customAssets.includes(it.assetId)) {
        state.customAssets.push(it.assetId);
      }
    }
    state.t = Math.min(state.t, state.stage.duration);
    ui.refreshAll();
    persist.schedule();
  },
  undo() { if (this.index > 0) { this.restore(this.index - 1); ui.toast('Undone'); } },
  redo() { if (this.index < this.stack.length - 1) { this.restore(this.index + 1); ui.toast('Redone'); } },
  canUndo() { return this.index > 0; },
  canRedo() { return this.index < this.stack.length - 1; },
};

let commitTimer = 0;
function commitSoon() {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(() => history.commit(), 450);
}
function commitNow() {
  clearTimeout(commitTimer);
  history.commit();
}

/* ---------- Assets ---------- */

const MAX_FRAME_SIDE = 1024;
const MAX_TOTAL_PIXELS = 90e6;

async function loadAsset(def) {
  const a = {
    id: def.id, name: def.name || 'Image', kind: def.kind || 'gif', src: def.src, builtin: !!def.builtin,
    status: 'loading', frames: [], cumulative: [], duration: 0, width: 1, height: 1, error: '',
  };
  assets.set(a.id, a);
  try {
    if (a.kind === 'gif') {
      const gif = decodeGif(dataUrlToBytes(a.src));
      const total = gif.width * gif.height * gif.frames.length;
      let scale = Math.min(1, MAX_FRAME_SIDE / Math.max(gif.width, gif.height));
      if (total * scale * scale > MAX_TOTAL_PIXELS) scale = Math.sqrt(MAX_TOTAL_PIXELS / total);
      const fw = Math.max(1, Math.round(gif.width * scale)), fh = Math.max(1, Math.round(gif.height * scale));
      const full = document.createElement('canvas');
      full.width = gif.width; full.height = gif.height;
      const fctx = full.getContext('2d');
      let acc = 0;
      for (const f of gif.frames) {
        const c = document.createElement('canvas');
        c.width = fw; c.height = fh;
        const imgData = new ImageData(f.data, gif.width, gif.height);
        if (scale === 1) {
          c.getContext('2d').putImageData(imgData, 0, 0);
        } else {
          fctx.putImageData(imgData, 0, 0);
          const cc = c.getContext('2d');
          cc.imageSmoothingQuality = 'high';
          cc.drawImage(full, 0, 0, fw, fh);
        }
        a.frames.push(c);
        acc += f.delay;
        a.cumulative.push(acc);
      }
      a.duration = acc;
      a.width = gif.width; a.height = gif.height;
    } else {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('This image could not be opened.'));
        im.src = a.src;
      });
      const iw = img.naturalWidth || 512, ih = img.naturalHeight || 512;
      const sc = Math.min(1, 2048 / Math.max(iw, ih));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(iw * sc));
      c.height = Math.max(1, Math.round(ih * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      a.frames.push(c);
      a.cumulative.push(1);
      a.duration = 0;
      a.width = iw; a.height = ih;
    }
    a.status = 'ready';
  } catch (err) {
    a.status = 'error';
    a.error = err.message || 'This file could not be read.';
  }
  markDirty();
  ui.onAssetsChanged();
  return a;
}

const MAX_IMPORT_BYTES = 40 * 1024 * 1024;

async function importFiles(files, dropAt) {
  const list = [...files];
  let added = 0, firstId = null;
  for (const file of list) {
    const isJson = /\.json$/i.test(file.name) || file.type === 'application/json';
    if (isJson) {
      await persist.openFile(file);
      return;
    }
    const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    const isImg = /^image\/(png|jpe?g|webp|svg\+xml|avif|bmp)$/.test(file.type) || /\.(png|jpe?g|webp|svg|avif|bmp)$/i.test(file.name);
    if (!isGif && !isImg) {
      ui.toast(`${file.name} isn't a GIF or image. Use GIF, PNG, JPG, WebP or SVG files.`, 'error');
      continue;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      ui.toast(`${file.name} is over 40 MB. Use a smaller file.`, 'error');
      continue;
    }
    try {
      const src = await readFileAs(file, 'dataurl');
      const id = uid('u');
      const a = await loadAsset({ id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40), kind: isGif ? 'gif' : 'image', src });
      if (a.status === 'error') {
        assets.delete(id);
        ui.toast(`${file.name}: ${a.error}`, 'error');
        continue;
      }
      state.customAssets.push(id);
      added++;
      if (!firstId) firstId = id;
    } catch (err) {
      ui.toast(`${file.name} could not be read.`, 'error');
    }
  }
  ui.onAssetsChanged();
  persist.schedule();
  if (added) {
    if (dropAt && firstId) {
      addSprite(firstId, dropAt);
    } else {
      ui.toast(added === 1 ? 'Added 1 file to Your uploads' : `Added ${added} files to Your uploads`);
    }
  }
}

function removeAsset(id) {
  state.customAssets = state.customAssets.filter((a) => a !== id);
  const before = state.items.length;
  state.items = state.items.filter((it) => !(it.type === 'sprite' && it.assetId === id));
  for (const sid of [...state.sel]) if (!state.items.some((it) => it.id === sid)) state.sel.delete(sid);
  if (state.stage.bg.imageId === id) {
    state.stage.bg.imageId = null;
    if (state.stage.bg.type === 'image') state.stage.bg.type = 'night';
  }
  ui.refreshAll();
  commitNow();
  persist.schedule();
  return before - state.items.length;
}

/* ---------- Item helpers ---------- */

function findItem(id) { return state.items.find((it) => it.id === id); }
function selectedItems() { return state.items.filter((it) => state.sel.has(it.id)); }

function itemEnd(it) {
  if (it.type === 'burst') return it.start + burstLength(it, state.stage.h);
  const a = assets.get(it.assetId);
  const sp = it.speed || 1;
  if (it.mode === 'once' && a && a.duration > 0) {
    const play = a.duration / 1000 / sp;
    return it.start + (it.len > 0 ? Math.min(it.len, play) : play);
  }
  return it.len > 0 ? it.start + it.len : Infinity;
}
function isActive(it, t) {
  return t >= it.start && t < itemEnd(it);
}
function burstTime(it) {
  return it.start + riseTime(it, state.stage.h);
}

function itemCorners(it) {
  const r = (it.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const hw = it.w / 2, hh = it.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [it.x + x * c - y * s, it.y + x * s + y * c]);
}
function itemAABB(it) {
  const cs = itemCorners(it);
  const xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function groupAABB(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) {
    const b = itemAABB(it);
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  return { x0, y0, x1, y1 };
}
function pointInItem(it, px, py) {
  const r = (-it.rot * Math.PI) / 180;
  const dx = px - it.x, dy = py - it.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2;
}

function spriteSize(a) {
  const target = state.stage.h * 0.3;
  const w = a ? a.width : 300, hgt = a ? a.height : 300;
  const sc = target / Math.max(w, hgt);
  return [Math.round(w * sc), Math.round(hgt * sc)];
}

function randomSkyPoint() {
  const S = state.stage;
  return { x: S.w * (0.2 + Math.random() * 0.6), y: S.h * (0.18 + Math.random() * 0.3) };
}

function addSprite(assetId, at) {
  const a = assets.get(assetId);
  if (!a) return null;
  const [w, hh] = spriteSize(a);
  const p = at || randomSkyPoint();
  const it = normalizeItem({
    type: 'sprite', assetId, name: a.name, x: p.x, y: p.y, w, h: hh,
    start: 0, mode: 'loop', blend: a.kind === 'gif' ? 'screen' : 'source-over',
  }, state.stage);
  state.items.push(it);
  state.sel = new Set([it.id]);
  ui.refreshAll();
  commitNow();
  return it;
}

function addBurst(presetId, at, start) {
  const pr = SHELL_PRESETS.find((p) => p.id === presetId) || SHELL_PRESETS[0];
  const S = state.stage;
  const base = pr.shell === 'willow' ? 0.5 : pr.shell === 'palm' ? 0.44 : 0.4;
  const size = Math.round(S.h * base * (0.88 + Math.random() * 0.24));
  const p = at || randomSkyPoint();
  const it = normalizeItem({
    type: 'burst', shell: pr.shell, color: pr.color, color2: pr.color2, colorMode: pr.colorMode,
    name: pr.name, x: p.x, y: p.y, w: size, h: size, start: start ?? state.t, launch: true,
    seed: (Math.random() * 1e9) | 0,
  }, S);
  state.items.push(it);
  state.sel = new Set([it.id]);
  ui.refreshAll();
  commitNow();
  return it;
}

function deleteSelected() {
  if (!state.sel.size) return;
  const n = state.sel.size;
  state.items = state.items.filter((it) => !state.sel.has(it.id));
  state.sel.clear();
  ui.refreshAll();
  commitNow();
  ui.toast(n === 1 ? 'Deleted 1 cue' : `Deleted ${n} cues`);
}

function copySelected(cut = false) {
  const items = selectedItems();
  if (!items.length) return;
  state.clipboard = JSON.stringify(items);
  state.pasteCount = 0;
  if (cut) {
    state.items = state.items.filter((it) => !state.sel.has(it.id));
    state.sel.clear();
    ui.refreshAll();
    commitNow();
    ui.toast(items.length === 1 ? 'Cut 1 cue' : `Cut ${items.length} cues`);
  } else {
    ui.toast(items.length === 1 ? 'Copied 1 cue' : `Copied ${items.length} cues`);
  }
}

function pasteClipboard(json = state.clipboard, offset) {
  if (!json) return;
  let raw;
  try { raw = JSON.parse(json); } catch (e) { return; }
  state.pasteCount++;
  const off = offset ?? 24 * state.pasteCount;
  const added = [];
  for (const r of raw) {
    const it = normalizeItem({ ...r, id: uid(), x: r.x + off, y: r.y + off }, state.stage);
    if (it && (it.type === 'burst' || assets.has(it.assetId))) { state.items.push(it); added.push(it.id); }
  }
  if (!added.length) return;
  state.sel = new Set(added);
  ui.refreshAll();
  commitNow();
}

function duplicateSelected() {
  if (!state.sel.size) return;
  pasteClipboard(JSON.stringify(selectedItems()), 24);
}

function reorder(kind) {
  const sel = state.sel;
  if (!sel.size) return;
  const items = state.items;
  if (kind === 'front') {
    state.items = [...items.filter((it) => !sel.has(it.id)), ...items.filter((it) => sel.has(it.id))];
  } else if (kind === 'back') {
    state.items = [...items.filter((it) => sel.has(it.id)), ...items.filter((it) => !sel.has(it.id))];
  } else if (kind === 'forward') {
    for (let i = items.length - 2; i >= 0; i--) {
      if (sel.has(items[i].id) && !sel.has(items[i + 1].id)) [items[i], items[i + 1]] = [items[i + 1], items[i]];
    }
  } else if (kind === 'backward') {
    for (let i = 1; i < items.length; i++) {
      if (sel.has(items[i].id) && !sel.has(items[i - 1].id)) [items[i], items[i - 1]] = [items[i - 1], items[i]];
    }
  }
  ui.refreshAll();
  commitNow();
}

function alignSelected(how) {
  const items = selectedItems().filter((it) => !it.locked);
  if (!items.length) return;
  const S = state.stage;
  const box = items.length === 1 ? { x0: 0, y0: 0, x1: S.w, y1: S.h } : groupAABB(items);
  for (const it of items) {
    const b = itemAABB(it);
    if (how === 'l') it.x += box.x0 - b.x0;
    if (how === 'r') it.x += box.x1 - b.x1;
    if (how === 'c') it.x += (box.x0 + box.x1) / 2 - (b.x0 + b.x1) / 2;
    if (how === 't') it.y += box.y0 - b.y0;
    if (how === 'b') it.y += box.y1 - b.y1;
    if (how === 'm') it.y += (box.y0 + box.y1) / 2 - (b.y0 + b.y1) / 2;
  }
  markDirty();
  ui.syncInspector();
  commitNow();
}

function distributeSelected(axis) {
  const items = selectedItems().filter((it) => !it.locked);
  if (items.length < 3) return;
  const k = axis === 'h' ? 'x' : 'y';
  items.sort((a, b) => a[k] - b[k]);
  const first = items[0][k], last = items[items.length - 1][k];
  items.forEach((it, i) => { it[k] = first + ((last - first) * i) / (items.length - 1); });
  markDirty();
  ui.syncInspector();
  commitNow();
}

/* ---------- Persistence ---------- */

const persist = {
  db: null,
  timer: 0,
  failedOnce: false,
  async open() {
    if (this.db) return this.db;
    if (!window.indexedDB) return null;
    this.db = await new Promise((resolve) => {
      try {
        const req = indexedDB.open('fireworks-studio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return this.db;
  },
  async get(key) {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  },
  async set(key, value) {
    const db = await this.open();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  },
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 700);
  },
  async saveNow() {
    clearTimeout(this.timer);
    const ok = await this.set('current', serializeProject());
    if (!ok && !this.failedOnce) {
      this.failedOnce = true;
      ui.toast('Autosave is unavailable in this browser window. Use File › Save show file to keep your work.', 'error', 6000);
    }
    ui.setSaved(ok);
  },
  saveFile() {
    const blob = new Blob([JSON.stringify(serializeProject())], { type: 'application/json' });
    downloadBlob(blob, `${slug(state.name)}.fireworks.json`);
    ui.toast('Saved show file');
  },
  async openFile(file) {
    try {
      const text = await readFileAs(file, 'text');
      const data = JSON.parse(text);
      await loadProject(data);
      ui.toast(`Opened “${state.name}”`);
    } catch (err) {
      ui.toast(err && err.userMessage ? err.userMessage : 'That file is not a Fireworks Studio show.', 'error');
    }
  },
};

function serializeProject() {
  const used = new Set(state.customAssets);
  return {
    format: 'fireworks-studio',
    version: 2,
    name: state.name,
    stage: state.stage,
    items: state.items,
    assets: [...used].map((id) => assets.get(id)).filter((a) => a && !a.builtin && a.status === 'ready')
      .map((a) => ({ id: a.id, name: a.name, kind: a.kind, src: a.src })),
    savedAt: new Date().toISOString(),
  };
}

async function loadProject(data, { resetHistory = true } = {}) {
  if (!data || data.format !== 'fireworks-studio' || !Array.isArray(data.items)) {
    const e = new Error('bad');
    e.userMessage = 'That file is not a Fireworks Studio show.';
    throw e;
  }
  const stage = normalizeStage(data.stage);
  const custom = [];
  const pending = [];
  for (const a of Array.isArray(data.assets) ? data.assets : []) {
    if (!a || typeof a.id !== 'string' || typeof a.src !== 'string' || !a.src.startsWith('data:')) continue;
    if (!assets.has(a.id)) pending.push(loadAsset({ id: a.id, name: a.name, kind: a.kind === 'image' ? 'image' : 'gif', src: a.src }));
    custom.push(a.id);
  }
  await Promise.all(pending);
  const seen = new Set();
  const items = [];
  for (const raw of data.items) {
    const it = normalizeItem(raw, stage);
    if (!it) continue;
    if (seen.has(it.id)) it.id = uid();
    seen.add(it.id);
    items.push(it);
  }
  state.name = typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 80) : 'Untitled show';
  state.stage = stage;
  state.items = items;
  state.customAssets = custom.filter((id) => assets.get(id)?.status === 'ready');
  state.sel.clear();
  state.t = 0;
  playback.prevT = -1e-4;
  if (resetHistory) history.reset();
  ui.refreshAll();
  ui.onAssetsChanged();
  persist.schedule();
}

/* ---------- Playback ---------- */

const playback = {
  prevT: 0,
  play() {
    if (state.exporting) return;
    if (state.t >= state.stage.duration - 0.001) state.t = 0;
    state.playing = true;
    this.prevT = state.t - 1e-4;
    if (audio.enabled) audio.ensure();
    ui.updateTransport();
  },
  pause() {
    state.playing = false;
    ui.updateTransport();
    markDirty();
  },
  toggle() { state.playing ? this.pause() : this.play(); },
  seek(t) {
    state.t = clamp(t, 0, state.stage.duration);
    this.prevT = state.t;
    markDirty();
    ui.updateTransport();
    ui.syncPlayhead();
  },
  step(dir) {
    this.pause();
    this.seek(Math.round((state.t + dir / 30) * 30) / 30);
  },
};

// Fire sounds for cues whose moment falls in (a, b].
function fireSounds(a, b) {
  if (!audio.ready()) return;
  const S = state.stage;
  for (const it of state.items) {
    if (!it.visible || !it.sound) continue;
    const pan = ((it.x / S.w) * 2 - 1) * 0.8;
    const size = clamp(it.w / S.h, 0.1, 1);
    if (it.type === 'burst') {
      const rise = riseTime(it, S.h);
      if (it.launch && it.start > a && it.start <= b) audio.launch(rise, pan);
      const bt = it.start + rise;
      if (bt > a && bt <= b) audio.boom(size, pan, it.shell === 'crackle' || it.shell === 'strobe');
    } else if (it.start > a && it.start <= b) {
      audio.boom(size * 0.8, pan, false);
    }
  }
}

/* ---------- Rendering ---------- */

const hasCanvasFilter = (() => {
  try {
    const c = document.createElement('canvas').getContext('2d');
    c.filter = 'hue-rotate(10deg)';
    return c.filter === 'hue-rotate(10deg)';
  } catch (e) {
    return false;
  }
})();

function renderScene(ctx, W, H, t, editor) {
  const S = state.stage;
  const s = W / S.w;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (hasCanvasFilter) ctx.filter = 'none';
  const bgAsset = S.bg.type === 'image' && S.bg.imageId ? assets.get(S.bg.imageId) : null;
  drawBackground(ctx, S.bg, W, H, t, bgAsset && bgAsset.status === 'ready' ? bgAsset.frames[0] : null);
  for (const it of state.items) {
    if (!it.visible || !isActive(it, t)) continue;
    if (it.type === 'burst') {
      drawBurst(ctx, it, t, s, S.h);
      continue;
    }
    const a = assets.get(it.assetId);
    ctx.save();
    ctx.translate(it.x * s, it.y * s);
    ctx.rotate((it.rot * Math.PI) / 180);
    ctx.scale(it.flipX ? -1 : 1, it.flipY ? -1 : 1);
    const w = it.w * s, hh = it.h * s;
    if (a && a.status === 'ready') {
      ctx.globalAlpha = it.opacity;
      ctx.globalCompositeOperation = it.blend || 'source-over';
      if (hasCanvasFilter && it.hue) ctx.filter = `hue-rotate(${it.hue}deg)`;
      ctx.drawImage(a.frames[spriteFrameIndex(a, it, t)], -w / 2, -hh / 2, w, hh);
    } else if (editor) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = a && a.status === 'loading' ? 'rgba(255,255,255,0.35)' : '#ff5a5f';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -hh / 2, w, hh);
      if (!a || a.status === 'error') {
        ctx.beginPath();
        ctx.moveTo(-w / 2, -hh / 2); ctx.lineTo(w / 2, hh / 2);
        ctx.moveTo(w / 2, -hh / 2); ctx.lineTo(-w / 2, hh / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (hasCanvasFilter) ctx.filter = 'none';
}

const view = {
  scene: null, sctx: null, overlay: null, octx: null, stageEl: null, wrap: null,
  cssW: 1, cssH: 1, dpr: 1, scale: 1,
  fit() {
    const S = state.stage;
    const r = this.wrap.getBoundingClientRect();
    const pad = r.width < 600 ? 12 : 28;
    const avW = Math.max(40, r.width - pad * 2), avH = Math.max(40, r.height - pad * 2);
    const sc = Math.min(avW / S.w, avH / S.h);
    this.cssW = Math.max(1, Math.floor(S.w * sc));
    this.cssH = Math.max(1, Math.floor(S.h * sc));
    this.scale = this.cssW / S.w;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.stageEl.style.width = this.cssW + 'px';
    this.stageEl.style.height = this.cssH + 'px';
    const sw = Math.min(S.w, Math.round(this.cssW * this.dpr));
    const shh = Math.round((sw * S.h) / S.w);
    if (this.scene.width !== sw || this.scene.height !== shh) { this.scene.width = sw; this.scene.height = shh; }
    const ow = Math.round(this.cssW * this.dpr), oh = Math.round(this.cssH * this.dpr);
    if (this.overlay.width !== ow || this.overlay.height !== oh) { this.overlay.width = ow; this.overlay.height = oh; }
    markDirty();
  },
  toStage(e) {
    const r = this.overlay.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * state.stage.w,
      y: ((e.clientY - r.top) / r.height) * state.stage.h,
    };
  },
};

/* ---------- Overlay (selection, guides, ghosts) ---------- */

const interact = {
  drag: null, hover: null, guides: [], marquee: null, pointer: null,
};

function drawOverlay() {
  const ctx = view.octx;
  const k = view.scale * view.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.overlay.width, view.overlay.height);
  if (state.exporting) return;
  const dpr = view.dpr;
  const accent = '#ffb547';
  const poly = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    ctx.closePath();
  };

  // Ghosts for cues that aren't on screen at this moment: a faint marker for
  // each, and a full outline with its time for the hovered or selected ones.
  if (state.ghosts && !state.playing) {
    ctx.save();
    ctx.lineWidth = 1 * dpr;
    ctx.font = `${10 * dpr}px "JetBrains Mono", ui-monospace, monospace`;
    for (const it of state.items) {
      if (!it.visible || isActive(it, state.t)) continue;
      const focus = state.sel.has(it.id) || interact.hover === it.id;
      const cx = it.x * k, cy = it.y * k;
      if (!focus) {
        ctx.strokeStyle = 'rgba(220,214,240,0.28)';
        ctx.setLineDash([]);
        const m = 5 * dpr;
        ctx.beginPath();
        ctx.moveTo(cx - m, cy); ctx.lineTo(cx + m, cy);
        ctx.moveTo(cx, cy - m); ctx.lineTo(cx, cy + m);
        ctx.stroke();
        continue;
      }
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeStyle = 'rgba(255,181,71,0.75)';
      if (it.type === 'burst') {
        ctx.beginPath();
        ctx.arc(cx, cy, (it.w / 2) * k * 0.7, 0, TAU);
        ctx.stroke();
      } else {
        poly(itemCorners(it));
        ctx.stroke();
      }
      const label = `${it.type === 'burst' ? 'bursts' : 'starts'} ${(it.type === 'burst' ? burstTime(it) : it.start).toFixed(2)}s`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(11,10,18,0.8)';
      ctx.fillRect(cx - tw / 2 - 4 * dpr, cy + 8 * dpr, tw + 8 * dpr, 15 * dpr);
      ctx.fillStyle = '#ffd59a';
      ctx.fillText(label, cx - tw / 2, cy + 19 * dpr);
    }
    ctx.restore();
  }

  // Hover outline.
  const hv = interact.hover && !interact.drag ? findItem(interact.hover) : null;
  if (hv && !state.sel.has(hv.id)) {
    ctx.strokeStyle = 'rgba(255,181,71,0.5)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([]);
    poly(itemCorners(hv));
    ctx.stroke();
  }

  // Selection.
  const sel = selectedItems();
  ctx.setLineDash([]);
  for (const it of sel) {
    ctx.strokeStyle = it.locked ? 'rgba(200,190,220,0.7)' : accent;
    ctx.lineWidth = 1.5 * dpr;
    poly(itemCorners(it));
    ctx.stroke();
  }
  if (sel.length > 1) {
    const b = groupAABB(sel);
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.strokeStyle = 'rgba(255,181,71,0.55)';
    ctx.strokeRect(b.x0 * k, b.y0 * k, (b.x1 - b.x0) * k, (b.y1 - b.y0) * k);
    ctx.setLineDash([]);
  }
  if (sel.length === 1 && !sel[0].locked) {
    const it = sel[0];
    const hs = handleGeometry(it);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(hs.topMid[0] * k, hs.topMid[1] * k);
    ctx.lineTo(hs.rot[0] * k, hs.rot[1] * k);
    ctx.stroke();
    ctx.fillStyle = '#16131f';
    for (const [x, y] of hs.corners) {
      ctx.beginPath();
      ctx.rect(x * k - 5 * dpr, y * k - 5 * dpr, 10 * dpr, 10 * dpr);
      ctx.fillStyle = '#fff7ea';
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(hs.rot[0] * k, hs.rot[1] * k, 6 * dpr, 0, TAU);
    ctx.fillStyle = accent;
    ctx.fill();
  }

  // Marquee.
  if (interact.marquee) {
    const m = interact.marquee;
    const x = Math.min(m.x0, m.x1) * k, y = Math.min(m.y0, m.y1) * k;
    const w = Math.abs(m.x1 - m.x0) * k, hh = Math.abs(m.y1 - m.y0) * k;
    ctx.fillStyle = 'rgba(255,181,71,0.08)';
    ctx.fillRect(x, y, w, hh);
    ctx.strokeStyle = 'rgba(255,181,71,0.7)';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(x, y, w, hh);
  }

  // Snap guides.
  if (interact.guides.length) {
    ctx.strokeStyle = '#ff5f8f';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([]);
    for (const g of interact.guides) {
      ctx.beginPath();
      if (g.x != null) { ctx.moveTo(g.x * k, 0); ctx.lineTo(g.x * k, view.overlay.height); }
      else { ctx.moveTo(0, g.y * k); ctx.lineTo(view.overlay.width, g.y * k); }
      ctx.stroke();
    }
  }

  // Fire tool aim.
  if (state.tool === 'fire' && interact.pointer && !interact.drag) {
    const p = interact.pointer;
    const pr = SHELL_PRESETS.find((x) => x.id === state.firePreset) || SHELL_PRESETS[0];
    const r = state.stage.h * 0.2 * k;
    ctx.strokeStyle = pr.color;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([3 * dpr, 5 * dpr]);
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(p.x * k, p.y * k, r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p.x * k - 8 * dpr, p.y * k); ctx.lineTo(p.x * k + 8 * dpr, p.y * k);
    ctx.moveTo(p.x * k, p.y * k - 8 * dpr); ctx.lineTo(p.x * k, p.y * k + 8 * dpr);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function handleGeometry(it) {
  const cs = itemCorners(it);
  const r = (it.rot * Math.PI) / 180;
  const up = [Math.sin(r), -Math.cos(r)];
  const topMid = [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2];
  const off = 26 / view.scale;
  return { corners: cs, topMid, rot: [topMid[0] + up[0] * off, topMid[1] + up[1] * off] };
}

/* ---------- Stage interaction ---------- */

function hitTest(p) {
  const order = [...state.items].reverse().filter((it) => it.visible && !it.locked);
  for (const it of order) if (isActive(it, state.t) && pointInItem(it, p.x, p.y)) return it;
  if (state.ghosts && !state.playing) {
    for (const it of order) if (pointInItem(it, p.x, p.y)) return it;
  }
  return null;
}

function hitHandle(it, p, touch) {
  const hs = handleGeometry(it);
  const rad = (touch ? 18 : 9) / view.scale;
  const d = (q) => Math.hypot(q[0] - p.x, q[1] - p.y);
  if (d(hs.rot) <= rad) return { kind: 'rotate' };
  const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < 4; i++) if (d(hs.corners[i]) <= rad) return { kind: 'resize', sx: signs[i][0], sy: signs[i][1] };
  return null;
}

function snapMove(dx, dy, startBox, ids, free) {
  interact.guides = [];
  if (!state.snap || free) return [dx, dy];
  const S = state.stage;
  const thr = 7 / view.scale;
  const tx = [0, S.w / 2, S.w], ty = [0, S.h / 2, S.h];
  for (const it of state.items) {
    if (ids.has(it.id) || !it.visible || !isActive(it, state.t)) continue;
    const b = itemAABB(it);
    tx.push(b.x0, (b.x0 + b.x1) / 2, b.x1);
    ty.push(b.y0, (b.y0 + b.y1) / 2, b.y1);
  }
  const bx = [startBox.x0 + dx, (startBox.x0 + startBox.x1) / 2 + dx, startBox.x1 + dx];
  const by = [startBox.y0 + dy, (startBox.y0 + startBox.y1) / 2 + dy, startBox.y1 + dy];
  let best = null;
  for (const t of tx) for (const v of bx) if (Math.abs(t - v) < thr && (!best || Math.abs(t - v) < Math.abs(best.d))) best = { d: t - v, x: t };
  if (best) { dx += best.d; interact.guides.push({ x: best.x }); }
  best = null;
  for (const t of ty) for (const v of by) if (Math.abs(t - v) < thr && (!best || Math.abs(t - v) < Math.abs(best.d))) best = { d: t - v, y: t };
  if (best) { dy += best.d; interact.guides.push({ y: best.y }); }
  return [dx, dy];
}

function stageCursor(p, touch) {
  if (state.tool === 'fire') return 'crosshair';
  const sel = selectedItems();
  if (sel.length === 1 && !sel[0].locked) {
    const hh = hitHandle(sel[0], p, touch);
    if (hh) {
      if (hh.kind === 'rotate') return 'grab';
      const ang = ((Math.atan2(hh.sy * sel[0].h, hh.sx * sel[0].w) * 180) / Math.PI + sel[0].rot + 360) % 180;
      return ang > 22 && ang < 68 ? 'nwse-resize' : ang > 112 && ang < 158 ? 'nesw-resize' : ang >= 68 && ang <= 112 ? 'ns-resize' : 'ew-resize';
    }
  }
  return hitTest(p) ? 'move' : 'default';
}

function bindStage() {
  const el = view.overlay;

  el.addEventListener('pointerdown', (e) => {
    if (state.exporting) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    audioUnlock();
    ui.closeMenus();
    el.focus({ preventScroll: true });
    const p = view.toStage(e);
    const touch = e.pointerType !== 'mouse';
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    if (state.tool === 'fire') {
      const it = addBurst(state.firePreset, p, state.t);
      if (state.playing && it.sound && audio.ready()) {
        const pan = ((it.x / state.stage.w) * 2 - 1) * 0.8;
        audio.launch(riseTime(it, state.stage.h), pan);
      }
      return;
    }

    const sel = selectedItems();
    if (sel.length === 1 && !sel[0].locked) {
      const hh = hitHandle(sel[0], p, touch);
      if (hh) {
        const it = sel[0];
        interact.drag = { kind: hh.kind, id: it.id, sx: hh.sx, sy: hh.sy, orig: { ...it }, p0: p, moved: false };
        return;
      }
    }
    const hit = hitTest(p);
    if (hit) {
      let deferSelect = false;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (state.sel.has(hit.id)) state.sel.delete(hit.id);
        else state.sel.add(hit.id);
      } else if (!state.sel.has(hit.id)) {
        state.sel = new Set([hit.id]);
      } else {
        deferSelect = true;
      }
      const moving = selectedItems().filter((it) => !it.locked);
      interact.drag = {
        kind: 'move', p0: p, moved: false, deferSelect, hitId: hit.id,
        origs: new Map(moving.map((it) => [it.id, { x: it.x, y: it.y }])),
        box: moving.length ? groupAABB(moving) : null,
      };
      ui.onSelectionChanged();
    } else {
      if (!(e.shiftKey || e.metaKey || e.ctrlKey) && state.sel.size) {
        state.sel.clear();
        ui.onSelectionChanged();
      }
      interact.drag = { kind: 'marquee', p0: p, base: new Set(state.sel), moved: false };
      interact.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }
    dirty.overlay = true;
  });

  el.addEventListener('pointermove', (e) => {
    const p = view.toStage(e);
    interact.pointer = p;
    const d = interact.drag;
    if (!d) {
      const hit = state.tool === 'select' ? hitTest(p) : null;
      const hid = hit ? hit.id : null;
      if (hid !== interact.hover) interact.hover = hid;
      el.style.cursor = stageCursor(p, e.pointerType !== 'mouse');
      dirty.overlay = true;
      return;
    }
    const dist = Math.hypot(p.x - d.p0.x, p.y - d.p0.y) * view.scale;
    if (!d.moved && dist < 3) return;
    d.moved = true;
    if (d.kind === 'move') {
      if (!d.box) return;
      let dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      [dx, dy] = snapMove(dx, dy, d.box, new Set(d.origs.keys()), e.altKey);
      for (const [id, o] of d.origs) {
        const it = findItem(id);
        if (it) { it.x = o.x + dx; it.y = o.y + dy; }
      }
    } else if (d.kind === 'resize') {
      resizeDrag(d, p, e.shiftKey, e.altKey);
    } else if (d.kind === 'rotate') {
      const it = findItem(d.id);
      if (it) {
        let ang = (Math.atan2(p.y - it.y, p.x - it.x) * 180) / Math.PI + 90;
        if (e.shiftKey) ang = Math.round(ang / 15) * 15;
        ang = ((ang + 540) % 360) - 180;
        it.rot = Math.round(ang * 10) / 10;
      }
    } else if (d.kind === 'marquee') {
      const m = interact.marquee;
      m.x1 = p.x; m.y1 = p.y;
      const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
      const next = new Set(d.base);
      for (const it of state.items) {
        if (!it.visible || it.locked) continue;
        if (!isActive(it, state.t) && !(state.ghosts && !state.playing)) continue;
        const b = itemAABB(it);
        if (b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1) next.add(it.id);
      }
      state.sel = next;
      ui.onSelectionChanged();
    }
    markDirty();
    ui.syncInspector();
  });

  const end = (e) => {
    const d = interact.drag;
    if (!d) return;
    interact.drag = null;
    interact.guides = [];
    interact.marquee = null;
    try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (d.kind === 'move' && !d.moved && d.deferSelect) {
      state.sel = new Set([d.hitId]);
      ui.onSelectionChanged();
    }
    if (d.moved && d.kind !== 'marquee') {
      commitNow();
      ui.refreshTimeline();
    }
    markDirty();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', () => { interact.pointer = null; interact.hover = null; dirty.overlay = true; });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.exporting) return;
    const p = view.toStage(e);
    const hit = hitTest(p);
    if (hit && !state.sel.has(hit.id)) { state.sel = new Set([hit.id]); ui.onSelectionChanged(); }
    if (!hit && state.sel.size) { state.sel.clear(); ui.onSelectionChanged(); }
    ui.contextMenu(e.clientX, e.clientY, !!hit, p);
  });
  el.addEventListener('dblclick', (e) => {
    if (state.tool !== 'select') return;
    const hit = hitTest(view.toStage(e));
    if (hit && !isActive(hit, state.t)) playback.seek(hit.type === 'burst' ? burstTime(hit) + 0.35 : hit.start);
  });

  // Drag and drop from the library and from the desktop.
  const stageArea = $('#stageArea');
  stageArea.addEventListener('dragover', (e) => {
    if (state.exporting) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    stageArea.classList.add('dropping');
  });
  stageArea.addEventListener('dragleave', (e) => {
    if (!stageArea.contains(e.relatedTarget)) stageArea.classList.remove('dropping');
  });
  stageArea.addEventListener('drop', (e) => {
    e.preventDefault();
    stageArea.classList.remove('dropping');
    if (state.exporting) return;
    const r = view.overlay.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const p = inside ? view.toStage(e) : null;
    const payload = e.dataTransfer.getData('application/x-fireworks');
    if (payload) {
      try {
        const d = JSON.parse(payload);
        if (d.kind === 'shell') addBurst(d.id, p, state.t);
        else if (d.kind === 'asset') addSprite(d.id, p);
      } catch (err) { /* ignore malformed drag data */ }
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length) importFiles(e.dataTransfer.files, p);
  });
}

function resizeDrag(d, p, free, fromCenter) {
  const it = findItem(d.id);
  if (!it) return;
  const o = d.orig;
  const r = (o.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const toLocal = (x, y) => [x * c + y * s, -x * s + y * c];
  const toWorld = (x, y) => [x * c - y * s, x * s + y * c];
  const uniform = it.type === 'burst' || !free;
  const minS = 16;
  let nw, nh;
  if (fromCenter) {
    const [lx, ly] = toLocal(p.x - o.x, p.y - o.y);
    nw = Math.abs(lx) * 2; nh = Math.abs(ly) * 2;
    if (uniform) {
      const k = Math.max(nw / o.w, nh / o.h);
      nw = o.w * k; nh = o.h * k;
    }
    nw = Math.max(minS, nw); nh = Math.max(minS, nh);
    it.w = nw; it.h = nh; it.x = o.x; it.y = o.y;
  } else {
    const [ax, ay] = toWorld(-d.sx * o.w / 2, -d.sy * o.h / 2);
    const anchor = [o.x + ax, o.y + ay];
    const [vx, vy] = toLocal(p.x - anchor[0], p.y - anchor[1]);
    if (uniform) {
      const k = (vx * d.sx * o.w + vy * d.sy * o.h) / (o.w * o.w + o.h * o.h);
      const kk = Math.max(minS / Math.min(o.w, o.h), k);
      nw = o.w * kk; nh = o.h * kk;
    } else {
      nw = Math.max(minS, vx * d.sx); nh = Math.max(minS, vy * d.sy);
    }
    const [cx, cy] = toWorld(d.sx * nw / 2, d.sy * nh / 2);
    it.w = nw; it.h = nh; it.x = anchor[0] + cx; it.y = anchor[1] + cy;
  }
  if (it.type === 'burst') it.h = it.w;
  it.w = Math.round(it.w * 10) / 10;
  it.h = Math.round(it.h * 10) / 10;
}

function audioUnlock() {
  if (audio.enabled) audio.ensure();
}

/* ---------- Main loop ---------- */

let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - (lastFrame || now)) / 1000));
  lastFrame = now;
  if (state.exporting) return;
  if (state.playing) {
    const D = state.stage.duration;
    let nt = state.t + dt;
    if (nt >= D) {
      if (state.loop) {
        fireSounds(playback.prevT, D);
        nt = nt - D;
        if (nt >= D) nt = 0;
        playback.prevT = -1e-4;
      } else {
        nt = D;
        state.playing = false;
        ui.updateTransport();
      }
    }
    fireSounds(playback.prevT, nt);
    playback.prevT = nt;
    state.t = nt;
    markDirty();
    ui.syncPlayhead();
  }
  if (dirty.scene) {
    renderScene(view.sctx, view.scene.width, view.scene.height, state.t, true);
    dirty.scene = false;
  }
  if (dirty.overlay) {
    drawOverlay();
    dirty.overlay = false;
  }
}
