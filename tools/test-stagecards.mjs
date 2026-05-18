// Capture inter-stage cinematic card screenshots for stages 2..9.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

for (const stage of [2, 3, 4, 5, 6, 7, 8, 9]) {
    await page.evaluate(([s]) => {
        const g = window.__game;
        // Block input from auto-advancing the card.
        const oldTick = g._tickStageCard;
        g._tickStageCard = function() { /* no-op */ };
        g.scene = 'stageCard';
        g._pendingStage = s;
        g.currentStage = s - 1;
        g.storyTimer = 140;
        // Restore tick after one frame
        setTimeout(() => { g._tickStageCard = oldTick; }, 100);
    }, [stage]);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `/tmp/clippy-card-${stage}.png` });
    console.log(`shot stage ${stage}`);
}
await browser.close();
