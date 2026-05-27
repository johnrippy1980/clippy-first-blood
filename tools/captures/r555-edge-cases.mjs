// R555: gameplay edge cases — pickups, weapon switching, player death,
// achievement unlocks. Watch for state leaks + visual bugs.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const OUT = '/tmp/r555';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
const warns = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
    else if (m.type() === 'warn' && !m.text().includes('DevTools')) warns.push(m.text());
});
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.evaluate(() => {
    window.__game._konamiUnlocked = true;
    window.__game.unlockedStage = 25;
    window.__game.gameCleared = true;
});

async function snap(label) {
    const u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/${label}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

async function enterStage(stage) {
    await page.evaluate((s) => window.__game._startStage(s), stage);
    await page.waitForTimeout(600);
    for (let i = 0; i < 50; i++) {
        await page.waitForTimeout(120);
        const sc = await page.evaluate(() => window.__game?.scene);
        const tr = await page.evaluate(() => window.__game?.transition > 0);
        if (tr) continue;
        if (sc === 'play' || sc === 'fpsPlay' || sc === 'beatPlay' || sc === 'doomPlay' || sc === 'turretPlay') break;
        if (sc === 'stageIntro' || sc === 'stageCard' || sc === 'ready' || sc === 'bossIntro') {
            await page.keyboard.press('KeyX');
        }
    }
    await page.waitForTimeout(400);
}

console.log('\n=== TEST 1: weapon swap during play (platformer) ===');
await enterStage(1);
// Grant all weapons
await page.evaluate(() => {
    const p = window.__game.player;
    p.weaponInventory = ['MG','SPREAD','LASER','HOMING','FLAME','THUNDER','SHOTGUN'];
    p.weaponIdx = 0;
    p.weapon = 'MG';
});
await page.waitForTimeout(200);
await snap('01_full_arsenal');
// Cycle weapons via TAB
for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const w = await page.evaluate(() => window.__game.player.weapon);
    console.log(`  TAB ${i}: weapon=${w}`);
}
await snap('02_weapons_cycled');

console.log('\n=== TEST 2: player death + respawn (platformer) ===');
await page.evaluate(() => {
    const p = window.__game.player;
    p.hp = 1;
    p.lives = 3;
    p.iframes = 0;
    p.secondChanceUsed = true;  // skip bullet-time
});
await page.evaluate(() => { window.__game.player.kill?.(); });
await page.waitForTimeout(1500);
await snap('03_dying');
await page.waitForTimeout(2000);
await snap('04_after_respawn');
const scAfterDeath = await page.evaluate(() => window.__game?.scene);
const livesAfter = await page.evaluate(() => window.__game.player?.lives);
console.log(`  scene after death: ${scAfterDeath}, lives: ${livesAfter}`);

console.log('\n=== TEST 3: pickup chain (platformer) ===');
await enterStage(2);
// Spawn pickups around player
await page.evaluate(() => {
    const g = window.__game;
    const px = g.player.x + 80;
    const py = g.player.y;
    for (const [t, dx] of [['LIFE', 0], ['SPREAD', 20], ['LASER', 40], ['GRENADE', 60], ['1UP', 80]]) {
        g.pickups?.spawn?.(px + dx, py, t);
    }
});
await page.waitForTimeout(200);
await snap('05_pickups_spawned');
// Walk to grab them
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(1500);
await page.keyboard.up('ArrowRight');
await snap('06_pickups_grabbed');

console.log('\n=== TEST 4: low-HP heartbeat + rage trigger ===');
await enterStage(3);
await page.evaluate(() => {
    const p = window.__game.player;
    p.hp = 1;
    p.rageUsedThisStage = false;
});
await page.waitForTimeout(800);
await snap('07_low_hp');
// Force damage to trigger death + rage
await page.evaluate(() => {
    const p = window.__game.player;
    if (p.takeDamage) p.takeDamage(1);
    else { p.hp -= 1; if (p._triggerRage) p._triggerRage(); }
});
await page.waitForTimeout(500);
await snap('08_rage_or_death');

console.log('\n=== TEST 5: achievement unlock toast ===');
await enterStage(1);
await page.evaluate(async () => {
    const a = (await import('/src/achievements.js')).achievements;
    a.banner.push({ id: 'first_blood', age: 5 });
});
await page.waitForTimeout(300);
await snap('09_achievement_toast');
await page.waitForTimeout(2000);
await snap('10_achievement_held');

console.log('\n=== TEST 6: rapid stage swap stress ===');
const stages = [1, 4, 6, 7, 16, 25, 12];
for (const s of stages) {
    await enterStage(s);
}
const finalScene = await page.evaluate(() => window.__game?.scene);
console.log(`  After rapid 7-stage swap: scene=${finalScene}`);

console.log('\n=== REPORT ===');
console.log(`Errors: ${errors.length}`);
errors.forEach(e => console.log('  ', e));
console.log(`Warnings: ${warns.length}`);
warns.forEach(w => console.log('  ', w));
await browser.close();
