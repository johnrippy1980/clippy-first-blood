// In-engine check that the new firing art is wired correctly: boots a real
// browser, loads the game's actual sprites.js + CLIPPY_MANIFEST, loads all
// frames over the running dev server, then renders the 'shoot'/'aim' frames
// through sprites.draw() (the same call path player.js uses) at facing=right
// and facing=left. Writes a zoomed PNG for eyeballing.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'firing_inengine.png');
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

  const states = ['shoot', 'shoot_alt', 'aim'];
  const loaded = {};
  for (const s of states) loaded[s] = sprites.has(s) ? sprites.dims.get(s) : null;

  // Render shoot facing right and left, plus the OLD reference (run) for scale.
  const Z = 6, pad = 10, lane = 60 * Z / 6; // logical lane height
  const cells = [
    ['shoot', false, 'shoot R'],
    ['shoot', true, 'shoot L(flip)'],
    ['shoot_alt', false, 'shoot_alt R'],
    ['run_2', false, 'run_2 (old aim)'],
  ];
  const cw = 56 * Z, ch = 56 * Z;
  const cv = document.createElement('canvas');
  cv.width = cells.length * cw + pad * (cells.length + 1);
  cv.height = ch + pad * 2;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#282a36'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  let x = pad;
  for (const [name, flip] of cells) {
    const d = sprites.dims.get(name) || { w: 40, h: 40 };
    // center horizontally in the cell, sit on a baseline
    const dx = x + (cw - d.w * Z) / 2;
    const dy = pad + ch - d.h * Z;
    sprites.draw(ctx, name, dx, dy, flip, Z);
    x += cw + pad;
  }
  const dataUrl = cv.toDataURL('image/png');
  return { loaded, dataUrl, present: states.filter(s => sprites.has(s)) };
}, BASE);

console.log('frames present:', result.present);
console.log('dims:', JSON.stringify(result.loaded));

const b64 = result.dataUrl.split(',')[1];
const fs = await import('fs');
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
console.log('wrote', OUT);

await browser.close();
