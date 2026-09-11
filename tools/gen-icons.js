#!/usr/bin/env node
/*
 * Writes icons/16.png, 48.png and 128.png.
 *
 * The icon is a green disc with a white bar across it: the "no" sign. It reads
 * well at 16 px. The script uses zlib only, so the project keeps no dependency.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const GREEN = [29, 185, 84];
const WHITE = [255, 255, 255];
const SS = 4; // supersample factor, for smooth edges

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Returns [r, g, b, a] for one supersample point, in a size x size icon.
function sample(x, y, size) {
  const cx = size / 2;
  const r = size / 2 - size * 0.02;
  const dx = x - cx;
  const dy = y - cx;
  if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  // The bar runs from the lower left to the upper right, at 45 degrees.
  const along = (dx + dy) / Math.SQRT2;          // distance across the bar
  if (Math.abs(along) <= size * 0.085) return [...WHITE, 255];
  return [...GREEN, 255];
}

function render(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size);
          r += px[0] * px[3]; g += px[1] * px[3]; b += px[2] * px[3]; a += px[3];
        }
      }
      const n = SS * SS;
      raw[p++] = a ? Math.round(r / a) : 0;
      raw[p++] = a ? Math.round(g / a) : 0;
      raw[p++] = a ? Math.round(b / a) : 0;
      raw[p++] = Math.round(a / n);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [16, 48, 128]) {
    const file = path.join(dir, size + '.png');
    fs.writeFileSync(file, render(size));
    console.log('wrote icons/' + size + '.png');
  }
}

module.exports = { render };
