// R239: verify THUNDER hits enemies in a perpendicular band (not just
// the dead-center ray). Park player, place a fake enemy 4-6px off-axis,
// fire THUNDER, assert enemy.hp decreased.
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
    await new Promise(r => setTimeout(r, 200));
    g.scene = 'play';
    g.bossSpawned = true;

    // Park player at level start.
    g.player.x = 80;
    g.player.y = g.level.height - 48;
    g.player.facing = 1;
    g.player.weapon = 'THUNDER';
    g.player.weaponLevel = 1;
    g.player.aim = { x: 1, y: 0 };  // horizontal aim
    g.player.bullets = [];

    // Place 3 enemies along the ray at increasing perp distance.
    // baseline=0px (dead-on), grazeR=4px, way-off=20px
    // Enemy is ~8 tall, ~14 wide. perp dist is |muzzleY - enemyCenterY|.
    // For HALF_WIDTH=6 + half-height=4 → grazeR=10. So:
    //   - yOff that puts enemy center exactly 6-9 px below muzzleY = grazing hit
    //   - yOff that puts enemy 16+ px away = clear miss
    const samples = [
        { name: 'on-axis',  yOff: 0  },
        { name: 'grazing',  yOff: -8 },  // pull enemy up so center sits ~5px off ray
        { name: 'off-band', yOff: 22 },
    ];
    const out = [];
    for (const s of samples) {
        // Take the first alive cabinet-like enemy and reposition it. If none
        // exist, fall back to inserting a minimal alive enemy.
        const e = g.enemies.enemies.find(x => x.alive) || null;
        if (!e) { out.push({ ...s, skipped: true }); continue; }
        // Park enemy fairly far so it's clearly past any nearby walls
        e.x = g.player.x + 80;
        e.y = g.player.y + s.yOff;
        e.hp = 10;
        e.alive = true;
        const hpBefore = e.hp;
        const mz = g.player._muzzleWorldPos();
        const eCxBefore = e.x + e.w / 2;
        const eCyBefore = e.y + e.h / 2;
        const perpDist = Math.abs(eCyBefore - mz.y);  // horizontal aim → perp is |dy|
        const axialDist = eCxBefore - mz.x;
        g.player.fireCooldown = 0;
        g.player.mgVentLock = 0;
        g.player.bullets = [];
        g.player._shoot();
        await new Promise(r => setTimeout(r, 100));
        const hpAfter = e.hp;
        out.push({ ...s, hpBefore, hpAfter, dmg: hpBefore - hpAfter,
            mzY: Math.round(mz.y), mzX: Math.round(mz.x),
            eCy: Math.round(eCyBefore), perpDist: Math.round(perpDist),
            axialDist: Math.round(axialDist), eh: e.h, ew: e.w });
    }
    return out;
});
console.log(JSON.stringify(result, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 3));
await browser.close();

// Verdict: on-axis must take damage. grazing should too (this is the new
// behavior). off-band should remain untouched.
const onAxis  = result.find(r => r.name === 'on-axis');
const grazing = result.find(r => r.name === 'grazing');
const offBand = result.find(r => r.name === 'off-band');
let ok = true;
if (!onAxis  || (onAxis.dmg || 0)  === 0) { console.log('FAIL: on-axis hit dealt no damage');  ok = false; }
if (!grazing || (grazing.dmg || 0) === 0) { console.log('FAIL: grazing hit dealt no damage (band test)'); ok = false; }
if ( offBand && (offBand.dmg || 0)  > 0)  { console.log('FAIL: off-band enemy took damage — band too wide'); ok = false; }
if (ok) console.log('✅ R239 PASS — THUNDER damage band working');
else process.exitCode = 1;
