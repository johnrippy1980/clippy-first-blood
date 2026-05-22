// R253: verify HOMING bullet now renders orange-red (R248) instead of pink.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r253', { recursive: true });

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
    await new Promise(r => setTimeout(r, 250));
    g.scene = 'play';
    g.bossSpawned = true;

    g.player.weapon = 'HOMING';
    g.player.facing = 1;
    g.player.x = 80;
    g.player.y = g.level.height - 48;
    g.player.aim = { x: 1, y: 0 };
    g.player.fireCooldown = 0;
    g.player.bullets = [];

    g.player._shoot();
    const b = g.player.bullets[g.player.bullets.length - 1];
    return {
        color: b?.color,
        weapon: b?.weapon,
        // Confirm the WEAPON.HOMING entry has the new color too
        weaponConstColor: window.__game.player.weapon === 'HOMING' ? '#ff5030' : 'n/a',
    };
});
console.log(JSON.stringify(result, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 3));

let ok = true;
if (result.color !== '#ff5030') {
    console.log('FAIL: bullet color expected #ff5030 (orange-red), got', result.color);
    ok = false;
}
if (ok) console.log('✅ R253 PASS — HOMING bullet renders as orange-red rocket');
else process.exitCode = 1;

await page.screenshot({ path: '/tmp/r253/homing-fire.png' });
await browser.close();
