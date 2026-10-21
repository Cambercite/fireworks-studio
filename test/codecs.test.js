const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Uint8Array, Uint8ClampedArray, Int16Array, Uint32Array, DataView, Blob, RangeError, Error, Math, String, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/codecs.js'), 'utf8') + ';this.decodeGif=decodeGif;this.GifWriter=GifWriter;this.fixWebmDuration=fixWebmDuration;', ctx);
const assets = path.join(__dirname, '../assets');
let fails = 0;
(async () => {
  for (const f of fs.readdirSync(assets).filter((x) => x.endsWith('.gif'))) {
    const g = ctx.decodeGif(fs.readFileSync(path.join(assets, f)));
    const w = new ctx.GifWriter(g.width, g.height, true);
    for (const fr of g.frames) w.addFrame(fr.data, Math.round(fr.delay / 10));
    const blob = w.finish();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const g2 = ctx.decodeGif(bytes);
    // Compare opaque pixels after round trip (encoder drops alpha, quantizes).
    let err = 0, n = 0;
    for (let i = 0; i < g.frames.length; i++) {
      const a = g.frames[i].data, b = g2.frames[i].data;
      for (let p = 0; p < a.length; p += 4) {
        if (a[p + 3] === 0) continue;
        err += Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]); n += 3;
      }
    }
    const mae = err / Math.max(1, n);
    const ok = g2.frames.length === g.frames.length && g2.width === g.width && mae < 12;
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${f} ${g.width}x${g.height} frames=${g.frames.length} delays=${g.frames.map(x=>x.delay).slice(0,3)}… roundtrip MAE=${mae.toFixed(2)} size=${bytes.length}`);
  }
  // Large noisy frame exercises dictionary resets and 12-bit codes.
  const W = 400, H = 300, data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = (i * 7919) % 256; data[i + 1] = (i * 104729) % 256; data[i + 2] = (i >> 6) % 256; data[i + 3] = 255; }
  const w = new ctx.GifWriter(W, H, false); w.addFrame(data, 5);
  const g = ctx.decodeGif(new Uint8Array(await w.finish().arrayBuffer()));
  const okNoise = g.frames.length === 1 && g.width === W;
  if (!okNoise) fails++;
  console.log(`${okNoise ? 'ok  ' : 'FAIL'} noise frame encodes/decodes`);
  // Truncated GIF keeps frames decoded so far.
  const big = fs.readFileSync(path.join(assets, 'gif-9.gif'));
  const part = ctx.decodeGif(big.subarray(0, Math.floor(big.length * 0.6)));
  console.log(`${part.frames.length > 0 ? 'ok  ' : 'FAIL'} truncated gif kept ${part.frames.length} frames`);
  try { ctx.decodeGif(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])); fails++; console.log('FAIL not-a-gif accepted'); }
  catch (e) { console.log('ok   rejects non-GIF: ' + e.message); }
  process.exit(fails ? 1 : 0);
})();
