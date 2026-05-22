// R242: drive stage 1 with real input for a few seconds, snapshot the
// playfield. Catches issues that scene-pinning probes miss.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r242', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Push past title -> ready -> stage-intro -> play with real keys.
await page.focus('#screen');
async function tap(key, hold = 50) {
    await page.keyboard.down(key);
    await page.waitForTimeout(hold);
    await page.keyboard.up(key);
}
// Title → main menu → story → ready → stage card → play.
// Mash X several times; each press advances one scene.
for (let i = 0; i < 8; i++) {
    await tap('x', 60);
    await page.waitForTimeout(500);
}

// Snapshot 1: stage start
await page.screenshot({ path: '/tmp/r242/01-start.png' });

// Walk right + shoot for ~3 sec
await page.keyboard.down('ArrowRight');
await page.keyboard.down('x');
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/r242/02-running.png' });

// Jump + shoot
await page.keyboard.down('z');
await page.waitForTimeout(150);
await page.keyboard.up('z');
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/r242/03-jumped.png' });

await page.keyboard.up('ArrowRight');
await page.keyboard.up('x');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/r242/04-idle.png' });

// Final state dump
const state = await page.evaluate(() => {
    const g = window.__game;
    return {
        scene: g.scene,
        playerX: Math.round(g.player?.x || 0),
        playerY: Math.round(g.player?.y || 0),
        playerHp: g.player?.hp,
        playerLives: g.player?.lives,
        kills: g.stageStats?.kills,
        enemies: g.enemies?.enemies?.length || 0,
    };
});
console.log(JSON.stringify(state, null, 2));
console.log('Errors:', errs.length, errs.slice(0, 5));
await browser.close();
