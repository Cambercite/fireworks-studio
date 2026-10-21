const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.OUT || '/tmp';
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/fireworks-studio.html'));
  await page.waitForFunction(() => window.__fw && window.__fw.state.items.length > 0);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/desktop.png` });
  const info = await page.evaluate(() => {
    const { state, assets } = window.__fw;
    return { items: state.items.length, t: state.t, playing: state.playing, assets: [...assets.values()].map((a) => `${a.id}:${a.status}:${a.frames.length}`).join(' ') };
  });
  console.log(JSON.stringify(info));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
