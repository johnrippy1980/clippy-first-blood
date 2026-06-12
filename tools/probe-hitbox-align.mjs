// Overlay the player hitbox on each wired frame using the EXACT anchor math
// from player.js draw() — so we can see whether the body-core sits over the
// 12px hitbox and whether the sprite's bottom lands on the feet line.
//
// player.js anchoring (the lines that matter):
//   cx = x + w/2          (sprite centered horizontally on hitbox center)
//   cy = y + h - dims.h/2 + 1
//   drawX = cx - dims.w/2   → sprite bottom = y + h (+1) = feet/ground line
// Hitbox: PLAYER_W = 12, STAND_HEIGHT = 22 (PRONE_HEIGHT = 8 for prone/slide).
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots', 'hitbox_align.png');
const BASE = 'http://localhost:8765';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (base) => {
  const { sprites, CLIPPY_MANIFEST, getFrameAnchorX } = await import(base + '/src/sprites.js');
  await sprites.loadAll(CLIPPY_MANIFEST, 'assets/sprites');

  const PLAYER_W = 12, STAND_H = 22, PRONE_H = 8;
  // [frame, hitboxHeight, label, flip?]  — flip=true mirrors like facing left,
  // to catch sign errors in the anchor flip on asymmetric (head-on-one-side)
  // frames. Right- and left-facing of the same pose should both land the
  // green hitbox-center line on the body-core.
  const cells = [
    ['idle', STAND_H, 'idle', false],
    ['run_2', STAND_H, 'walk', false],
    ['shoot', STAND_H, 'fire R', false],
    ['run_shoot_1', STAND_H, 'walkFire', false],
    ['jump_aim', STAND_H, 'jumpFire', false],
    ['crouch', STAND_H - 4, 'crouch', false],
    ['crouch_shoot', STAND_H - 4, 'crouchFire', false],
    ['prone', PRONE_H, 'prone', false],
    ['prone_shoot', PRONE_H, 'proneFire', false],
    ['slide', PRONE_H, 'slide', false],
    // left-facing checks for the asymmetric / widest frames
    ['shoot', STAND_H, 'fire L', true],
    ['prone', PRONE_H, 'prone L', true],
    ['prone_shoot', PRONE_H, 'proneFire L', true],
    ['slide', PRONE_H, 'slide L', true],
    ['run_shoot_1', STAND_H, 'walkFire L', true],
  ];

  const Z = 7, pad = 14, cols = 5;
  const cw = 70 * Z / 6 * 6 / 6, ch = cw; // square-ish cell
  const CW = 72 * Z / 6 * 6, CH = 60 * Z / 6 * 6; // generous
  const cellW = 78 * Z; const cellH = 70 * Z;
  const rows = Math.ceil(cells.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * cellW + pad * (cols + 1);
  cv.height = rows * (cellH + 26) + pad * (rows + 1);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1a1b26'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  ctx.font = '16px monospace'; ctx.textAlign = 'center';

  const report = [];
  cells.forEach(([frame, hbH, label, flip], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const ox = pad + col * (cellW + pad);
    const oy = pad + row * (cellH + 26 + pad);
    const d = sprites.dims.get(frame) || { w: 40, h: 40 };

    // Simulate a hitbox placed inside the cell. Put the hitbox bottom on a
    // "ground line" near the cell bottom, hitbox horizontally centered.
    const groundY = oy + cellH - 8 * Z;          // ground line in cell
    const hbBottom = groundY;
    const hbTop = hbBottom - hbH * Z;
    const hbCenterX = ox + cellW / 2;
    const hbLeft = hbCenterX - (PLAYER_W * Z) / 2;

    // EXACT player.js anchor (post body-core fix): sprite centered on hitbox
    // center X, then shifted by coreDX so the measured body-core (not the bbox
    // center) lands on the hitbox center. Sign flips with facing, identical to
    // player.js: coreDX = coreOff * (facingLeft ? +1 : -1).
    const coreOff = getFrameAnchorX(frame);            // logical px, right-facing
    const coreDX = coreOff * (flip ? 1 : -1);
    const drawX = hbCenterX - (d.w * Z) / 2 + coreDX * Z;
    const drawBottom = hbBottom + 1 * Z;
    const drawY = drawBottom - d.h * Z;

    // ground line
    ctx.strokeStyle = '#414868'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ox, groundY); ctx.lineTo(ox + cellW, groundY); ctx.stroke();

    // sprite (using sprites.draw which honors facing flip)
    sprites.draw(ctx, frame, drawX, drawY, !!flip, Z);

    // hitbox overlay (semi-transparent red)
    ctx.fillStyle = 'rgba(255,64,64,0.22)';
    ctx.fillRect(hbLeft, hbTop, PLAYER_W * Z, hbH * Z);
    ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2;
    ctx.strokeRect(hbLeft, hbTop, PLAYER_W * Z, hbH * Z);
    // hitbox center vertical line (green) — where the body-core SHOULD sit
    ctx.strokeStyle = '#39ff7a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hbCenterX, oy); ctx.lineTo(hbCenterX, groundY); ctx.stroke();

    ctx.fillStyle = '#c0caf5';
    ctx.fillText(`${label}  ${d.w}x${d.h}  off${coreOff.toFixed(1)}`, ox + cellW / 2, oy + cellH + 18);

    report.push({ frame, dims: { w: d.w, h: d.h }, hbH, coreOff: +coreOff.toFixed(2) });
  });

  return { dataUrl: cv.toDataURL('image/png'), report };
}, BASE);

console.log(JSON.stringify(result.report, null, 0));
const fs = await import('fs');
fs.writeFileSync(OUT, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
console.log('wrote', OUT);
await browser.close();
