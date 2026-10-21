const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.env.OUT;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('file://' + path.resolve(__dirname, '../dist/fireworks-studio.html'));
  await page.waitForFunction(() => window.__fw && window.__fw.state.items.length > 0);
  await page.waitForTimeout(300);
  const times = (process.env.TIMES || '1.3,2.4,3.3,4.2,5.0,5.9,6.8,7.6,8.8,10.5,11.5,12.3').split(',').map(Number);
  const url = await page.evaluate((times) => {
    const { renderScene } = window.__fw;
    const W = 640, H = 360, cols = 3;
    const sheet = document.createElement('canvas');
    sheet.width = W * cols; sheet.height = H * Math.ceil(times.length / cols);
    const sc = sheet.getContext('2d');
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    times.forEach((t, i) => {
      renderScene(c.getContext('2d'), W, H, t, false);
      sc.drawImage(c, (i % cols) * W, Math.floor(i / cols) * H);
      sc.fillStyle = '#fff'; sc.font = '16px monospace'; sc.fillText(t + 's', (i % cols) * W + 8, Math.floor(i / cols) * H + 20);
    });
    return sheet.toDataURL('image/png');
  }, times);
  fs.writeFileSync(`${OUT}/frames.png`, Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
})();
