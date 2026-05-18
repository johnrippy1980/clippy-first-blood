// Simple flip test: stand still, swing mouse left then right, screenshot Clippy.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1024, height: 768 } }).then(c => c.newPage());

await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.click('#screen');
await page.evaluate(() => window.__game._startStage(1));
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__game.scene = 'play'; window.__game.player.x = 100; window.__game.player.vx = 0; });
await page.waitForTimeout(400);

const cBox = await page.locator('#screen').boundingBox();

// Aim left without moving
await page.mouse.move(cBox.x + 20, cBox.y + cBox.height/2);
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-flip-left.png', clip: { x: cBox.x, y: cBox.y, width: cBox.width, height: cBox.height } });
console.log('Facing:', (await page.evaluate(() => window.__game.player.facing)));

// Aim right without moving
await page.mouse.move(cBox.x + cBox.width - 20, cBox.y + cBox.height/2);
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/clippy-flip-right.png', clip: { x: cBox.x, y: cBox.y, width: cBox.width, height: cBox.height } });
console.log('Facing:', (await page.evaluate(() => window.__game.player.facing)));

await browser.close();
