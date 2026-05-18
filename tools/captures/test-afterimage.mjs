// Verify afterimage trail during slide
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/afterimage', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(700);
// Force play + position
await page.evaluate(() => {
    const g = window.__game;
    g.scene = 'play';
    g.storyTimer = 0;
    // Place WAY before any boss/miniboss trigger
    g.player.x = 10 * 16;
    g.player.y = (g.level.data.height - 6) * 16;
    g.camera.x = Math.max(0, g.player.x - 100);
    g.player.iFrames = 600; // immune to enemies during capture
});
await page.waitForTimeout(200);
// Trigger slide manually and watch state over time
const trace2 = await page.evaluate(async () => {
    const g = window.__game;
    g.player.state = 'slide';
    g.player.slideTimer = 60;
    g.player.h = 12;
    g.player.facing = 1;
    g.player.vx = 4;
    const out = [];
    for (let i = 0; i < 20; i++) {
        await new Promise(r => requestAnimationFrame(r));
        out.push({ i, state: g.player.state, st: g.player.slideTimer, ai: g.player._afterimages.length, tick: g.player._afterimageTick });
    }
    return out;
});
for (const r of trace2) console.log('R', JSON.stringify(r));
const ts = [40, 100, 180, 260];
for (let i = 0; i < ts.length; i++) {
    const delta = i === 0 ? ts[0] : ts[i] - ts[i - 1];
    await page.waitForTimeout(delta);
    await page.screenshot({ path: `/tmp/afterimage/slide-t${ts[i]}.png` });
}
const trace = await page.evaluate(() => ({
    state: window.__game.player.state,
    afterimageCount: window.__game.player._afterimages.length,
    ages: window.__game.player._afterimages.map(a => a.age),
}));
console.log('TRACE:', JSON.stringify(trace));

// Now backdash
await page.evaluate(() => {
    const g = window.__game;
    g.player.state = 'idle';
    g.player.h = 30;
    g.player.x = 36 * 16;
    g.camera.x = Math.max(0, g.player.x - 100);
});
await page.waitForTimeout(200);
await page.evaluate(() => {
    const g = window.__game;
    g.player.state = 'backdash';
    g.player.backdashTimer = 22;
    g.player.facing = 1;
});
await page.waitForTimeout(120);
await page.screenshot({ path: `/tmp/afterimage/backdash.png` });

await browser.close();
console.log('done');
