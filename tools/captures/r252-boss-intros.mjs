// R252: capture each stage's boss-intro cinematic to audit framing.
// Each boss has a painted backdrop + title card with name + tagline.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r252', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

const bosses = [
    [1, 'COPIER_3000'],
    [2, 'SHREDDER'],
    [3, 'CTRL_ALT_DEL'],
    [4, 'SPINDLER'],
    [5, 'BALLMER'],
    [6, 'GATES'],
    [7, 'CLIPPY_2'],
    [9, 'ALGORITHM'],
];
for (const [stage, kind] of bosses) {
    await page.evaluate((s) => {
        const g = window.__game;
        g._startStage(s);
        g.storyTimer = 999;
        g.scene = 'play';
    }, stage);
    await page.waitForTimeout(800);
    // Trigger the boss intro cinematic
    await page.evaluate(() => {
        const g = window.__game;
        g.scene = 'play';
        g.bossSpawned = false;
        g._spawnBoss();
    });
    // Let the intro slide in mid-way before snapshotting
    await page.waitForTimeout(900);
    await page.screenshot({ path: `/tmp/r252/boss-${kind}.png` });
}
console.log('Errors:', errs.length, errs.slice(0, 5));
await browser.close();
