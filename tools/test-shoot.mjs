// Verify pressing X actually fires a bullet.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(`${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
});
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(400);

// Snapshot before
const before = await page.evaluate(() => {
    const g = window.__game;
    return {
        bullets: g.player?.bullets?.length || 0,
        fireCD: g.player?.fireCooldown,
        weapon: g.player?.weapon,
        aim: g.player?.aim,
        aimLocked: g.player?.aimLocked,
        aimActive: g.player ? window.__input?.aimActive : undefined,
    };
});
console.log('BEFORE:', JSON.stringify(before));

// Press X for ~500ms
await page.keyboard.down('KeyX');
await page.waitForTimeout(500);
await page.keyboard.up('KeyX');
await page.waitForTimeout(150);

const after = await page.evaluate(() => {
    const g = window.__game;
    return {
        bullets: g.player?.bullets?.length || 0,
        fireCD: g.player?.fireCooldown,
        state: g.player?.state,
        held_shoot: undefined, // would require exposing input
    };
});
console.log('AFTER:', JSON.stringify(after));

await page.screenshot({ path: '/tmp/clippy-shoot.png' });
await browser.close();

console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));
