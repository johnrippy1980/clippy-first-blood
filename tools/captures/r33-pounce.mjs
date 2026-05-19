// Verify stealth pounce: from grass-hidden, special triggers spin-jump arc
// onto enemy, damages + stuns or kills, vaults to opposite side, grants air-jump.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r33', { recursive: true });

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
    // Place a fresh enemy near the player
    const e = g.enemies.enemies.find(en => en.type === 'cabinet' && en.alive);
    if (e) {
        e.x = g.player.x + 40;
        e.y = g.player.y;
        e.hp = 10; e.maxHp = 10;
        e.activated = true; e._grace = 0;
        window.__enemy = e;
    }
    // Spoof grass-hidden — set flag directly since stage 1 may not have a grass tile here
    g.player.grassHidden = true;
});

// Force-flag the player as hidden + set the pounce target directly, then
// invoke _startPounce so we exercise the pounce state machine deterministically
// without depending on stage 1 having a grass tile at player position.
await page.evaluate(() => {
    const g = window.__game;
    g.player._pounceTarget = window.__enemy;
    g.player._startPounce(window.__enemy);
});

await page.waitForTimeout(60);
const setup = { manuallyTriggered: true };
console.log('setup:', JSON.stringify(setup));
const mid = await page.evaluate(() => {
    const g = window.__game;
    return {
        state: g.player.state,
        phase: g.player._pounce?.phase,
        enemyHp: window.__enemy?.hp,
        enemyStun: window.__enemy?._stunTimer,
    };
});
console.log('mid:', JSON.stringify(mid));
await page.screenshot({ path: '/tmp/r33/mid.png' });

// Wait for full sequence (~20 frames)
await page.waitForTimeout(500);
const post = await page.evaluate(() => {
    const g = window.__game;
    return {
        state: g.player.state,
        playerX: g.player.x | 0,
        airJumpsLeft: g.player.airJumpsLeft,
        enemyHp: window.__enemy?.hp,
        enemyAlive: window.__enemy?.alive,
        enemyStun: window.__enemy?._stunTimer | 0,
    };
});
console.log('post:', JSON.stringify(post));
await page.screenshot({ path: '/tmp/r33/post.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
