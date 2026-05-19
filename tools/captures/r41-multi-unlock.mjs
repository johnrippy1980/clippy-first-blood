// Verify multi-unlock icon strip renders when 2+ achievements unlock in a stage
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r41', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

await page.evaluate(async () => {
    const ach = await import('/src/achievements.js');
    const g = window.__game;
    g._startStage(1);
    g.scene = 'stageClear';
    g.storyTimer = 200;          // jump past the flash → into stats panel
    // Fake newly-unlocked: 3 items to force the multi-icon strip
    g._newlyUnlocked = [
        ach.ACHIEVEMENT_LIST.find(a => a.id === 'first_blood'),
        ach.ACHIEVEMENT_LIST.find(a => a.id === 'combo_5'),
        ach.ACHIEVEMENT_LIST.find(a => a.id === 'silent_strike'),
    ];
});

await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/r41/multi.png' });

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
