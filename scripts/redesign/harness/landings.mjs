#!/usr/bin/env node
// From a run of the picture harness: where each role really lands on each address, set against the inventory's
// role table (which shows the menu and the middleware only: a role can "pass" there and still be sent away by a
// check inside the page).
//
//   node scripts/redesign/harness/landings.mjs <run-name>            writes landings.md into the private folder
//   node scripts/redesign/harness/landings.mjs <run-name> --notes    prints the differences as notes (kind "seen")
//                                                                    for the inventory's private notes
//
// The page it writes says which addresses open without signing in and where a check inside a page is the only
// thing that stops a role. The repository is public, so it is written outside it: RD_PRIVATE (default
// ~/Projects/genera-redesign/private), beside the inventory's private notes.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { INDEX, PICTURES, ROLES } from './lib.mjs';

const name = process.argv[2];
const dir = join(PICTURES, name || '');
if (!name || !existsSync(join(dir, 'run.json'))) { console.error('usage: landings.mjs <run-name> [--notes]'); process.exit(2); }
const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
const index = JSON.parse(readFileSync(INDEX, 'utf8'));
const recs = new Map();
for (const f of readdirSync(dir)) {
  if (!/^[a-z_]+\.(desktop|phone)\.json$/.test(f)) continue;
  for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8'))) recs.set(`${r.role}|${r.width}|${r.route}`, r);
}
const roles = Object.keys(ROLES).filter((r) => r !== 'anon');
const path = (p) => (p || '').split('?')[0];

// What one record says, in a few words.
function outcome(r) {
  if (!r) return 'not walked';
  if (r.skipped) return 'no id';
  if (r.error) return `error: ${r.error.slice(0, 60)}`;
  if (r.status === 404 || /\b404\b/.test(r.title || '') || /Página no encontrada|This page could not be found/.test(r.text || '')) return 'not found (404)';
  if (r.sentAway) return `sent to ${path(r.landed)}`;
  return r.reached === 'click' ? 'opens (only by a click; opened directly it lands on the panel)' : 'opens';
}

const rows = []; const notes = [];
for (const route of index.routes) {
  const per = {}; const diffs = [];
  const group = new Map(); // one line per kind of difference, with the roles it holds for
  const add = (what, role) => { if (!group.has(what)) group.set(what, []); group.get(what).push(role); };
  for (const role of roles) {
    const d = recs.get(`${role}|desktop|${route.route}`); const p = recs.get(`${role}|phone|${route.route}`);
    const o = outcome(d || p);
    per[role] = o;
    if (d && p && outcome(d) !== outcome(p)) add(`desktop and phone differ (desktop «${outcome(d)}», phone «${outcome(p)}»)`, role);
    const mw = route.roles[role] ? route.roles[role].middleware : '';
    const expectOpen = mw === 'pass'; const expectAway = /^sent to /.test(mw);
    if (o === 'no id' || o === 'not walked') continue;
    if (expectOpen && !o.startsWith('opens')) add(`the role table says the middleware lets them pass, but they are ${o}`, role);
    else if (expectOpen && o.startsWith('opens (only')) add('opens only when reached by a click (opened directly it lands on the panel)', role);
    if (expectAway && o.startsWith('opens')) add(`the role table says «${mw}», but it opens`, role);
    if (expectAway && o.startsWith('sent to') && o !== mw) add(`the role table says «${mw}», but they are ${o}`, role);
  }
  for (const [what, who] of group) diffs.push(`${who.length === roles.length ? 'all nine roles' : who.join(', ')}: ${what}`);
  const anon = outcome(recs.get(`anon|desktop|${route.route}`) || recs.get(`anon|phone|${route.route}`));
  rows.push({ route: route.route, area: route.area, per, anon, diffs });
  if (diffs.length) notes.push({ screen: route.route, kind: 'seen', text: `Where roles really land (picture harness, local copy with made-up accounts and invented content): ${diffs.join('; ')}.`, source: `picture harness run «${name}», ${meta.started.slice(0, 10)} (local copy, built from ${String(meta.builtCommit).slice(0, 9)})` });
}

if (process.argv.includes('--notes')) { console.log(JSON.stringify(notes, null, 1)); process.exit(0); }

const short = { admin: 'adm', consultor: 'con', equipo_directivo: 'dir', lider_generacion: 'gen', lider_comunidad: 'com', supervisor_de_red: 'red', community_manager: 'cm', docente: 'doc', encargado_licitacion: 'lic' };
const cell = (o) => (o.startsWith('opens (only') ? 'click' : o.startsWith('opens') ? 'opens' : o.startsWith('sent to ') ? `→ ${o.slice(8)}` : o.startsWith('not found') ? '404' : o.startsWith('error') ? 'error' : o);
const L = [];
L.push('# Where each role really lands', '');
L.push(`Written by \`scripts/redesign/harness/landings.mjs\` from the picture run «${name}» (${meta.started.slice(0, 10)}, local copy built from \`${String(meta.builtCommit).slice(0, 9)}\`, database snapshot «${meta.snapshot}»). One made-up account per role; the account of a role decides what it may see, so "sent away" here can mean "this account has no community / no school / no registro", not "the role never gets in".`, '');
L.push('`opens` = stays on the address asked for · `click` = opens only when reached by a click (opened directly it lands on the panel) · `→ /x` = sent to /x · `404` = the platform says not found · `no id` = an address with a changing part that the sample content cannot fill.', '');
L.push(`| Address | ${roles.map((r) => short[r]).join(' | ')} | not signed in |`, `|---|${roles.map(() => '---').join('|')}|---|`);
for (const r of rows) L.push(`| \`${r.route}\` | ${roles.map((x) => cell(r.per[x])).join(' | ')} | ${cell(r.anon)} |`);
const withDiff = rows.filter((r) => r.diffs.length);
L.push('', `## Differences from the inventory's role table (${withDiff.length} addresses)`, '');
L.push('The table shows what the menu and the middleware do. These are the addresses where the walk found something else: a check inside the page, an API that refuses, or an account that lacks what the page needs.', '');
for (const r of withDiff) { L.push(`- \`${r.route}\``); for (const d of r.diffs) L.push(`  - ${d}`); }
const open = rows.filter((r) => r.anon.startsWith('opens'));
L.push('', `## Addresses a visitor who is not signed in can open (${open.length})`, '', open.map((r) => `\`${r.route}\``).join(', '), '');
// Pages that try to write just by being opened, and reads made with POST that were let through.
const refused = new Map(); const allowed = new Map(); const errs = [];
for (const r of recs.values()) {
  for (const w of r.refused || []) { if (!refused.has(w)) refused.set(w, new Set()); refused.get(w).add(r.route); }
  for (const w of r.allowed || []) { if (!allowed.has(w)) allowed.set(w, new Set()); allowed.get(w).add(r.route); }
  if (r.pageErrors) errs.push(`\`${r.route}\` as ${r.role} (${r.width}): ${r.pageErrors[0]}`);
}
L.push(`## Requests that would write, refused by the harness (${refused.size})`, '', 'A page that tries to write just by being opened. The picture shows the page without that write.', '');
for (const [w, s] of [...refused].sort()) L.push(`- \`${w}\` — on ${[...s].slice(0, 6).map((x) => `\`${x}\``).join(', ')}${s.size > 6 ? ` and ${s.size - 6} more` : ''}`);
L.push('', `## Reads made with POST that were let through (${allowed.size})`, '');
for (const [w, s] of [...allowed].sort()) L.push(`- \`${w}\` — on ${s.size} address${s.size === 1 ? '' : 'es'}`);
L.push('', `## Page errors seen (${errs.length})`, '');
for (const e of [...new Set(errs)].sort().slice(0, 200)) L.push(`- ${e}`);
const PRIVATE = process.env.RD_PRIVATE || join(homedir(), 'Projects/genera-redesign/private');
mkdirSync(PRIVATE, { recursive: true });
writeFileSync(join(PRIVATE, 'landings.md'), `${L.join('\n')}\n`);
console.log(`${join(PRIVATE, 'landings.md')} written: ${rows.length} addresses, ${withDiff.length} differ from the role table, ${open.length} open without sign-in, ${refused.size} kinds of refused write, ${errs.length} page errors.`);
