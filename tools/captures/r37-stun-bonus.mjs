// Verify stunned enemies take 1.5x damage from player bullets
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(() => {
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
});

// Test 1: shoot a NON-stunned enemy, record damage
const normal = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.enemies.find(en => en.alive);
    e.hp = 100; e.maxHp = 100;
    e._stunTimer = 0;
    const hpBefore = e.hp;
    const b = { x: e.x + e.w / 2, y: e.y + e.h / 2, vx: 1, vy: 0, damage: 4, weapon: 'MG', hits: new Set(), piercing: false, stuck: false };
    g.player.bullets.push(b);
    return { hpBefore };
});
await page.waitForTimeout(80);
const normalAfter = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.enemies.find(en => en.alive);
    return { hp: e?.hp };
});
console.log(`normal: dmg=4, hp ${normal.hpBefore} → ${normalAfter.hp}, delta=${normal.hpBefore - normalAfter.hp}`);

// Test 2: shoot a STUNNED enemy with same dmg
const stunned = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.enemies.find(en => en.alive);
    e.hp = 100; e.maxHp = 100;
    e._stunTimer = 60;
    const hpBefore = e.hp;
    const b = { x: e.x + e.w / 2, y: e.y + e.h / 2, vx: 1, vy: 0, damage: 4, weapon: 'MG', hits: new Set(), piercing: false, stuck: false };
    g.player.bullets.push(b);
    return { hpBefore };
});
await page.waitForTimeout(80);
const stunnedAfter = await page.evaluate(() => {
    const g = window.__game;
    const e = g.enemies.enemies.find(en => en.alive);
    return { hp: e?.hp };
});
console.log(`stunned: dmg=4*1.5=6 expected, hp ${stunned.hpBefore} → ${stunnedAfter.hp}, delta=${stunned.hpBefore - stunnedAfter.hp}`);

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
