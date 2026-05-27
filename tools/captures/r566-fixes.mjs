// R566: verify (1) stage 25 now shows Clippy sprite not procedural turret rig,
// (2) BLOCK 11 intro spin is 1.5s not 4s, (3) wall pinch fixed by PAD bump.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r566-fixes';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// === STAGE 25 — Clippy sprite verification ===
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game._startStage(25);
});
// Skip intros
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(150);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'turretPlay') break;
    if (sc === 'stageIntro' || sc === 'ready' || sc === 'bossIntro') {
        await page.keyboard.press('KeyX');
    }
}
await page.waitForTimeout(500);
await snap('01_stage25_clippy_idle');

// Fire to trigger muzzle flash + recoil sprite cycle
await page.mouse.move(512, 384);
for (let i = 0; i < 6; i++) {
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(60);
    await snap(`02_stage25_firing_${i}`);
}

// === STAGE 23 BLOCK 11 — verify intro spin is 1.5s ===
await page.evaluate(() => window.__game._restartRun());
await page.waitForTimeout(400);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game._startStage(23);
});
// Skip intro card
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'doomPlay') break;
    if (sc === 'stageIntro' || sc === 'ready') await page.keyboard.press('KeyX');
}

// Sample the intro spin window — should complete in ~90 frames (1.5s)
for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(200);
    await snap(`03_doom_t${String(i).padStart(2, '0')}`);
}
// Check intro state
const introState = await page.evaluate(() => ({
    introT: window.__game._doomEngine?._introT,
    angle: window.__game._doomEngine?.player?.angle,
}));
console.log('After ~2.4s, _introT should be 0:', introState);

// === Force player into a wall to verify pinch is gone ===
// Slam player against wall by setting position then trying to move toward it
await page.evaluate(() => {
    const e = window.__game._doomEngine;
    // Find a wall tile adjacent to player and warp player right next to it
    const p = e.player;
    for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
            const mx = Math.floor(p.x) + dx;
            const my = Math.floor(p.y) + dy;
            if (mx >= 0 && my >= 0 && mx < e.mapW && my < e.mapH && e.map[my]?.[mx]) {
                // Warp to face this wall, very close
                p.x = mx + (dx > 0 ? -0.4 : 1.4);
                p.y = my + 0.5;
                p.angle = dx > 0 ? 0 : Math.PI;
                return { mx, my, px: p.x, py: p.y };
            }
        }
    }
    return null;
});
await page.waitForTimeout(400);
await snap('04_doom_wall_close');

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ', e));
await browser.close();
