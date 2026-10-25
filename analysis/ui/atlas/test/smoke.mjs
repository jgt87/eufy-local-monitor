// Renders every recovered screen and modal of every bundle in a headless browser, light and dark,
// and reports exceptions, empty renders, text coverage and the most common unresolved components.
// Files with T8214 branches are also rendered per model variant and per separated branch tree.
// Then checks text search, the preview language switch and the version comparison (#/diff).
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
// Text search, preview language (header switch, remembered across reloads) and version comparison.
const featureFails = [];
const check = (ok, msg) => { if (!ok) featureFails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const s1 = await page.evaluate(async () => {
  const { search } = await import('./js/views/search.js');
  const t0 = performance.now(), hits = await search('motion detection'), t1 = performance.now();
  await search('activity zone');
  const t2 = performance.now();
  return { n: hits.length, motion: hits.some(x => x.name === 'MotionDetectionScreen'), byKey: (await search('wiredwlc_smartdetection_page_text1')).length, byName: (await search('MotionDetectionScreen'))[0]?.name, first: Math.round(t1 - t0), next: Math.round(t2 - t1) };
});
check(s1.motion && s1.byKey > 0 && s1.byName === 'MotionDetectionScreen', `search: "motion detection" ${s1.n} hits incl. MotionDetectionScreen, by key ${s1.byKey}, by name ${s1.byName}; first query ${s1.first} ms (builds index), next ${s1.next} ms`);
const motionIndex = await page.evaluate(async () => (await (await import('./js/data.js')).catalog('SEC_SETTING')).modules.findIndex(m => m.p.endsWith('motionDetection_MotionDetectionScreen.tsx')));
await page.goto(`${base}#/b/SEC_SETTING/${motionIndex}`);
await page.waitForSelector('.phone-screen');
const enText = await page.textContent('.phone-screen');
await page.selectOption('#lang', 'nl');
await page.waitForFunction(() => /Bewegingsdetectie|Activiteitszone/.test(document.querySelector('.phone-screen')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
const nlText = await page.textContent('.phone-screen');
await page.reload();
await page.waitForSelector('.phone-screen');
const kept = await page.$eval('#lang', el => el.value);
const nlAgain = await page.textContent('.phone-screen');
check(/Activity Zone/.test(enText) && /Activiteitszone/.test(nlText) && kept === 'nl' && /Activiteitszone/.test(nlAgain), `language: English preview shows "Activity Zone", Dutch "Activiteitszone", choice kept after reload (${kept})`);
const s2 = await page.evaluate(async () => (await (await import('./js/views/search.js')).search('bewegingsdetectie')).some(x => x.name === 'MotionDetectionScreen'));
check(s2, 'search in Dutch: "bewegingsdetectie" finds MotionDetectionScreen');
await page.selectOption('#lang', 'en');
await page.fill('#search', 'activity zone');
await page.waitForSelector('#search-results a');
await page.press('#search', 'Enter');
await page.waitForSelector('.search-hit');
check(decodeURIComponent(await page.evaluate(() => location.hash)) === '#/search/activity zone' && await page.$$eval('.search-hit', els => els.length) > 0, 'header search: dropdown hits, Enter opens #/search/<query>');
await page.goto(`${base}#/diff`);
await page.waitForSelector('.empty-state, .diff');
const versions = await page.evaluate(async () => (await (await import('./js/data.js')).versionIndex()).versions.length);
check(versions >= 2 ? await page.$('.diff') !== null : await page.$('.empty-state') !== null, `#/diff with ${versions} version manifest(s) shows ${versions >= 2 ? 'the comparison' : 'the empty state'}`);
const d = await page.evaluate(async () => {
  const data = await import('./js/data.js');
  const { diffManifests, diffSummary } = await import('./js/version-diff.js');
  const { renderDiff } = await import('./js/views/diff.js');
  const idx = await data.versionIndex();
  const a = await data.manifest(idx.current ?? idx.versions.at(-1).id), b = structuredClone(a);
  b.id = 'synthetic';
  const S = b.bundles.SEC_SETTING.modules, ps = Object.keys(S).filter(p => S[p].kind === 'screen');
  const plain = ps.filter(p => !S[p].t8214), t = ps.find(p => S[p].t8214);
  delete S[plain[0]];
  S['setting_src_synthetic_NewScreen.tsx'] = { kind: 'screen', hash: 'x', texts: ['new_key'] };
  S[plain[1]] = { ...S[plain[1]], hash: 'changed' };
  S[t] = { ...S[t], t8214: { ...S[t].t8214, refs: [...S[t].t8214.refs, 'T8214X'] } };
  b.bundles.SEC_SETTING.strings = { ...b.bundles.SEC_SETTING.strings, new_key: 'New' };
  const dd = diffManifests(a, b), el = await renderDiff(dd, { current: idx.current, strings: [a, b] });
  document.getElementById('view').replaceChildren(el);
  return { s: diffSummary(dd), rows: el.querySelectorAll('tbody tr').length, links: el.querySelectorAll('tbody a[href^="#/b/"]').length };
});
check(d.s.added === 1 && d.s.removed === 1 && d.s.changed === 2 && d.s.t8214 === 1 && d.s.stringsAdded === 1 && d.rows === 6 && d.links >= 4, `diff of a synthetic copy: ${JSON.stringify(d.s)}, ${d.rows} rows, ${d.links} links`);
await browser.close();
let failed = pageErrors.length > 0 || featureFails.length > 0;
for (const r of report) {
  console.log(`${r.bundle.padEnd(14)} screens ${String(r.screens).padStart(4)} · rendered ${String(r.rendered).padStart(4)} · no tree ${String(r.noTree).padStart(3)} · empty ${String(r.empty).padStart(3)} · texts ${String(r.texts).padStart(5)} · images ${String(r.images).padStart(5)} · errors ${r.errors.length}${r.variants ? ` · T8214 variants ${r.variants}, branch trees ${r.branchTrees}` : ''}`);
  if (r.unresolved) console.log(`${''.padEnd(14)} top unresolved: ${r.unresolved}`);
  for (const e of r.errors.slice(0, 5)) console.log(`  ERROR ${e}`);
  if (r.errors.length) failed = true;
}
if (pageErrors.length) console.log('PAGE ERRORS', pageErrors.join('\n'));
console.log(failed ? 'FAIL' : 'PASS: every recovered screen renders in light and dark without exceptions; search, language switch and version diff work');
process.exitCode = failed ? 1 : 0;
