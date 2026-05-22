// R246: confirm THUNDER hit-band damages enemies that aren't dead-on-axis
// at runtime via the real _shoot path. Uses a 3-enemy fan: directly on
// ray, slight perp offset (grazing), and well off-axis (clear miss).
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

    g.player.weapon = 'THUNDER';
    g.player.facing = 1;
    g.player.x = 80;
    g.player.y = g.level.height - 48;
    g.player.aim = { x: 1, y: 0 };
    g.player.fireCooldown = 0;
    g.player.bullets = [];
    g.player.weaponLevel = 1;

    const enemies = g.enemies.enemies.filter(e => e.alive).slice(0, 3);
    if (enemies.length < 3) return { error: 'need 3 enemies' };

    // Three enemies vertically stacked at the same x distance, varying y.
    // Muzzle Y is roughly at the player's torso, so 0 perp = enemy center on
    // the muzzle. With grazeR ~6+4 = 10, an enemy 8px above or below should
    // still take damage; 30px should not.
    const mz = g.player._muzzleWorldPos();
    const samples = [
        { name: 'on-axis',  yOff: 0   },
        { name: 'grazing',  yOff: -8  },  // 8 above the ray
        { name: 'off-band', yOff: -30 },  // way above the ray
    ];
    const out = [];
    for (let i = 0; i < 3; i++) {
        const e = enemies[i];
        const s = samples[i];
        e.x = g.player.x + 60;
        // Anchor the enemy so its CENTER lands at muzzleY + yOff
        e.y = mz.y + s.yOff - e.h / 2;
        e.hp = 100;
        e.alive = true;
        out.push({ name: s.name, yOff: s.yOff, eCy: e.y + e.h / 2, mzY: mz.y });
    }
    const before = enemies.map(e => e.hp);
    g.player._shoot();
    const after = enemies.map(e => e.hp);
    for (let i = 0; i < 3; i++) {
        out[i].before = before[i];
        out[i].after = after[i];
        out[i].dmg = before[i] - after[i];
    }
    return out;
});
console.log(JSON.stringify(result, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 3));

let ok = true;
const onAxis  = result.find(r => r.name === 'on-axis');
const grazing = result.find(r => r.name === 'grazing');
const offBand = result.find(r => r.name === 'off-band');
if (!onAxis  || (onAxis.dmg || 0)  === 0) { console.log('FAIL: on-axis dealt 0 damage'); ok = false; }
if (!grazing || (grazing.dmg || 0) === 0) { console.log('FAIL: grazing dealt 0 damage (band test)'); ok = false; }
if ( offBand && (offBand.dmg || 0)  > 0)  { console.log('FAIL: off-band took damage — band too wide'); ok = false; }
if (ok) console.log('✅ R246 PASS — THUNDER band works at runtime');
else process.exitCode = 1;

await browser.close();
