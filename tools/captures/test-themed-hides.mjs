// Drive each stage's GRASS tile location, capture both with and without
// the player at the hide spot so the theme reads clearly.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/themed-hides', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);

// (stage, col-to-stand-in, label)
const targets = [
    [1, 12, 'jungle-grass'],
    [2, 12, 'breakroom-tablecloth'],
    [3, 26, 'serverroom-grate'],
    [4, 14, 'boardroom-curtain'],
    [5, 10, 'keynote-seats'],
    [6, 20, 'founder-drape'],
    [8, 36, 'cloud-puff'],
    [9, 32, 'recyclebin-grate'],
];

for (const [stage, col, name] of targets) {
    await page.evaluate(s => window.__game._startStage(s), stage);
    await page.waitForTimeout(800);
    // Force scene to play AFTER the stage-intro/card timer finishes.
    await page.evaluate(({ col }) => {
        const g = window.__game;
        g.scene = 'play';
        g.storyTimer = 0;
        g.player.x = col * 16;
        g.player.y = (g.level.data.height - 4) * 16;
        g.player.vx = 0; g.player.vy = 0;
        g.player.iFrames = 600;
        g.camera.x = Math.max(0, g.player.x - 128);
        g.enemies.enemies.length = 0;
    }, { col });
    await page.waitForTimeout(800);
    const hidden = await page.evaluate(() => window.__game.player.grassHidden);
    await page.screenshot({ path: `/tmp/themed-hides/${name}.png` });
    console.log(`stage ${stage} ${name}: grassHidden=${hidden}`);
}

await browser.close();
console.log('captures in /tmp/themed-hides/');
