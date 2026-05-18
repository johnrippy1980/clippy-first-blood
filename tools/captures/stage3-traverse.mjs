// Verify stage 3 is actually traversable end-to-end.
// Walks the player right, recording x position over time, with jumps at any
// stall. If x stops advancing for too long, that's the blocked column.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/stage3', { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => { errors.push('PAGE: ' + e.message); console.error('PAGE ERROR:', e.message); });
page.on('console', m => { if (m.type() === 'error') { errors.push('CON: ' + m.text()); } });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(3);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});
await page.waitForTimeout(500);

// Walk right while pressing jump occasionally.
await page.keyboard.down('ArrowRight');
let stuckAt = null, lastX = -1, sameCount = 0;
const trajectory = [];
for (let i = 0; i < 60; i++) {
    const state = await page.evaluate(() => ({
        x: window.__game.player.x | 0,
        y: window.__game.player.y | 0,
        grounded: !!window.__game.player.onGround,
    }));
    trajectory.push(state);
    if (state.x === lastX) {
        sameCount++;
        // Try climbing first, then jumping
        await page.keyboard.down('ArrowUp');
        await page.waitForTimeout(80);
        await page.keyboard.up('ArrowUp');
        if (sameCount >= 3) {
            await page.keyboard.press('z');
            await page.waitForTimeout(100);
            await page.keyboard.press('z'); // double jump
        }
        if (sameCount >= 12 && stuckAt == null) {
            stuckAt = state.x;
            break;
        }
    } else {
        sameCount = 0;
        lastX = state.x;
    }
    await page.waitForTimeout(120);
}
await page.keyboard.up('ArrowRight');

console.log('TRAJECTORY:');
for (let i = 0; i < trajectory.length; i++) {
    const t = trajectory[i];
    console.log(`  t=${i} x=${t.x} y=${t.y} g=${t.grounded?1:0}`);
}
const lastState = trajectory[trajectory.length - 1];
console.log(`LAST STATE: x=${lastState.x} y=${lastState.y}`);
if (stuckAt != null) console.log(`STUCK AT x=${stuckAt} (in tiles: ${(stuckAt / 16).toFixed(1)})`);

await page.screenshot({ path: '/tmp/stage3/stuck-position.png' });

await browser.close();
console.log('ERRORS:', errors.length);
