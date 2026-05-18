// Drive the stage card scene at multiple storyTimer values to verify dialog beats render.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/stage-card', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[browser err]', m.text()); });
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.click('#screen');
await page.waitForTimeout(300);

const stages = [2, 3, 4, 5, 6, 7, 8, 9];
const beats = [
    { name: 'pre',     t: 10  },  // before any text
    { name: 'beat1',   t: 60  },  // first line in
    { name: 'both',    t: 130 },  // both lines visible
];
for (const stage of stages) {
    for (const beat of beats) {
        await page.evaluate(({ s, t }) => {
            const g = window.__game;
            g.scene = 'stageCard';
            g._pendingStage = s;
            g.currentStage = s - 1;
            g.storyTimer = t;
        }, { s: stage, t: beat.t });
        await page.waitForTimeout(60);
        await page.screenshot({ path: `/tmp/stage-card/stage${stage}-${beat.name}.png` });
    }
}
console.log('captures written to /tmp/stage-card/');
await browser.close();
