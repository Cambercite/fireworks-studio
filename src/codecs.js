/* ==========================================================================
   Codecs: GIF decoder, GIF encoder (median-cut + LZW), WebM duration fix.
   No dependencies. Everything here is pure and synchronous except where noted.
   ========================================================================== */

/* ---------- GIF decoding ---------- */

function lzwDecode(minCodeSize, data, pixelCount) {
  const out = new Uint8Array(pixelCount);
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; }

  let codeSize = minCodeSize + 1;
  let codeMask = (1 << codeSize) - 1;
  let avail = clear + 2;
  let old = -1, first = 0, top = 0, datum = 0, bits = 0, di = 0, pi = 0;

  while (pi < pixelCount) {
    if (top === 0) {
      if (bits < codeSize) {
        if (di >= data.length) break;
        datum |= data[di++] << bits;
        bits += 8;
        continue;
      }
      let code = datum & codeMask;
      datum >>= codeSize;
      bits -= codeSize;
      if (code === clear) {
        codeSize = minCodeSize + 1;
        codeMask = (1 << codeSize) - 1;
        avail = clear + 2;
        old = -1;
        continue;
      }
      if (code === eoi) break;
      if (old === -1) {
        if (code >= clear) break; // corrupt stream
        stack[top++] = suffix[code];
        old = code;
        first = code;
        continue;
      }
      if (code > avail) break; // corrupt stream
      const inCode = code;
      if (code === avail) { stack[top++] = first; code = old; }
      while (code >= clear && top < 4096) { stack[top++] = suffix[code]; code = prefix[code]; }
      first = suffix[code];
      stack[top++] = first;
      if (avail < 4096) {
        prefix[avail] = old;
        suffix[avail] = first;
        avail++;
        if ((avail & codeMask) === 0 && avail < 4096) { codeSize++; codeMask += avail; }
      }
      old = inCode;
    }
    out[pi++] = stack[--top];
  }
  return out;
}

/**
 * Decode a GIF into fully composited RGBA frames.
 * Returns { width, height, frames: [{ data: Uint8ClampedArray, delay }] }.
 * Truncated files keep whatever frames decoded cleanly.
 */
function decodeGif(bytes) {
  const d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (d.length < 13) throw new Error('This file is too small to be a GIF.');
  const sig = String.fromCharCode(d[0], d[1], d[2], d[3], d[4], d[5]);
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('This file is not a GIF.');

  const W = d[6] | (d[7] << 8);
  const H = d[8] | (d[9] << 8);
  if (!W || !H) throw new Error('This GIF has no size.');
  if (W * H > 4096 * 4096) throw new Error('This GIF is larger than 4096×4096 pixels.');
  const lsd = d[10];
  let p = 13;
  let gct = null;
  if (lsd & 0x80) {
    const n = 3 * (1 << ((lsd & 7) + 1));
    gct = d.subarray(p, p + n);
    p += n;
  }

  const screen = new Uint8ClampedArray(W * H * 4);
  const frames = [];
  let gce = { disposal: 0, delay: 0, trans: -1 };
  let prevDisposal = 0, prevRect = null, saved = null;

  const need = (n) => { if (p + n > d.length) throw new RangeError('truncated'); };
  const readSubBlocks = () => {
    const chunks = [];
    let total = 0;
    for (;;) {
      need(1);
      const size = d[p++];
      if (size === 0) break;
      need(size);
      chunks.push(d.subarray(p, p + size));
      total += size;
      p += size;
    }
    const buf = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { buf.set(c, o); o += c.length; }
    return buf;
  };
  const skipSubBlocks = () => {
    for (;;) {
      need(1);
      const size = d[p++];
      if (size === 0) return;
      need(size);
      p += size;
    }
  };

  try {
    while (p < d.length) {
      const block = d[p++];
      if (block === 0x21) {
        need(1);
        const label = d[p++];
        if (label === 0xf9) {
          need(6);
          const packed = d[p + 1];
          gce = {
            disposal: (packed >> 2) & 7,
            delay: (d[p + 2] | (d[p + 3] << 8)) * 10,
            trans: packed & 1 ? d[p + 4] : -1,
          };
          p += 1 + d[p];
          skipSubBlocks();
        } else {
          skipSubBlocks();
        }
      } else if (block === 0x2c) {
        need(9);
        const fx = d[p] | (d[p + 1] << 8);
        const fy = d[p + 2] | (d[p + 3] << 8);
        const fw = d[p + 4] | (d[p + 5] << 8);
        const fh = d[p + 6] | (d[p + 7] << 8);
        const packed = d[p + 8];
        p += 9;
        let pal = gct;
        if (packed & 0x80) {
          const n = 3 * (1 << ((packed & 7) + 1));
          need(n);
          pal = d.subarray(p, p + n);
          p += n;
        }
        const interlaced = !!(packed & 0x40);
        need(1);
        const minCode = d[p++];
        if (minCode < 2 || minCode > 11) throw new RangeError('bad lzw');
        const data = readSubBlocks();

        // Dispose of the previous frame.
        if (prevDisposal === 2 && prevRect) {
          clearRect(screen, W, H, prevRect);
        } else if (prevDisposal === 3 && saved) {
          screen.set(saved);
        }
        saved = gce.disposal === 3 ? screen.slice() : null;

        if (pal && fw && fh) {
          let idx = lzwDecode(minCode, data, fw * fh);
          if (interlaced) idx = deinterlace(idx, fw, fh);
          blit(screen, W, H, idx, fx, fy, fw, fh, pal, gce.trans);
        }
        frames.push({ data: screen.slice(), delay: gce.delay < 20 ? 100 : gce.delay });
        prevDisposal = gce.disposal;
        prevRect = { x: fx, y: fy, w: fw, h: fh };
        gce = { disposal: 0, delay: 0, trans: -1 };
      } else if (block === 0x3b) {
        break;
      } else {
        break; // unknown block: stop and keep what we have
      }
    }
  } catch (err) {
    if (!(err instanceof RangeError) || frames.length === 0) {
      throw new Error('This GIF is damaged and could not be read.');
    }
  }
  if (!frames.length) throw new Error('This GIF has no frames.');
  return { width: W, height: H, frames };
}

function clearRect(screen, W, H, r) {
  const x1 = Math.min(W, r.x + r.w), y1 = Math.min(H, r.y + r.h);
  for (let y = r.y; y < y1; y++) {
    screen.fill(0, (y * W + r.x) * 4, (y * W + x1) * 4);
  }
}

function deinterlace(idx, w, h) {
  const out = new Uint8Array(idx.length);
  const passes = [[0, 8], [4, 8], [2, 4], [1, 2]];
  let row = 0;
  for (const [start, step] of passes) {
    for (let y = start; y < h; y += step) {
      out.set(idx.subarray(row * w, row * w + w), y * w);
      row++;
    }
  }
  return out;
}

function blit(screen, W, H, idx, fx, fy, fw, fh, pal, trans) {
  const palLen = pal.length / 3;
  for (let y = 0; y < fh; y++) {
    const sy = fy + y;
    if (sy >= H) break;
    for (let x = 0; x < fw; x++) {
      const sx = fx + x;
      if (sx >= W) break;
      const ci = idx[y * fw + x];
      if (ci === trans || ci >= palLen) continue;
      const o = (sy * W + sx) * 4;
      screen[o] = pal[ci * 3];
      screen[o + 1] = pal[ci * 3 + 1];
      screen[o + 2] = pal[ci * 3 + 2];
      screen[o + 3] = 255;
    }
  }
}

/* ---------- GIF encoding ---------- */

/** Median-cut palette (up to 256 colours) for one RGBA frame. */
function buildPalette(rgba, maxColors) {
  const hist = new Uint32Array(32768);
  const step = Math.max(1, Math.floor(rgba.length / 4 / 60000));
  for (let i = 0; i < rgba.length; i += 4 * step) {
    hist[((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)]++;
  }
  const bins = [];
  for (let k = 0; k < 32768; k++) if (hist[k]) bins.push(k);
  const boxes = [makeBox(bins, hist)];
  while (boxes.length < maxColors) {
    let best = -1, bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.bins.length < 2) continue;
      const score = b.range * Math.sqrt(b.count);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    const b = boxes[best];
    const shift = b.axis === 0 ? 10 : b.axis === 1 ? 5 : 0;
    b.bins.sort((a, c) => ((a >> shift) & 31) - ((c >> shift) & 31));
    let acc = 0, cut = 0;
    const half = b.count / 2;
    for (; cut < b.bins.length - 1; cut++) {
      acc += hist[b.bins[cut]];
      if (acc >= half) break;
    }
    if (cut > b.bins.length - 2) cut = b.bins.length - 2;
    const left = b.bins.slice(0, cut + 1), right = b.bins.slice(cut + 1);
    if (!right.length) { b.range = 0; continue; }
    boxes.splice(best, 1, makeBox(left, hist), makeBox(right, hist));
  }
  const palette = new Uint8Array(768);
  boxes.forEach((b, i) => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const k of b.bins) {
      const c = hist[k];
      r += (((k >> 10) & 31) * 8 + 4) * c;
      g += (((k >> 5) & 31) * 8 + 4) * c;
      bl += ((k & 31) * 8 + 4) * c;
      n += c;
    }
    n = n || 1;
    palette[i * 3] = Math.round(r / n);
    palette[i * 3 + 1] = Math.round(g / n);
    palette[i * 3 + 2] = Math.round(bl / n);
  });
  return { palette, size: Math.max(1, boxes.length) };
}

function makeBox(bins, hist) {
  let rmin = 31, rmax = 0, gmin = 31, gmax = 0, bmin = 31, bmax = 0, count = 0;
  for (const k of bins) {
    const r = (k >> 10) & 31, g = (k >> 5) & 31, b = k & 31;
    if (r < rmin) rmin = r; if (r > rmax) rmax = r;
    if (g < gmin) gmin = g; if (g > gmax) gmax = g;
    if (b < bmin) bmin = b; if (b > bmax) bmax = b;
    count += hist[k];
  }
  const rr = rmax - rmin, gr = gmax - gmin, br = bmax - bmin;
  const axis = gr >= rr && gr >= br ? 1 : rr >= br ? 0 : 2;
  return { bins, count, axis, range: Math.max(rr, gr, br) };
}

function mapToPalette(rgba, palette, size) {
  const lut = new Int16Array(32768).fill(-1);
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    let ci = lut[key];
    if (ci < 0) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      let best = 0, bd = Infinity;
      for (let c = 0; c < size; c++) {
        const dr = palette[c * 3] - r, dg = palette[c * 3 + 1] - g, db = palette[c * 3 + 2] - b;
        const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (dist < bd) { bd = dist; best = c; if (dist === 0) break; }
      }
      ci = lut[key] = best;
    }
    out[j] = ci;
  }
  return out;
}

function lzwEncode(pixels, out) {
  const minCode = 8, clear = 256, eoi = 257;
  const dict = new Int16Array(4096 * 256);
  let codeSize = 9, next = 258;
  let cur = 0, curBits = 0;
  const block = new Uint8Array(255);
  let bl = 0;
  const flushBlock = () => {
    if (!bl) return;
    out.byte(bl);
    out.bytes(block.subarray(0, bl));
    bl = 0;
  };
  const emit = (code) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) {
      block[bl++] = cur & 255;
      if (bl === 255) flushBlock();
      cur >>= 8;
      curBits -= 8;
    }
  };
  const reset = () => { dict.fill(-1); next = 258; };

  out.byte(minCode);
  reset();
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = prefix * 256 + k;
    const c = dict[key];
    if (c !== -1) { prefix = c; continue; }
    emit(prefix);
    if (next > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
    if (next < 4096) {
      dict[key] = next++;
    } else {
      emit(clear);
      reset();
      codeSize = 9;
    }
    prefix = k;
  }
  emit(prefix);
  if (next > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
  emit(eoi);
  if (curBits > 0) { block[bl++] = cur & 255; if (bl === 255) flushBlock(); }
  flushBlock();
  out.byte(0);
}

class ByteWriter {
  constructor() { this.chunks = []; this.buf = new Uint8Array(1 << 16); this.n = 0; }
  byte(b) { if (this.n === this.buf.length) this.spill(); this.buf[this.n++] = b; }
  word(w) { this.byte(w & 255); this.byte((w >> 8) & 255); }
  bytes(arr) { for (let i = 0; i < arr.length; i++) this.byte(arr[i]); }
  str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  spill() { this.chunks.push(this.buf.slice(0, this.n)); this.n = 0; }
  blob(type) { this.spill(); return new Blob(this.chunks, { type }); }
}

/** Streaming GIF writer: call addFrame(rgba, delayCs) repeatedly, then finish(). */
class GifWriter {
  constructor(width, height, loop = true) {
    this.w = width; this.h = height;
    const o = (this.out = new ByteWriter());
    o.str('GIF89a');
    o.word(width); o.word(height);
    o.byte(0x70); // no global colour table, 8-bit colour resolution
    o.byte(0); o.byte(0);
    if (loop) {
      o.byte(0x21); o.byte(0xff); o.byte(11); o.str('NETSCAPE2.0');
      o.byte(3); o.byte(1); o.word(0); o.byte(0);
    }
  }
  addFrame(rgba, delayCs) {
    const { palette, size } = buildPalette(rgba, 256);
    const idx = mapToPalette(rgba, palette, size);
    const o = this.out;
    o.byte(0x21); o.byte(0xf9); o.byte(4);
    o.byte(0x04); // dispose: do not dispose, no transparency
    o.word(Math.max(2, delayCs)); o.byte(0); o.byte(0);
    o.byte(0x2c); o.word(0); o.word(0); o.word(this.w); o.word(this.h);
    o.byte(0x87); // local colour table, 256 entries
    o.bytes(palette);
    lzwEncode(idx, o);
  }
  finish() { this.out.byte(0x3b); return this.out.blob('image/gif'); }
}

/* ---------- WebM duration fix ----------
   Chrome's MediaRecorder writes WebM files without a Duration element, so
   players cannot show length or seek. This inserts one into Segment > Info.
   Any surprise in the structure returns the original bytes untouched. */

function readVint(d, p) {
  const first = d[p];
  if (first === undefined) return null;
  let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 8) return null;
  let value = first & (mask - 1);
  let allOnes = value === mask - 1;
  for (let i = 1; i < len; i++) {
    const b = d[p + i];
    if (b === undefined) return null;
    if (b !== 0xff) allOnes = false;
    value = value * 256 + b;
  }
  return { len, value, unknown: allOnes };
}
function readId(d, p) {
  const first = d[p];
  let len = 1, mask = 0x80;
  while (len <= 4 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 4) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + d[p + i];
  return { len, id };
}
function encodeSize(n) {
  // 8-byte size vint keeps things simple.
  const out = new Uint8Array(8);
  out[0] = 0x01;
  let v = n;
  for (let i = 7; i >= 1; i--) { out[i] = v % 256; v = Math.floor(v / 256); }
  return out;
}

function fixWebmDuration(bytes, durationMs) {
  try {
    const d = bytes;
    let p = 0;
    const ebml = readId(d, p);
    if (!ebml || ebml.id !== 0x1a45dfa3) return bytes;
    p += ebml.len;
    const ebmlSize = readVint(d, p);
    p += ebmlSize.len + ebmlSize.value;
    const seg = readId(d, p);
    if (!seg || seg.id !== 0x18538067) return bytes;
    p += seg.len;
    const segSize = readVint(d, p);
    p += segSize.len;
    // Walk segment children to find Info.
    for (let guard = 0; guard < 64 && p < d.length; guard++) {
      const id = readId(d, p);
      if (!id) return bytes;
      const size = readVint(d, p + id.len);
      if (!size) return bytes;
      const bodyStart = p + id.len + size.len;
      if (id.id === 0x1549a966) {
        if (size.unknown) return bytes;
        const bodyEnd = bodyStart + size.value;
        // Look for existing Duration and TimecodeScale.
        let q = bodyStart, scale = 1000000;
        while (q < bodyEnd) {
          const cid = readId(d, q);
          const cs = readVint(d, q + cid.len);
          const cb = q + cid.len + cs.len;
          if (cid.id === 0x4489) return bytes; // already has Duration
          if (cid.id === 0x2ad7b1) {
            let v = 0;
            for (let i = 0; i < cs.value; i++) v = v * 256 + d[cb + i];
            scale = v || scale;
          }
          q = cb + cs.value;
        }
        const dur = new Uint8Array(11);
        dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88;
        new DataView(dur.buffer).setFloat64(3, (durationMs * 1000000) / scale);
        const newSize = encodeSize(size.value + dur.length);
        const head = d.subarray(0, p + id.len);
        const body = d.subarray(bodyStart, bodyEnd);
        const tail = d.subarray(bodyEnd);
        const out = new Uint8Array(head.length + newSize.length + body.length + dur.length + tail.length);
        let o = 0;
        out.set(head, o); o += head.length;
        out.set(newSize, o); o += newSize.length;
        out.set(body, o); o += body.length;
        out.set(dur, o); o += dur.length;
        out.set(tail, o);
        return out;
      }
      if (size.unknown) return bytes;
      p = bodyStart + size.value;
    }
  } catch (e) {
    /* fall through */
  }
  return bytes;
}
