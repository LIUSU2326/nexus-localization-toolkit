import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = join(rootDir, 'assets');
const tauriDir = join(rootDir, 'src-tauri');
const iconDir = join(tauriDir, 'icons');
const tempIconDir = join(tauriDir, '.generated-icons');
const markPath = join(assetDir, 'transmate-mark.svg');
const appIconPath = join(assetDir, 'transmate-app-icon.svg');
const logoPath = join(assetDir, 'transmate-logo.svg');
const lightLogoPath = join(assetDir, 'transmate-logo-light.svg');
const tauriCliPath = join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

const expectedTempParent = resolve(tauriDir);
if (resolve(dirname(tempIconDir)) !== expectedTempParent || basename(tempIconDir) !== '.generated-icons') {
  throw new Error(`Refusing to use unexpected temporary icon directory: ${tempIconDir}`);
}

if (!existsSync(tauriCliPath)) {
  throw new Error('Missing @tauri-apps/cli. Install dependencies before generating icons.');
}

const masterSvg = readFileSync(markPath, 'utf8');
const defsMatch = masterSvg.match(/<defs>([\s\S]*?)<\/defs>/);
const markPaths = [...masterSvg.matchAll(/<path\b[^>]*\/>/g)].map((match) => match[0]);

if (!defsMatch || markPaths.length !== 3) {
  throw new Error('transmate-mark.svg must contain one <defs> block and exactly three self-closing <path> elements.');
}

const markDefs = defsMatch[1].trim();
const markMarkup = markPaths.join('\n    ');
const monochromeMarkup = markPaths
  .map((path) => path.replace(/fill="url\(#tm-(?:gradient|ink|spark)\)"/g, 'fill="#fff"'))
  .join('\n    ');

const appIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">TransMate 应用图标</title>
  <desc id="desc">白色圆角卡片中的 TransMate 渐变 T 标志。</desc>
  <defs>
    <filter id="card-shadow" x="-12%" y="-12%" width="124%" height="145%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#20283a" flood-opacity="0.10"/>
    </filter>
    <linearGradient id="card-surface" x1="28" y1="8" x2="104" y2="124" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/>
      <stop offset="1" stop-color="#fbfbfd"/>
    </linearGradient>
    ${markDefs}
  </defs>
  <rect x="4" y="3" width="120" height="120" rx="26" fill="url(#card-surface)" filter="url(#card-shadow)"/>
  <rect x="4.5" y="3.5" width="119" height="119" rx="25.5" fill="none" stroke="#f0f1f5"/>
  <g transform="translate(24.5 27.8) scale(.317)">
    ${markMarkup}
  </g>
</svg>
`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 116" role="img" aria-labelledby="title desc">
  <title id="title">TransMate</title>
  <desc id="desc">TransMate，AI 游戏本地化助手。</desc>
  <defs>
    ${markDefs}
  </defs>
  <g transform="translate(4 8) scale(.42)">
    ${markMarkup}
  </g>
  <text x="112" y="58" fill="#20283d" font-family="Montserrat, 'Avenir Next', 'Trebuchet MS', sans-serif" font-size="48" font-style="italic" font-weight="800" letter-spacing="-2">TransMate</text>
  <text x="116" y="88" fill="#747b8b" font-family="'Noto Sans SC', 'Microsoft YaHei', sans-serif" font-size="18" font-weight="500">AI 游戏本地化助手</text>
</svg>
`;

const lightLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 116" role="img" aria-labelledby="title desc">
  <title id="title">TransMate 浅色标志</title>
  <desc id="desc">适用于深色背景的 TransMate 标志。</desc>
  <g transform="translate(4 8) scale(.42)">
    ${monochromeMarkup}
  </g>
  <text x="112" y="58" fill="#fff" font-family="Montserrat, 'Avenir Next', 'Trebuchet MS', sans-serif" font-size="48" font-style="italic" font-weight="800" letter-spacing="-2">TransMate</text>
  <text x="116" y="88" fill="#fff" fill-opacity=".78" font-family="'Noto Sans SC', 'Microsoft YaHei', sans-serif" font-size="18" font-weight="500">AI 游戏本地化助手</text>
</svg>
`;

mkdirSync(assetDir, { recursive: true });
mkdirSync(iconDir, { recursive: true });
writeFileSync(appIconPath, appIconSvg);
writeFileSync(logoPath, logoSvg);
writeFileSync(lightLogoPath, lightLogoSvg);

const requiredIcons = [
  '32x32.png',
  '128x128.png',
  '128x128@2x.png',
  'icon.png',
  'icon.ico',
  'icon.icns'
];

function writeDeterministicIcns(sourcePath, destinationPath) {
  const source = readFileSync(sourcePath);
  if (source.length < 8 || source.subarray(0, 4).toString('ascii') !== 'icns') {
    throw new Error(`Invalid ICNS file generated at ${sourcePath}`);
  }
  if (source.readUInt32BE(4) !== source.length) {
    throw new Error(`ICNS header length does not match file length in ${sourcePath}`);
  }

  const chunks = [];
  let offset = 8;
  while (offset < source.length) {
    if (offset + 8 > source.length) {
      throw new Error(`Truncated ICNS chunk header in ${sourcePath}`);
    }

    const length = source.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > source.length) {
      throw new Error(`Invalid ICNS chunk length in ${sourcePath}`);
    }

    chunks.push(source.subarray(offset, offset + length));
    offset += length;
  }

  if (chunks.some((chunk) => chunk.subarray(0, 4).toString('ascii') === 'TOC ')) {
    throw new Error(`Cannot reorder ICNS with a table-of-contents chunk: ${sourcePath}`);
  }

  const canonicalOrder = [
    'is32', 's8mk', 'il32', 'l8mk',
    'icp4', 'icp5', 'icp6',
    'ic07', 'ic08', 'ic09', 'ic10', 'ic11', 'ic12', 'ic13', 'ic14'
  ];
  const rank = new Map(canonicalOrder.map((type, index) => [type, index]));
  chunks.sort((left, right) => {
    const leftType = left.subarray(0, 4).toString('ascii');
    const rightType = right.subarray(0, 4).toString('ascii');
    const rankDifference = (rank.get(leftType) ?? canonicalOrder.length)
      - (rank.get(rightType) ?? canonicalOrder.length);
    return rankDifference || leftType.localeCompare(rightType);
  });

  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  writeFileSync(destinationPath, Buffer.concat([header, ...chunks]));
}

rmSync(tempIconDir, { recursive: true, force: true });
try {
  const result = spawnSync(process.execPath, [tauriCliPath, 'icon', appIconPath, '-o', tempIconDir], {
    cwd: rootDir,
    encoding: 'utf8'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`Tauri icon generation failed with exit code ${result.status}.`);
  }

  for (const fileName of requiredIcons) {
    if (!existsSync(join(tempIconDir, fileName))) {
      throw new Error(`Tauri did not generate required icon: ${fileName}`);
    }
  }

  for (const fileName of requiredIcons) {
    const sourcePath = join(tempIconDir, fileName);
    const destinationPath = join(iconDir, fileName);
    if (fileName === 'icon.icns') {
      writeDeterministicIcns(sourcePath, destinationPath);
    } else {
      copyFileSync(sourcePath, destinationPath);
    }
  }
} finally {
  rmSync(tempIconDir, { recursive: true, force: true });
}
console.log(`Generated TransMate brand assets and ${requiredIcons.length} app icon files from ${markPath}`);
