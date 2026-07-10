// R710 in-engine check: render the 3 new angled-firing poses + 7 weapon-body
// poses through the game's real sprites.js / CLIPPY_MANIFEST over the running
// dev server, facing right and left (flip), and write a zoomed contact sheet.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'r710_poses_inengine.png');
const BASE = 'http://localhost:8765';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => console.log('  [page]', m.text()));
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (base) => {
  const mod = await import(base + '/src/sprites.js');
  const { sprites, CLIPPY_MANIFEST } = mod;
  await sprites.loadAll(CLIPPY_MANIFEST, 'assets/sprites');

  const keys = [
    'aim_up', 'aim_diag', 'aim_diag_down',
    'v6_shotgun', 'v6_spread', 'v6_laser', 'v6_flame',
    'v6_homing', 'v6_thunder', 'v6_chainsaw',
  ];
  const loaded = {};
  for (const k of keys) loaded[k] = sprites.has(k) ? sprites.dims.get(k) : null;

  const Z = 5, pad = 8;
  const cw = 56 * Z, ch = 60 * Z;
  const cols = keys.length;
  const cv = document.createElement('canvas');
  cv.width = cols * cw + pad * (cols + 1);
  cv.height = 2 * ch + pad * 3;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // dark scene bg to expose any white fringe
  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, cv.width, cv.height);

  const drawCell = (key, col, row, flip) => {
    const x = pad + col * (cw + pad);
    const y = pad + row * (ch + pad);
    ctx.strokeStyle = '#3a4150';
    ctx.strokeRect(x, y, cw, ch);
    const d = sprites.dims.get(key);
    if (!sprites.has(key) || !d) return;
    // Center the sprite in the cell using its own dims, then draw at Z scale
    // through the real sprites.draw(ctx, name, x, y, flipH, scale) path.
    const dw = d.w * Z, dh = d.h * Z;
    const dx = x + (cw - dw) / 2;
    const dy = y + (ch - dh) / 2;
    sprites.draw(ctx, key, dx, dy, flip, Z);
  };

  keys.forEach((k, i) => {
    drawCell(k, i, 0, false); // facing right
    drawCell(k, i, 1, true);  // facing left (flip)
  });

  return { loaded, dataUrl: cv.toDataURL('image/png') };
}, BASE);

console.log('loaded dims:', JSON.stringify(result.loaded));
const missing = Object.entries(result.loaded).filter(([, v]) => !v).map(([k]) => k);
console.log(missing.length ? 'MISSING: ' + missing.join(', ') : 'all 10 keys present');

const b64 = result.dataUrl.replace(/^data:image\/png;base64,/, '');
const fs = await import('fs');
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
console.log('wrote', OUT);
await browser.close();
