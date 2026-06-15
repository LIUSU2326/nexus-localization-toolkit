import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(rootDir, 'dist');
const entryFiles = ['index.html', 'styles.css', 'script.js'];
const requiredAssetDirs = ['vendor'];
const optionalAssetDirs = ['assets', 'images', 'fonts'];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const fileName of entryFiles) {
  copyFileSync(join(rootDir, fileName), join(distDir, fileName));
}

for (const dirName of requiredAssetDirs) {
  const sourceDir = join(rootDir, dirName);
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`Missing required asset directory: ${dirName}`);
  }
  cpSync(sourceDir, join(distDir, dirName), { recursive: true });
}

for (const dirName of optionalAssetDirs) {
  const sourceDir = join(rootDir, dirName);
  if (existsSync(sourceDir) && statSync(sourceDir).isDirectory()) {
    cpSync(sourceDir, join(distDir, dirName), { recursive: true });
  }
}

const copied = readdirSync(distDir).map((name) => basename(name)).join(', ');
console.log(`Built desktop web assets: ${copied}`);
