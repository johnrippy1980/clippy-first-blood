import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(7));
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(120);
    const sc = await page.evaluate(() => window.__game?.scene);
    if (sc === 'beatPlay') break;
    if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready') await page.keyboard.press('KeyX');
}
await page.waitForTimeout(500);
// Spawn enemy DIRECTLY on top of player
await page.evaluate(() => {
    const b = window.__game._beatEmUp;
    const p = b.player;
    b.enemies.push({
        x: p.x + 8, y: p.y,  // very close
        w: 16, h: 24,
        hp: 99, maxHp: 99,
        vx: 0, vy: 0,
        type: 'scavenger',
        alive: true, hitFlash: 0,
        attackCD: 999, attackRange: 0,
        _animT: 0, _isPlayer: false,
        baseY: p.y, hoverPhase: 0,
        airY: 0, speed: 0,
    });
    b._meleeIntroBark = 0;
    b._meleeIntroShown = true;
    b._meleeBarkT = 0;
});
// Punch 3 times in succession — should hit
for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(80);   // shorter so combo doesn't expire
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    await fs.writeFile(`/tmp/r563_combo_${i}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}
await browser.close();
