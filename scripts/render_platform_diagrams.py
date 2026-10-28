"""渲染自媒体工作流平台方案的两张配图（Playwright + CSS）"""
import asyncio
import os
from playwright.async_api import async_playwright

OUT_DIR = '/home/z/my-project/download/assets'
os.makedirs(OUT_DIR, exist_ok=True)

JOBS = [
    ('/home/z/my-project/scripts/platform-arch.html', f'{OUT_DIR}/platform-architecture.png', 1180),
    ('/home/z/my-project/scripts/content-pipeline.html', f'{OUT_DIR}/content-pipeline.png', 1220),
]


async def html_to_image(html_path, output_path, width=1200, scale=2):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            viewport={'width': width, 'height': 900},
            device_scale_factor=scale,
        )
        await page.goto(f'file://{html_path}', wait_until='networkidle')
        await page.wait_for_timeout(500)

        el = page.locator('#root')
        bbox = await el.bounding_box()
        if bbox:
            fit_w = max(width, int(bbox['width'] + 100))
            fit_h = int(bbox['height'] + 100)
            await page.set_viewport_size({'width': fit_w, 'height': fit_h})
            await page.wait_for_timeout(200)
        await el.screenshot(path=output_path)
        await browser.close()
        print(f'OK {output_path} ({os.path.getsize(output_path) / 1024:.0f}KB)')


async def main():
    for html, png, w in JOBS:
        await html_to_image(html, png, width=w)


if __name__ == '__main__':
    asyncio.run(main())
