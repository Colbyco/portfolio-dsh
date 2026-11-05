// Lossless PNG re-encoder (no dependencies; Node >= 22 for zlib.crc32).
//
// For 8-bit, non-interlaced RGB/RGBA files it:
//   * drops the alpha channel when every pixel is fully opaque (pixel values unchanged),
//   * re-filters scanlines and re-deflates the image data at maximum compression,
//   * keeps the colour chunks browsers use (gAMA, cHRM, sRGB, iCCP) byte-for-byte,
//   * drops metadata that does not affect rendering (tEXt/zTXt/iTXt/tIME/bKGD/pHYs).
// The result is decoded again and compared pixel-by-pixel with the original; if anything
// differs, or the file would not get smaller, the original bytes are returned unchanged.
import zlib from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KEEP = new Set(["gAMA", "cHRM", "sRGB", "iCCP"]);

function readChunks(file) {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  const chunks = [];
  for (let offset = 8; offset < file.length; ) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    chunks.push({ type, data: file.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// Returns the raw pixel bytes (no filter bytes) of an 8-bit non-interlaced image.
function decode(chunks) {
  const ihdr = chunks.find((c) => c.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = ihdr.subarray(8);
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) return null;
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
  const data = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    const line = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      if (predictor === undefined) throw new Error(`bad filter ${filter}`);
      pixels[y * stride + x] = (line[x] + predictor) & 255;
    }
  }
  return { width, height, colorType, bpp, pixels };
}

function filterLine(pixels, y, stride, bpp, type) {
  const out = Buffer.alloc(stride);
  for (let x = 0; x < stride; x++) {
    const v = pixels[y * stride + x];
    const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
    const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
    const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;
    out[x] = (v - [0, a, b, (a + b) >> 1, paeth(a, b, c)][type]) & 255;
  }
  return out;
}

function encodeIdat({ width, height, bpp, pixels }) {
  const stride = width * bpp;
  const plans = ["0", "1", "2", "3", "4", "adaptive"];
  let best = null;
  for (const plan of plans) {
    const lines = [];
    for (let y = 0; y < height; y++) {
      let type = Number(plan), line;
      if (plan === "adaptive") {
        let score = Infinity;
        for (let t = 0; t < 5; t++) {
          const candidate = filterLine(pixels, y, stride, bpp, t);
          const s = candidate.reduce((sum, v) => sum + (v < 128 ? v : 256 - v), 0);
          if (s < score) { score = s; type = t; line = candidate; }
        }
      } else line = filterLine(pixels, y, stride, bpp, type);
      lines.push(Buffer.from([type]), line);
    }
    const raw = Buffer.concat(lines);
    for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED]) {
      const z = zlib.deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15, strategy });
      if (!best || z.length < best.length) best = z;
    }
  }
  return best;
}

export function optimizePng(original) {
  const chunks = readChunks(original);
  const image = decode(chunks);
  if (!image) return { bytes: original, changed: false, reason: "unsupported format" };
  let { pixels, bpp, colorType } = image;
  if (colorType === 6) {
    let opaque = true;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) { opaque = false; break; }
    if (opaque) {
      const rgb = Buffer.alloc((pixels.length / 4) * 3);
      for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) { rgb[j] = pixels[i]; rgb[j + 1] = pixels[i + 1]; rgb[j + 2] = pixels[i + 2]; }
      pixels = rgb; bpp = 3; colorType = 2;
    }
  }
  const ihdr = Buffer.from(chunks.find((c) => c.type === "IHDR").data);
  ihdr[9] = colorType;
  const idat = encodeIdat({ width: image.width, height: image.height, bpp, pixels });
  const kept = chunks.filter((c) => KEEP.has(c.type)).map((c) => chunk(c.type, c.data));
  const bytes = Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), ...kept, chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);

  // Verify: identical pixels (as RGBA) and identical colour chunks.
  const check = decode(readChunks(bytes));
  const asRgba = (img) => {
    if (img.colorType === 6) return img.pixels;
    const out = Buffer.alloc((img.pixels.length / 3) * 4);
    for (let i = 0, j = 0; i < img.pixels.length; i += 3, j += 4) { out[j] = img.pixels[i]; out[j + 1] = img.pixels[i + 1]; out[j + 2] = img.pixels[i + 2]; out[j + 3] = 255; }
    return out;
  };
  if (!asRgba(check).equals(asRgba(image)) || check.width !== image.width || check.height !== image.height) {
    return { bytes: original, changed: false, reason: "verification failed" };
  }
  if (bytes.length >= original.length) return { bytes: original, changed: false, reason: "not smaller" };
  return { bytes, changed: true, reason: `${colorType === image.colorType ? "re-deflated" : "RGBA->RGB (opaque), re-deflated"}; kept ${kept.length} colour chunk(s)` };
}
