// In-engine check that the full friend pose pack is wired correctly: boots a
// real browser, loads the game's actual sprites.js + CLIPPY_MANIFEST, loads
// every frame over the running dev server, then renders each newly-wired
// logical frame through sprites.draw() (the player.js call path) at facing
// right and left. Writes a zoomed contact sheet for eyeballing scale + facing.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'friend_poses_inengine.png');
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

  // logical frame, flip?, label — grouped by state for readability.
  const cells = [
    ['idle', false, 'idle'], ['idle_alt', false, 'idle_alt'],
    ['run_1', false, 'walk1'], ['run_2', false, 'walk2'], ['run_3', false, 'walk3'],
    ['run_shoot_1', false, 'wfire1'], ['run_shoot_2', false, 'wfire2'], ['run_shoot_3', false, 'wfire3'],
    ['shoot', false, 'fire1'], ['shoot_alt', false, 'fire2'],
    ['jump', false, 'jump'], ['fall', false, 'fall'],
    ['crouch', false, 'crouch'], ['crouch_shoot', false, 'crouchS'],
    ['prone', false, 'prone'], ['prone_shoot', false, 'proneS'],
    ['climb_1', false, 'climb1'], ['climb_2', false, 'climb2'],
    ['hurt', false, 'hurt'], ['death_hit', false, 'deathHit'],
    // a few left-facing checks to confirm the flip mirrors cleanly
    ['run_2', true, 'walk2 L'], ['shoot', true, 'fire L'], ['jump', true, 'jump L'],
  ];

  const Z = 5, pad = 8;
  const cols = 8;
  const cw = 56 * Z, ch = 56 * Z;
  const rows = Math.ceil(cells.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * cw + pad * (cols + 1);
  cv.height = rows * (ch + 22) + pad * (rows + 1);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#282a36'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.font = '16px monospace'; ctx.textAlign = 'center';

  const present = [];
  cells.forEach(([name, flip, label], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cellX = pad + col * (cw + pad);
    const cellY = pad + row * (ch + 22 + pad);
    // baseline + center, like the player render
    const d = sprites.dims.get(name) || { w: 40, h: 40 };
    if (sprites.has(name)) present.push(name);
    const dx = cellX + (cw - d.w * Z) / 2;
    const dy = cellY + ch - d.h * Z;
    // faint baseline so scale differences are obvious
    ctx.strokeStyle = '#44475a'; ctx.beginPath();
    ctx.moveTo(cellX, cellY + ch); ctx.lineTo(cellX + cw, cellY + ch); ctx.stroke();
    sprites.draw(ctx, name, dx, dy, flip, Z);
    ctx.fillStyle = '#f8f8f2';
    ctx.fillText(label, cellX + cw / 2, cellY + ch + 16);
  });

  const dataUrl = cv.toDataURL('image/png');
  const dims = {};
  for (const [name] of cells) dims[name] = sprites.dims.get(name) || null;
  return { dataUrl, present: [...new Set(present)], dims };
}, BASE);

console.log('frames present:', result.present.length, 'of unique requested');
console.log('dims:', JSON.stringify(result.dims));

const b64 = result.dataUrl.split(',')[1];
const fs = await import('fs');
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
console.log('wrote', OUT);

await browser.close();
