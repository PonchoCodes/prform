// Builds the app icons from the PRform wordmark.
//
//   node scripts/buildIcons.mjs "path/to/PRForm Favicon.png"
//
// Replaces the placeholders from generatePlaceholderIcons.mjs. Run it again
// whenever the source artwork changes.
//
// PNG decoding and scaling are done by hand rather than with an image library,
// because the alternative was adding a native dependency (sharp is ~30MB of
// platform binaries) to a project that needs it four times, at build time, for
// flat-colour art. The source is a hard-edged logo in three colours, which
// box-averages down cleanly; this would be the wrong call for a photograph.

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/**
 * Fallback field colour, used only when the source has a transparent corner.
 *
 * Normally the field is sampled from the artwork itself (see `fieldColourOf`).
 * Filling with the design token instead leaves a visible frame wherever the
 * artwork's own black is a shade off it, which at icon sizes reads as a border
 * somebody drew on purpose.
 */
const FALLBACK_BACKGROUND = [0x0a, 0x0a, 0x0a];

/** The artwork's own field colour, taken from its top-left pixel. */
function fieldColourOf(source) {
  const [r, g, b, a] = source.data.subarray(0, 4);
  return a === 255 ? [r, g, b] : FALLBACK_BACKGROUND;
}

// ── decode ──────────────────────────────────────────────────────────────────

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNGs are not supported");
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      transparency = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`only 8-bit PNGs are supported (got ${bitDepth})`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);

  // Undo the per-scanline filters. Each line's filter byte says how it was
  // encoded relative to the pixel to its left (a) and the line above (b).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      let value = line[i];

      switch (filter) {
        case 0: break;
        case 1: value += a; break;
        case 2: value += b; break;
        case 3: value += Math.floor((a + b) / 2); break;
        case 4: {
          // Paeth: pick whichever neighbour the gradient predicts.
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`unknown filter ${filter}`);
      }
      out[i] = value & 0xff;
    }
  }

  // Normalize everything to RGBA so the rest of the script has one shape.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r, g, b, a = 255;
    if (colorType === 6) {
      [r, g, b, a] = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2], pixels[i * 4 + 3]];
    } else if (colorType === 2) {
      [r, g, b] = [pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]];
    } else if (colorType === 3) {
      const idx = pixels[i];
      [r, g, b] = [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
      if (transparency && idx < transparency.length) a = transparency[idx];
    } else if (colorType === 0) {
      r = g = b = pixels[i];
    } else {
      r = g = b = pixels[i * 2];
      a = pixels[i * 2 + 1];
    }
    rgba.set([r, g, b, a], i * 4);
  }

  return { width, height, data: rgba };
}

// ── encode ──────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── transform ───────────────────────────────────────────────────────────────

/**
 * Square canvas, the source scaled to `fill` of it and centred, on the field
 * colour.
 *
 * Area averaging rather than nearest neighbour: a hard-edged logo reduced by
 * nearest neighbour loses whole strokes at small sizes, which is exactly where
 * an app icon lives.
 */
function render(source, size, fill, transparentBackground = false) {
  const field = [...fieldColourOf(source), 255];
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    out.set(transparentBackground ? [0, 0, 0, 0] : field, i * 4);
  }

  const scale = Math.min((size * fill) / source.width, (size * fill) / source.height);
  const drawW = Math.round(source.width * scale);
  const drawH = Math.round(source.height * scale);
  const offsetX = Math.round((size - drawW) / 2);
  const offsetY = Math.round((size - drawH) / 2);

  for (let y = 0; y < drawH; y++) {
    // The source rows this destination row averages over.
    const sy0 = Math.floor((y / drawH) * source.height);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) / drawH) * source.height));

    for (let x = 0; x < drawW; x++) {
      const sx0 = Math.floor((x / drawW) * source.width);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) / drawW) * source.width));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const p = (sy * source.width + sx) * 4;
          r += source.data[p];
          g += source.data[p + 1];
          b += source.data[p + 2];
          a += source.data[p + 3];
          n++;
        }
      }

      const dp = ((y + offsetY) * size + (x + offsetX)) * 4;
      if (dp >= 0 && dp + 3 < out.length) {
        out.set([Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)], dp);
      }
    }
  }

  return { width: size, height: size, data: out };
}

/**
 * The status-bar badge: a silhouette, not a picture.
 *
 * Android throws away the colour of a badge and keeps only the alpha channel,
 * so a normal icon arrives as a solid grey square. Everything that is not the
 * dark field becomes opaque white, and the field becomes transparent, leaving
 * the letterforms.
 */
function silhouette(image) {
  const out = Buffer.from(image.data);
  for (let i = 0; i < out.length; i += 4) {
    const luminance = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
    const isField = luminance < 64;
    out.set(isField ? [0, 0, 0, 0] : [255, 255, 255, 255], i);
  }
  return { ...image, data: out };
}

// ── run ─────────────────────────────────────────────────────────────────────

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error('usage: node scripts/buildIcons.mjs "path/to/PRForm Favicon.png"');
  process.exit(1);
}

const source = decodePng(readFileSync(sourcePath));
console.log(`source: ${source.width}x${source.height}`);
mkdirSync(OUT_DIR, { recursive: true });

const files = [
  // Chrome will not offer to install without these two.
  ["icon-192.png", render(source, 192, 0.92)],
  ["icon-512.png", render(source, 512, 0.92)],
  // Maskable: the mark sits inside the middle 80%, so a launcher can crop it
  // to a circle, squircle or teardrop without cutting into the letters.
  ["icon-maskable-512.png", render(source, 512, 0.66)],
  // Alpha-only, so the OS silhouette is the wordmark rather than a square.
  ["icon-badge.png", silhouette(render(source, 96, 0.95, true))],
];

for (const [name, image] of files) {
  const buffer = encodePng(image);
  writeFileSync(join(OUT_DIR, name), buffer);
  console.log(`wrote public/icons/${name} (${image.width}x${image.height}, ${buffer.length} bytes)`);
}

// The iOS home-screen icon, as a static file rather than a generated route.
// Safari fetches this exactly once, at the moment the athlete taps Add to Home
// Screen, and a fetch that fails then leaves a screenshot tile forever — so
// the least failure-prone thing that can serve it is a PNG on the CDN. Next
// picks the file up by its conventional name and emits the apple-touch-icon
// link. iOS ignores any transparency, so the artwork's own field fills the
// canvas edge to edge.
const APPLE_OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "apple-icon.png");
const apple = render(source, 180, 0.92);
const appleBuffer = encodePng(apple);
writeFileSync(APPLE_OUT, appleBuffer);
console.log(`wrote app/apple-icon.png (180x180, ${appleBuffer.length} bytes)`);
