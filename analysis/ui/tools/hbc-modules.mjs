// Recovers the Metro module table of a Hermes v96 RN bundle:
// every __d(factory, "<source path>", [deps]) call in the global function, plus for each
// module the strings its closure subtree uses and the object literals it builds
// (StyleSheet.create input, route tables, option objects).
// Usage: node hbc-modules.mjs <index.android.hbc> <BytecodeList.def> <out.json>
import fs from 'node:fs';
import { loadOpcodes, openHbc } from './hbc.mjs';

const [hbcPath, defPath, outPath] = process.argv.slice(2);
const h = openHbc(hbcPath, loadOpcodes(defPath));
const b = h.buffer, S = h.strings;
const align = n => (n + 3) & ~3;
const arrayBase = align(h.storageEnd);
const keyBase = align(arrayBase + b.readUInt32LE(80));
const valueBase = align(keyBase + b.readUInt32LE(84));

// Serialized literal buffer: tag byte = type (bits 4-6) | length; bit 7 extends length by one byte.
function readLiterals(base, index, count) {
  const out = [];
  let p = base + index;
  while (out.length < count) {
    let tag = b[p++], len = tag & 0x0f;
    if (tag & 0x80) len = (len << 8) | b[p++];
    const type = tag & 0x70;
    for (let i = 0; i < len && out.length < count; i++) {
      switch (type) {
        case 0x00: out.push(null); break;
        case 0x10: out.push(true); break;
        case 0x20: out.push(false); break;
        case 0x30: out.push(b.readDoubleLE(p)); p += 8; break;
        case 0x40: out.push(S[b.readUInt32LE(p)]); p += 4; break;
        case 0x50: out.push(S[b.readUInt16LE(p)]); p += 2; break;
        case 0x60: out.push(S[b[p]]); p += 1; break;
        case 0x70: out.push(b.readInt32LE(p)); p += 4; break;
        default: throw Error(`literal tag ${tag.toString(16)} at ${p - 1}`);
      }
    }
  }
  return out;
}

// Pass 1: decode every function once.
const fns = [];
for (let id = 0; id < h.functionCount; id++) {
  const fn = { strs: new Set(), kids: [], objects: [], arrays: [] };
  for (const ins of h.instructions(id)) {
    if (ins.str !== undefined) fn.strs.add(ins.str);
    if (ins.fn !== undefined) fn.kids.push(ins.fn);
    if (ins.op === 'NewObjectWithBuffer' || ins.op === 'NewObjectWithBufferLong') {
      const [, , count, ki, vi] = ins.args;
      const keys = readLiterals(keyBase, ki, count), values = readLiterals(valueBase, vi, count);
      fn.objects.push(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
    }
    if (ins.op === 'NewArrayWithBuffer' || ins.op === 'NewArrayWithBufferLong') {
      const [, , count, ai] = ins.args;
      fn.arrays.push(readLiterals(arrayBase, ai, count));
    }
  }
  fns.push(fn);
}
const parent = new Int32Array(h.functionCount).fill(-1);
fns.forEach((fn, id) => fn.kids.forEach(k => { if (parent[k] === -1 && k !== id) parent[k] = id; }));

// Pass 2: module table from the global function.
const modules = [];
let pendingFn = null, pendingPath = null, pendingDeps = [];
for (const ins of h.instructions(0)) {
  if (ins.op.startsWith('Create') && ins.op.includes('Closure')) { pendingFn = ins.fn; pendingPath = null; pendingDeps = []; }
  else if (ins.op.startsWith('LoadConstString') && pendingFn !== null && pendingPath === null) pendingPath = ins.str;
  else if (ins.op.startsWith('NewArrayWithBuffer') && pendingPath) pendingDeps = readLiterals(arrayBase, ins.args[3], ins.args[2]);
  else if (ins.op.startsWith('Call') && pendingPath) {
    modules.push({ path: pendingPath, factory: pendingFn, deps: pendingDeps });
    pendingFn = pendingPath = null; pendingDeps = [];
  }
}

for (const m of modules) {
  const strs = new Set(), objects = [], stack = [m.factory], seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    fns[id].strs.forEach(s => strs.add(s));
    objects.push(...fns[id].objects);
    for (const k of fns[id].kids) if (parent[k] === id) stack.push(k);
  }
  m.functions = seen.size;
  m.strings = [...strs];
  m.objects = objects;
}
fs.writeFileSync(outPath, JSON.stringify({ hbc: hbcPath, functionCount: h.functionCount, modules }));
const app = modules.filter(m => !m.path.includes('node_modules'));
console.log(JSON.stringify({ hbc: hbcPath, modules: modules.length, appModules: app.length, sample: app.slice(0, 3).map(m => m.path) }));
