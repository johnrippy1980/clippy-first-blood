// Verify pounce target picker prefers non-stunned enemies
import { chromium } from 'playwright';

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
});

// Two cabinets — one CLOSER but stunned, one FARTHER but fresh
const r = await page.evaluate(() => {
    const g = window.__game;
    const cabs = g.enemies.enemies.filter(e => e.type === 'cabinet').slice(0, 2);
    if (cabs.length < 2) return { err: 'need 2 cabinets' };
    const [near, far] = cabs;
    near.x = g.player.x + 20; near.y = g.player.y; near._stunTimer = 60; near.activated = true; near._grace = 0;
    far.x = g.player.x + 50; far.y = g.player.y; far._stunTimer = 0;  far.activated = true; far._grace = 0;
    g.player.grassHidden = true;
    // Trigger one EnemyManager tick to populate _pounceTarget
    g.enemies.update(g.level, g.player);
    return {
        nearX: near.x | 0, nearStunned: near._stunTimer > 0,
        farX: far.x | 0,  farStunned: far._stunTimer > 0,
        picked: g.player._pounceTarget === far ? 'far (fresh)'
              : g.player._pounceTarget === near ? 'near (stunned)' : 'none',
    };
});
console.log(JSON.stringify(r));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
