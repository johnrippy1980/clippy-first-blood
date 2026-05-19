// Stage 5 fall-through — natural transition test.
// Boots, jumps through stages 1→2→3→4→5 via _startStage which mimics
// the cinematic-card advance. Then watches the first 60 frames of stage 5 PLAY
// for any y > level.height + 80 event.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

// Walk through stages 1..5 the same way the cinematic-card transition does:
//   stage 5 _startStage (= same code path as advance), then _fadeTo(STAGE_INTRO).
// Then bypass the intro by pressing JUMP.
for (let n = 1; n <= 5; n++) {
    await page.evaluate((stage) => {
        window.__game._startStage(stage);
    }, n);
    // Skip the intro fade by forcing into play.
    await page.evaluate(() => {
        window.__game.scene = 'play';
        window.__game.transition = 0;
    });
    await page.waitForTimeout(100);
}

// Now in stage 5, scene = play.
// Watch for fall-through during first 200 frames with no input.
let fellAt = -1;
for (let i = 0; i < 200; i++) {
    const s = await page.evaluate(() => ({
        scene: window.__game.scene,
        x: window.__game.player.x | 0,
        y: window.__game.player.y | 0,
        vy: +window.__game.player.vy.toFixed(2),
        g: !!window.__game.player.onGround,
        h: window.__game.level.height,
        lives: window.__game.player.lives,
        hp: window.__game.player.hp,
        deadT: window.__game.player.deathTimer,
    }));
    if (i < 10 || i % 20 === 0) console.log(`t=${i} scene=${s.scene} x=${s.x} y=${s.y} vy=${s.vy} g=${s.g?1:0} hp=${s.hp} lives=${s.lives} deathT=${s.deadT}`);
    if (s.y > s.h + 20 || s.deadT > 0) {
        console.log(`>> FELL/DIED at t=${i} x=${s.x} y=${s.y} deathT=${s.deadT}`);
        fellAt = i;
        break;
    }
    await page.waitForTimeout(40);
}

if (fellAt < 0) console.log('No fall-through detected in 200 frames of stage 5 play.');

await page.screenshot({ path: '/tmp/stage5-fall.png' });
await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
