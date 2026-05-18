"""Headless smoke test. Loads game, captures screenshots, logs errors."""
import asyncio
import json
import os
from playwright.async_api import async_playwright

URL = 'http://localhost:8765/'
OUT_DIR = '/tmp/clippy-smoke'


async def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 1024, 'height': 768})
        page = await ctx.new_page()

        errors, warnings, fails = [], [], []

        def on_console(msg):
            t = f"{msg.type}: {msg.text}"
            if msg.type == 'error':
                errors.append(t)
            elif msg.type == 'warning':
                warnings.append(t)
        page.on('console', on_console)
        page.on('pageerror', lambda e: errors.append(f'PAGEERROR: {e}'))
        page.on('requestfailed', lambda r: fails.append(f'{r.failure} {r.url}'))

        def on_response(resp):
            if resp.status >= 400:
                fails.append(f'{resp.status} {resp.url}')
        page.on('response', on_response)

        await page.goto(URL, wait_until='networkidle')
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT_DIR}/01-title.png')

        await page.click('#screen')
        await page.wait_for_timeout(300)
        await page.keyboard.press('KeyX')
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT_DIR}/02-story-1.png')

        for i in range(4):
            await page.keyboard.press('KeyX')
            await page.wait_for_timeout(700)
            await page.screenshot(path=f'{OUT_DIR}/03-story-{i + 2}.png')

        await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT_DIR}/07-stage1-start.png')

        await page.keyboard.down('ArrowRight')
        await page.wait_for_timeout(800)
        await page.screenshot(path=f'{OUT_DIR}/08-running.png')
        await page.keyboard.press('KeyZ')
        await page.wait_for_timeout(150)
        await page.screenshot(path=f'{OUT_DIR}/09-jump.png')
        await page.keyboard.press('KeyX')
        await page.wait_for_timeout(80)
        await page.screenshot(path=f'{OUT_DIR}/10-jump-shoot.png')
        await page.keyboard.up('ArrowRight')
        await page.wait_for_timeout(400)
        await page.keyboard.down('ArrowDown')
        await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT_DIR}/11-crouch.png')
        await page.keyboard.up('ArrowDown')

        await page.keyboard.down('ArrowRight')
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f'{OUT_DIR}/12-scrolling.png')
        await page.keyboard.up('ArrowRight')

        state = await page.evaluate('''() => {
            const g = globalThis.__game || globalThis.game;
            if (!g) return { error: 'no game global', keys: Object.keys(globalThis).filter(k => !k.startsWith('_') && typeof globalThis[k] !== 'function').slice(0,30) };
            try {
                return {
                    scene: g.scene,
                    stage: g.stageNum,
                    player: g.player ? { x: g.player.x, y: g.player.y, state: g.player.state, w: g.player.w, h: g.player.h, facing: g.player.facing } : null,
                    enemyCount: g.enemies?.length,
                };
            } catch (e) { return { error: e.message }; }
        }''')

        await browser.close()

        print('\n=== STATE ===')
        print(json.dumps(state, indent=2, default=str))
        print(f'\n=== ERRORS ({len(errors)}) ===')
        for e in errors:
            print(' ', e)
        print(f'\n=== WARNINGS ({len(warnings)}) ===')
        for w in warnings[:20]:
            print(' ', w)
        print(f'\n=== FAILED REQUESTS ({len(fails)}) ===')
        for f in fails[:40]:
            print(' ', f)
        print(f'\nScreenshots in {OUT_DIR}/')


asyncio.run(main())
