// Verify SILENT STRIKE achievement unlocks after pounce kill
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    window.__ach = ach.achievements;
    window.__achList = ach.ACHIEVEMENT_LIST;
    const g = window.__game;
    g._startStage(1);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
    // Clear any cached unlock so the test runs cleanly
    window.__ach.unlocked.delete('silent_strike');
    // Spawn a low-HP enemy + pounce on it
    const e = g.enemies.enemies.find(en => en.alive);
    e.x = g.player.x + 40; e.y = g.player.y;
    e.hp = 1; e.maxHp = 1;
    window.__e = e;
    g.player._startPounce(e);
});

await page.waitForTimeout(500);
const before = await page.evaluate(() => ({
    pounceKills: window.__game.player.pounceKills || 0,
    unlocked: window.__ach.isUnlocked('silent_strike'),
}));
console.log('after pounce kill, before achievement update:', JSON.stringify(before));

// Trigger an achievements.update() call by spoofing stats snapshot
await page.evaluate(() => {
    window.__ach.update({ pounceKills: window.__game.player.pounceKills });
});
const after = await page.evaluate(() => ({
    unlocked: window.__ach.isUnlocked('silent_strike'),
}));
console.log('after update:', JSON.stringify(after));

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
