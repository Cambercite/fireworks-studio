/* ==========================================================================
   UI: header, library, inspector, timeline, transport, modals, export, boot.
   ========================================================================== */

const ui = {
  /* ---------- Toasts ---------- */
  toast(msg, kind = 'info', ms = 3200) {
    const host = $('#toasts');
    if (!host) return;
    while (host.children.length > 3) host.firstChild.remove();
    const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
    host.append(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 300);
    }, ms);
  },

  setSaved(ok) {
    const el = $('#saveState');
    if (!el) return;
    el.textContent = ok ? 'Saved in this browser' : 'Not saved';
    el.classList.toggle('bad', !ok);
  },

  updateUndo() {
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.disabled = !history.canUndo();
    if (r) r.disabled = !history.canRedo();
  },

  refreshAll() {
    const S = state.stage;
    if (view.lastW !== S.w || view.lastH !== S.h) {
      view.lastW = S.w; view.lastH = S.h;
      view.fit();
    }
    $('#projectName').value = state.name;
    this.buildInspector();
    this.refreshTimeline();
    this.updateTransport();
    this.updateUndo();
    this.updateToolButtons();
    markDirty();
  },

  onSelectionChanged() {
    this.buildInspector();
    this.markTimelineSelection();
    dirty.overlay = true;
  },

  onAssetsChanged() {
    this.buildUploads();
    this.refreshTimeline();
    if (!state.sel.size) this.buildInspector();
  },

  closeMenus() {
    document.querySelectorAll('.menu-pop.open').forEach((m) => m.classList.remove('open'));
    document.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    const cm = $('#ctxMenu');
    if (cm) cm.hidden = true;
  },
};

/* ---------- Static chrome ---------- */

function setIconButton(btn, name, size = 16) {
  btn.prepend(icon(name, size));
}

function buildChrome() {
  document.querySelectorAll('[data-icon]').forEach((b) => setIconButton(b, b.dataset.icon, +b.dataset.size || 16));

  $('#projectName').addEventListener('input', (e) => {
    state.name = e.target.value.slice(0, 80) || 'Untitled show';
    persist.schedule();
  });
  $('#projectName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

  $('#btnUndo').addEventListener('click', () => history.undo());
  $('#btnRedo').addEventListener('click', () => history.redo());
  $('#btnHelp').addEventListener('click', openHelp);
  $('#btnExport').addEventListener('click', openExport);

  // File menu.
  const fileBtn = $('#btnFile'), fileMenu = $('#fileMenu');
  fileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !fileMenu.classList.contains('open');
    ui.closeMenus();
    fileMenu.classList.toggle('open', open);
    fileBtn.setAttribute('aria-expanded', String(open));
    if (open) fileMenu.querySelector('button')?.focus();
  });
  fileMenu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    ui.closeMenus();
    fileAction(b.dataset.act);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.menu') && !e.target.closest('#ctxMenu')) ui.closeMenus();
    if (window.matchMedia('(max-width: 960px)').matches && !e.target.closest('.panel') && !e.target.closest('.drawer-toggle')) {
      document.querySelectorAll('.panel.open').forEach((p) => p.classList.remove('open'));
    }
  });

  $('#fileInput').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length) importFiles(files);
    e.target.value = '';
  });
  $('#projectInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) persist.openFile(f);
    e.target.value = '';
  });
  $('#bgInput').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { ui.toast('Choose a PNG, JPG, WebP or GIF image for the background.', 'error'); return; }
    if (f.size > MAX_IMPORT_BYTES) { ui.toast('That image is over 40 MB. Use a smaller one.', 'error'); return; }
    const src = await readFileAs(f, 'dataurl');
    const id = uid('u');
    const a = await loadAsset({ id, name: f.name.replace(/\.[^.]+$/, '').slice(0, 40), kind: 'image', src });
    if (a.status !== 'ready') { assets.delete(id); ui.toast(a.error, 'error'); return; }
    state.customAssets.push(id);
    state.stage.bg.imageId = id;
    state.stage.bg.type = 'image';
    ui.refreshAll();
    ui.onAssetsChanged();
    commitNow();
  });

  // Drawer toggles on narrow screens.
  $('#btnLib').addEventListener('click', () => togglePanel('#library'));
  $('#btnInsp').addEventListener('click', () => togglePanel('#inspector'));

  // Stage tools.
  $('#toolSelect').addEventListener('click', () => setTool('select'));
  $('#toolFire').addEventListener('click', () => setTool('fire'));
  $('#toggleSnap').addEventListener('click', () => { state.snap = !state.snap; prefs.set('snap', state.snap); ui.updateToolButtons(); });
  $('#toggleGhosts').addEventListener('click', () => { state.ghosts = !state.ghosts; prefs.set('ghosts', state.ghosts); ui.updateToolButtons(); dirty.overlay = true; });

  // Library drop zone for files.
  const lib = $('#library');
  lib.addEventListener('dragover', (e) => {
    if (![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault();
    lib.classList.add('dropping');
  });
  lib.addEventListener('dragleave', (e) => { if (!lib.contains(e.relatedTarget)) lib.classList.remove('dropping'); });
  lib.addEventListener('drop', (e) => {
    lib.classList.remove('dropping');
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    importFiles(e.dataTransfer.files);
  });
  $('#btnImport').addEventListener('click', () => $('#fileInput').click());

  // Keep the page from navigating away when a file misses a drop zone.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

function togglePanel(sel) {
  const p = $(sel);
  const open = !p.classList.contains('open');
  document.querySelectorAll('.panel.open').forEach((x) => x.classList.remove('open'));
  p.classList.toggle('open', open);
}
function closeDrawers() {
  document.querySelectorAll('.panel.open').forEach((x) => x.classList.remove('open'));
}

function setTool(tool) {
  state.tool = tool;
  ui.updateToolButtons();
  view.overlay.style.cursor = tool === 'fire' ? 'crosshair' : 'default';
  dirty.overlay = true;
}

ui.updateToolButtons = function () {
  $('#toolSelect').classList.toggle('on', state.tool === 'select');
  $('#toolSelect').setAttribute('aria-pressed', String(state.tool === 'select'));
  $('#toolFire').classList.toggle('on', state.tool === 'fire');
  $('#toolFire').setAttribute('aria-pressed', String(state.tool === 'fire'));
  $('#toggleSnap').classList.toggle('on', state.snap);
  $('#toggleSnap').setAttribute('aria-pressed', String(state.snap));
  $('#toggleGhosts').classList.toggle('on', state.ghosts);
  $('#toggleGhosts').setAttribute('aria-pressed', String(state.ghosts));
  const hint = $('#fireHint');
  if (state.tool === 'fire') {
    const pr = SHELL_PRESETS.find((p) => p.id === state.firePreset) || SHELL_PRESETS[0];
    hint.hidden = false;
    hint.replaceChildren(
      h('span', { class: 'swatch', style: { background: pr.color } }),
      h('span', null, `Click the sky to fire `, h('b', null, pr.name), ` at ${fmtTime(state.t)}. Keep playing to fire live.`),
    );
  } else {
    hint.hidden = true;
  }
  document.querySelectorAll('.lib-card[data-shell]').forEach((c) => c.classList.toggle('armed', state.tool === 'fire' && c.dataset.shell === state.firePreset));
};

async function fileAction(act) {
  if (act === 'new') {
    const ok = await confirmModal('Start a new show?', 'This clears the stage and timeline. Your uploads stay in the library. Save a show file first if you want to keep this one.', 'Start new show', true);
    if (!ok) return;
    const keep = state.customAssets.map((id) => assets.get(id)).filter(Boolean).map((a) => ({ id: a.id, name: a.name, kind: a.kind, src: a.src }));
    await loadProject({ format: 'fireworks-studio', version: 2, name: 'Untitled show', stage: defaultStage(), items: [], assets: keep });
    state.playing = false;
    ui.updateTransport();
    ui.toast('New show ready. Drag a shell onto the sky to begin.');
  } else if (act === 'open') {
    $('#projectInput').click();
  } else if (act === 'save') {
    persist.saveFile();
  } else if (act === 'import') {
    $('#fileInput').click();
  } else if (act === 'sample') {
    const ok = await confirmModal('Load the sample show?', 'This replaces the current show with the sample. Save a show file first if you want to keep this one.', 'Load sample', false);
    if (!ok) return;
    await loadProject(demoProject());
    playback.play();
  } else if (act === 'png') {
    exportPng();
  }
}

/* ---------- Library ---------- */

function buildLibrary() {
  const shells = $('#libShells');
  shells.replaceChildren();
  SHELL_PRESETS.forEach((pr, i) => {
    const c = h('canvas', { width: 160, height: 120, class: 'thumb' });
    const card = h('button', {
      class: 'lib-card', draggable: 'true', 'data-shell': pr.id, type: 'button',
      title: `${pr.name}. Click to add at the playhead, or drag onto the sky.${i < 10 ? ` Fire tool key: ${(i + 1) % 10}` : ''}`,
    }, c, h('span', { class: 'lib-name' }, pr.name));
    drawShellThumb(c, pr, null);
    let raf = 0, t0 = 0;
    const animate = (now) => {
      if (!t0) t0 = now;
      const m = burstModel(thumbItem(pr));
      const tt = ((now - t0) / 1000) % (m.maxLife + 0.3);
      drawShellThumb(c, pr, tt);
      raf = requestAnimationFrame(animate);
    };
    card.addEventListener('pointerenter', () => { if (!raf && !matchMedia('(prefers-reduced-motion: reduce)').matches) { t0 = 0; raf = requestAnimationFrame(animate); } });
    card.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); raf = 0; drawShellThumb(c, pr, null); });
    card.addEventListener('click', () => {
      state.firePreset = pr.id;
      if (state.tool === 'fire') { ui.updateToolButtons(); ui.toast(`Fire tool loaded with ${pr.name}`); return; }
      addBurst(pr.id, null, state.t);
      ui.updateToolButtons();
      closeDrawers();
    });
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/x-fireworks', JSON.stringify({ kind: 'shell', id: pr.id }));
      e.dataTransfer.setData('text/plain', pr.name);
    });
    shells.append(card);
  });

  const gifs = $('#libGifs');
  gifs.replaceChildren();
  for (const g of BUILTIN_GIFS) gifs.append(assetCard(g.id, g.name, g.src, false));
  ui.buildUploads();
}

function thumbItem(pr) {
  return { type: 'burst', shell: pr.shell, color: pr.color, color2: pr.color2, colorMode: pr.colorMode, x: 80, y: 58, w: 96, h: 96, rot: 0, start: 0, launch: false, seed: 4242, count: SHELLS[pr.shell].count, opacity: 1, blend: 'lighter' };
}

function drawShellThumb(c, pr, t) {
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#06071a');
  grad.addColorStop(1, '#1d1030');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  const it = thumbItem(pr);
  const m = burstModel(it);
  drawBurst(g, it, t == null ? Math.min(0.75, m.maxLife * 0.42) : t, 1, 120);
}

function assetCard(id, name, src, removable) {
  const img = h('img', { src, alt: '', class: 'thumb', draggable: 'false', loading: 'lazy' });
  const card = h('button', { class: 'lib-card', draggable: 'true', type: 'button', 'data-asset': id, title: `${name}. Click to add, or drag onto the sky.` },
    img, h('span', { class: 'lib-name' }, name));
  card.addEventListener('click', () => { addSprite(id, null); closeDrawers(); });
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-fireworks', JSON.stringify({ kind: 'asset', id }));
    e.dataTransfer.setData('text/plain', name);
  });
  if (!removable) return card;
  const wrap = h('div', { class: 'lib-card-wrap' }, card);
  const rm = h('button', { class: 'lib-remove', type: 'button', 'aria-label': `Remove ${name} from uploads`, title: 'Remove from uploads' });
  rm.append(icon('x', 12));
  rm.addEventListener('click', async (e) => {
    e.stopPropagation();
    const uses = state.items.filter((it) => it.type === 'sprite' && it.assetId === id).length + (state.stage.bg.imageId === id ? 1 : 0);
    if (uses) {
      const ok = await confirmModal(`Remove “${name}”?`, `It's used ${uses === 1 ? 'once' : `${uses} times`} in this show. Removing it also removes those cues.`, 'Remove', true);
      if (!ok) return;
    }
    const removed = removeAsset(id);
    ui.toast(removed ? `Removed ${name} and ${removed} cue${removed === 1 ? '' : 's'}` : `Removed ${name}`);
  });
  wrap.append(rm);
  return wrap;
}

ui.buildUploads = function () {
  const host = $('#libUploads');
  if (!host) return;
  host.replaceChildren();
  const ids = state.customAssets.filter((id) => assets.get(id)?.status === 'ready');
  for (const id of ids) {
    const a = assets.get(id);
    host.append(assetCard(id, a.name, a.src, true));
  }
  $('#uploadsEmpty').hidden = ids.length > 0;
};

/* ---------- Inspector ---------- */

const insp = { fields: [] };

function live() {
  markDirty();
  ui.updateTimelineBars();
}

function fieldRow(label, control, opts = {}) {
  const id = control.id || (control.querySelector && control.querySelector('input,select')?.id);
  const lab = h('label', { class: 'f-label' + (opts.scrub ? ' scrub' : ''), for: id || null }, label);
  return [h('div', { class: 'f-row' + (opts.wide ? ' wide' : '') }, lab, control), lab];
}

let fieldSeq = 0;
function numberField(label, get, set, o = {}) {
  const id = `f-${++fieldSeq}`;
  const input = h('input', { type: 'number', id, step: o.step ?? 1, min: o.min, max: o.max, inputmode: 'decimal', class: 'f-num' });
  const fmt = (v) => (o.decimals != null ? (+v).toFixed(o.decimals) : String(Math.round(v * 100) / 100));
  const read = () => { input.value = fmt(get()); };
  read();
  const apply = (v, commit) => {
    if (!isFinite(v)) return;
    v = clamp(v, o.min ?? -Infinity, o.max ?? Infinity);
    set(v);
    live();
    if (commit) commitNow();
  };
  input.addEventListener('input', () => { if (!o.lazy && input.value !== '') apply(parseFloat(input.value), false); });
  input.addEventListener('change', () => { if (input.value === '') read(); else apply(parseFloat(input.value), true); read(); syncInspector(); });
  const ctl = h('div', { class: 'f-numwrap' }, input, o.unit ? h('span', { class: 'f-unit' }, o.unit) : null);
  const [row, lab] = fieldRow(label, ctl, { scrub: true });
  // Drag the label to scrub the value.
  lab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || o.lazy) return;
    e.preventDefault();
    const startX = e.clientX, v0 = get();
    let moved = false;
    lab.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 2) moved = true;
      const stepv = (o.scrubStep ?? o.step ?? 1) * (ev.shiftKey ? 10 : 1);
      apply(v0 + Math.round(dx / 2) * stepv, false);
      read();
    };
    const up = () => {
      lab.removeEventListener('pointermove', move);
      lab.removeEventListener('pointerup', up);
      lab.removeEventListener('pointercancel', up);
      if (moved) { commitNow(); syncInspector(); } else input.focus();
    };
    lab.addEventListener('pointermove', move);
    lab.addEventListener('pointerup', up);
    lab.addEventListener('pointercancel', up);
  });
  insp.fields.push({ el: input, read });
  return row;
}

function rangeField(label, get, set, o = {}) {
  const id = `f-${++fieldSeq}`;
  const input = h('input', { type: 'range', id, min: o.min, max: o.max, step: o.step ?? 1, class: 'f-range' });
  const out = h('output', { class: 'f-out', for: id });
  const show = (v) => { out.textContent = o.format ? o.format(v) : String(v); };
  const read = () => { input.value = get(); show(get()); };
  read();
  input.addEventListener('input', () => { set(parseFloat(input.value)); show(parseFloat(input.value)); live(); });
  input.addEventListener('change', () => { commitNow(); syncInspector(); });
  const [row] = fieldRow(label, h('div', { class: 'f-rangewrap' }, input, out));
  insp.fields.push({ el: input, read });
  return row;
}

function selectField(label, options, get, set, o = {}) {
  const id = `f-${++fieldSeq}`;
  const sel = h('select', { id, class: 'f-select' }, options.map(([v, l]) => h('option', { value: v }, l)));
  const read = () => { sel.value = get(); };
  read();
  sel.addEventListener('change', () => {
    set(sel.value);
    live();
    commitNow();
    if (o.rebuild) ui.buildInspector();
    else syncInspector();
  });
  const [row] = fieldRow(label, sel);
  insp.fields.push({ el: sel, read });
  return row;
}

function colorField(label, get, set) {
  const id = `f-${++fieldSeq}`;
  const input = h('input', { type: 'color', id, class: 'f-color' });
  const txt = h('span', { class: 'f-hex' });
  const read = () => { input.value = get(); txt.textContent = get().toUpperCase(); };
  read();
  input.addEventListener('input', () => { set(input.value.toLowerCase()); txt.textContent = input.value.toUpperCase(); live(); });
  input.addEventListener('change', () => { commitNow(); ui.refreshTimeline(); });
  const [row] = fieldRow(label, h('div', { class: 'f-colorwrap' }, input, txt));
  insp.fields.push({ el: input, read });
  return row;
}

function toggleField(label, get, set, o = {}) {
  const id = `f-${++fieldSeq}`;
  const input = h('input', { type: 'checkbox', id, class: 'f-check', role: 'switch' });
  const read = () => { input.checked = !!get(); };
  read();
  input.addEventListener('change', () => {
    set(input.checked);
    live();
    commitNow();
    if (o.rebuild) ui.buildInspector();
  });
  const [row] = fieldRow(label, h('div', { class: 'f-switchwrap' }, input, h('span', { class: 'f-switch', 'aria-hidden': 'true' })));
  insp.fields.push({ el: input, read });
  return row;
}

function btn(label, onClick, o = {}) {
  const b = h('button', { type: 'button', class: `btn ${o.kind || ''} ${o.iconOnly ? 'icon-only' : ''}`.trim(), title: o.title || (o.iconOnly ? label : null), 'aria-label': o.iconOnly ? label : null, disabled: o.disabled });
  if (o.icon) b.append(icon(o.icon, 15));
  if (!o.iconOnly) b.append(h('span', null, label));
  b.addEventListener('click', onClick);
  return b;
}

function section(title, ...kids) {
  return h('section', { class: 'i-sec' }, h('h3', { class: 'i-title' }, title), ...kids);
}

function syncInspector() {
  for (const f of insp.fields) {
    if (document.activeElement === f.el) continue;
    try { f.read(); } catch (e) { /* item removed */ }
  }
  ui.updateTimelineBars();
}
ui.syncInspector = syncInspector;

ui.buildInspector = function () {
  const host = $('#inspectorBody');
  if (!host) return;
  insp.fields = [];
  const items = selectedItems();
  let content;
  if (!items.length) content = showSettings();
  else if (items.length === 1) content = items[0].type === 'burst' ? burstInspector(items[0]) : spriteInspector(items[0]);
  else content = multiInspector(items);
  host.replaceChildren(...[content].flat());
  $('#inspectorTitle').textContent = !items.length ? 'Show settings' : items.length === 1 ? (items[0].type === 'burst' ? 'Shell cue' : 'GIF cue') : `${items.length} cues`;
};

function nameField(it) {
  const input = h('input', { type: 'text', class: 'i-name', value: it.name, maxlength: 80, 'aria-label': 'Cue name', id: 'cueName' });
  input.addEventListener('input', () => { it.name = input.value; ui.updateTimelineLabels(); });
  input.addEventListener('change', () => { if (!input.value.trim()) { it.name = it.type === 'burst' ? SHELLS[it.shell].label : 'GIF'; input.value = it.name; } commitNow(); ui.refreshTimeline(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  return input;
}

function layerSection(it) {
  return section('Layer',
    h('div', { class: 'btn-row' },
      btn('Bring forward', () => reorder('forward'), { icon: 'front', iconOnly: true, title: 'Bring forward  ]' }),
      btn('Send backward', () => reorder('backward'), { icon: 'back', iconOnly: true, title: 'Send backward  [' }),
      btn('Bring to front', () => reorder('front'), { icon: 'toFront', iconOnly: true, title: 'Bring to front  Shift+]' }),
      btn('Send to back', () => reorder('back'), { icon: 'toBack', iconOnly: true, title: 'Send to back  Shift+[' }),
      btn('Duplicate', duplicateSelected, { icon: 'copy', iconOnly: true, title: 'Duplicate  Ctrl+D' }),
    ),
    h('div', { class: 'btn-row' },
      btn(it.locked ? 'Unlock' : 'Lock', () => { it.locked = !it.locked; commitNow(); ui.refreshAll(); }, { icon: it.locked ? 'unlock' : 'lock' }),
      btn(it.visible ? 'Hide' : 'Show', () => { it.visible = !it.visible; commitNow(); ui.refreshAll(); }, { icon: it.visible ? 'eyeOff' : 'eye' }),
      btn('Delete', deleteSelected, { icon: 'trash', kind: 'danger' }),
    ),
  );
}

function positionFields(it, opts = {}) {
  const S = state.stage;
  const rows = [
    h('div', { class: 'f-grid2' },
      numberField(opts.xLabel || 'X', () => it.x, (v) => { it.x = v; }, { step: 1, min: -S.w, max: S.w * 2 }),
      numberField(opts.yLabel || 'Y', () => it.y, (v) => { it.y = v; }, { step: 1, min: -S.h, max: S.h * 2 }),
    ),
  ];
  return rows;
}

function spriteInspector(it) {
  const a = assets.get(it.assetId);
  const S = state.stage;
  let keepAspect = true;
  const ratio = () => it.w / it.h;
  const info = a ? (a.status === 'ready'
    ? (a.frames.length > 1 ? `${a.width} × ${a.height} px · ${a.frames.length} frames · ${(a.duration / 1000).toFixed(2)} s loop` : `${a.width} × ${a.height} px still image`)
    : a.status === 'loading' ? 'Loading…' : a.error) : 'This image is missing from the show file.';
  const isAnim = a && a.frames.length > 1;
  return [
    h('div', { class: 'i-head' }, nameField(it), h('p', { class: 'i-meta' }, info)),
    section('Position and size',
      ...positionFields(it),
      h('div', { class: 'f-grid2' },
        numberField('W', () => it.w, (v) => { const r = ratio(); it.w = Math.max(8, v); if (keepAspect) it.h = Math.max(8, it.w / r); }, { min: 8, max: 8000 }),
        numberField('H', () => it.h, (v) => { const r = ratio(); it.h = Math.max(8, v); if (keepAspect) it.w = Math.max(8, it.h * r); }, { min: 8, max: 8000 }),
      ),
      toggleField('Keep aspect ratio', () => keepAspect, (v) => { keepAspect = v; }),
      numberField('Rotation', () => it.rot, (v) => { it.rot = v; }, { min: -360, max: 360, step: 1, unit: '°' }),
      h('div', { class: 'btn-row' },
        btn('Flip horizontally', () => { it.flipX = !it.flipX; live(); commitNow(); }, { icon: 'flipH', iconOnly: true }),
        btn('Flip vertically', () => { it.flipY = !it.flipY; live(); commitNow(); }, { icon: 'flipV', iconOnly: true }),
        btn('Centre horizontally on stage', () => alignSelected('c'), { icon: 'alignC', iconOnly: true }),
        btn('Centre vertically on stage', () => alignSelected('m'), { icon: 'alignM', iconOnly: true }),
        btn('Natural size', () => {
          if (!a) return;
          const [w, hh] = spriteSize(a);
          it.w = w; it.h = hh; live(); commitNow(); syncInspector();
        }, { icon: 'fit', iconOnly: true, title: 'Reset to default size' }),
      ),
    ),
    section('Look',
      rangeField('Opacity', () => Math.round(it.opacity * 100), (v) => { it.opacity = v / 100; }, { min: 0, max: 100, format: (v) => `${v}%` }),
      selectField('Blend', BLEND_MODES, () => it.blend, (v) => { it.blend = v; }),
      hasCanvasFilter
        ? rangeField('Hue shift', () => it.hue, (v) => { it.hue = v; }, { min: -180, max: 180, format: (v) => `${v}°` })
        : h('p', { class: 'i-note' }, 'Hue shift needs a newer browser.'),
    ),
    section('Timing',
      numberField('Starts at', () => it.start, (v) => { it.start = v; }, { min: 0, max: S.duration, step: 0.05, scrubStep: 0.05, unit: 's', decimals: 2 }),
      isAnim ? selectField('Playback', [['loop', 'Loop'], ['once', 'Play once'], ['hold', 'Play once, hold last frame']], () => it.mode, (v) => { it.mode = v; }) : null,
      numberField('Length', () => it.len, (v) => { it.len = v; }, { min: 0, max: MAX_DURATION, step: 0.1, scrubStep: 0.05, unit: 's', decimals: 2 }),
      h('p', { class: 'i-note' }, 'Length 0 keeps the GIF on screen until the show ends.'),
      isAnim ? rangeField('Speed', () => it.speed, (v) => { it.speed = v; }, { min: 0.1, max: 4, step: 0.05, format: (v) => `${(+v).toFixed(2)}×` }) : null,
      toggleField('Boom when it appears', () => it.sound, (v) => { it.sound = v; }),
    ),
    layerSection(it),
  ];
}

function caliber(it) {
  const inches = clamp(Math.round(2 + (it.w / state.stage.h) * 12), 2, 16);
  return `≈ ${inches}-inch shell`;
}

function burstInspector(it) {
  const S = state.stage;
  const calEl = h('span', { class: 'i-cal' }, caliber(it));
  const shellOptions = Object.entries(SHELLS).map(([k, d]) => [k, d.label]);
  return [
    h('div', { class: 'i-head' }, nameField(it), h('p', { class: 'i-meta' }, `${SHELLS[it.shell].label} shell · bursts at ${burstTime(it).toFixed(2)} s`)),
    section('Shell',
      selectField('Type', shellOptions, () => it.shell, (v) => {
        const oldLabel = SHELLS[it.shell].label;
        it.shell = v;
        it.count = SHELLS[v].count;
        if (!it.name || it.name === oldLabel) it.name = SHELLS[v].label;
      }, { rebuild: true }),
      colorField('Colour', () => it.color, (v) => { it.color = v; }),
      selectField('Colour mode', [['single', 'Single colour'], ['fade', 'Fade to second colour'], ['mix', 'Mix both colours']], () => it.colorMode, (v) => { it.colorMode = v; }, { rebuild: true }),
      it.colorMode !== 'single' ? colorField('Second colour', () => it.color2, (v) => { it.color2 = v; }) : null,
      rangeField('Stars', () => it.count, (v) => { it.count = Math.round(v); }, { min: 4, max: 300, step: 1 }),
      h('div', { class: 'btn-row' }, btn('New random pattern', () => { it.seed = ((Math.random() * 1e9) | 0) || 1; live(); commitNow(); }, { icon: 'dice' })),
    ),
    section('Placement',
      ...positionFields(it, { xLabel: 'Burst X', yLabel: 'Burst Y' }),
      rangeField('Size', () => Math.round(it.w), (v) => { it.w = it.h = v; calEl.textContent = caliber(it); }, { min: 40, max: Math.round(S.h * 1.4), step: 2, format: (v) => `${v}px` }),
      h('p', { class: 'i-note' }, calEl),
      numberField('Rotation', () => it.rot, (v) => { it.rot = v; }, { min: -360, max: 360, unit: '°' }),
      toggleField('Launch rocket', () => it.launch, (v) => { it.launch = v; }, { rebuild: true }),
    ),
    section('Timing',
      numberField(it.launch ? 'Launch at' : 'Bursts at', () => it.start, (v) => { it.start = v; }, { min: 0, max: S.duration, step: 0.05, scrubStep: 0.05, unit: 's', decimals: 2 }),
      it.launch ? h('p', { class: 'i-note' }, `The rocket climbs for ${riseTime(it, S.h).toFixed(2)} s before it bursts.`) : null,
      toggleField('Sound', () => it.sound, (v) => { it.sound = v; }),
      h('div', { class: 'btn-row' }, btn('Preview this cue', () => { playback.seek(Math.max(0, it.start - 0.1)); playback.play(); }, { icon: 'play' })),
    ),
    section('Look',
      rangeField('Opacity', () => Math.round(it.opacity * 100), (v) => { it.opacity = v / 100; }, { min: 0, max: 100, format: (v) => `${v}%` }),
      selectField('Blend', BLEND_MODES, () => it.blend, (v) => { it.blend = v; }),
    ),
    layerSection(it),
  ];
}

function multiInspector(items) {
  const unlocked = items.filter((it) => !it.locked);
  let stagger = 0.25;
  const first = items[0];
  return [
    h('div', { class: 'i-head' }, h('p', { class: 'i-meta' }, `${items.length} cues selected${unlocked.length < items.length ? ` · ${items.length - unlocked.length} locked` : ''}`)),
    section('Arrange',
      h('div', { class: 'btn-row' },
        btn('Align left edges', () => alignSelected('l'), { icon: 'alignL', iconOnly: true }),
        btn('Align centres horizontally', () => alignSelected('c'), { icon: 'alignC', iconOnly: true }),
        btn('Align right edges', () => alignSelected('r'), { icon: 'alignR', iconOnly: true }),
        btn('Align top edges', () => alignSelected('t'), { icon: 'alignT', iconOnly: true }),
        btn('Align middles vertically', () => alignSelected('m'), { icon: 'alignM', iconOnly: true }),
        btn('Align bottom edges', () => alignSelected('b'), { icon: 'alignB', iconOnly: true }),
      ),
      h('div', { class: 'btn-row' },
        btn('Space evenly across', () => distributeSelected('h'), { icon: 'distH', disabled: unlocked.length < 3 }),
        btn('Space evenly down', () => distributeSelected('v'), { icon: 'distV', disabled: unlocked.length < 3 }),
      ),
    ),
    section('Timing',
      numberField('Stagger', () => stagger, (v) => { stagger = v; }, { min: 0, max: 5, step: 0.05, unit: 's', decimals: 2 }),
      h('div', { class: 'btn-row' },
        btn('Stagger left to right', () => {
          const list = [...unlocked].sort((a, b) => a.x - b.x);
          const t0 = Math.min(...list.map((it) => it.start));
          list.forEach((it, i) => { it.start = clamp(t0 + i * stagger, 0, state.stage.duration); });
          live(); commitNow(); ui.refreshTimeline();
        }, { icon: 'distH' }),
        btn('Start together', () => {
          const t0 = Math.min(...unlocked.map((it) => it.start));
          unlocked.forEach((it) => { it.start = t0; });
          live(); commitNow(); ui.refreshTimeline();
        }),
      ),
    ),
    section('Look',
      rangeField('Opacity', () => Math.round(first.opacity * 100), (v) => { items.forEach((it) => { it.opacity = v / 100; }); }, { min: 0, max: 100, format: (v) => `${v}%` }),
      selectField('Blend', BLEND_MODES, () => first.blend, (v) => { items.forEach((it) => { it.blend = v; }); }),
    ),
    section('Cues',
      h('div', { class: 'btn-row' },
        btn('Duplicate', duplicateSelected, { icon: 'copy' }),
        btn('Lock', () => { const v = !items.every((it) => it.locked); items.forEach((it) => { it.locked = v; }); commitNow(); ui.refreshAll(); }, { icon: 'lock' }),
        btn('Delete', deleteSelected, { icon: 'trash', kind: 'danger' }),
      ),
    ),
  ];
}

function applyStageSize(w, hh) {
  const S = state.stage;
  w = clamp(Math.round(w), 160, 4096);
  hh = clamp(Math.round(hh), 160, 4096);
  if (w === S.w && hh === S.h) return;
  const sx = w / S.w, sy = hh / S.h, sz = Math.min(sx, sy);
  for (const it of state.items) {
    it.x *= sx; it.y *= sy; it.w *= sz; it.h *= sz;
  }
  S.w = w; S.h = hh;
  ui.refreshAll();
  commitNow();
}

function showSettings() {
  const S = state.stage;
  const bg = S.bg;
  const presetId = (STAGE_PRESETS.find((p) => p.w === S.w && p.h === S.h) || { id: 'custom' }).id;
  const counts = {
    shells: state.items.filter((it) => it.type === 'burst').length,
    gifs: state.items.filter((it) => it.type === 'sprite').length,
  };
  const imgs = state.customAssets.map((id) => assets.get(id)).filter((a) => a && a.status === 'ready');
  return [
    h('div', { class: 'i-head' }, h('p', { class: 'i-meta' }, `${counts.shells} shell${counts.shells === 1 ? '' : 's'} · ${counts.gifs} GIF${counts.gifs === 1 ? '' : 's'} · ${S.w} × ${S.h}`)),
    section('Show',
      numberField('Length', () => S.duration, (v) => { S.duration = v; if (state.t > v) state.t = v; ui.layoutTimeline(); }, { min: 1, max: MAX_DURATION, step: 0.5, unit: 's', decimals: 1, lazy: true }),
      selectField('Canvas', [...STAGE_PRESETS.map((p) => [p.id, p.label]), ['custom', 'Custom size']], () => presetId, (v) => {
        const p = STAGE_PRESETS.find((x) => x.id === v);
        if (p) applyStageSize(p.w, p.h);
      }, { rebuild: true }),
      h('div', { class: 'f-grid2' },
        numberField('Width', () => S.w, (v) => applyStageSize(v, S.h), { min: 160, max: 4096, lazy: true }),
        numberField('Height', () => S.h, (v) => applyStageSize(S.w, v), { min: 160, max: 4096, lazy: true }),
      ),
    ),
    section('Sky',
      selectField('Background', [['night', 'Night sky'], ['gradient', 'Gradient'], ['solid', 'Solid colour'], ['image', 'Photo']], () => bg.type, (v) => {
        bg.type = v;
        if (v === 'image' && !bg.imageId) $('#bgInput').click();
      }, { rebuild: true }),
      bg.type !== 'image' ? colorField(bg.type === 'solid' ? 'Colour' : 'Top colour', () => bg.c1, (v) => { bg.c1 = v; }) : null,
      bg.type === 'night' || bg.type === 'gradient' ? colorField('Horizon colour', () => bg.c2, (v) => { bg.c2 = v; }) : null,
      bg.type === 'image' ? h('div', { class: 'btn-row' },
        btn(bg.imageId ? 'Choose another photo' : 'Choose photo', () => $('#bgInput').click(), { icon: 'image' }),
      ) : null,
      bg.type === 'image' && imgs.length > 1 ? selectField('Photo', imgs.map((a) => [a.id, a.name]), () => bg.imageId || '', (v) => { bg.imageId = v; }) : null,
      bg.type === 'image' ? rangeField('Darken', () => Math.round(bg.dim * 100), (v) => { bg.dim = v / 100; }, { min: 0, max: 90, format: (v) => `${v}%` }) : null,
      toggleField('Stars', () => bg.stars, (v) => { bg.stars = v; }),
      toggleField('City skyline', () => bg.skyline, (v) => { bg.skyline = v; }, { rebuild: true }),
      bg.skyline ? h('div', { class: 'btn-row' }, btn('New skyline', () => { bg.seed = ((Math.random() * 1e6) | 0) + 1; live(); commitNow(); }, { icon: 'dice' })) : null,
    ),
    section('Sound',
      toggleField('Play sound', () => audio.enabled, (v) => setSound(v)),
      rangeField('Volume', () => Math.round(audio.volume * 100), (v) => { audio.setVolume(v / 100); prefs.set('volume', v / 100); }, { min: 0, max: 100, format: (v) => `${v}%` }),
      h('p', { class: 'i-note' }, 'Booms and launch whistles are synthesised live and recorded into video exports.'),
    ),
    section('Tips',
      h('ul', { class: 'tips' },
        h('li', null, 'Drag shells and GIFs from the library onto the sky.'),
        h('li', null, 'Press ', h('kbd', null, 'F'), ' for the Fire tool, then click the sky while the show plays to fire shells live.'),
        h('li', null, 'Drag bars in the timeline to change when each cue fires.'),
        h('li', null, 'Press ', h('kbd', null, '?'), ' for every shortcut.'),
      ),
    ),
  ];
}

function setSound(on) {
  audio.enabled = on;
  prefs.set('sound', on);
  if (on) audio.ensure();
  ui.updateTransport();
  if (!state.sel.size) syncInspector();
}

/* ---------- Timeline ---------- */

const tl = { pps: 60, zoom: 1, labelW: 196, rowH: 30, trackW: 0 };

function buildTimeline() {
  tl.scroll = $('#tlScroll');
  tl.content = $('#tlContent');
  tl.rows = $('#tlRows');
  tl.ruler = $('#tlRuler');
  tl.rulerWrap = $('#tlRulerWrap');
  tl.playhead = $('#tlPlayhead');
  tl.cap = $('#tlCap');
  tl.endMark = $('#tlEnd');

  const rulerScrub = (e) => {
    const r = tl.rulerWrap.getBoundingClientRect();
    playback.seek((e.clientX - r.left) / tl.pps);
  };
  tl.rulerWrap.addEventListener('pointerdown', (e) => {
    if (state.exporting) return;
    const wasPlaying = state.playing;
    playback.pause();
    rulerScrub(e);
    tl.rulerWrap.setPointerCapture(e.pointerId);
    const move = (ev) => rulerScrub(ev);
    const up = () => {
      tl.rulerWrap.removeEventListener('pointermove', move);
      tl.rulerWrap.removeEventListener('pointerup', up);
      tl.rulerWrap.removeEventListener('pointercancel', up);
      if (wasPlaying) playback.play();
    };
    tl.rulerWrap.addEventListener('pointermove', move);
    tl.rulerWrap.addEventListener('pointerup', up);
    tl.rulerWrap.addEventListener('pointercancel', up);
  });

  tl.rows.addEventListener('pointerdown', onTimelinePointer);
  tl.rows.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.tl-row');
    if (!row) return;
    const it = findItem(row.dataset.id);
    if (!it) return;
    if (e.target.closest('.tl-bar')) playback.seek(it.type === 'burst' ? burstTime(it) + 0.3 : it.start);
    else if (e.target.closest('.tl-name')) {
      ui.onSelectionChanged();
      const n = $('#cueName');
      if (n) { n.focus(); n.select(); }
      if (window.matchMedia('(max-width: 960px)').matches) togglePanel('#inspector');
    }
  });

  tl.scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomTimeline(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX);
  }, { passive: false });

  $('#tlZoomIn').addEventListener('click', () => zoomTimeline(1.4));
  $('#tlZoomOut').addEventListener('click', () => zoomTimeline(1 / 1.4));
  $('#tlZoomFit').addEventListener('click', () => { tl.zoom = 1; ui.layoutTimeline(); });

  // Resize the timeline panel.
  const handle = $('#tlResize');
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = $('#timeline').getBoundingClientRect().height;
    const move = (ev) => {
      const hh = clamp(startH - (ev.clientY - startY), 120, window.innerHeight * 0.6);
      document.documentElement.style.setProperty('--tl-h', `${Math.round(hh)}px`);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      prefs.set('tlH', parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tl-h'), 10) || 240);
      view.fit();
      ui.layoutTimeline();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

function zoomTimeline(f, clientX) {
  const before = tl.pps;
  const r = tl.scroll.getBoundingClientRect();
  const anchorX = clientX != null ? clientX - r.left - tl.labelW : (state.t * tl.pps - tl.scroll.scrollLeft);
  const anchorT = (tl.scroll.scrollLeft + anchorX) / before;
  tl.zoom = clamp(tl.zoom * f, 0.25, 40);
  ui.layoutTimeline();
  tl.scroll.scrollLeft = Math.max(0, anchorT * tl.pps - anchorX);
}

ui.layoutTimeline = function () {
  if (!tl.scroll) return;
  const D = state.stage.duration;
  tl.labelW = $('.tl-corner').offsetWidth || 196;
  const avail = Math.max(120, tl.scroll.clientWidth - tl.labelW - 28);
  tl.pps = clamp((avail / D) * tl.zoom, 2, 30000 / D);
  tl.trackW = Math.ceil(D * tl.pps) + 28;
  tl.content.style.width = `${tl.labelW + tl.trackW}px`;
  tl.rulerWrap.style.width = `${tl.trackW}px`;
  drawRuler();
  ui.updateTimelineBars();
  ui.syncPlayhead();
  tl.endMark.style.left = `${tl.labelW + D * tl.pps}px`;
};

function drawRuler() {
  const c = tl.ruler;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = tl.trackW, H = 26;
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  c.style.width = `${W}px`;
  c.style.height = `${H}px`;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const major = steps.find((s) => s * tl.pps >= 64) || 60;
  const minor = major / (major === 0.2 || major === 2 ? 4 : 5);
  const D = state.stage.duration;
  g.fillStyle = 'rgba(167,160,187,0.5)';
  for (let t = 0; t <= D + 1e-6; t += minor) {
    const x = Math.round(t * tl.pps) + 0.5;
    g.fillRect(x, H - 6, 1, 6);
  }
  g.fillStyle = '#a7a0bb';
  g.font = '10px "JetBrains Mono", ui-monospace, monospace';
  for (let i = 0; i * major <= D + 1e-6; i++) {
    const t = i * major;
    const x = Math.round(t * tl.pps) + 0.5;
    g.fillRect(x, H - 12, 1, 12);
    const label = major < 1 ? `${t.toFixed(1)}s` : t >= 60 ? fmtTime(t, false) : `${Math.round(t)}s`;
    g.fillText(label, x + 4, 11);
  }
}

ui.refreshTimeline = function () {
  if (!tl.rows) return;
  const items = [...state.items].reverse();
  tl.rows.replaceChildren();
  $('#tlEmpty').hidden = items.length > 0;
  for (const it of items) {
    const a = it.type === 'sprite' ? assets.get(it.assetId) : null;
    const swatch = it.type === 'burst'
      ? h('span', { class: 'tl-sw', style: { background: it.colorMode === 'single' ? it.color : `linear-gradient(135deg, ${it.color} 50%, ${it.color2} 50%)` } })
      : h('span', { class: 'tl-sw gif' }, a && a.status === 'ready' ? h('img', { src: a.src, alt: '' }) : null);
    const eye = h('button', { class: 'tl-ib', type: 'button', 'data-act': 'vis', 'aria-label': it.visible ? `Hide ${it.name}` : `Show ${it.name}`, title: it.visible ? 'Hide' : 'Show' }, icon(it.visible ? 'eye' : 'eyeOff', 14));
    const lock = h('button', { class: 'tl-ib' + (it.locked ? ' on' : ''), type: 'button', 'data-act': 'lock', 'aria-label': it.locked ? `Unlock ${it.name}` : `Lock ${it.name}`, title: it.locked ? 'Unlock' : 'Lock' }, icon(it.locked ? 'lock' : 'unlock', 14));
    const label = h('div', { class: 'tl-label', title: 'Drag up or down to change layer order' }, eye, lock, swatch, h('span', { class: 'tl-name' }, it.name || 'Cue'));
    const bar = h('div', { class: `tl-bar ${it.type}`, 'data-act': 'bar' });
    if (it.type === 'burst') {
      bar.style.setProperty('--c', it.color);
      bar.append(h('span', { class: 'tl-rise' }), h('span', { class: 'tl-pop' }));
    } else {
      bar.append(h('span', { class: 'tl-bar-name' }, it.name), h('span', { class: 'tl-end-h', 'data-act': 'end', title: 'Drag to set length' }));
    }
    const track = h('div', { class: 'tl-track', style: { width: `${tl.trackW}px` } }, bar);
    const row = h('div', { class: 'tl-row' + (state.sel.has(it.id) ? ' sel' : '') + (it.visible ? '' : ' hidden-cue') + (it.locked ? ' locked' : ''), 'data-id': it.id }, label, track);
    tl.rows.append(row);
  }
  ui.layoutTimeline();
};

ui.updateTimelineLabels = function () {
  if (!tl.rows) return;
  for (const row of tl.rows.children) {
    const it = findItem(row.dataset.id);
    if (!it) continue;
    row.querySelector('.tl-name').textContent = it.name || 'Cue';
    const bn = row.querySelector('.tl-bar-name');
    if (bn) bn.textContent = it.name;
  }
};

ui.markTimelineSelection = function () {
  if (!tl.rows) return;
  for (const row of tl.rows.children) row.classList.toggle('sel', state.sel.has(row.dataset.id));
};

ui.updateTimelineBars = function () {
  if (!tl.rows) return;
  const D = state.stage.duration;
  for (const row of tl.rows.children) {
    const it = findItem(row.dataset.id);
    if (!it) continue;
    const bar = row.querySelector('.tl-bar');
    const end = Math.min(itemEnd(it), D);
    const x0 = it.start * tl.pps;
    const w = Math.max(6, (Math.max(end, it.start + 0.05) - it.start) * tl.pps);
    bar.style.left = `${x0}px`;
    bar.style.width = `${w}px`;
    bar.classList.toggle('open-ended', it.type === 'sprite' && itemEnd(it) === Infinity);
    if (it.type === 'burst') {
      bar.style.setProperty('--c', it.color);
      const rise = riseTime(it, state.stage.h) * tl.pps;
      bar.querySelector('.tl-rise').style.width = `${rise}px`;
      bar.querySelector('.tl-pop').style.left = `${rise}px`;
    }
  }
};

ui.syncPlayhead = function () {
  if (!tl.playhead) return;
  const x = state.t * tl.pps;
  tl.playhead.style.transform = `translateX(${tl.labelW + x}px)`;
  tl.cap.style.transform = `translateX(${x}px)`;
  $('#timecode').textContent = fmtTime(state.t);
  if (state.playing) {
    const sl = tl.scroll.scrollLeft, vw = tl.scroll.clientWidth - tl.labelW;
    if (x < sl || x > sl + vw - 20) tl.scroll.scrollLeft = Math.max(0, x - 40);
  }
  if (state.tool === 'fire' && !state.playing) ui.updateToolButtons();
};

function onTimelinePointer(e) {
  if (state.exporting) return;
  const row = e.target.closest('.tl-row');
  if (!row) return;
  const it = findItem(row.dataset.id);
  if (!it) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  const additive = e.shiftKey || e.metaKey || e.ctrlKey;

  if (act === 'vis' || act === 'lock') {
    if (act === 'vis') it.visible = !it.visible;
    else it.locked = !it.locked;
    commitNow();
    ui.refreshAll();
    return;
  }

  if (act === 'bar' || act === 'end') {
    e.preventDefault();
    if (additive) {
      if (state.sel.has(it.id)) state.sel.delete(it.id); else state.sel.add(it.id);
    } else if (!state.sel.has(it.id)) {
      state.sel = new Set([it.id]);
    }
    ui.onSelectionChanged();
    if (it.locked) return;
    const target = e.target;
    target.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const group = act === 'end' ? [it] : selectedItems().filter((x) => !x.locked);
    const origStarts = new Map(group.map((x) => [x.id, x.start]));
    const origEnd = it.len > 0 ? it.start + it.len : Math.min(itemEnd(it), state.stage.duration);
    let moved = false;
    const D = state.stage.duration;
    const snapT = (t, free) => {
      if (free) return t;
      const ph = state.t;
      if (Math.abs(t - ph) * tl.pps < 6) return ph;
      const grid = tl.pps > 200 ? 0.01 : tl.pps > 60 ? 0.05 : 0.1;
      return Math.round(t / grid) * grid;
    };
    const move = (ev) => {
      const dt = (ev.clientX - x0) / tl.pps;
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      moved = true;
      if (act === 'end') {
        const newEnd = clamp(snapT(origEnd + dt, ev.altKey), it.start + 0.1, MAX_DURATION);
        it.len = Math.round((newEnd - it.start) * 100) / 100;
      } else {
        const lead = origStarts.get(it.id);
        const ns = clamp(snapT(lead + dt, ev.altKey), 0, D);
        const delta = ns - lead;
        for (const g of group) g.start = Math.round(clamp(origStarts.get(g.id) + delta, 0, D) * 1000) / 1000;
      }
      live();
      syncInspector();
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (moved) commitNow();
      else if (!additive && state.sel.size > 1) { state.sel = new Set([it.id]); ui.onSelectionChanged(); }
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    return;
  }

  if (e.target.closest('.tl-label')) {
    // Select, and drag vertically to reorder layers.
    if (additive) {
      if (state.sel.has(it.id)) state.sel.delete(it.id); else state.sel.add(it.id);
    } else {
      state.sel = new Set([it.id]);
    }
    ui.onSelectionChanged();
    const label = e.target.closest('.tl-label');
    label.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    let dragging = false, targetIdx = -1;
    const indicator = $('#tlDrop');
    const rows = [...tl.rows.children];
    const move = (ev) => {
      if (!dragging && Math.abs(ev.clientY - y0) < 5) return;
      dragging = true;
      const r0 = tl.rows.getBoundingClientRect();
      const idx = clamp(Math.round((ev.clientY - r0.top) / tl.rowH), 0, rows.length);
      targetIdx = idx;
      indicator.hidden = false;
      indicator.style.top = `${tl.rows.offsetTop + idx * tl.rowH - 1}px`;
    };
    const up = () => {
      label.removeEventListener('pointermove', move);
      label.removeEventListener('pointerup', up);
      label.removeEventListener('pointercancel', up);
      indicator.hidden = true;
      if (!dragging || targetIdx < 0) return;
      // Rows are front-to-back; items array is back-to-front.
      const order = [...state.items].reverse();
      const from = order.indexOf(it);
      order.splice(from, 1);
      const to = targetIdx > from ? targetIdx - 1 : targetIdx;
      order.splice(clamp(to, 0, order.length), 0, it);
      state.items = order.reverse();
      ui.refreshAll();
      commitNow();
    };
    label.addEventListener('pointermove', move);
    label.addEventListener('pointerup', up);
    label.addEventListener('pointercancel', up);
    return;
  }

  // Empty track area: move the playhead there.
  const track = e.target.closest('.tl-track');
  if (track) {
    const r = track.getBoundingClientRect();
    playback.seek((e.clientX - r.left) / tl.pps);
    if (!additive && state.sel.size) { state.sel.clear(); ui.onSelectionChanged(); }
  }
}

/* ---------- Transport ---------- */

function buildTransport() {
  $('#btnPlay').addEventListener('click', () => { audioUnlock(); playback.toggle(); });
  $('#btnStart').addEventListener('click', () => playback.seek(0));
  $('#btnStepBack').addEventListener('click', () => playback.step(-1));
  $('#btnStepFwd').addEventListener('click', () => playback.step(1));
  $('#btnLoop').addEventListener('click', () => { state.loop = !state.loop; prefs.set('loop', state.loop); ui.updateTransport(); });
  $('#btnSound').addEventListener('click', () => setSound(!audio.enabled));
  const dur = $('#durInput');
  dur.addEventListener('change', () => {
    const v = parseFloat(dur.value);
    if (isFinite(v)) {
      state.stage.duration = clamp(Math.round(v * 10) / 10, 1, MAX_DURATION);
      if (state.t > state.stage.duration) state.t = state.stage.duration;
      commitNow();
      ui.refreshAll();
    }
    dur.value = state.stage.duration;
  });
}

ui.updateTransport = function () {
  const play = $('#btnPlay');
  if (!play) return;
  play.replaceChildren(icon(state.playing ? 'pause' : 'play', 18));
  play.setAttribute('aria-label', state.playing ? 'Pause (Space)' : 'Play (Space)');
  play.title = state.playing ? 'Pause  Space' : 'Play  Space';
  play.classList.toggle('on', state.playing);
  const loop = $('#btnLoop');
  loop.classList.toggle('on', state.loop);
  loop.setAttribute('aria-pressed', String(state.loop));
  const snd = $('#btnSound');
  snd.replaceChildren(icon(audio.enabled ? 'volume' : 'mute', 16));
  snd.setAttribute('aria-label', audio.enabled ? 'Mute sound (M)' : 'Turn sound on (M)');
  snd.title = audio.enabled ? 'Sound on  M' : 'Sound off  M';
  snd.classList.toggle('on', audio.enabled);
  const dur = $('#durInput');
  if (document.activeElement !== dur) dur.value = state.stage.duration;
  $('#timecode').textContent = fmtTime(state.t);
};

/* ---------- Context menu ---------- */

ui.contextMenu = function (x, y, onItem, p) {
  const m = $('#ctxMenu');
  const entries = onItem
    ? [
        ['Duplicate', 'Ctrl+D', duplicateSelected],
        ['Copy', 'Ctrl+C', () => copySelected()],
        ['Cut', 'Ctrl+X', () => copySelected(true)],
        ['Paste', 'Ctrl+V', () => pasteClipboard(), !state.clipboard],
        null,
        ['Bring to front', 'Shift+]', () => reorder('front')],
        ['Send to back', 'Shift+[', () => reorder('back')],
        null,
        ['Delete', 'Del', deleteSelected],
      ]
    : [
        ['Paste', 'Ctrl+V', () => pasteClipboard(), !state.clipboard],
        ['Fire a shell here', '', () => addBurst(state.firePreset, p, state.t)],
        ['Select all', 'Ctrl+A', selectAll, !state.items.length],
      ];
  m.replaceChildren(...entries.map((en) => {
    if (!en) return h('div', { class: 'sep', role: 'separator' });
    const [label, key, fn, disabled] = en;
    const b = h('button', { type: 'button', role: 'menuitem', disabled: !!disabled }, h('span', null, label), h('kbd', null, key));
    b.addEventListener('click', () => { m.hidden = true; fn(); });
    return b;
  }));
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  m.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  m.querySelector('button:not([disabled])')?.focus();
};

function selectAll() {
  state.sel = new Set(state.items.filter((it) => it.visible && !it.locked).map((it) => it.id));
  ui.onSelectionChanged();
}

/* ---------- Modals ---------- */

const modals = [];

function openModal({ title, body, actions = [], wide = false, extraClass = '', onClose, dismissable = () => true }) {
  const root = $('#modalRoot');
  const titleId = uid('mt');
  const box = h('div', { class: `modal ${wide ? 'wide' : ''} ${extraClass}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
  const head = h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title));
  const x = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, icon('x', 16));
  head.append(x);
  const bodyEl = h('div', { class: 'modal-body' });
  const foot = h('div', { class: 'modal-foot' });
  box.append(head, bodyEl, foot);
  const back = h('div', { class: 'modal-back' }, box);
  const prevFocus = document.activeElement;
  const m = {
    el: box, bodyEl, foot,
    setBody(...kids) { bodyEl.replaceChildren(...kids.flat()); },
    setActions(list) {
      foot.replaceChildren(...list.map((a) => {
        const b = h('button', { type: 'button', class: `btn ${a.kind || ''}`, disabled: !!a.disabled });
        if (a.icon) b.append(icon(a.icon, 15));
        b.append(h('span', null, a.label));
        b.addEventListener('click', () => a.onClick(m));
        return b;
      }));
      foot.hidden = !list.length;
    },
    close(result) {
      if (m.closed) return;
      m.closed = true;
      back.classList.remove('in');
      setTimeout(() => back.remove(), 160);
      modals.splice(modals.indexOf(m), 1);
      state.modalOpen = modals.length > 0;
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      onClose && onClose(result);
    },
    tryClose() { if (dismissable()) m.close(); },
  };
  x.addEventListener('click', () => m.tryClose());
  back.addEventListener('pointerdown', (e) => { if (e.target === back) m.tryClose(); });
  m.setBody(body);
  m.setActions(actions);
  root.append(back);
  modals.push(m);
  state.modalOpen = true;
  requestAnimationFrame(() => {
    back.classList.add('in');
    (foot.querySelector('.btn.primary:not(.danger)') || foot.querySelector('.btn') || box.querySelector('button, input, select'))?.focus();
  });
  return m;
}

function confirmModal(title, message, confirmLabel, danger) {
  return new Promise((resolve) => {
    let result = false;
    openModal({
      title,
      body: h('p', { class: 'modal-text' }, message),
      actions: [
        { label: 'Cancel', onClick: (m) => m.close() },
        { label: confirmLabel, kind: danger ? 'danger primary' : 'primary', onClick: (m) => { result = true; m.close(); } },
      ],
      onClose: () => resolve(result),
    });
  });
}

function openHelp() {
  const rows = [
    ['Space', 'Play or pause'],
    ['Home / End', 'Jump to start or end'],
    [', and .', 'Step one frame back or forward'],
    ['← →', 'Step one frame (nudge when cues are selected)'],
    ['Arrow keys', 'Nudge selected cues · hold Shift for 10 px'],
    ['V', 'Select tool'],
    ['F', 'Fire tool: click the sky to fire a shell'],
    ['1 – 0', 'Pick the Fire tool shell'],
    ['Delete', 'Delete selected cues'],
    ['Ctrl+D', 'Duplicate'],
    ['Ctrl+C / X / V', 'Copy, cut, paste'],
    ['Ctrl+A', 'Select all cues'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['[ and ]', 'Send backward / bring forward · with Shift: to back / front'],
    ['Tab', 'Select the next cue'],
    ['Esc', 'Clear selection'],
    ['L', 'Loop on or off'],
    ['M', 'Sound on or off'],
    ['G', 'Show or hide outlines of cues not on screen'],
    ['Ctrl+S', 'Save show file'],
    ['Ctrl+O', 'Open show file'],
    ['Ctrl+E', 'Export'],
  ];
  const mouse = [
    ['Drag a corner', 'Resize, keeping proportions · Shift: free resize · Alt: from centre'],
    ['Drag the round handle', 'Rotate · Shift: 15° steps'],
    ['Alt while moving', 'Turn off snapping'],
    ['Drag a bar in the timeline', 'Change when a cue starts · Alt: no snapping'],
    ['Drag a cue name up or down', 'Change layer order'],
    ['Ctrl + scroll on timeline', 'Zoom the timeline'],
    ['Double-click an outline', 'Jump to the moment that cue appears'],
  ];
  openModal({
    title: 'Shortcuts',
    wide: true,
    extraClass: 'help',
    body: h('div', { class: 'help-grid' },
      h('div', null, h('h3', null, 'Keyboard'), h('dl', { class: 'keys' }, rows.map(([k, v]) => [h('dt', null, h('kbd', null, k)), h('dd', null, v)]))),
      h('div', null, h('h3', null, 'Mouse and touch'), h('dl', { class: 'keys' }, mouse.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
        h('p', { class: 'modal-text' }, 'Your show saves automatically in this browser. Use File › Save show file to keep a copy or move it to another computer.')),
    ),
    actions: [{ label: 'Done', kind: 'primary', onClick: (m) => m.close() }],
  });
}

/* ---------- Export ---------- */

function videoFormats(withAudio) {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return [];
  const sup = (m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } };
  const groups = [
    { label: 'MP4 (H.264)', ext: 'mp4', cands: withAudio
      ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4']
      : ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01F', 'video/mp4;codecs=avc1', 'video/mp4'] },
    { label: 'WebM (VP9)', ext: 'webm', cands: withAudio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9'] : ['video/webm;codecs=vp9'] },
    { label: 'WebM (VP8)', ext: 'webm', cands: withAudio ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'] : ['video/webm;codecs=vp8', 'video/webm'] },
  ];
  const out = [];
  for (const g of groups) {
    const m = g.cands.find(sup);
    if (m) out.push({ label: g.label, ext: g.ext, mime: m });
  }
  return out;
}

const exportPrefs = {
  tab: 'video', format: 0, scale: 1, fps: 30, quality: 'high', audio: true,
  gifWidth: 480, gifFps: 15, gifLoop: true,
};

function openExport() {
  if (state.exporting) return;
  playback.pause();
  const S = state.stage;
  const opts = { ...exportPrefs, from: 0, to: S.duration };
  let m;
  const render = () => {
    const tabs = h('div', { class: 'tabs', role: 'tablist' },
      [['video', 'Video', 'film'], ['gif', 'Animated GIF', 'image'], ['png', 'Still image', 'image']].map(([k, l, ic]) => {
        const b = h('button', { type: 'button', role: 'tab', class: 'tab' + (opts.tab === k ? ' on' : ''), 'aria-selected': String(opts.tab === k) }, icon(ic, 15), h('span', null, l));
        b.addEventListener('click', () => { opts.tab = k; exportPrefs.tab = k; render(); });
        return b;
      }));
    const body = [tabs];
    const field = (label, ctl, note) => h('div', { class: 'x-row' }, h('label', null, label), h('div', { class: 'x-ctl' }, ctl, note ? h('p', { class: 'x-note' }, note) : null));
    const sel = (options, val, onChange) => {
      const s = h('select', { class: 'f-select' }, options.map(([v, l]) => h('option', { value: String(v) }, l)));
      s.value = String(val);
      s.addEventListener('change', () => onChange(s.value));
      return s;
    };
    const rangeInputs = () => {
      const a = h('input', { type: 'number', class: 'f-num', min: 0, max: S.duration, step: 0.1, value: opts.from, 'aria-label': 'Start time in seconds' });
      const b = h('input', { type: 'number', class: 'f-num', min: 0, max: S.duration, step: 0.1, value: opts.to, 'aria-label': 'End time in seconds' });
      a.addEventListener('change', () => { opts.from = clamp(parseFloat(a.value) || 0, 0, S.duration - 0.1); a.value = opts.from; render(); });
      b.addEventListener('change', () => { opts.to = clamp(parseFloat(b.value) || S.duration, 0.1, S.duration); b.value = opts.to; render(); });
      return h('div', { class: 'x-range' }, a, h('span', null, 'to'), b, h('span', null, 's'));
    };
    const len = Math.max(0.1, opts.to - opts.from);
    let actions = [{ label: 'Cancel', onClick: () => m.close() }];

    if (opts.tab === 'video') {
      const hasSound = state.items.some((it) => it.sound && it.visible);
      const formats = videoFormats(opts.audio && hasSound);
      if (!formats.length) {
        body.push(h('p', { class: 'modal-text warn' }, 'This browser cannot record video from a canvas. Try the latest Chrome, Edge, Firefox or Safari, or export an animated GIF instead.'));
      } else {
        opts.format = Math.min(opts.format, formats.length - 1);
        const scales = [[1, 'Full'], [2 / 3, 'Two-thirds'], [0.5, 'Half']];
        const dims = (sc) => [Math.round((S.w * sc) / 2) * 2, Math.round((S.h * sc) / 2) * 2];
        body.push(
          field('Format', sel(formats.map((f, i) => [i, f.label]), opts.format, (v) => { opts.format = +v; exportPrefs.format = +v; })),
          field('Size', sel(scales.map(([sc, l]) => [sc, `${dims(sc).join(' × ')} (${l})`]), opts.scale, (v) => { opts.scale = +v; exportPrefs.scale = +v; })),
          field('Frame rate', sel([[24, '24 fps'], [30, '30 fps'], [60, '60 fps']], opts.fps, (v) => { opts.fps = +v; exportPrefs.fps = +v; })),
          field('Quality', sel([['standard', 'Standard (smaller file)'], ['high', 'High'], ['max', 'Maximum']], opts.quality, (v) => { opts.quality = v; exportPrefs.quality = v; })),
          field('Section', rangeInputs(), `${len.toFixed(1)} s of video`),
          field('Sound', (() => {
            const c = h('input', { type: 'checkbox', class: 'f-check', id: 'xAudio', checked: opts.audio && hasSound, disabled: !hasSound });
            c.addEventListener('change', () => { opts.audio = c.checked; exportPrefs.audio = c.checked; render(); });
            return h('label', { class: 'x-check', for: 'xAudio' }, c, h('span', null, hasSound ? 'Include booms and whistles' : 'No cues have sound turned on'));
          })()),
          h('p', { class: 'x-note' }, `Video records in real time, so this takes about ${Math.ceil(len)} seconds. Keep this tab in front until it finishes.`),
        );
        actions.push({ label: 'Export video', kind: 'primary', icon: 'film', onClick: () => runVideoExport(m, { ...opts, formatInfo: formats[opts.format], dims: dims(opts.scale), withAudio: opts.audio && hasSound }) });
      }
    } else if (opts.tab === 'gif') {
      const widths = [320, 480, 640, 800, 960].filter((w) => w <= S.w);
      if (!widths.includes(opts.gifWidth)) opts.gifWidth = widths[Math.min(1, widths.length - 1)] || S.w;
      const gh = (w) => Math.round((w * S.h) / S.w);
      const frames = Math.max(1, Math.round(len * opts.gifFps));
      body.push(
        field('Width', sel(widths.map((w) => [w, `${w} × ${gh(w)}`]), opts.gifWidth, (v) => { opts.gifWidth = +v; exportPrefs.gifWidth = +v; render(); })),
        field('Frame rate', sel([[10, '10 fps'], [12, '12 fps'], [15, '15 fps'], [20, '20 fps'], [25, '25 fps']], opts.gifFps, (v) => { opts.gifFps = +v; exportPrefs.gifFps = +v; render(); })),
        field('Section', rangeInputs(), `${frames} frames`),
        field('Loop', (() => {
          const c = h('input', { type: 'checkbox', class: 'f-check', id: 'xLoop', checked: opts.gifLoop });
          c.addEventListener('change', () => { opts.gifLoop = c.checked; exportPrefs.gifLoop = c.checked; });
          return h('label', { class: 'x-check', for: 'xLoop' }, c, h('span', null, 'Loop forever'));
        })()),
        h('p', { class: 'x-note' }, 'GIFs have no sound and use 256 colours per frame. Smaller widths and lower frame rates make smaller files.'),
      );
      actions.push({ label: 'Export GIF', kind: 'primary', icon: 'image', onClick: () => runGifExport(m, { ...opts, width: opts.gifWidth, height: gh(opts.gifWidth) }) });
    } else {
      body.push(
        h('p', { class: 'modal-text' }, `Saves the frame at ${fmtTime(state.t)} as a ${S.w} × ${S.h} PNG. Move the playhead to pick a different moment.`),
      );
      actions.push({ label: 'Save PNG', kind: 'primary', icon: 'download', onClick: () => { exportPng(); m.close(); } });
    }
    m.setBody(body);
    m.setActions(actions);
  };
  m = openModal({ title: 'Export', body: [], wide: true, dismissable: () => !state.exporting, onClose: () => { m.cleanup && m.cleanup(); } });
  render();
}

function exportPng() {
  const S = state.stage;
  const c = document.createElement('canvas');
  c.width = S.w; c.height = S.h;
  renderScene(c.getContext('2d'), S.w, S.h, state.t, false);
  c.toBlob((blob) => {
    if (!blob) { ui.toast('The image could not be created.', 'error'); return; }
    downloadBlob(blob, `${slug(state.name)}-${state.t.toFixed(2).replace('.', '_')}s.png`);
    ui.toast('Saved PNG');
  }, 'image/png');
}

function progressView(m, title, canvas) {
  const bar = h('div', { class: 'x-bar-fill' });
  const status = h('p', { class: 'x-status', 'aria-live': 'polite' }, 'Starting…');
  const warn = h('p', { class: 'x-note warn', hidden: true });
  const prev = h('div', { class: 'x-preview' }, canvas);
  m.setBody(h('div', { class: 'x-progress' }, prev, h('div', { class: 'x-bar', role: 'progressbar', 'aria-label': title }, bar), status, warn));
  return {
    set(frac, text) { bar.style.width = `${(clamp(frac, 0, 1) * 100).toFixed(1)}%`; status.textContent = text; },
    warn(text) { warn.hidden = false; warn.textContent = text; },
  };
}

function doneView(m, blob, filename, kind) {
  const url = URL.createObjectURL(blob);
  m.cleanup = () => URL.revokeObjectURL(url);
  const media = kind === 'video'
    ? h('video', { src: url, controls: true, loop: true, playsinline: '', class: 'x-result' })
    : h('img', { src: url, alt: 'Exported animation', class: 'x-result' });
  m.setBody(h('div', { class: 'x-done' },
    h('div', { class: 'x-preview' }, media),
    h('p', { class: 'x-status' }, h('b', null, filename), ` · ${fmtBytes(blob.size)}`),
    h('p', { class: 'x-note' }, 'The file has downloaded. If your browser blocked it, use Download again.'),
  ));
  m.setActions([
    { label: 'Download again', icon: 'download', onClick: () => downloadBlob(blob, filename) },
    { label: 'Done', kind: 'primary', onClick: () => m.close() },
  ]);
  downloadBlob(blob, filename);
}

function failView(m, message) {
  m.setBody(h('p', { class: 'modal-text warn' }, message));
  m.setActions([{ label: 'Close', kind: 'primary', onClick: () => m.close() }]);
}

async function runVideoExport(m, o) {
  const S = state.stage;
  const [W, H] = o.dims;
  const canvas = h('canvas', { width: W, height: H });
  const ctx = canvas.getContext('2d');
  let cancelled = false;
  state.exporting = true;
  state.playing = false;
  ui.updateTransport();
  dirty.overlay = true;
  drawOverlay();
  m.setActions([{ label: 'Cancel export', onClick: () => { cancelled = true; } }]);
  const pv = progressView(m, 'Recording video', canvas);
  renderScene(ctx, W, H, o.from, false);

  let stream, rec;
  const chunks = [];
  const soundWas = audio.enabled;
  const finish = () => { audio.enabled = soundWas; state.exporting = false; markDirty(); ui.updateTransport(); };
  try {
    stream = canvas.captureStream(o.fps);
    if (o.withAudio) {
      audio.enabled = true;
      if (audio.ensure() && audio.ctx.state !== 'running') await audio.ctx.resume().catch(() => {});
      const as = audio.recordStream();
      if (as) as.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
    const qual = { standard: 0.6, high: 1, max: 2 }[o.quality] || 1;
    const bps = clamp(Math.round(12e6 * qual * ((W * H * o.fps) / (1920 * 1080 * 30))), 1e6, 80e6);
    rec = new MediaRecorder(stream, { mimeType: o.formatInfo.mime, videoBitsPerSecond: bps, audioBitsPerSecond: 192000 });
  } catch (err) {
    finish();
    failView(m, `The browser could not start recording (${err.message || err.name}). Try a different format or size.`);
    return;
  }
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { rec.onstop = resolve; });
  let recError = null;
  rec.onerror = (e) => { recError = e.error || e; };

  const onHide = () => { if (document.hidden) pv.warn('This tab went into the background, which can make the video stutter. Export again with the tab in front if it looks wrong.'); };
  document.addEventListener('visibilitychange', onHide);

  const len = o.to - o.from;
  let prevT = o.from - 1e-4;
  rec.start(500);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      if (cancelled || recError) { resolve(); return; }
      const t = Math.min(o.to, o.from + (performance.now() - t0) / 1000);
      renderScene(ctx, W, H, t, false);
      if (o.withAudio) fireSounds(prevT, t);
      prevT = t;
      pv.set((t - o.from) / len, `Recording ${(t - o.from).toFixed(1)} s of ${len.toFixed(1)} s`);
      if (t >= o.to) { setTimeout(resolve, 150); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* already stopped */ }
  await stopped;
  stream.getVideoTracks().forEach((t) => t.stop());
  document.removeEventListener('visibilitychange', onHide);
  finish();

  if (cancelled) { m.close(); ui.toast('Export cancelled'); return; }
  if (recError || !chunks.length) {
    failView(m, `The recording failed${recError && recError.message ? ` (${recError.message})` : ''}. Try a smaller size, a lower frame rate or a different format.`);
    return;
  }
  pv.set(1, 'Finishing the file…');
  const type = o.formatInfo.mime.split(';')[0];
  let blob = new Blob(chunks, { type });
  if (o.formatInfo.ext === 'webm') {
    try {
      const fixed = fixWebmDuration(new Uint8Array(await blob.arrayBuffer()), len * 1000);
      blob = new Blob([fixed], { type });
    } catch (e) { /* keep original */ }
  }
  doneView(m, blob, `${slug(state.name)}.${o.formatInfo.ext}`, 'video');
}

async function runGifExport(m, o) {
  const W = o.width, H = o.height;
  const canvas = h('canvas', { width: W, height: H });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let cancelled = false;
  state.exporting = true;
  state.playing = false;
  ui.updateTransport();
  drawOverlay();
  m.setActions([{ label: 'Cancel export', onClick: () => { cancelled = true; } }]);
  const pv = progressView(m, 'Building GIF', canvas);
  try {
    const len = o.to - o.from;
    const n = Math.max(1, Math.round(len * o.gifFps));
    const gw = new GifWriter(W, H, o.gifLoop);
    let last = performance.now();
    for (let i = 0; i < n; i++) {
      if (cancelled) break;
      const t = o.from + i / o.gifFps;
      renderScene(ctx, W, H, t, false);
      const data = ctx.getImageData(0, 0, W, H).data;
      const delay = Math.round(((i + 1) * 100) / o.gifFps) - Math.round((i * 100) / o.gifFps);
      gw.addFrame(data, delay);
      if (performance.now() - last > 30) {
        pv.set((i + 1) / n, `Frame ${i + 1} of ${n}`);
        await nextTick();
        last = performance.now();
      }
    }
    state.exporting = false;
    markDirty();
    if (cancelled) { m.close(); ui.toast('Export cancelled'); return; }
    pv.set(1, 'Finishing the file…');
    await nextTick();
    doneView(m, gw.finish(), `${slug(state.name)}.gif`, 'gif');
  } catch (err) {
    state.exporting = false;
    markDirty();
    failView(m, `The GIF could not be built (${err.message || 'out of memory'}). Try a smaller width or a shorter section.`);
  }
}

/* ---------- Keyboard ---------- */

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (state.modalOpen) {
      if (e.key === 'Escape') { e.preventDefault(); modals[modals.length - 1]?.tryClose(); }
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) && !(e.target.type === 'checkbox' || e.target.type === 'range' || e.target.type === 'color') || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;

    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); persist.saveFile(); return; }
    if (mod && (k === 'o' || k === 'O')) { e.preventDefault(); $('#projectInput').click(); return; }
    if (mod && (k === 'e' || k === 'E')) { e.preventDefault(); openExport(); return; }
    if (typing) {
      if (k === 'Escape') e.target.blur();
      return;
    }
    if (state.exporting) return;
    if (k === 'Escape' && !$('#ctxMenu').hidden) { ui.closeMenus(); return; }
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); history.redo(); return; }
    if (mod && (k === 'c' || k === 'C')) { e.preventDefault(); copySelected(); return; }
    if (mod && (k === 'x' || k === 'X')) { e.preventDefault(); copySelected(true); return; }
    if (mod && (k === 'v' || k === 'V')) { e.preventDefault(); pasteClipboard(); return; }
    if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); duplicateSelected(); return; }
    if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); selectAll(); return; }
    if (mod) return;

    const sel = selectedItems().filter((it) => !it.locked);
    switch (k) {
      case ' ':
        if (tag === 'BUTTON') return;
        e.preventDefault(); audioUnlock(); playback.toggle(); return;
      case 'Home': e.preventDefault(); playback.seek(0); return;
      case 'End': e.preventDefault(); playback.seek(state.stage.duration); return;
      case ',': playback.step(-1); return;
      case '.': playback.step(1); return;
      case 'Delete': case 'Backspace': e.preventDefault(); deleteSelected(); return;
      case 'Escape':
        if (state.tool !== 'select') setTool('select');
        else if (state.sel.size) { state.sel.clear(); ui.onSelectionChanged(); }
        return;
      case 'v': case 'V': setTool('select'); return;
      case 'f': case 'F': setTool('fire'); return;
      case 'l': case 'L': $('#btnLoop').click(); return;
      case 'm': case 'M': setSound(!audio.enabled); return;
      case 'g': case 'G': $('#toggleGhosts').click(); return;
      case '?': openHelp(); return;
      case '[': case '{': reorder(e.shiftKey ? 'back' : 'backward'); return;
      case ']': case '}': reorder(e.shiftKey ? 'front' : 'forward'); return;
      case 'Tab': {
        if (!state.items.length || (e.target !== view.overlay && e.target !== document.body)) return;
        e.preventDefault();
        const order = state.items.filter((it) => it.visible && !it.locked);
        if (!order.length) return;
        const cur = order.findIndex((it) => state.sel.has(it.id));
        const next = (cur + (e.shiftKey ? -1 : 1) + order.length) % order.length;
        state.sel = new Set([order[next].id]);
        ui.onSelectionChanged();
        return;
      }
      case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
        e.preventDefault();
        if (!sel.length) {
          if (k === 'ArrowLeft' || k === 'ArrowRight') {
            const dir = k === 'ArrowLeft' ? -1 : 1;
            if (e.shiftKey) { playback.pause(); playback.seek(state.t + dir); } else playback.step(dir);
          }
          return;
        }
        const d = e.shiftKey ? 10 : 1;
        for (const it of sel) {
          if (k === 'ArrowLeft') it.x -= d;
          if (k === 'ArrowRight') it.x += d;
          if (k === 'ArrowUp') it.y -= d;
          if (k === 'ArrowDown') it.y += d;
        }
        markDirty();
        syncInspector();
        commitSoon();
        return;
      }
      default:
        if (/^[0-9]$/.test(k)) {
          const idx = (parseInt(k, 10) + 9) % 10;
          const pr = SHELL_PRESETS[idx];
          if (pr) {
            state.firePreset = pr.id;
            if (state.tool !== 'fire') setTool('fire');
            else ui.updateToolButtons();
          }
        }
    }
  });
}

/* ---------- Sample show ---------- */

function demoProject() {
  const S = { w: 1920, h: 1080 };
  const B = (shell, preset, x, y, size, start, extra = {}) => {
    const pr = SHELL_PRESETS.find((p) => p.id === preset);
    return { type: 'burst', shell, color: pr.color, color2: pr.color2, colorMode: pr.colorMode, name: pr.name, x, y, w: size, h: size, start, launch: true, seed: Math.round(x * 31 + y * 17 + start * 1000), ...extra };
  };
  const G = (assetId, name, x, y, w, hh, start, extra = {}) => ({ type: 'sprite', assetId, name, x, y, w, h: hh, start, mode: 'loop', blend: 'screen', ...extra });
  return {
    format: 'fireworks-studio',
    version: 2,
    name: 'Sample show',
    stage: { ...defaultStage(), w: S.w, h: S.h, duration: 14 },
    items: [
      G('gif-8', 'Firework 10', 1540, 300, 420, 420, 0.6, { len: 4.4 }),
      G('gif-9', 'Firework 12', 400, 290, 600, 337, 5.6, { len: 4.6 }),
      G('gif-5', 'Firework 5', 1000, 230, 300, 300, 3.2, { mode: 'once' }),
      G('gif-11', 'Firework 13', 1360, 330, 560, 315, 9.2, { len: 4.6 }),
      B('willow', 'gold-willow', 960, 300, 560, 0.0),
      B('peony', 'red-peony', 560, 270, 430, 1.0),
      B('ring', 'blue-ring', 1350, 250, 400, 1.7),
      B('chrysanthemum', 'violet-mum', 760, 340, 470, 2.6),
      B('palm', 'green-palm', 1180, 380, 450, 3.5),
      B('heart', 'pink-heart', 960, 270, 380, 4.4),
      B('crossette', 'silver-crossette', 520, 300, 440, 5.3),
      B('strobe', 'white-strobe', 1420, 290, 430, 6.1),
      B('peony', 'patriot-peony', 960, 330, 500, 7.0),
      B('crackle', 'gold-crackle', 700, 250, 400, 7.9),
      B('peony', 'red-peony', 420, 260, 420, 9.0),
      B('ring', 'blue-ring', 1500, 240, 400, 9.25),
      B('chrysanthemum', 'violet-mum', 760, 300, 460, 9.5),
      B('crossette', 'silver-crossette', 1180, 280, 460, 9.75),
      B('willow', 'gold-willow', 960, 250, 640, 10.1),
      B('strobe', 'white-strobe', 600, 330, 420, 10.4),
      B('palm', 'green-palm', 1320, 330, 460, 10.6),
      B('crackle', 'gold-crackle', 960, 380, 520, 10.9),
    ],
    assets: [],
  };
}

/* ---------- Boot ---------- */

async function boot() {
  prefs.load();
  state.loop = prefs.get('loop', true);
  state.snap = prefs.get('snap', true);
  state.ghosts = prefs.get('ghosts', true);
  audio.enabled = prefs.get('sound', true);
  audio.volume = clamp(num(prefs.get('volume', 0.8), 0.8), 0, 1);
  const tlH = prefs.get('tlH', 0);
  if (tlH) document.documentElement.style.setProperty('--tl-h', `${clamp(tlH, 120, 700)}px`);

  view.scene = $('#scene');
  view.sctx = view.scene.getContext('2d');
  view.overlay = $('#overlay');
  view.octx = view.overlay.getContext('2d');
  view.stageEl = $('#stage');
  view.wrap = $('#stageWrap');

  buildChrome();
  buildTimeline();
  buildTransport();
  bindStage();
  bindKeys();

  for (const g of BUILTIN_GIFS) loadAsset({ ...g, kind: 'gif', builtin: true });
  buildLibrary();

  let restored = false;
  const saved = await persist.get('current');
  if (saved && saved.format === 'fireworks-studio') {
    try {
      await loadProject(saved);
      restored = true;
    } catch (e) {
      console.warn('Could not restore the saved show', e);
    }
  }
  if (!restored) await loadProject(demoProject());
  view.lastW = state.stage.w; view.lastH = state.stage.h;
  view.fit();
  ui.refreshAll();
  state.playing = state.items.length > 0;
  if (restored) ui.toast(`Restored “${state.name}” from your last visit`);
  ui.updateTransport();
  ui.setSaved(true);

  new ResizeObserver(() => { view.fit(); ui.layoutTimeline(); }).observe(view.wrap);
  window.addEventListener('resize', () => { view.fit(); ui.layoutTimeline(); });
  document.addEventListener('pointerdown', audioUnlock, { once: false, passive: true });
  window.addEventListener('beforeunload', () => { persist.saveNow(); });
  document.documentElement.classList.add('ready');
  requestAnimationFrame(frame);

  window.__fw = { state, assets, history, playback, renderScene, persist, ui, addBurst, addSprite, loadProject, serializeProject, decodeGif, GifWriter, fixWebmDuration, exportPng };
}
