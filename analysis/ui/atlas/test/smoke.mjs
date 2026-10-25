// Renders every recovered screen and modal of every bundle in a headless browser, light and dark,
// and reports exceptions, empty renders, text coverage and the most common unresolved components.
// Files with T8214 branches are also rendered per model variant and per separated branch tree.
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
    const r = { bundle: b.bundle, screens: 0, rendered: 0, noTree: 0, errors: [], empty: 0, elements: 0, texts: 0, images: 0, unresolved: {}, variants: 0, branchTrees: 0 };
    for (const m of cat.modules.filter(m => m.kind === 'screen' || m.kind === 'modal')) {
      r.screens++;
      const tm = data.treeModuleFor(cat, rc.idx, cat.modules.indexOf(m));
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
    // Files with T8214 branches: each model variant and each separated branch tree.
    for (const [i, m] of cat.modules.entries()) {
      if (!m.t8214) continue;
      const tm = data.treeModuleFor(cat, rc.idx, i);
      for (const comp of tm?.comps || []) {
        for (const variant of ['T8214', 'other']) {
          try { createRenderer(rc, { variant }).renderComponent(comp); r.variants++; } catch (e) { r.errors.push(`${m.p} [${variant}]: ${e.message}`); }
        }
        (comp.branches || []).forEach((_, k) => {
          try { createRenderer(rc).renderComponent(comp, `b${k}`); r.branchTrees++; } catch (e) { r.errors.push(`${m.p} [branch ${k}]: ${e.message}`); }
        });
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
  console.log(`${r.bundle.padEnd(14)} screens ${String(r.screens).padStart(4)} · rendered ${String(r.rendered).padStart(4)} · no tree ${String(r.noTree).padStart(3)} · empty ${String(r.empty).padStart(3)} · texts ${String(r.texts).padStart(5)} · images ${String(r.images).padStart(5)} · errors ${r.errors.length}${r.variants ? ` · T8214 variants ${r.variants}, branch trees ${r.branchTrees}` : ''}`);
  if (r.unresolved) console.log(`${''.padEnd(14)} top unresolved: ${r.unresolved}`);
  for (const e of r.errors.slice(0, 5)) console.log(`  ERROR ${e}`);
  if (r.errors.length) failed = true;
}
if (pageErrors.length) console.log('PAGE ERRORS', pageErrors.join('\n'));
console.log(failed ? 'FAIL' : 'PASS: every recovered screen renders in light and dark without exceptions');
process.exitCode = failed ? 1 : 0;
