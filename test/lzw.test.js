const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Uint8Array, Uint8ClampedArray, Int16Array, Uint32Array, DataView, Blob, RangeError, Error, Math, String, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/codecs.js'), 'utf8') + ';this.decodeGif=decodeGif;this.GifWriter=GifWriter;', ctx);
(async () => {
  let bad = 0;
  for (const [W, H, ncol] of [[640, 360, 200], [97, 61, 7], [800, 600, 256], [1, 1, 1]]) {
    const cols = Array.from({ length: ncol }, (_, i) => [((i * 37) % 32) * 8 + 4, ((i * 11) % 32) * 8 + 4, ((i * 5 + (i >> 5)) % 32) * 8 + 4]);
    const data = new Uint8ClampedArray(W * H * 4);
    let seed = 1;
    for (let i = 0; i < W * H; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const c = cols[(i % 13 < 6 ? (i / 50) | 0 : seed >>> 8) % ncol];
      data.set([c[0], c[1], c[2], 255], i * 4);
    }
    const w = new ctx.GifWriter(W, H, true);
    w.addFrame(data, 4);
    const g = ctx.decodeGif(new Uint8Array(await w.finish().arrayBuffer()));
    let diff = 0;
    for (let i = 0; i < data.length; i++) if (i % 4 !== 3 && data[i] !== g.frames[0].data[i]) diff++;
    console.log(`${W}x${H} ${ncol} colours: ${diff} differing channels`);
    if (diff) bad++;
  }
  process.exit(bad ? 1 : 0);
})();
