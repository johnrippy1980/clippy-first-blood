// Honest playtest: drive stage 1 for ~12s of real input, log everything.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

const errs = [];
const warns = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => {
    if (m.type() === 'error') errs.push(m.text());
    if (m.type() === 'warning') warns.push(m.text());
});

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(900);
await page.evaluate(() => { window.__game.scene = 'play'; });
await page.waitForTimeout(200);

// Snapshot 1: start
let s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'start', x: Math.round(g.player.x), y: Math.round(g.player.y), hp: g.player.hp, kills: g.player.kills };
});
console.log(JSON.stringify(s));

// Run right + shoot for 4s
await page.keyboard.down('ArrowRight');
const shootInterval = setInterval(() => page.keyboard.press('KeyX'), 250);
await page.waitForTimeout(4000);
clearInterval(shootInterval);
await page.keyboard.up('ArrowRight');
s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'after_run', x: Math.round(g.player.x), y: Math.round(g.player.y), hp: g.player.hp, kills: g.player.kills, score: g.player.score, weapon: g.player.weapon };
});
console.log(JSON.stringify(s));
await page.screenshot({ path: '/tmp/playtest-mid.png' });

// Jump test
await page.keyboard.press('KeyZ');
await page.waitForTimeout(200);
await page.keyboard.press('KeyZ'); // double-jump
await page.waitForTimeout(500);
s = await page.evaluate(() => {
    const g = window.__game;
    return { t: 'after_jump', x: Math.round(g.player.x), y: Math.round(g.player.y), state: g.player.state, airJumps: g.player.airJumpsLeft };
});
console.log(JSON.stringify(s));

// Test cover — find nearest cover tile, walk to it, hold up
const coverInfo = await page.evaluate(() => {
    const g = window.__game;
    const tiles = g.level.tiles;
    for (let r = 0; r < tiles.length; r++) {
        for (let c = 0; c < tiles[0].length; c++) {
            if (tiles[r][c] === 7) return { row: r, col: c, x: c * 16 };
        }
    }
    return null;
});
console.log('nearest cover:', JSON.stringify(coverInfo));

if (coverInfo) {
    // Teleport near cover
    await page.evaluate((tx) => {
        const g = window.__game;
        g.player.x = tx;
        g.player.y = (g.level.data.height - 4) * 16;
        g.player.vx = 0;
    }, coverInfo.x);
    await page.waitForTimeout(100);
    // Hold up
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(400);
    s = await page.evaluate(() => ({ t: 'after_cover_attempt', state: window.__game.player.state, onCover: window.__game.player.onCover }));
    console.log(JSON.stringify(s));
    await page.screenshot({ path: '/tmp/playtest-cover.png' });
    await page.keyboard.up('ArrowUp');
}

// Continue right to reach the swamp + sniper section
await page.evaluate(() => { window.__game.player.x = 350; window.__game.player.y = 170; });
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/playtest-swamp.png' });

console.log(`\nErrors: ${errs.length}`);
errs.forEach(e => console.log('  ERR: ' + e));
console.log(`Warns: ${warns.length}`);
warns.slice(0, 5).forEach(w => console.log('  WARN: ' + w));
await browser.close();
