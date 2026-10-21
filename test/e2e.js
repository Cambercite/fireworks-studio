// End-to-end checks against the built single-file app.
// Run: NODE_PATH=$(npm root -g) OUT=/some/dir node test/e2e.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.env.OUT || '/tmp';
const FILE = 'file://' + path.resolve(__dirname, '../dist/fireworks-studio.html');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => window.__fw && window.__fw.state.items.length > 0);
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify({ items: window.__fw.state.items, sel: [...window.__fw.state.sel], t: window.__fw.state.t, stage: window.__fw.state.stage, custom: window.__fw.state.customAssets })));
  const toScreen = async (x, y) => page.evaluate(([x, y]) => {
    const r = document.getElementById('overlay').getBoundingClientRect();
    const st = window.__fw.state.stage;
    return [r.left + (x / st.w) * r.width, r.top + (y / st.h) * r.height];
  }, [x, y]);

  check('sample show loads with 22 cues', (await S()).items.length === 22);

  // New show via File menu + in-page confirm.
  await page.click('#btnFile');
  await page.click('#fileMenu [data-act="new"]');
  await page.click('.modal-foot .btn.danger');
  await page.waitForTimeout(250);
  check('New show clears the stage', (await S()).items.length === 0);

  // Drag a shell from the library to the stage.
  const [dx, dy] = await toScreen(600, 300);
  await page.dragAndDrop('.lib-card[data-shell="red-peony"]', '#overlay', { targetPosition: await page.evaluate(([x, y]) => { const r = document.getElementById('overlay').getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; }, [dx, dy]) });
  let st = await S();
  check('drag a shell onto the sky', st.items.length === 1 && st.items[0].type === 'burst' && Math.abs(st.items[0].x - 600) < 4 && Math.abs(st.items[0].y - 300) < 4, `at ${st.items[0]?.x?.toFixed(1)},${st.items[0]?.y?.toFixed(1)}`);

  // Click a GIF card adds a sprite.
  await page.click('.lib-card[data-asset="gif-8"]');
  st = await S();
  const spr = st.items.find((i) => i.type === 'sprite');
  check('click a GIF card adds it', !!spr && st.sel[0] === spr.id);

  // Pause and park the playhead so the sprite is visible and steady.
  await page.evaluate(() => { window.__fw.playback.pause(); window.__fw.playback.seek(0.5); });
  // Move the sprite programmatically to a known place, then drag it with the mouse.
  await page.evaluate((id) => { const it = window.__fw.state.items.find((i) => i.id === id); it.x = 1200; it.y = 500; it.rot = 0; window.__fw.history.commit(); }, spr.id);
  let [sx, sy] = await toScreen(1200, 500);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 40, sy + 20, { steps: 5 });
  await page.mouse.up();
  st = await S();
  let it = st.items.find((i) => i.id === spr.id);
  const scale = await page.evaluate(() => document.getElementById('overlay').getBoundingClientRect().width / window.__fw.state.stage.w);
  check('drag moves the cue', Math.abs(it.x - (1200 + 40 / scale)) < 8 && Math.abs(it.y - (500 + 20 / scale)) < 8, `x=${it.x.toFixed(1)} y=${it.y.toFixed(1)}`);

  await page.keyboard.press('Control+z');
  st = await S();
  it = st.items.find((i) => i.id === spr.id);
  check('undo restores position', Math.abs(it.x - 1200) < 0.01 && Math.abs(it.y - 500) < 0.01);
  await page.keyboard.press('Control+Shift+z');
  st = await S();
  it = st.items.find((i) => i.id === spr.id);
  check('redo reapplies move', Math.abs(it.x - 1200) > 5);

  // Resize from the bottom-right corner keeps the aspect ratio.
  const before = it;
  const [cx, cy] = await toScreen(before.x + before.w / 2, before.y + before.h / 2);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 30, { steps: 6 });
  await page.mouse.up();
  st = await S();
  it = st.items.find((i) => i.id === spr.id);
  check('corner drag resizes proportionally', it.w > before.w + 20 && Math.abs(it.w / it.h - before.w / before.h) < 0.01, `${before.w.toFixed(0)}→${it.w.toFixed(0)}`);

  // Rotate handle sits above the top-centre.
  const rh = await page.evaluate((id) => {
    const it = window.__fw.state.items.find((i) => i.id === id);
    const r = document.getElementById('overlay').getBoundingClientRect();
    const sc = r.width / window.__fw.state.stage.w;
    return [r.left + it.x * sc, r.top + (it.y - it.h / 2) * sc - 26];
  }, spr.id);
  await page.mouse.move(rh[0], rh[1]);
  await page.mouse.down();
  await page.mouse.move(rh[0] + 80, rh[1] + 30, { steps: 6 });
  await page.mouse.up();
  st = await S();
  it = st.items.find((i) => i.id === spr.id);
  check('rotate handle rotates', Math.abs(it.rot) > 5, `rot=${it.rot}`);

  // Keyboard: nudge, duplicate, delete, undo.
  await page.focus('#overlay');
  const x0 = it.x;
  await page.keyboard.press('Shift+ArrowRight');
  st = await S();
  check('Shift+Arrow nudges 10 px', Math.abs(st.items.find((i) => i.id === spr.id).x - (x0 + 10)) < 0.01);
  await page.keyboard.press('Control+d');
  st = await S();
  check('Ctrl+D duplicates', st.items.length === 3);
  await page.keyboard.press('Delete');
  st = await S();
  check('Delete removes the selection', st.items.length === 2);
  await page.keyboard.press('Control+z');
  st = await S();
  check('undo brings it back', st.items.length === 3);

  // Inspector number field moves the cue.
  await page.evaluate((id) => { window.__fw.state.sel = new Set([id]); window.__fw.ui.onSelectionChanged(); }, spr.id);
  const xField = page.locator('#inspectorBody .f-row').filter({ hasText: /^X/ }).locator('input');
  await xField.fill('321');
  await xField.press('Enter');
  st = await S();
  check('inspector X field sets position', Math.abs(st.items.find((i) => i.id === spr.id).x - 321) < 0.01);

  // Fire tool: click the sky at the playhead.
  await page.evaluate(() => window.__fw.playback.seek(2));
  await page.keyboard.press('Escape');
  await page.focus('#overlay');
  await page.keyboard.press('f');
  const [fx, fy] = await toScreen(1500, 250);
  await page.mouse.click(fx, fy);
  st = await S();
  const fired = st.items[st.items.length - 1];
  check('Fire tool places a shell at the playhead', fired.type === 'burst' && Math.abs(fired.start - 2) < 0.01 && Math.abs(fired.x - 1500) < 4);
  await page.keyboard.press('v');

  // Timeline: drag the newest cue's bar right by 1 second.
  const pps = await page.evaluate(() => { const r = document.getElementById('tlRulerWrap'); return r.getBoundingClientRect().width; });
  const dur = st.stage.duration;
  const row = page.locator(`.tl-row[data-id="${fired.id}"] .tl-bar`);
  const bb = await row.boundingBox();
  const pxPerSec = (pps - 28) / dur;
  await page.mouse.move(bb.x + 4, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + 4 + pxPerSec, bb.y + bb.height / 2, { steps: 8 });
  await page.mouse.up();
  st = await S();
  const moved = st.items.find((i) => i.id === fired.id);
  check('timeline drag shifts start time', Math.abs(moved.start - 3) < 0.11, `start=${moved.start}`);

  // Change canvas to vertical: items rescale with the stage.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.__fw.state.sel.clear(); window.__fw.ui.onSelectionChanged(); });
  await page.locator('#inspectorBody .f-row').filter({ hasText: 'Canvas' }).locator('select').selectOption('vertical');
  st = await S();
  check('canvas preset changes stage size', st.stage.w === 1080 && st.stage.h === 1920);
  await page.keyboard.press('Control+z');
  st = await S();
  check('undo restores canvas size', st.stage.w === 1920 && st.stage.h === 1080);

  // Save show file, start new, reopen it.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')]);
  const showPath = path.join(OUT, 'saved.fireworks.json');
  await dl.saveAs(showPath);
  const saved = JSON.parse(fs.readFileSync(showPath, 'utf8'));
  check('Ctrl+S downloads a show file', saved.format === 'fireworks-studio' && saved.items.length === st.items.length);
  await page.click('#btnFile');
  await page.click('#fileMenu [data-act="new"]');
  await page.click('.modal-foot .btn.danger');
  await page.waitForTimeout(200);
  await page.setInputFiles('#projectInput', showPath);
  await page.waitForFunction((n) => window.__fw.state.items.length === n, saved.items.length);
  check('open show file restores cues', true);

  // Import a GIF through the file picker.
  const gifPath = path.resolve(__dirname, '../assets/gif-3.gif');
  await page.setInputFiles('#fileInput', gifPath);
  await page.waitForFunction(() => window.__fw.state.customAssets.length === 1);
  check('import adds to Your uploads', (await page.locator('#libUploads .lib-card').count()) === 1);
  await page.locator('#libUploads .lib-card').click();
  st = await S();
  check('uploaded GIF can be placed', st.items.some((i) => i.assetId === st.custom[0]));

  // Bad file is rejected with a message.
  const badPath = path.join(OUT, 'bad.gif');
  fs.writeFileSync(badPath, 'not really a gif');
  await page.setInputFiles('#fileInput', badPath);
  await page.waitForTimeout(300);
  check('damaged GIF shows an error toast', (await page.locator('.toast.error').count()) > 0);

  // Autosave survives a reload.
  await page.evaluate(() => window.__fw.persist.saveNow());
  const count = (await S()).items.length;
  await page.reload();
  await page.waitForFunction(() => window.__fw && window.__fw.state.items.length > 0);
  st = await S();
  check('autosave restores after reload', st.items.length === count && st.custom.length === 1, `${st.items.length}/${count}`);

  // PNG export.
  const [png] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.__fw.exportPng())]);
  const pngPath = path.join(OUT, 'frame.png');
  await png.saveAs(pngPath);
  const pngBytes = fs.readFileSync(pngPath);
  check('PNG export', pngBytes.slice(1, 4).toString() === 'PNG' && pngBytes.readUInt32BE(16) === 1920);

  // GIF export of one second at 320 px.
  await page.keyboard.press('Control+e');
  await page.click('.tab:has-text("Animated GIF")');
  await page.locator('.x-row').filter({ hasText: 'Width' }).locator('select').selectOption('320');
  const rangeInputs = page.locator('.x-range input');
  await rangeInputs.nth(0).fill('2'); await rangeInputs.nth(0).press('Tab');
  await rangeInputs.nth(1).fill('3'); await rangeInputs.nth(1).press('Tab');
  const [gifDl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('.modal-foot .btn.primary')]);
  const gifOut = path.join(OUT, 'export.gif');
  await gifDl.saveAs(gifOut);
  const gb = fs.readFileSync(gifOut);
  check('GIF export', gb.slice(0, 6).toString() === 'GIF89a' && gb.readUInt16LE(6) === 320, `${gb.length} bytes`);
  await page.click('.modal-foot .btn.primary'); // Done

  // Video export, 1.5 seconds.
  const formats = await page.evaluate(() => ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4'].filter((m) => MediaRecorder.isTypeSupported(m)));
  console.log('     recorder formats:', formats.join(', ') || 'none');
  await page.keyboard.press('Control+e');
  await page.click('.tab:has-text("Video")');
  const fmtSel = page.locator('.x-row').filter({ hasText: 'Format' }).locator('select');
  const opts = await fmtSel.locator('option').allTextContents();
  const webmIdx = opts.findIndex((o) => o.includes('WebM'));
  if (webmIdx >= 0) await fmtSel.selectOption(String(webmIdx));
  await page.locator('.x-row').filter({ hasText: 'Size' }).locator('select').selectOption('0.5');
  const vr = page.locator('.x-range input');
  await vr.nth(0).fill('9'); await vr.nth(0).press('Tab');
  await vr.nth(1).fill('10.5'); await vr.nth(1).press('Tab');
  const [vid] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('.modal-foot .btn.primary')]);
  const vidOut = path.join(OUT, 'export.' + (vid.suggestedFilename().split('.').pop()));
  await vid.saveAs(vidOut);
  const vb = fs.readFileSync(vidOut);
  const hasDuration = vb.indexOf(Buffer.from([0x44, 0x89, 0x88])) > 0;
  check('video export', vb.length > 10000, `${vid.suggestedFilename()} ${vb.length} bytes, duration element: ${hasDuration}`);
  await page.screenshot({ path: path.join(OUT, 'export-done.png') });
  await page.click('.modal-foot .btn.primary');

  check('no console errors', errors.length === 0, errors.join(' | '));

  // Phone layout.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const perr = [];
  phone.on('pageerror', (e) => perr.push(e.message));
  await phone.goto(FILE);
  await phone.waitForFunction(() => window.__fw && window.__fw.state.items.length > 0);
  await phone.waitForTimeout(1500);
  await phone.screenshot({ path: path.join(OUT, 'phone.png') });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('phone: no horizontal overflow', !overflow);
  await phone.tap('#btnLib');
  await phone.waitForTimeout(350);
  await phone.screenshot({ path: path.join(OUT, 'phone-library.png') });
  await phone.tap('.lib-card[data-shell="blue-ring"]');
  const n = await phone.evaluate(() => window.__fw.state.items.length);
  check('phone: tap a shell adds it', n > 0);
  check('phone: no page errors', perr.length === 0, perr.join(' | '));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
