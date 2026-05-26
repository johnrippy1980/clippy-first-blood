// R533: reproduce Floor 11 crash
import { chromium } from 'playwright';
const URL = 'http://localhost:8765/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 24;
    window.__game.gameCleared = true;
});
await page.evaluate(() => window.__game._startStage(16));
await page.waitForTimeout(2500);
for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__game?.scene);
    if (s === 'doomPlay') break;
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(200);
}
// Teleport player to boss room
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    if (d) {
        d._introT = 0;
        d.player.x = 20.5;
        d.player.y = 2.5;
        // Grant all keys
        d.keys.add('red'); d.keys.add('yellow'); d.keys.add('blue');
        // Wait for boss to be active
    }
});
// Wait for boss intro, then let it run
await page.waitForTimeout(1500);
// Skip the boss intro cinematic if it fires
const s1 = await page.evaluate(() => window.__game?.scene);
console.log('after teleport scene:', s1);
if (s1 === 'bossIntro') {
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press('KeyX');
        await page.waitForTimeout(200);
    }
    await page.evaluate(() => {
        if (window.__game._bossIntro) {
            window.__game._bossIntro.autoAdvance = true;
        }
    });
    await page.waitForTimeout(800);
}
// Trigger phase 2 by damaging boss to ~35hp
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    const boss = d?.entities?.find(e => e.kind === 'boss');
    if (boss) {
        boss.hp = 35;
        console.log('Set boss HP to', boss.hp, 'maxHp', boss.maxHp);
    }
});
// Run for 5 seconds
for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(30);
    if (errors.length > 0) break;
}
console.log('mid-fight scene:', await page.evaluate(() => window.__game?.scene));
// Kill the PLAYER (this triggers the crash path)
await page.evaluate(() => {
    const d = window.__game._doomEngine;
    if (d) {
        d.player.hp = 1;
        d.player.iframes = 0;
        d.player.lives = 5;
        // Inject a lethal enemy bullet at player position
        d.bullets.push({
            x: d.player.x, y: d.player.y,
            vx: 0, vy: 0,
            life: 5,
            fromEnemy: true,
            dmg: 5,
        });
        // And another
        d.bullets.push({
            x: d.player.x, y: d.player.y,
            vx: 0, vy: 0,
            life: 5,
            fromEnemy: true,
            dmg: 5,
        });
        d.bullets.push({
            x: d.player.x, y: d.player.y,
            vx: 0, vy: 0,
            life: 5,
            fromEnemy: true,
            dmg: 5,
        });
        console.log('Lethal bullet injected, hp:', d.player.hp);
    }
});
for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(30);
    if (errors.length > 0) break;
}
console.log('after fight scene:', await page.evaluate(() => window.__game?.scene));
console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();
