import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(rootDir, 'src-tauri', 'icons');
const sourceSize = 1024;

const pngTargets = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 1024 }
];

const icoTargets = [16, 32, 64, 128, 256];
const icnsTargets = [
  { type: 'icp4', size: 16 },
  { type: 'icp5', size: 32 },
  { type: 'icp6', size: 64 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic10', size: 1024 }
];

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

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function pngFromRgba(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function colorMix(from, to, t, alpha = 255) {
  return [
    mix(from[0], to[0], t),
    mix(from[1], to[1], t),
    mix(from[2], to[2], t),
    alpha
  ];
}

function blendPixel(buffer, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height || color[3] <= 0) {
    return;
  }

  const offset = (y * width + x) * 4;
  const sourceA = color[3] / 255;
  const targetA = buffer[offset + 3] / 255;
  const outA = sourceA + targetA * (1 - sourceA);

  if (outA <= 0) {
    buffer[offset] = 0;
    buffer[offset + 1] = 0;
    buffer[offset + 2] = 0;
    buffer[offset + 3] = 0;
    return;
  }

  buffer[offset] = Math.round((color[0] * sourceA + buffer[offset] * targetA * (1 - sourceA)) / outA);
  buffer[offset + 1] = Math.round((color[1] * sourceA + buffer[offset + 1] * targetA * (1 - sourceA)) / outA);
  buffer[offset + 2] = Math.round((color[2] * sourceA + buffer[offset + 2] * targetA * (1 - sourceA)) / outA);
  buffer[offset + 3] = Math.round(outA * 255);
}

function fillRoundedRect(buffer, width, height, x, y, rectWidth, rectHeight, radius, colorAt) {
  const startX = Math.floor(x);
  const endX = Math.ceil(x + rectWidth);
  const startY = Math.floor(y);
  const endY = Math.ceil(y + rectHeight);

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      const sampleX = px + 0.5;
      const sampleY = py + 0.5;
      const closestX = clamp(sampleX, x + radius, x + rectWidth - radius);
      const closestY = clamp(sampleY, y + radius, y + rectHeight - radius);
      const dx = sampleX - closestX;
      const dy = sampleY - closestY;

      if (dx * dx + dy * dy <= radius * radius) {
        const color = typeof colorAt === 'function' ? colorAt(sampleX, sampleY) : colorAt;
        blendPixel(buffer, width, height, px, py, color);
      }
    }
  }
}

function drawSoftShadow(buffer, width, height, x, y, rectWidth, rectHeight, radius) {
  for (let i = 56; i >= 1; i -= 1) {
    const alpha = Math.round(2.6 * (1 - i / 58));
    fillRoundedRect(
      buffer,
      width,
      height,
      x - i,
      y + 18 - i,
      rectWidth + i * 2,
      rectHeight + i * 2,
      radius + i,
      [15, 23, 42, alpha]
    );
  }
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function drawLine(buffer, width, height, ax, ay, bx, by, lineWidth, color) {
  const half = lineWidth / 2;
  const minX = Math.floor(Math.min(ax, bx) - half - 2);
  const maxX = Math.ceil(Math.max(ax, bx) + half + 2);
  const minY = Math.floor(Math.min(ay, by) - half - 2);
  const maxY = Math.ceil(Math.max(ay, by) + half + 2);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by);
      if (distance <= half + 1) {
        const edge = clamp(half + 1 - distance, 0, 1);
        blendPixel(buffer, width, height, x, y, [color[0], color[1], color[2], Math.round(color[3] * edge)]);
      }
    }
  }
}

function drawArc(buffer, width, height, cx, cy, rx, ry, start, end, lineWidth, color) {
  const steps = 120;
  let previous = null;
  for (let i = 0; i <= steps; i += 1) {
    const angle = start + ((end - start) * i) / steps;
    const point = [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
    if (previous) {
      drawLine(buffer, width, height, previous[0], previous[1], point[0], point[1], lineWidth, color);
    }
    previous = point;
  }
}

function fillCircle(buffer, width, height, cx, cy, radius, color) {
  const startX = Math.floor(cx - radius - 1);
  const endX = Math.ceil(cx + radius + 1);
  const startY = Math.floor(cy - radius - 1);
  const endY = Math.ceil(cy + radius + 1);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (distance <= radius + 1) {
        const edge = clamp(radius + 1 - distance, 0, 1);
        blendPixel(buffer, width, height, x, y, [color[0], color[1], color[2], Math.round(color[3] * edge)]);
      }
    }
  }
}

function drawArrow(buffer, width, height, ax, ay, bx, by, lineWidth, color, direction = 1) {
  drawLine(buffer, width, height, ax, ay, bx, by, lineWidth, color);
  const angle = Math.atan2(by - ay, bx - ax) + (direction < 0 ? Math.PI : 0);
  const tipX = direction > 0 ? bx : ax;
  const tipY = direction > 0 ? by : ay;
  const wing = lineWidth * 2.4;
  drawLine(buffer, width, height, tipX, tipY, tipX - Math.cos(angle - 0.72) * wing, tipY - Math.sin(angle - 0.72) * wing, lineWidth, color);
  drawLine(buffer, width, height, tipX, tipY, tipX - Math.cos(angle + 0.72) * wing, tipY - Math.sin(angle + 0.72) * wing, lineWidth, color);
}

function drawLetterA(buffer, width, height, x, y, scale, color) {
  drawLine(buffer, width, height, x, y + 110 * scale, x + 46 * scale, y, 15 * scale, color);
  drawLine(buffer, width, height, x + 46 * scale, y, x + 94 * scale, y + 110 * scale, 15 * scale, color);
  drawLine(buffer, width, height, x + 22 * scale, y + 64 * scale, x + 70 * scale, y + 64 * scale, 12 * scale, color);
}

function drawZhongGlyph(buffer, width, height, x, y, scale, color) {
  drawLine(buffer, width, height, x + 20 * scale, y + 22 * scale, x + 92 * scale, y + 22 * scale, 12 * scale, color);
  drawLine(buffer, width, height, x + 20 * scale, y + 22 * scale, x + 20 * scale, y + 82 * scale, 12 * scale, color);
  drawLine(buffer, width, height, x + 92 * scale, y + 22 * scale, x + 92 * scale, y + 82 * scale, 12 * scale, color);
  drawLine(buffer, width, height, x + 20 * scale, y + 82 * scale, x + 92 * scale, y + 82 * scale, 12 * scale, color);
  drawLine(buffer, width, height, x + 56 * scale, y, x + 56 * scale, y + 108 * scale, 13 * scale, color);
  drawLine(buffer, width, height, x + 20 * scale, y + 52 * scale, x + 92 * scale, y + 52 * scale, 12 * scale, color);
}

function createIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);
  const scale = size / sourceSize;
  const s = (value) => value * scale;

  drawSoftShadow(buffer, size, size, s(108), s(102), s(808), s(808), s(186));
  fillRoundedRect(buffer, size, size, s(108), s(92), s(808), s(808), s(188), (x, y) => {
    const tx = x / size;
    const ty = y / size;
    const diagonal = clamp((tx * 0.72 + ty * 0.52), 0, 1);
    const base = colorMix([10, 22, 44], [31, 63, 155], diagonal, 255);
    const teal = Math.max(0, 1 - Math.hypot(tx - 0.25, ty - 0.18) * 2.7);
    const purple = Math.max(0, 1 - Math.hypot(tx - 0.82, ty - 0.78) * 2.3);

    base[0] = clamp(base[0] + teal * 8 + purple * 32, 0, 255);
    base[1] = clamp(base[1] + teal * 56 + purple * 6, 0, 255);
    base[2] = clamp(base[2] + teal * 44 + purple * 42, 0, 255);
    return base;
  });

  fillRoundedRect(buffer, size, size, s(154), s(138), s(716), s(716), s(150), [255, 255, 255, 16]);
  drawArc(buffer, size, size, s(512), s(512), s(302), s(228), -0.72, 3.82, s(19), [125, 211, 252, 70]);
  drawArc(buffer, size, size, s(512), s(512), s(332), s(260), 2.64, 5.88, s(15), [167, 139, 250, 60]);
  drawLine(buffer, size, size, s(230), s(780), s(804), s(224), s(28), [45, 212, 191, 70]);

  fillRoundedRect(buffer, size, size, s(190), s(190), s(214), s(166), s(50), [14, 165, 233, 232]);
  fillRoundedRect(buffer, size, size, s(212), s(212), s(170), s(122), s(34), [255, 255, 255, 24]);
  drawLetterA(buffer, size, size, s(250), s(220), scale, [245, 253, 255, 245]);

  fillRoundedRect(buffer, size, size, s(620), s(672), s(230), s(168), s(54), [99, 102, 241, 236]);
  fillRoundedRect(buffer, size, size, s(642), s(694), s(186), s(124), s(36), [255, 255, 255, 25]);
  drawZhongGlyph(buffer, size, size, s(680), s(704), scale, [248, 250, 252, 245]);

  drawArrow(buffer, size, size, s(426), s(246), s(594), s(246), s(15), [186, 230, 253, 215], 1);
  drawArrow(buffer, size, size, s(598), s(778), s(432), s(778), s(15), [221, 214, 254, 210], -1);

  drawLine(buffer, size, size, s(333), s(690), s(333), s(346), s(96), [2, 6, 23, 70]);
  drawLine(buffer, size, size, s(333), s(346), s(692), s(690), s(96), [2, 6, 23, 70]);
  drawLine(buffer, size, size, s(692), s(690), s(692), s(346), s(96), [2, 6, 23, 70]);

  drawLine(buffer, size, size, s(333), s(690), s(333), s(346), s(76), [248, 250, 252, 250]);
  drawLine(buffer, size, size, s(333), s(346), s(692), s(690), s(76), [94, 234, 212, 252]);
  drawLine(buffer, size, size, s(692), s(690), s(692), s(346), s(76), [248, 250, 252, 250]);

  fillCircle(buffer, size, size, s(333), s(346), s(23), [255, 255, 255, 255]);
  fillCircle(buffer, size, size, s(692), s(690), s(23), [94, 234, 212, 255]);

  return buffer;
}

function resizeNearestPowerOfTwo(source, sourceWidth, targetWidth) {
  if (sourceWidth === targetWidth) {
    return Buffer.from(source);
  }

  const factor = sourceWidth / targetWidth;
  const target = Buffer.alloc(targetWidth * targetWidth * 4);

  for (let y = 0; y < targetWidth; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const startX = Math.floor(x * factor);
      const startY = Math.floor(y * factor);
      const endX = Math.floor((x + 1) * factor);
      const endY = Math.floor((y + 1) * factor);
      const total = Math.max(1, (endX - startX) * (endY - startY));
      const sums = [0, 0, 0, 0];

      for (let sy = startY; sy < endY; sy += 1) {
        for (let sx = startX; sx < endX; sx += 1) {
          const offset = (sy * sourceWidth + sx) * 4;
          sums[0] += source[offset];
          sums[1] += source[offset + 1];
          sums[2] += source[offset + 2];
          sums[3] += source[offset + 3];
        }
      }

      const targetOffset = (y * targetWidth + x) * 4;
      target[targetOffset] = Math.round(sums[0] / total);
      target[targetOffset + 1] = Math.round(sums[1] / total);
      target[targetOffset + 2] = Math.round(sums[2] / total);
      target[targetOffset + 3] = Math.round(sums[3] / total);
    }
  }

  return target;
}

function makeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const entryOffset = index * 16;
    directory[entryOffset] = entry.size >= 256 ? 0 : entry.size;
    directory[entryOffset + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[entryOffset + 2] = 0;
    directory[entryOffset + 3] = 0;
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(entry.png.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

function makeIcns(entries) {
  const chunks = entries.map((entry) => {
    const header = Buffer.alloc(8);
    header.write(entry.type, 0, 4, 'ascii');
    header.writeUInt32BE(entry.png.length + 8, 4);
    return Buffer.concat([header, entry.png]);
  });

  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}

mkdirSync(iconDir, { recursive: true });

const source = createIcon(sourceSize);
const pngCache = new Map();

function pngForSize(size) {
  if (!pngCache.has(size)) {
    const rgba = resizeNearestPowerOfTwo(source, sourceSize, size);
    pngCache.set(size, pngFromRgba(size, size, rgba));
  }
  return pngCache.get(size);
}

for (const target of pngTargets) {
  writeFileSync(join(iconDir, target.name), pngForSize(target.size));
}

writeFileSync(
  join(iconDir, 'icon.ico'),
  makeIco(icoTargets.map((size) => ({ size, png: pngForSize(size) })))
);

writeFileSync(
  join(iconDir, 'icon.icns'),
  makeIcns(icnsTargets.map((target) => ({ type: target.type, png: pngForSize(target.size) })))
);

console.log(`Generated app icons in ${iconDir}`);
