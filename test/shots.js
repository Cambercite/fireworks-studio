const { chromium } = require('playwright');
const path = require('path');
const OUT = process.env.OUT;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file://' + path.resolve(__dirname, '../dist/fireworks-studio.html'));
  await page.waitForFunction(() => window.__fw && window.__fw.state.items.length > 0);
  await page.evaluate(() => {
    const fw = window.__fw; fw.playback.pause(); fw.playback.seek(4.9);
    const it = fw.state.items.find((i) => i.name === 'Green Palm');
    fw.state.sel = new Set([it.id]); fw.ui.onSelectionChanged(); fw.ui.refreshTimeline();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/selected.png` });
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/export.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.click('#btnHelp');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/help.png` });
  await browser.close();
})();
