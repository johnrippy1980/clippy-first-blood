// Verify stage 2 (BREAK ROOM) plays cleanly after stage 1 clear.
// We force-clear stage 1 via debug hooks and capture the stage 2 card
// → intro → mid-run → boss-fight loop.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/playthrough3', { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => { errors.push('PAGE: ' + e.message); console.error('PAGE ERROR:', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push('CON: ' + m.text()); console.log('CON ERR:', m.text()); } });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const snap = (n, label) => page.screenshot({ path: `/tmp/playthrough3/${String(n).padStart(2,'0')}-${label}.png` });

// Jump straight to stage 2 via debug hook
await page.click('#screen');
await page.evaluate(() => {
    const g = window.__game;
    // Run any startup logic, then warp to stage 2
    g._startStage(2);
});
await page.waitForTimeout(800);
await snap(1, 'stage2-card');
await page.waitForTimeout(1500);
await snap(2, 'stage2-card-mid');
await page.keyboard.press('x');
await page.waitForTimeout(500);
await snap(3, 'stage2-intro');
await page.keyboard.press('x');
await page.waitForTimeout(500);
await snap(4, 'stage2-play-start');

// Play
await page.keyboard.down('ArrowRight');
await page.keyboard.down('x');
await page.waitForTimeout(1500);
await snap(5, 'stage2-mid-1');
await page.waitForTimeout(2000);
await snap(6, 'stage2-mid-2');

const state = await page.evaluate(() => ({
    scene: window.__game.scene,
    playerX: window.__game.player?.x | 0,
    hp: window.__game.player?.hp,
    kills: window.__game.player?.kills,
    score: window.__game.player?.score,
}));
console.log('STAGE2 STATE:', JSON.stringify(state));

// Teleport to boss
await page.keyboard.up('ArrowRight');
await page.keyboard.up('x');
await page.evaluate(() => {
    const g = window.__game;
    const trig = g.level.data.bossTrigger || { x: (g.level.data.width - 6) * 16 };
    g.player.x = trig.x + 10;
    g.player.y = (g.level.data.height - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 128);
    g.player.iFrames = 99999;
    g.player.hp = g.player.maxHp;
});
await page.waitForTimeout(1200);
await snap(7, 'stage2-boss-entrance');
await page.waitForTimeout(1500);
await snap(8, 'stage2-boss-fight');

// Force-kill boss to verify stage 3 transition
await page.evaluate(() => {
    const g = window.__game;
    if (g.boss && g.boss.alive) g.boss.hurt(g.boss.hp, 1, {});
});
await page.waitForTimeout(2500);
await snap(9, 'stage2-clear');

await browser.close();
console.log('ERRORS:', errors.length);
if (errors.length) for (const e of errors) console.log('  ', e);
