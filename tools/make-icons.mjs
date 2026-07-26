// Generates the PWA PNG icons with no dependencies (raw RGBA -> zlib -> PNG).
// Run with:  node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

class Canvas {
  constructor(size) {
    this.size = size;
    this.buf = Buffer.alloc(size * size * 4);
  }
  px(x, y, [r, g, b, a = 255]) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const sa = a / 255;
    const da = this.buf[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (!oa) return;
    for (let k = 0; k < 3; k++) {
      const sc = [r, g, b][k];
      this.buf[i + k] = Math.round((sc * sa + this.buf[i + k] * da * (1 - sa)) / oa);
    }
    this.buf[i + 3] = Math.round(oa * 255);
  }
  rect(x, y, w, h, color, radius = 0) {
    for (let py = Math.floor(y); py < y + h; py++) {
      for (let px = Math.floor(x); px < x + w; px++) {
        if (radius) {
          const cx = Math.min(Math.max(px + 0.5, x + radius), x + w - radius);
          const cy = Math.min(Math.max(py + 0.5, y + radius), y + h - radius);
          const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
          if (d > radius) continue;
          if (d > radius - 1) {
            this.px(px, py, [color[0], color[1], color[2], Math.round((color[3] ?? 255) * (radius - d))]);
            continue;
          }
        }
        this.px(px, py, color);
      }
    }
  }
}

// A five-by-five nonogram with a heart, the same picture as level 1.
const ART = ['.#.#.', '#####', '#####', '.###.', '..#..'];

function drawIcon(size, { padding = 0.06, bgRadius = 0.22 } = {}) {
  const c = new Canvas(size);
  const blue = [47, 111, 237, 255];
  const white = [255, 255, 255, 255];
  const ink = [24, 38, 66, 255];

  const pad = size * padding;
  const box = size - pad * 2;
  c.rect(pad, pad, box, box, blue, box * bgRadius);

  const inner = box * 0.7;
  const ox = pad + (box - inner) / 2;
  const oy = pad + (box - inner) / 2;
  c.rect(ox, oy, inner, inner, white, inner * 0.1);

  const cell = inner / 5;
  const gap = Math.max(1, cell * 0.08);
  for (let r = 0; r < 5; r++) {
    for (let col = 0; col < 5; col++) {
      if (ART[r][col] !== '#') continue;
      c.rect(ox + col * cell + gap, oy + r * cell + gap, cell - gap * 2, cell - gap * 2, ink, cell * 0.16);
    }
  }
  return png(size, size, c.buf);
}

const targets = [
  ['icon-180.png', 180, { padding: 0.0, bgRadius: 0.2 }],
  ['icon-192.png', 192, { padding: 0.0, bgRadius: 0.22 }],
  ['icon-512.png', 512, { padding: 0.0, bgRadius: 0.22 }],
  ['maskable-512.png', 512, { padding: 0.0, bgRadius: 0.0 }],
];

for (const [name, size, opts] of targets) {
  const data = drawIcon(size, opts);
  writeFileSync(join(outDir, name), data);
  console.log(`wrote icons/${name} (${(data.length / 1024).toFixed(1)} kB)`);
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#2f6fed"/>
  <rect x="15" y="15" width="70" height="70" rx="7" fill="#fff"/>
  ${ART.flatMap((row, r) =>
    [...row].map((ch, c) => (ch === '#' ? `<rect x="${15 + c * 14 + 1}" y="${15 + r * 14 + 1}" width="12" height="12" rx="2" fill="#182642"/>` : ''))
  ).join('')}
</svg>`;
writeFileSync(join(outDir, 'favicon.svg'), favicon);
console.log('wrote icons/favicon.svg');
