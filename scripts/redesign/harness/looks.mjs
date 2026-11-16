#!/usr/bin/env node
// Compare what two LOOKS show (phase 5): a run walked in today's look and a run of the same build walked in the new
// look. Pictures differ on purpose, so this does not look at pixels. It checks that nothing was lost on the way:
//
//   node scripts/redesign/harness/looks.mjs <run-clasico> <run-nuevo> [--frame]
//
// For every role × width × address in both runs: the same outcome (a picture, sent elsewhere, an error), the same
// landing, the same menu entries in the sidebar, the same headings and the same text in the page's own content
// (`main`), letter case and spacing aside (a look may set a title in capitals; it may not change a word).
// With --frame the whole page's text is compared too, frame included (for a release that must not change the frame).
// It also says which look each picture was really taken in (`data-look` on <html> at that moment), and lists the
// signed-in pictures of the second run that were NOT in the new look: those must be exactly the pages the look
// leaves alone (the public site, the sign-in family, documents for clients).
//
// Make the two runs on one stack from two snapshots that differ ONLY in the look:
//   stack.sh restore content none && stack.sh look clasico && stack.sh snapshot content-testers
//   stack.sh restore content none && stack.sh look nuevo   && stack.sh snapshot content-nuevo
// (both mark every made-up account «Tester QA», so the tester-only parts of the platform are in both runs).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PICTURES } from './lib.mjs';

const a = process.argv.slice(2);
const frame = a.includes('--frame');
const names = a.filter((x) => !x.startsWith('--'));
if (names.length !== 2) { console.error('usage: looks.mjs <run-clasico> <run-nuevo> [--frame]'); process.exit(2); }

function load(name) {
  const dir = join(PICTURES, name);
  if (!existsSync(join(dir, 'run.json'))) { console.error(`no finished run named ${name} in ${PICTURES}`); process.exit(2); }
  const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  const recs = new Map();
  for (const f of readdirSync(dir)) {
    if (!/^[a-z_]+\.(desktop|phone)\.json$/.test(f)) continue;
    for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8'))) recs.set(`${r.role} | ${r.width} | ${r.route}`, r);
  }
  return { dir, meta, recs };
}
const A = load(names[0]); const B = load(names[1]);

// Letter case and spacing aside: capitals are a look's business, words are not.
const plain = (t) => (t || '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
const outcome = (r) => (r.skipped ? 'no id' : r.error ? 'error' : r.sameAs ? `sent to ${r.sameAs}` : 'picture');
// Where two texts first part ways, with a little of each around that point.
function firstDifference(x, y) {
  let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const cut = (t) => JSON.stringify(t.slice(Math.max(0, i - 40), i + 80));
  return `at character ${i}: ${cut(x)} → ${cut(y)}`;
}

const diffs = { outcome: [], landed: [], menu: [], headings: [], content: [], frame: [], onlyA: [], onlyB: [] };
let compared = 0; let same = 0;
for (const [k, ra] of A.recs) {
  const rb = B.recs.get(k);
  if (!rb) { diffs.onlyA.push(k); continue; }
  compared += 1;
  let ok = true;
  if (outcome(ra) !== outcome(rb)) { diffs.outcome.push(`${k}: ${outcome(ra)} → ${outcome(rb)}`); continue; }
  if ((ra.landed || '') !== (rb.landed || '')) { diffs.landed.push(`${k}: ${ra.landed} → ${rb.landed}`); continue; }
  const ma = (ra.menu || []).join(', '); const mb = (rb.menu || []).join(', ');
  if (ma !== mb) {
    const sa = new Set(ra.menu || []); const sb = new Set(rb.menu || []);
    const gone = [...sa].filter((x) => !sb.has(x)); const added = [...sb].filter((x) => !sa.has(x));
    diffs.menu.push(`${k}: ${gone.length ? `missing in the second: ${gone.join(', ')}` : ''}${gone.length && added.length ? '; ' : ''}${added.length ? `only in the second: ${added.join(', ')}` : ''}${!gone.length && !added.length ? 'the same entries in another order' : ''}`);
    ok = false;
  }
  const ha = (ra.headings || []).map(plain).join(' | '); const hb = (rb.headings || []).map(plain).join(' | ');
  if (ha !== hb) { diffs.headings.push(`${k}: ${firstDifference(ha, hb)}`); ok = false; }
  if (ra.mainText != null || rb.mainText != null) {
    const ca = plain(ra.mainText); const cb = plain(rb.mainText);
    if (ca !== cb) { diffs.content.push(`${k}: ${firstDifference(ca, cb)}`); ok = false; }
  }
  if (frame || (ra.mainText == null && rb.mainText == null)) {
    const ta = plain(ra.text); const tb = plain(rb.text);
    if (ta !== tb) { diffs.frame.push(`${k}: ${firstDifference(ta, tb)}`); ok = false; }
  }
  if (ok) same += 1;
}
for (const k of B.recs.keys()) if (!A.recs.has(k)) diffs.onlyB.push(k);

// Which look each record was really in.
const tally = (run) => { const t = {}; for (const r of run.recs.values()) { if (r.look === undefined) { t['not recorded'] = (t['not recorded'] || 0) + 1; continue; } const v = r.look || 'today\'s'; t[v] = (t[v] || 0) + 1; } return Object.entries(t).map(([v, n]) => `${n} ${v}`).join(', '); };
const notNew = new Map(); // landing → how many signed-in records of the second run were not in the new look there
for (const r of B.recs.values()) {
  if (r.role === 'anon' || r.look === 'nuevo' || r.look === undefined || r.error || r.skipped) continue;
  const where = (r.landed || r.route || '?').split('?')[0];
  notNew.set(where, (notNew.get(where) || 0) + 1);
}
const newInFirst = [...A.recs.entries()].filter(([, r]) => r.look === 'nuevo').map(([k]) => k);

const total = Object.values(diffs).reduce((n, list) => n + list.length, 0);
const lines = [];
lines.push(`Compared what ${names[0]} (${A.meta.builtCommit ? A.meta.builtCommit.slice(0, 9) : '?'}, snapshot ${A.meta.snapshot}) and ${names[1]} (${B.meta.builtCommit ? B.meta.builtCommit.slice(0, 9) : '?'}, snapshot ${B.meta.snapshot}) show: ${compared} role × width × address in both.`);
if (A.meta.builtCommit !== B.meta.builtCommit) lines.push('NOTE: the two runs are of different builds; a difference may be the build\'s, not the look\'s.');
lines.push(`Look of each record — ${names[0]}: ${tally(A)}. ${names[1]}: ${tally(B)}.`);
if (newInFirst.length) { lines.push(`WARNING: ${newInFirst.length} record(s) of ${names[0]} were taken in the new look:`); for (const k of newInFirst.slice(0, 20)) lines.push(`  ${k}`); }
lines.push(`Signed-in records of ${names[1]} that were NOT in the new look, by where the visitor landed (these must be the pages the look leaves alone):`);
if (!notNew.size) lines.push('  none');
for (const [where, n] of [...notNew].sort()) lines.push(`  ${where} (${n})`);
if (total === 0) lines.push(`NOTHING LOST: ${same} show the same landing, menu, headings and text in both looks.`);
else {
  lines.push(`DIFFERENT: ${compared - same + diffs.onlyA.length + diffs.onlyB.length} differ, ${same} the same.`);
  const section = (title, list) => { if (!list.length) return; lines.push(`\n${title} (${list.length}):`); for (const x of list.slice(0, 80)) lines.push(`  ${x}`); if (list.length > 80) lines.push(`  … and ${list.length - 80} more`); };
  section('Outcome changed', diffs.outcome);
  section('Lands somewhere else', diffs.landed);
  section('Menu entries differ', diffs.menu);
  section('Headings differ', diffs.headings);
  section('The page\'s own text differs', diffs.content);
  section(frame ? 'The whole page\'s text differs' : 'Text differs (no main part on the page)', diffs.frame);
  section(`Only in ${names[0]}`, diffs.onlyA);
  section(`Only in ${names[1]}`, diffs.onlyB);
}
const report = lines.join('\n');
console.log(report);
writeFileSync(join(B.dir, `looks-with-${names[0]}.txt`), `${report}\n`);
process.exit(total === 0 ? 0 : 1);
