#!/usr/bin/env node
// Compare two runs of the picture harness.
//
//   node scripts/redesign/harness/compare.mjs <run-a> <run-b> [--images] [--only-roles admin,docente]
//
// A picture whose difference is rendering noise (a few pixels, a shade or two apart) is counted as the same and listed.
//
// Answers "IDENTICAL" (exit 0) or lists what differs (exit 1): a picture whose pixels changed, a role that now lands
// somewhere else, an address photographed in one run and not in the other. With --images it also writes, for every
// changed picture, an image that marks the changed area: <pictures>/<run-b>/_diff-vs-<run-a>/….
// It also warns when the two runs are not comparable (different database snapshot, different address list).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PICTURES } from './lib.mjs';

const a = process.argv.slice(2);
const names = []; let images = false; let onlyRoles = null;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--images') images = true;
  else if (a[i] === '--only-roles') onlyRoles = a[++i].split(',');
  else names.push(a[i]);
}
if (names.length !== 2) { console.error('usage: compare.mjs <run-a> <run-b> [--images]'); process.exit(2); }

function load(name) {
  const dir = join(PICTURES, name);
  if (!existsSync(join(dir, 'run.json'))) { console.error(`no finished run named ${name} in ${PICTURES}`); process.exit(2); }
  const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  const recs = new Map();
  for (const f of readdirSync(dir)) {
    if (!/^[a-z_]+\.(desktop|phone)\.json$/.test(f)) continue;
    for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8'))) {
      if (onlyRoles && !onlyRoles.includes(r.role)) continue;
      recs.set(`${r.role} | ${r.width} | ${r.route}`, r);
    }
  }
  return { dir, meta, recs };
}

// What counts as rendering noise (see below, where pictures are compared).
const NOISE_PIXELS = 200; const NOISE_SHADES = 4;
const A = load(names[0]); const B = load(names[1]);
const warnings = [];
if (A.meta.snapshot !== B.meta.snapshot) warnings.push(`different database snapshots: ${A.meta.snapshot} and ${B.meta.snapshot}`);
if (!A.meta.snapshotRestoredForThisRun || !B.meta.snapshotRestoredForThisRun) warnings.push('at least one run did not put the database back to its snapshot first');
if (A.meta.harnessNow !== B.meta.harnessNow) warnings.push('the two runs used different clock settings');
for (const [m, n] of [[A.meta, names[0]], [B.meta, names[1]]]) {
  // Signing in writes to the sign-in service's own tables (auth.*); anything else changed is worth a warning.
  const touched = Array.isArray(m.databaseChangedByTheWalk) ? m.databaseChangedByTheWalk.filter((t) => !t.startsWith('auth.')) : [];
  if (touched.length) warnings.push(`run ${n} changed these tables while walking: ${touched.join(', ')}`);
  if (m.errors) warnings.push(`run ${n} had ${m.errors} errors`);
  if (m.unstable) warnings.push(`run ${n} has ${m.unstable} pictures that never stood still`);
}

const diffs = { pixels: [], landed: [], onlyA: [], onlyB: [], state: [] };
let same = 0; let compared = 0;
for (const [k, ra] of A.recs) {
  const rb = B.recs.get(k);
  if (!rb) { diffs.onlyA.push(k); continue; }
  compared += 1;
  const stateA = ra.skipped ? 'no id' : ra.error ? 'error' : ra.sameAs ? `sent to ${ra.sameAs}` : 'picture';
  const stateB = rb.skipped ? 'no id' : rb.error ? 'error' : rb.sameAs ? `sent to ${rb.sameAs}` : 'picture';
  if (stateA !== stateB) { diffs.state.push(`${k}: ${stateA} → ${stateB}`); continue; }
  if ((ra.landed || '') !== (rb.landed || '')) { diffs.landed.push(`${k}: ${ra.landed} → ${rb.landed}`); continue; }
  if (ra.file && ra.sha !== rb.sha) { diffs.pixels.push({ k, a: ra, b: rb }); continue; }
  same += 1;
}
for (const k of B.recs.keys()) if (!A.recs.has(k)) diffs.onlyB.push(k);

// For changed pictures: how much changed, and where. Counted in an off-screen browser (no picture library needed).
if (diffs.pixels.length) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const outDir = join(B.dir, `_diff-vs-${names[0]}`);
  const partFile = (f, n) => (n ? f.replace(/\.png$/, `.${n + 1}.png`) : f);
  for (const d of diffs.pixels.slice(0, 600)) {
    // A tall page is kept in parts; each part is compared with its counterpart.
    const count = Math.max(d.a.parts || 1, d.b.parts || 1);
    let total = 0; let strongest = 0; const where = []; const sizes = new Set();
    if ((d.a.parts || 1) !== (d.b.parts || 1)) where.push(`${d.a.parts || 1} parts → ${d.b.parts || 1} parts`);
    for (let n = 0; n < count; n++) {
      const fa = join(A.dir, partFile(d.a.file, n)); const fb = join(B.dir, partFile(d.b.file, n));
      if (!existsSync(fa) || !existsSync(fb)) continue;
      const ba = readFileSync(fa); const bb = readFileSync(fb);
      if (ba.equals(bb)) continue;
      const res = await page.evaluate(async ([ua, ub, want]) => {
        const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
        const [ia, ib] = await Promise.all([img(ua), img(ub)]);
        const w = Math.max(ia.width, ib.width); const h = Math.max(ia.height, ib.height);
        const data = (i) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, w, h).data; };
        const da = data(ia); const db = data(ib);
        let n = 0; let top = h; let bottom = -1; let left = w; let right = -1; let strongest = 0;
        const out = want ? new Uint8ClampedArray(db) : null;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const p = (y * w + x) * 4;
          if (da[p] !== db[p] || da[p + 1] !== db[p + 1] || da[p + 2] !== db[p + 2] || da[p + 3] !== db[p + 3]) {
            n += 1; if (y < top) top = y; if (y > bottom) bottom = y; if (x < left) left = x; if (x > right) right = x;
            strongest = Math.max(strongest, Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2]), Math.abs(da[p + 3] - db[p + 3]));
            if (out) { out[p] = 255; out[p + 1] = 0; out[p + 2] = 160; out[p + 3] = 255; }
          } else if (out) { out[p] = (out[p] + 510) / 3; out[p + 1] = (out[p + 1] + 510) / 3; out[p + 2] = (out[p + 2] + 510) / 3; }
        }
        let png = null;
        if (out) {
          const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
          const blob = await c.convertToBlob({ type: 'image/png' });
          const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          png = btoa(s);
        }
        return { n, strongest, sizeA: `${ia.width}×${ia.height}`, sizeB: `${ib.width}×${ib.height}`, box: n ? `x ${left}–${right}, y ${top}–${bottom}` : '', png };
      }, [`data:image/png;base64,${ba.toString('base64')}`, `data:image/png;base64,${bb.toString('base64')}`, images]).catch((e) => ({ n: 0, err: String(e.message).slice(0, 100) }));
      total += res.n || 0; strongest = Math.max(strongest, res.strongest || 0); if (res.err) strongest = 255;
      if (res.box) where.push(count > 1 ? `part ${n + 1}: ${res.box}` : res.box);
      if (res.sizeA !== res.sizeB) sizes.add(`${res.sizeA} → ${res.sizeB}`);
      if (res.png) { const f = join(outDir, partFile(d.b.file, n)); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, Buffer.from(res.png, 'base64')); d.image = f; }
    }
    d.pixels = total; d.box = where.join('; '); d.strongest = strongest;
    // Rendering noise: a handful of pixels on a rounded corner that come out one or two shades apart (of 255) from
    // one run to the next, on unchanged code. Too few and too faint to be a change anyone made or could see.
    d.noise = total > 0 && total <= NOISE_PIXELS && strongest <= NOISE_SHADES && !sizes.size && (d.a.parts || 1) === (d.b.parts || 1);
    d.sizes = d.a.pageHeight === d.b.pageHeight ? `page ${d.b.pageHeight} px tall` : `page ${d.a.pageHeight} → ${d.b.pageHeight} px tall`;
    if (sizes.size) d.sizes += ` (${[...sizes].join(', ')})`;
  }
  await browser.close();
}

const noise = diffs.pixels.filter((d) => d.noise);
diffs.pixels = diffs.pixels.filter((d) => !d.noise);
same += noise.length;
const total = diffs.pixels.length + diffs.landed.length + diffs.state.length + diffs.onlyA.length + diffs.onlyB.length;
const lines = [];
lines.push(`Compared ${names[0]} (${A.meta.builtCommit ? A.meta.builtCommit.slice(0, 9) : '?'}${A.meta.builtWithUncommitted ? '+changes' : ''}) with ${names[1]} (${B.meta.builtCommit ? B.meta.builtCommit.slice(0, 9) : '?'}${B.meta.builtWithUncommitted ? '+changes' : ''}): ${compared} role × width × address in both.`);
for (const w of warnings) lines.push(`WARNING: ${w}`);
if (total === 0) lines.push(`IDENTICAL: ${same} the same, 0 different.`);
else {
  lines.push(`DIFFERENT: ${total} differ, ${same} the same.`);
  if (diffs.pixels.length) {
    // How far apart the changed pixels are says what kind of change it is: 255 is a different thing drawn, 1 or 2 is
    // the same thing drawn from a value that was rounded differently (see docs/plan/redesign/tokens.md).
    const measured = diffs.pixels.filter((d) => d.strongest !== undefined);
    const strongest = measured.reduce((m, d) => Math.max(m, d.strongest), 0);
    lines.push(`\nPictures that changed (${diffs.pixels.length})${measured.length ? `; the largest difference of any pixel in them: ${strongest} of 255 shades` : ''}:`);
    for (const d of diffs.pixels) lines.push(`  ${d.k}${d.pixels !== undefined ? ` — ${d.pixels} pixels, at most ${d.strongest} shades apart, ${d.sizes}${d.box ? `, ${d.box}` : ''}` : ''}`);
  }
  if (diffs.landed.length) { lines.push(`\nLands somewhere else (${diffs.landed.length}):`); for (const x of diffs.landed) lines.push(`  ${x}`); }
  if (diffs.state.length) { lines.push(`\nOutcome changed (${diffs.state.length}):`); for (const x of diffs.state) lines.push(`  ${x}`); }
  if (diffs.onlyA.length) { lines.push(`\nOnly in ${names[0]} (${diffs.onlyA.length}):`); for (const x of diffs.onlyA) lines.push(`  ${x}`); }
  if (diffs.onlyB.length) { lines.push(`\nOnly in ${names[1]} (${diffs.onlyB.length}):`); for (const x of diffs.onlyB) lines.push(`  ${x}`); }
}
if (noise.length) {
  lines.push(`Counted as the same: ${noise.length} picture${noise.length === 1 ? '' : 's'} with rendering noise only (at most ${NOISE_PIXELS} pixels, each at most ${NOISE_SHADES} shades of 255 apart):`);
  for (const d of noise) lines.push(`  ${d.k} — ${d.pixels} pixels, ${d.strongest} shade${d.strongest === 1 ? '' : 's'} apart, ${d.box}`);
}
const report = lines.join('\n');
console.log(report);
writeFileSync(join(B.dir, `compare-with-${names[0]}.txt`), `${report}\n`);
process.exit(total === 0 ? 0 : 1);
