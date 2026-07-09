/**
 * copy-assets.js
 * Copies static assets (data files, wasm, html) from source to dist/ for production build.
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

// Ensure dist subdirectories exist
const dirs = ['data', 'wasm'];
for (const dir of dirs) {
  const dirPath = path.join(distDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Copy JSON data files from src/data/ to dist/data/
const srcDataDir = path.join(rootDir, 'src', 'data');
const distDataDir = path.join(distDir, 'data');
if (fs.existsSync(srcDataDir)) {
  const files = fs.readdirSync(srcDataDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      const srcFile = path.join(srcDataDir, file);
      const destFile = path.join(distDataDir, file);
      fs.copyFileSync(srcFile, destFile);
      console.log(`Copied ${srcFile} -> ${destFile}`);
    }
  }
} else {
  console.warn(`Source data directory not found: ${srcDataDir}`);
}

// Copy WASM assets from public/wasm/ to dist/wasm/
const publicWasmDir = path.join(rootDir, 'public', 'wasm');
const distWasmDir = path.join(distDir, 'wasm');
if (fs.existsSync(publicWasmDir)) {
  const files = fs.readdirSync(publicWasmDir);
  for (const file of files) {
    const srcFile = path.join(publicWasmDir, file);
    const destFile = path.join(distWasmDir, file);
    fs.copyFileSync(srcFile, destFile);
    console.log(`Copied ${srcFile} -> ${destFile}`);
  }
} else {
  console.warn(`WASM directory not found: ${publicWasmDir}`);
}

// Copy HTML files from public/ to dist/ (excluding wasm subdir)
const publicDir = path.join(rootDir, 'public');
if (fs.existsSync(publicDir)) {
  const files = fs.readdirSync(publicDir);
  for (const file of files) {
    if (file.endsWith('.html')) {
      const srcFile = path.join(publicDir, file);
      const destFile = path.join(distDir, file);
      fs.copyFileSync(srcFile, destFile);
      console.log(`Copied ${srcFile} -> ${destFile}`);
    }
  }
} else {
  console.warn(`Public directory not found: ${publicDir}`);
}

console.log('Asset copying complete.');
