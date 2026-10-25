// Renders every recovered screen and modal of every bundle in a headless browser, light and dark,
// and reports exceptions, empty renders, text coverage and the most common unresolved components.
// Usage: node smoke.mjs   (atlas server must be running; set PLAYWRIGHT_MODULE_URL as for shots.mjs)
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
const base = process.env.ATLAS_URL || 'http://127.0.0.1:4291/ui/atlas/';
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(base);
const report = await page.evaluate(async () => {
  const data = await import('./js/data.js');
  const { createRenderer, mainComponent } = await import('./js/rn-render.js');
  const out = [];
  for (const b of await data.bundles()) {
    const [cat, rc] = await Promise.all([data.catalog(b.bundle), data.renderContext(b.bundle)]);
    const r = { bundle: b.bundle, screens: 0, rendered: 0, noTree: 0, errors: [], empty: 0, elements: 0, texts: 0, images: 0, unresolved: {} };
    for (const m of cat.modules.filter(m => m.kind === 'screen' || m.kind === 'modal')) {
      r.screens++;
      const tm = rc.idx.byPath.get(cat.prefix + m.p);
      if (!tm || !tm.comps.length) { r.noTree++; continue; }
      const comp = mainComponent(tm);
      for (const mode of ['light', 'dark']) {
        try {
          const rr = createRenderer(rc, { mode });
          const el = rr.renderComponent(comp);
          if (mode === 'light') {
            r.rendered++;
            r.elements += rr.stats.elements; r.texts += rr.stats.texts; r.images += rr.stats.images;
            if (!el.textContent.trim() && !el.querySelector('.rn-image, svg')) r.empty++;
            for (const [k, n] of rr.stats.unresolved) r.unresolved[k] = (r.unresolved[k] || 0) + n;
          }
        } catch (e) { r.errors.push(`${m.p} [${mode}]: ${e.message}`); }
      }
    }
    r.unresolved = Object.entries(r.unresolved).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(', ');
    out.push(r);
  }
  return out;
});
await browser.close();
let failed = pageErrors.length > 0;
for (const r of report) {
  console.log(`${r.bundle.padEnd(14)} screens ${String(r.screens).padStart(4)} · rendered ${String(r.rendered).padStart(4)} · no tree ${String(r.noTree).padStart(3)} · empty ${String(r.empty).padStart(3)} · texts ${String(r.texts).padStart(5)} · images ${String(r.images).padStart(5)} · errors ${r.errors.length}`);
  if (r.unresolved) console.log(`${''.padEnd(14)} top unresolved: ${r.unresolved}`);
  for (const e of r.errors.slice(0, 5)) console.log(`  ERROR ${e}`);
  if (r.errors.length) failed = true;
}
if (pageErrors.length) console.log('PAGE ERRORS', pageErrors.join('\n'));
console.log(failed ? 'FAIL' : 'PASS: every recovered screen renders in light and dark without exceptions');
process.exitCode = failed ? 1 : 0;
