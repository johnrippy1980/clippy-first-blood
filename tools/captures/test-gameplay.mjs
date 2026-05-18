// Full gameplay verification: spawn → shoot → enemy dies → pickup drops → stage end.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
page.on('pageerror', e => errs.push(`${e.message}`));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(400);

// Aim manually at the right side of the screen so shots travel sideways
// Y=560 ≈ row 163 of the 224 internal canvas = ground enemy height
await page.mouse.move(800, 560);

// Initial snapshot
const t0 = await page.evaluate(() => {
    const g = window.__game;
    return {
        enemies: g.enemies?.list?.length ?? g.enemies?.length ?? 'unknown',
        playerHP: g.player?.hp,
        playerScore: g.player?.score,
        playerKills: g.player?.kills,
    };
});
console.log('T0 (spawn):', JSON.stringify(t0));

// Hold shoot + walk right for 3 seconds
await page.keyboard.down('KeyX');
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyX');
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(300);

const t1 = await page.evaluate(() => {
    const g = window.__game;
    return {
        enemies: g.enemies?.enemies?.length,
        firstEnemyX: g.enemies?.enemies?.[0]?.x,
        firstEnemyY: g.enemies?.enemies?.[0]?.y,
        firstEnemyType: g.enemies?.enemies?.[0]?.type,
        playerHP: g.player?.hp,
        playerScore: g.player?.score,
        playerKills: g.player?.kills,
        playerX: g.player?.x,
        playerY: g.player?.y,
        aim: { x: g.player?.aim?.x?.toFixed(2), y: g.player?.aim?.y?.toFixed(2) },
        bullets: g.player?.bullets?.length,
        shotsFired: g.player?.shotsFired,
    };
});
console.log('T1 (3s combat):', JSON.stringify(t1));

await page.screenshot({ path: '/tmp/clippy-gameplay.png' });
await browser.close();

console.log(`Errors: ${errs.length}`);
errs.forEach(e => console.log('  ' + e));

const killed = (t1.playerKills ?? 0) - (t0.playerKills ?? 0);
const moved = (t1.playerX ?? 0) - 64;
console.log(`\nKilled: ${killed}, Moved: ${moved}px, Score: ${t1.playerScore}, HP: ${t1.playerHP}`);
if (killed === 0) console.log('!!! No enemies killed — combat is broken.');
if (moved < 5) console.log('!!! Player did not move — movement is broken.');
