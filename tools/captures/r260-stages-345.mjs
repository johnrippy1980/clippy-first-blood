// R260: verify ceiling layers loaded in stages 3, 4 (loader 4 = Pipeline), 5.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://localhost:8765/?nocache=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#screen');
await page.waitForTimeout(600);

// Loader indices for the stages I'm verifying:
//   loader 3 = makeStage3 (Server Room)
//   loader 4 = makeStagePipeline (Pipeline — the renumbered Spindler stage)
//   loader 5 = makeStage4 (Boardroom)
const stages = [
    { loader: 3, name: 'Server Room' },
    { loader: 4, name: 'Pipeline' },
    { loader: 5, name: 'Boardroom' },
];

for (const s of stages) {
    const r = await page.evaluate((idx) => {
        window.__game._startStage(idx);
        const lvl = window.__game.level.data;
        const ceilingPickups = (lvl.pickupSpawns || []).filter(p => p.y < 40);
        return { width: lvl.width, height: lvl.height, ceilingPickups };
    }, s.loader);
    console.log(`\n${s.name} (loader ${s.loader}):`);
    console.log(JSON.stringify(r, null, 2));
}

console.log('\nErrors:', errs.length);
await browser.close();
