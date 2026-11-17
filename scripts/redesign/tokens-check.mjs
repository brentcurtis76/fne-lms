#!/usr/bin/env node
// Proves that naming a value changed nothing: two compiled stylesheets say the same thing once every named value
// (a CSS variable of styles/fne-tokens.css) is replaced by what it holds.
//
//   node scripts/redesign/tokens-check.mjs <before.css> <after.css> [--look nuevo]
//
// Make the two files with Tailwind's own command line, from the code before and after a change:
//   node_modules/.bin/tailwindcss -c tailwind.config.js -i styles/globals.css -o <scratch>/before.css
//
// What it does: reads both files rule by rule; in the second file it takes the variables declared on `:root` that
// the first file does not declare (the named values), puts each one's value wherever it is read with `var(--name)`,
// and leaves their declarations out; writes every colour the same way (`#e5e7eb`, `rgb(229 231 235)` and
// `rgb(229 231 235 / 1)` are one colour); then compares rule by rule, in order. EQUIVALENT (exit 0) means a browser
// computes the same style for every element from either file, in every state: hover, focus, pop-ups and all the
// things a picture of a page at rest cannot show. Otherwise it lists what differs (exit 1).
//
// It covers what Tailwind compiles from styles/globals.css (every class of the platform and the files that
// stylesheet imports). It does not read the other stylesheets pages/_app.tsx loads (they do not go through names),
// the minified file Next ships, or styles typed in code; and it answers for a browser that knows custom properties.
// At-rules without declarations (an `@import` of a web font) are not compared.
//
// Rules that apply only under a look (every selector of the rule carries `[data-look=…]`) are left out and counted:
// without --look the answer is about a page with the switch off.
// --look <name>: resolve the named values as they are under `[data-look="<name>"]` instead of `:root`, list the
// look's other rules apart, and summarise every declaration whose value changes, grouped by change (phase 5: with
// this option the answer is expected to be DIFFERENT, and the list is what the new look changes). Since 5a this
// resolves every `:root` variable of both files, not only the new names: the look overrides names 4a and 4b
// already declared.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const postcss = require('postcss');

const argv = process.argv.slice(2);
const lookAt = argv.indexOf('--look');
const look = lookAt >= 0 ? argv.splice(lookAt, 2)[1] : null;
// --new-rules: a release that only ADDS classes (new pieces with new utility classes) puts new rules between the old
// ones. With this option a rule whose selector (and at-rules) the first file does not hold at all is set apart and
// listed by selector; everything else must still be the same, in the same order.
const newRulesAt = argv.indexOf('--new-rules');
const allowNewRules = newRulesAt >= 0 ? Boolean(argv.splice(newRulesAt, 1)) : false;
if (argv.length !== 2) {
  console.error('usage: tokens-check.mjs <before.css> <after.css> [--look <name>] [--new-rules]');
  process.exit(2);
}

const hexToTriplet = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
};

// One spelling per colour. Only spellings that are the same colour by the CSS specification are folded together.
function sameSpelling(value) {
  return value
    .replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (hex) => `rgb(${hexToTriplet(hex)} / 1)`)
    .replace(/rgb\((\d+) (\d+) (\d+)\)/g, 'rgb($1 $2 $3 / 1)')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every declaration of a file, in order, with the at-rules and the selector it sits under.
function read(file) {
  const root = postcss.parse(readFileSync(file, 'utf8'), { from: file });
  const rows = [];
  root.walkDecls((decl) => {
    const where = [];
    for (let n = decl.parent; n && n.type !== 'root'; n = n.parent) {
      where.unshift(n.type === 'atrule' ? `@${n.name} ${n.params}` : n.selector.replace(/\s+/g, ' '));
    }
    rows.push({ where: where.join(' { '), prop: decl.prop, value: decl.value, important: Boolean(decl.important) });
  });
  return rows;
}

const before = read(argv[0]);
const after = read(argv[1]);

const rootVars = (rows, selector) => new Map(rows.filter((r) => r.where === selector && r.prop.startsWith('--')).map((r) => [r.prop, r.value]));
const known = rootVars(before, ':root');
const named = new Map([...rootVars(after, ':root')].filter(([name]) => !known.has(name)));
const lookSelector = look ? `[data-look="${look}"]` : null;
const lookRoot = (r) => r.where.split(' { ').pop().replace(/'/g, '"').trim().replace(/^(html|:root)/, '') === lookSelector;
const lookVars = look ? new Map(after.filter((r) => lookRoot(r) && r.prop.startsWith('--')).map((r) => [r.prop, r.value])) : new Map();
if (look && lookVars.size === 0) {
  console.error(`no values found under ${lookSelector} in ${argv[1]}`);
  process.exit(2);
}
const valueOf = (name) => (lookVars.has(name) ? lookVars.get(name) : named.get(name));

const used = new Set();
function resolve(value) {
  let out = value;
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/var\((--[A-Za-z0-9_-]+)\)/g, (whole, name) => {
      if (!named.has(name)) return whole;
      used.add(name);
      return valueOf(name);
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

// A rule that every one of its selectors ties to a look (`[data-look="nuevo"] …`) applies to nobody whose page does
// not carry that look. Without --look such rules are left out (and counted): that is the comparison "switch off".
// With --look, the named values declared under that look are taken as the values (above) and left out here; any
// other rule of the look stays in and is listed, because it is something the look changes.
const innermost = (r) => r.where.split(' { ').pop().replace(/'/g, '"');
// "Under a look" means the selector REQUIRES the attribute: `:not([data-look="nuevo"]) …` is the opposite (it
// applies with the switch off) and stays in.
const requiresALook = (part) => part.replace(/:not\([^)]*\)/g, '').includes('[data-look=');
const onlyUnderALook = (r) => !innermost(r).startsWith('@') && innermost(r).split(',').every(requiresALook);
// The rule that holds a look's values: `[data-look="x"]`, also written `html[data-look="x"]` or `:root[data-look="x"]`.
const isLookRoot = (r) => Boolean(lookSelector) && innermost(r).trim().replace(/^(html|:root)/, '') === lookSelector;
const isNamedDeclaration = (r) => named.has(r.prop) && (r.where === ':root' || isLookRoot(r));
const key = (r) => `${r.where} { ${r.prop}`;
// Without --look, rules that apply only under a look are left out of BOTH files (since phase 5a the first file can
// hold a look too): the comparison is the page with the switch off.
const leftOutBefore = look ? [] : before.filter(onlyUnderALook);
const A = before
  .filter((r) => look || !onlyUnderALook(r))
  .map((r) => ({ ...r, value: sameSpelling(r.value) }));
const leftOut = look ? [] : after.filter(onlyUnderALook);
let B = after
  .filter((r) => !isNamedDeclaration(r) && (look || !onlyUnderALook(r)))
  .map((r) => ({ ...r, value: sameSpelling(resolve(r.value)) }));
// --new-rules: set apart the rules whose place (at-rules and selector) the first file does not know.
const newRules = new Map(); // place -> number of declarations
if (allowNewRules && !look) {
  const places = new Set(A.map((r) => r.where));
  B = B.filter((r) => {
    if (places.has(r.where)) return true;
    newRules.set(r.where, (newRules.get(r.where) || 0) + 1);
    return false;
  });
}

// --look, phase 5a. The new look gives other values to names the first file ALREADY declares (the 4a and 4b
// names), so "the names the first file does not know" is not enough there. With --look the comparison is
// instead: both files with every variable of their own `:root` replaced by its value (the second one's taken
// from the look where the look declares it), the look's own rules set apart and listed, and every remaining
// declaration compared in order. The answer is a summary of what the look changes, grouped by change.
if (look) {
  const rootOf = (rows) => rootVars(rows, ':root');
  const beforeVars = rootOf(before);
  const afterVars = new Map([...rootOf(after), ...lookVars]);
  const resolveWith = (vars) => (value) => {
    let out = value;
    for (let i = 0; i < 6; i++) {
      const next = out.replace(/var\((--[A-Za-z0-9_-]+)\)/g, (whole, name) => (vars.has(name) ? vars.get(name) : whole));
      if (next === out) break;
      out = next;
    }
    return out;
  };
  const isRootVar = (r) => r.where === ':root' && r.prop.startsWith('--');
  const rA = resolveWith(beforeVars);
  const rB = resolveWith(afterVars);
  const LA = before.filter((r) => !isRootVar(r)).map((r) => ({ ...r, value: sameSpelling(rA(r.value)) }));
  const lookRules = after.filter((r) => onlyUnderALook(r) && !isLookRoot(r));
  const LB = after
    .filter((r) => !isRootVar(r) && !onlyUnderALook(r))
    .map((r) => ({ ...r, value: sameSpelling(rB(r.value)) }));
  console.log(`Values taken from ${lookSelector}: ${lookVars.size} (of them, names the first file did not know: ${[...lookVars.keys()].filter((name) => !beforeVars.has(name)).length}).`);
  if (LA.length !== LB.length) {
    console.log(`DIFFERENT: the files do not line up (${LA.length} and ${LB.length} declarations once the look's own rules are set apart).`);
    process.exit(1);
  }
  const changes = new Map();
  let changed = 0;
  for (let i = 0; i < LA.length; i++) {
    const a = LA[i];
    const b = LB[i];
    if (key(a) !== key(b)) {
      console.log(`DIFFERENT: the files no longer line up at #${i + 1} (${key(a)} / ${key(b)}).`);
      process.exit(1);
    }
    if (a.value === b.value && a.important === b.important) continue;
    changed++;
    const what = `${a.prop}: ${a.value}  ->  ${b.value}`;
    const entry = changes.get(what) ?? { count: 0, example: a.where };
    entry.count++;
    changes.set(what, entry);
  }
  console.log(`Rules of the look itself (they apply only under ${lookSelector}): ${lookRules.length} declaration(s).`);
  for (const r of lookRules) console.log(`  ${r.where} { ${r.prop}: ${sameSpelling(rB(r.value))}${r.important ? ' !important' : ''}`);
  console.log(`Declarations whose value the look changes: ${changed} of ${LA.length}, in ${changes.size} distinct change(s):`);
  for (const [what, { count, example }] of [...changes].sort((x, y) => y[1].count - x[1].count)) {
    console.log(`  ${String(count).padStart(4)} x ${what}   (e.g. ${example})`);
  }
  console.log(changed === 0 && lookRules.length === 0 ? 'EQUIVALENT' : 'DIFFERENT (expected with --look: the list above is what the look changes).');
  process.exit(changed === 0 && lookRules.length === 0 ? 0 : 1);
}

const differences = [];
const n = Math.max(A.length, B.length);
if (A.length !== B.length) differences.push(`the first file holds ${A.length} declarations, the second ${B.length} (named values left out)`);
for (let i = 0, shown = 0; i < n && shown < 60; i++) {
  const a = A[i];
  const b = B[i];
  if (a && b && key(a) === key(b) && a.value === b.value && a.important === b.important) continue;
  shown++;
  differences.push(`#${i + 1}\n    before: ${a ? `${key(a)}: ${a.value}${a.important ? ' !important' : ''}` : '(nothing)'}\n    after:  ${b ? `${key(b)}: ${b.value}${b.important ? ' !important' : ''}` : '(nothing)'}`);
  if (a && b && key(a) !== key(b)) {
    differences.push('    (the two files no longer line up from here; the rest is not listed)');
    break;
  }
}

const unused = [...named.keys()].filter((name) => !used.has(name));
console.log(`Named values in the second file: ${named.size} (read at least once: ${used.size}; declared and not read by any rule: ${unused.length}).`);
if (unused.length) console.log(`  not read: ${unused.join(', ')}`);
if (look) console.log(`Values taken from ${lookSelector}: ${lookVars.size}.`);
if (leftOut.length || leftOutBefore.length) console.log(`Left out: ${leftOut.length} declaration(s) of the second file${leftOutBefore.length ? ` and ${leftOutBefore.length} of the first` : ''} in rules that apply only under a look (\`[data-look=…]\`); with the switch off they apply to nobody.`);
if (newRules.size) {
  console.log(`Set apart: ${[...newRules.values()].reduce((a, b) => a + b, 0)} declaration(s) in ${newRules.size} rule(s) the first file does not hold (new classes); every rule the first file holds is compared below.`);
  for (const place of newRules.keys()) console.log(`  new: ${place}`);
}
if (differences.length === 0) {
  console.log(`EQUIVALENT: ${A.length} declarations, the same in both files once each named value is replaced by what it holds.`);
  process.exit(0);
}
console.log(`DIFFERENT: ${differences.length} place(s).`);
for (const d of differences) console.log(d);
process.exit(1);
