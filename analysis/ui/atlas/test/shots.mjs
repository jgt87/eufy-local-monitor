// Screenshots atlas pages and fails on page errors.
// Usage (from local-app, which has playwright installed):
//   node ../analysis/ui/atlas/test/shots.mjs <outDir> "#/route" ["#/route" ...]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
import fs from 'node:fs/promises';
import path from 'node:path';

const [outDir, ...routes] = process.argv.slice(2);
const base = process.env.ATLAS_URL || 'http://127.0.0.1:4291/ui/atlas/';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
for (const r of routes) {
  await page.goto(base + r);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  const name = r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
  const phone = await page.$('.phone');
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  if (phone) await phone.screenshot({ path: path.join(outDir, `${name}.phone.png`) });
  const stats = await page.$eval('.muted.small', el => el.textContent).catch(() => '');
  console.log(r, '|', stats.slice(0, 300));
}
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); process.exitCode = 1; }
