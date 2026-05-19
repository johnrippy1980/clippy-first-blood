// Verify boss damage-chip ghost bar: deal damage, see _ghostHp drain.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r27', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
    const boss = g.enemies.spawnBoss(g.player.x + 80, g.player.y + 40, 'COPIER_3000');
    window.__boss = boss;
});

await page.waitForTimeout(120);
const initial = await page.evaluate(() => {
    const b = window.__boss;
    return { hp: b.hp, maxHp: b.maxHp, ghost: b._ghostHp };
});
console.log('initial:', JSON.stringify(initial));

// Deal a chunk of damage
await page.evaluate(() => {
    const b = window.__boss;
    b.hp = Math.floor(b.maxHp * 0.65);
});
await page.waitForTimeout(16); // ~1 frame
const t0 = await page.evaluate(() => {
    const b = window.__boss;
    return { hp: b.hp, ghost: b._ghostHp };
});
console.log('post-hit (16ms):', JSON.stringify(t0));
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r27/post-hit.png' });
const t1 = await page.evaluate(() => {
    const b = window.__boss;
    return { hp: b.hp, ghost: b._ghostHp };
});
console.log('post-hit (136ms):', JSON.stringify(t1));

// Wait for ghost to fully drain (~24 frames + buffer)
await page.waitForTimeout(500);
const t2 = await page.evaluate(() => {
    const b = window.__boss;
    return { hp: b.hp, ghost: b._ghostHp };
});
console.log('post-drain (560ms):', JSON.stringify(t2));
await page.screenshot({ path: '/tmp/r27/drained.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
