import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "../..");
const OUTPUT_DIR = resolve(ROOT, "apps/extension/public/icons");
const SIZES = [16, 32, 48, 128];

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const png = createIconPng(size);
    const path = resolve(OUTPUT_DIR, `icon-${size}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, png);
  }
}

function createIconPng(size) {
  const supersample = size <= 32 ? 4 : 3;
  const hi = size * supersample;
  const highPixels = new Uint8ClampedArray(hi * hi * 4);

  for (let y = 0; y < hi; y += 1) {
    for (let x = 0; x < hi; x += 1) {
      const px = ((y * hi + x) * 4);
      const ux = ((x + 0.5) / hi) * 128;
      const uy = ((y + 0.5) / hi) * 128;
      const color = sampleIcon(ux, uy);
      highPixels[px] = color[0];
      highPixels[px + 1] = color[1];
      highPixels[px + 2] = color[2];
      highPixels[px + 3] = color[3];
    }
  }

  const pixels = downsample(highPixels, size, supersample);
  return encodePng(size, size, pixels);
}

function sampleIcon(x, y) {
  let color = [0, 0, 0, 0];

  if (insideRoundedRect(x, y, 0, 0, 128, 128, 28)) {
    const t = clamp((x * 0.42 + y * 0.58) / 128, 0, 1);
    color = blend(color, lerpColor([23, 58, 52, 255], [14, 36, 42, 255], t));
  }

  if (insideRoundedRect(x, y, 24, 26, 70, 81, 13)) {
    color = blend(color, [247, 241, 230, 255]);
  }
  if (insideRoundedRect(x, y, 32, 34, 54, 65, 5)) {
    color = blend(color, [221, 232, 223, 255]);
  }
  if (insideRoundedRect(x, y, 36, 35, 48, 60, 4)) {
    color = blend(color, [247, 241, 230, 255]);
  }

  color = fillRoundedRect(color, x, y, 46, 49, 26, 7, 3.5, [23, 58, 52, 255]);
  color = fillRoundedRect(color, x, y, 46, 64, 44, 7, 3.5, [23, 58, 52, 200]);
  color = fillRoundedRect(color, x, y, 46, 79, 20, 7, 3.5, [23, 58, 52, 135]);

  if (insideRoundedRect(x, y, 83, 42, 24, 46, 7)) {
    const t = clamp(((x - 83) * 0.35 + (y - 42) * 0.65) / 46, 0, 1);
    color = blend(color, lerpColor([255, 180, 92, 255], [240, 92, 74, 255], t));
  }

  color = fillRoundedRect(color, x, y, 91.5, 54, 5.8, 24.4, 2.8, [255, 247, 234, 255]);
  color = fillRoundedRect(color, x, y, 94, 54, 8, 5.8, 2.8, [255, 247, 234, 255]);
  color = fillRoundedRect(color, x, y, 94, 64, 8, 5.5, 2.6, [255, 247, 234, 255]);
  color = fillRoundedRect(color, x, y, 94, 72.6, 8, 5.8, 2.8, [255, 247, 234, 255]);

  if (insideRotatedRoundedRect(x, y, 96.5, 38.5, 19, 7, -0.62, 3.5)) {
    color = blend(color, [255, 206, 122, 255]);
  }

  return color;
}

function downsample(highPixels, size, supersample) {
  const hi = size * supersample;
  const pixels = Buffer.alloc(size * size * 4);
  const area = supersample * supersample;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const accum = [0, 0, 0, 0];
      for (let sy = 0; sy < supersample; sy += 1) {
        for (let sx = 0; sx < supersample; sx += 1) {
          const hp = (((y * supersample + sy) * hi + (x * supersample + sx)) * 4);
          accum[0] += highPixels[hp];
          accum[1] += highPixels[hp + 1];
          accum[2] += highPixels[hp + 2];
          accum[3] += highPixels[hp + 3];
        }
      }
      const p = ((y * size + x) * 4);
      pixels[p] = Math.round(accum[0] / area);
      pixels[p + 1] = Math.round(accum[1] / area);
      pixels[p + 2] = Math.round(accum[2] / area);
      pixels[p + 3] = Math.round(accum[3] / area);
    }
  }
  return pixels;
}

function fillRoundedRect(base, x, y, left, top, width, height, radius, color) {
  return insideRoundedRect(x, y, left, top, width, height, radius) ? blend(base, color) : base;
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  if (x < left || x > left + width || y < top || y > top + height) {
    return false;
  }
  const cx = x < left + radius ? left + radius : x > left + width - radius ? left + width - radius : x;
  const cy = y < top + radius ? top + radius : y > top + height - radius ? top + height - radius : y;
  return ((x - cx) ** 2 + (y - cy) ** 2) <= radius ** 2;
}

function insideRotatedRoundedRect(x, y, cx, cy, width, height, angle, radius) {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rx = dx * cos - dy * sin + width / 2;
  const ry = dx * sin + dy * cos + height / 2;
  return insideRoundedRect(rx, ry, 0, 0, width, height, radius);
}

function lerpColor(left, right, t) {
  return [
    Math.round(left[0] + (right[0] - left[0]) * t),
    Math.round(left[1] + (right[1] - left[1]) * t),
    Math.round(left[2] + (right[2] - left[2]) * t),
    Math.round(left[3] + (right[3] - left[3]) * t)
  ];
}

function blend(base, overlay) {
  const oa = overlay[3] / 255;
  const ba = base[3] / 255;
  const outA = oa + ba * (1 - oa);
  if (outA === 0) {
    return [0, 0, 0, 0];
  }
  return [
    Math.round((overlay[0] * oa + base[0] * ba * (1 - oa)) / outA),
    Math.round((overlay[1] * oa + base[1] * ba * (1 - oa)) / outA),
    Math.round((overlay[2] * oa + base[2] * ba * (1 - oa)) / outA),
    Math.round(outA * 255)
  ];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0])
    ])),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(crcInput))
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

main();
