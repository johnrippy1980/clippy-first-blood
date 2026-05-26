// R524: snap a close-up CRT monster to see the new screen detail + arm lunge
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r524';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(25));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'turretPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
await page.evaluate(() => { if (window.__game._turretArena) window.__game._turretArena._introT = 0; });
await page.waitForTimeout(300);

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

// Force a single monster near camera (t=0.85, lane=0.5) for each screen type
for (let st = 0; st < 5; st++) {
    await page.evaluate((idx) => {
        const a = window.__game._turretArena;
        if (a) {
            a.monsters = [{
                t: 0.7, lane: 0.35,
                w: 16, h: 24,
                speed: 0,
                hp: 3, maxHp: 3,
                hitFlash: 0,
                alive: true,
                isBoss: false,
                _stride: 0,
                _screenIdx: idx,
                _screenT: 0,
            }];
        }
    }, st);
    await page.waitForTimeout(150);
    await snap(`screen_${st}`);
}

// Boss close-up
await page.evaluate(() => {
    const a = window.__game._turretArena;
    if (a) {
        a.monsters = [{
            t: 0.55, lane: 0.5,
            w: 48, h: 56,
            speed: 0,
            hp: 30, maxHp: 30,
            hitFlash: 0,
            alive: true,
            isBoss: true,
            _stride: 0,
            _screenIdx: 0,
            _screenT: 0,
        }];
    }
});
await page.waitForTimeout(150);
await snap('06_boss_closeup');

console.log('done');
await browser.close();
