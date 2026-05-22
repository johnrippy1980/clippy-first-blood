// R244: verify chainsaw stun + shake mechanics from R240 actually
// apply to enemies in real gameplay.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

const result = await page.evaluate(async () => {
    const g = window.__game;
    g._startStage(1);
    g.storyTimer = 999;
    g.scene = 'play';
    await new Promise(r => setTimeout(r, 300));
    g.scene = 'play';
    g.bossSpawned = true;

    g.player.weapon = 'CHAINSAW';
    g.player.facing = 1;
    g.player.x = 80;
    g.player.y = g.level.height - 48;
    g.player.fireCooldown = 0;
    g.player.bullets = [];

    // Find or place an enemy directly in front of Clippy within saw range.
    let e = g.enemies.enemies.find(x => x.alive);
    if (!e) return { error: 'no enemy available' };
    e.x = g.player.x + 24;        // ~24px in front, inside CHAINSAW range=38
    e.y = g.player.y;
    e.hp = 50;                     // tough enough to survive ticks for measurement
    e.alive = true;
    e._stunTimer = 0;
    e._shakeTimer = 0;

    // Snapshot enemy state, tick chainsaw once.
    const before = { hp: e.hp, stun: e._stunTimer || 0, shake: e._shakeTimer || 0 };
    g.player._tickChainsaw();
    const afterTick1 = { hp: e.hp, stun: e._stunTimer || 0, shake: e._shakeTimer || 0 };
    g.player._tickChainsaw();
    const afterTick2 = { hp: e.hp, stun: e._stunTimer || 0, shake: e._shakeTimer || 0 };

    return { before, afterTick1, afterTick2 };
});
console.log(JSON.stringify(result, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 3));

let ok = true;
if (!result.afterTick1) { console.log('FAIL: no afterTick1'); ok = false; }
else {
    if (result.afterTick1.hp >= result.before.hp) { console.log('FAIL: no damage applied'); ok = false; }
    if ((result.afterTick1.stun || 0) < 10) { console.log('FAIL: stun not set to ≥10, got', result.afterTick1.stun); ok = false; }
    if ((result.afterTick1.shake || 0) < 8) { console.log('FAIL: shake not set to ≥8, got', result.afterTick1.shake); ok = false; }
}
if (ok) console.log('✅ R244 PASS — chainsaw applies stun + shake on tick');
else process.exitCode = 1;

await browser.close();
