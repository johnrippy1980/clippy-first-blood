// Verify grapple hook fires + renders + pulls player toward anchor.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r18', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Use stage 3 (server room) — has tall girders to grapple onto.
await page.evaluate(() => {
    const g = window.__game;
    g._startStage(3);
    g.scene = 'play';
    g.transition = 0;
    g.player.iFrames = 99999;
    // Position next to the tall wall at col 32 (x=512). Place player to its
    // left and aim right so the grapple hits the wall face.
    g.player.x = 480;
    g.player.y = 170;
    g.player.vy = 0;
    g.player.onGround = false;
    g.player.aim = { x: 1, y: 0 };
});

await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r18/pre-grapple.png' });

// Fire grapple directly via internal call so we don't need to time the
// keypress with the airborne state.
const dbg = await page.evaluate(() => {
    const g = window.__game;
    g.player.aim = { x: 1, y: 0 };
    g.player.onGround = false;
    // Probe what tiles look like along the ray.
    const samples = [];
    for (let d = 4; d <= 96; d += 8) {
        const px = g.player.x + g.player.w / 2 + d;
        const py = g.player.y + g.player.h / 2;
        samples.push({ d, px: px|0, py: py|0, solid: g.level.isSolid(px, py) });
    }
    const fired = g.player._fireGrapple(g.level);
    return { fired, samples, w: g.level.data.width, h: g.level.data.height };
});
console.log('fired:', dbg.fired, 'samples:', JSON.stringify(dbg.samples));
console.log('level dims:', dbg.w, 'x', dbg.h);
await page.waitForTimeout(60);
const state1 = await page.evaluate(() => ({
    state: window.__game.player.state,
    anchor: window.__game.player._grappleAnchor,
    px: window.__game.player.x | 0,
    py: window.__game.player.y | 0,
}));
console.log('after fire:', JSON.stringify(state1));
await page.screenshot({ path: '/tmp/r18/mid-grapple.png' });

await page.waitForTimeout(400);
const state2 = await page.evaluate(() => ({
    state: window.__game.player.state,
    px: window.__game.player.x | 0,
    py: window.__game.player.y | 0,
}));
console.log('after 400ms:', JSON.stringify(state2));
await page.screenshot({ path: '/tmp/r18/post-grapple.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
