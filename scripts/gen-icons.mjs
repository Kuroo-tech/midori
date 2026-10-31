#!/usr/bin/env node
/**
 * Sinh biểu tượng PWA — không dùng thư viện ngoài.
 *
 * Vì sao tự viết bộ mã hoá PNG: dự án chỉ cần ba file ảnh tĩnh, và thêm một
 * dependency ảnh (sharp/canvas) chỉ để vẽ hai hình chữ nhật là cái giá không
 * tương xứng — cả về dung lượng cài đặt lẫn bề mặt cập nhật.
 *
 * Hình được vẽ bằng siêu mẫu (supersampling) 4× rồi thu nhỏ, nên cạnh bo tròn
 * mượt mà không cần thuật toán khử răng cưa riêng.
 *
 * Chạy: `npm run icons`
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(root, 'public', 'icons');

/** Màu thương hiệu: xanh lá "midori". */
const BRAND_TOP = [0x18, 0xa9, 0x74];
const BRAND_BOTTOM = [0x0a, 0x5f, 0x3f];
const CARD_COLOR = [0xff, 0xff, 0xff];
const LINE_COLOR = [0x0a, 0x5f, 0x3f];

/** Bội số siêu mẫu mỗi trục. 4 ⇒ 16 mẫu mỗi điểm ảnh. */
const SUPERSAMPLE = 4;

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Điểm có nằm trong hình chữ nhật bo tròn không? */
function insideRoundedRect(x, y, rect) {
  const { left, top, right, bottom, radius } = rect;
  if (x < left || x > right || y < top || y > bottom) return false;
  const rw = right - left;
  const rh = bottom - top;
  const r = Math.min(radius, rw / 2, rh / 2);
  if (r <= 0) return true;

  const cx = Math.min(Math.max(x, left + r), right - r);
  const cy = Math.min(Math.max(y, top + r), bottom - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Vẽ icon ở kích thước `size`.
 *
 * `maskable` bỏ góc bo của nền và thu nhỏ hình vẽ vào vùng an toàn 80%, để hệ
 * điều hành có thể cắt tròn tuỳ ý mà không mất chi tiết.
 */
function render(size, maskable) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = SUPERSAMPLE;
  const samples = scale * scale;

  // Tỉ lệ hình vẽ trong khung: maskable cần chừa lề an toàn.
  const inset = maskable ? 0.1 : 0;
  const cardLeft = (0.20 + inset) * size;
  const cardRight = (0.80 - inset) * size;
  const cardTop = (0.24 + inset) * size;
  const cardBottom = (0.76 - inset) * size;
  const radius = 0.07 * size * (1 - inset);

  const card = { left: cardLeft, top: cardTop, right: cardRight, bottom: cardBottom, radius };
  const lineHeight = 0.075 * size * (1 - inset);
  const lineGap = 0.09 * size * (1 - inset);
  const barTop = cardTop + 0.20 * (cardBottom - cardTop);
  const line1 = {
    left: cardLeft + 0.14 * (cardRight - cardLeft),
    right: cardRight - 0.14 * (cardRight - cardLeft),
    top: barTop,
    bottom: barTop + lineHeight,
    radius: lineHeight / 2,
  };
  const line2 = {
    ...line1,
    right: line1.left + 0.58 * (line1.right - line1.left),
    top: barTop + lineGap,
    bottom: barTop + lineGap + lineHeight,
  };

  const background = { left: 0, top: 0, right: size, bottom: size, radius: maskable ? 0 : 0.22 * size };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0;
      let cardHits = 0;
      let lineHits = 0;

      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const x = px + (sx + 0.5) / scale;
          const y = py + (sy + 0.5) / scale;
          if (insideRoundedRect(x, y, background)) bgHits++;
          if (insideRoundedRect(x, y, card)) cardHits++;
          if (insideRoundedRect(x, y, line1) || insideRoundedRect(x, y, line2)) lineHits++;
        }
      }

      const offset = (py * size + px) * 4;
      if (bgHits === 0) {
        pixels[offset + 3] = 0; // ngoài nền ⇒ trong suốt
        continue;
      }

      const gradient = mix(BRAND_TOP, BRAND_BOTTOM, py / Math.max(1, size - 1));
      let color = gradient;

      const cardCoverage = cardHits / samples;
      if (cardCoverage > 0) color = mix(color, CARD_COLOR, cardCoverage);
      const lineCoverage = lineHits / samples;
      if (lineCoverage > 0) color = mix(color, LINE_COLOR, lineCoverage);

      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = Math.round((bgHits / samples) * 255);
    }
  }

  return pixels;
}

// ── Bộ mã hoá PNG tối giản ──────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bit mỗi kênh
  header[9] = 6; // RGBA
  header[10] = 0; // nén deflate
  header[11] = 0; // lọc thích nghi
  header[12] = 0; // không xen kẽ

  // Mỗi dòng bắt đầu bằng byte phương pháp lọc 0.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
];

mkdirSync(outputDir, { recursive: true });
for (const target of TARGETS) {
  const png = encodePng(render(target.size, target.maskable), target.size);
  writeFileSync(join(outputDir, target.file), png);
  console.log(`✓ ${target.file} — ${target.size}×${target.size}, ${(png.length / 1024).toFixed(1)} KB`);
}
