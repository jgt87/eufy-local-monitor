// Compares two version manifests (ui/atlas/data/versions/<id>.json). Pure function, shared by the
// #/diff page and tools/diff-versions.mjs. Modules are matched by bundle and source path.
const setDiff = (a = [], b = []) => { const A = new Set(a), B = new Set(b); return { added: b.filter(x => !A.has(x)), removed: a.filter(x => !B.has(x)) }; };
const t8214Key = t => (t ? JSON.stringify([t.refs, t.branches, t.via ?? [], t.labels ?? []]) : '');

export function diffManifests(a, b) {
  const meta = m => ({ id: m.id, version: m.version, build: m.build, source: m.source, counts: m.counts });
  const d = { a: meta(a), b: meta(b), added: [], removed: [], changed: [], t8214: [], strings: { added: [], removed: [], changed: [] } };
  for (const bundle of [...new Set([...Object.keys(a.bundles), ...Object.keys(b.bundles)])].sort()) {
    const ma = a.bundles[bundle]?.modules ?? {}, mb = b.bundles[bundle]?.modules ?? {};
    for (const p of [...new Set([...Object.keys(ma), ...Object.keys(mb)])].sort()) {
      const x = ma[p], y = mb[p];
      if (!x || !y) {
        const e = { bundle, p, kind: (x || y).kind };
        (x ? d.removed : d.added).push(e);
        if ((x || y).t8214) d.t8214.push({ ...e, change: x ? 'removed' : 'added', a: x?.t8214, b: y?.t8214 });
        continue;
      }
      const texts = setDiff(x.texts, y.texts), nav = setDiff(x.navigates, y.navigates);
      const c = { bundle, p, kind: y.kind };
      if (x.kind !== y.kind) c.kindWas = x.kind;
      if (x.hash !== y.hash) c.tree = true;
      if (texts.added.length || texts.removed.length) c.texts = texts;
      if (nav.added.length || nav.removed.length) c.navigates = nav;
      if (JSON.stringify(x.routes ?? []) !== JSON.stringify(y.routes ?? [])) c.routes = true;
      if (t8214Key(x.t8214) !== t8214Key(y.t8214)) {
        c.t8214 = true;
        d.t8214.push({ bundle, p, kind: y.kind, change: !x.t8214 ? 'added' : !y.t8214 ? 'removed' : 'changed', a: x.t8214, b: y.t8214 });
      }
      if (Object.keys(c).length > 3) d.changed.push(c);
    }
    const sa = a.bundles[bundle]?.strings ?? {}, sb = b.bundles[bundle]?.strings ?? {};
    for (const k of Object.keys(sb)) if (!(k in sa)) d.strings.added.push({ bundle, key: k, b: sb[k] });
    for (const k of Object.keys(sa)) {
      if (!(k in sb)) d.strings.removed.push({ bundle, key: k, a: sa[k] });
      else if (JSON.stringify(sa[k]) !== JSON.stringify(sb[k])) d.strings.changed.push({ bundle, key: k, a: sa[k], b: sb[k] });
    }
  }
  return d;
}

export const diffSummary = d => ({
  added: d.added.length, removed: d.removed.length, changed: d.changed.length, t8214: d.t8214.length,
  stringsAdded: d.strings.added.length, stringsRemoved: d.strings.removed.length, stringsChanged: d.strings.changed.length,
});
