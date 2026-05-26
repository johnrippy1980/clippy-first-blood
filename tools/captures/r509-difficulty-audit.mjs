// R509: verify difficulty selector + nav dropdown still render correctly
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const URL = 'http://localhost:8765/';
const OUT = '/tmp/r509';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// Title with difficulty selector
await page.keyboard.press('KeyX');
await page.waitForTimeout(500);
let u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/01_after_x.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Check current scene
const s1 = await page.evaluate(() => window.__game?.scene);
console.log('after X: scene =', s1);

// Snap main menu if we landed there
await page.waitForTimeout(500);
u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
if (u) await fs.writeFile(`${OUT}/02_menu.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));

// Click difficulty levels
for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    u = await page.evaluate(() => document.getElementById('screen')?.toDataURL('image/png'));
    if (u) await fs.writeFile(`${OUT}/0${3 + i}_diff_${i}.png`, Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

console.log('errors:', errors.length);
errors.forEach(e => console.log('  ' + e));
await browser.close();
