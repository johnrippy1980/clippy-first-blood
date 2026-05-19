// Capture GAME OVER scene with ember field rendering. Routes through the
// natural player.kill() → _onPlayerDeath → fade-to-GAME_OVER flow so the
// scene state is real, not just forced.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r9', { recursive: true });

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
    g.player.lives = 0;
    g.player.secondChanceUsed = true;
    g.player.hp = 1;
    g.player.iFrames = 0;
    g.player.hurt(99, -1, g.player.x + 60, g.player.y);
});

// Wait for the death pinwheel and the fade into GAME OVER.
await page.waitForTimeout(2200);
await page.screenshot({ path: '/tmp/r9/gameover-real-t0.png' });

await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/r9/gameover-real-t1.png' });

await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/r9/gameover-real-t2.png' });

const scene = await page.evaluate(() => window.__game.scene);
console.log('final scene:', scene);

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
