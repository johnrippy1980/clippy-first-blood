// Verify stage-clear rank letter computes correctly across scenarios
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('/tmp/r31', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });

await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');

const scenarios = [
    { name: 'perfect',  dmg: 0,  acc: 80, time: 60 * 50  },  // expect S
    { name: 'good',     dmg: 2,  acc: 50, time: 60 * 70  },  // A
    { name: 'meh',      dmg: 5,  acc: 30, time: 60 * 100 },  // B
    { name: 'bad',      dmg: 10, acc: 10, time: 60 * 200 },  // C or D
];

for (const sc of scenarios) {
    const r = await page.evaluate((s) => {
        const g = window.__game;
        g._startStage(1);
        // Spoof end-of-stage state
        g.stageStats.damageTaken = s.dmg;
        g.stageStats.kills = 10;
        g.player.shotsFired = Math.max(1, Math.round((10 / s.acc) * 100));
        g.stageTime = s.time;
        g.player.score = 5000;
        g._stageClearRank = null;
        // Compute rank by invoking the stats draw with a fake panelT
        // (rank cache builds on first call)
        g._drawStageClearStats(60, 50);
        return g._stageClearRank;
    }, sc);
    console.log(`${sc.name}: dmg=${sc.dmg}, acc=${sc.acc}%, time=${sc.time/60}s →`, JSON.stringify(r));
}

await browser.close();
console.log('ERRORS:', errors.length);
errors.forEach(e => console.log('  ' + e));
