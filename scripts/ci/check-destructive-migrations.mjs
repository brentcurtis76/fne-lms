#!/usr/bin/env node
/**
 * GENERA hard rule (CLAUDE.md -> Database Safety): migrations are ADDITIVE ONLY.
 *
 * WHY THIS EXISTS. `scripts/ci/check-rls-migrations.sh` caught exactly one
 * forbidden statement -- the row-security disable -- with a plain `grep`. It did
 * not catch `DROP`, `TRUNCATE`, or a destructive `ALTER`, and an independent
 * reviewer found a `DROP TRIGGER IF EXISTS` shipped in
 * `20260819120000_forced_password_change_boundary.sql`. A rule nobody enforces
 * is a rule that gets broken.
 *
 * WHAT MAKES THIS DIFFERENT FROM `grep -i drop`:
 *
 *   1. COMMENTS ARE NOT CODE. This repository writes long prose headers in its
 *      migrations, and several existing `COMMENT ON` bodies contain the word
 *      TRUNCATE while explaining why TRUNCATE cannot bypass a policy. A grep
 *      fails all of them. This strips line comments and nested block comments
 *      before it looks at anything.
 *
 *   2. STRING LITERALS ARE NOT CODE -- EXCEPT WHEN THEY ARE. A single-quoted
 *      literal is normally data (`COMMENT ON ... IS '...TRUNCATE...'`). But
 *      `EXECUTE 'ALTER ROLE ...'` inside a DO block is executable SQL wearing a
 *      literal's clothes, and a guard that blindly strips literals is trivially
 *      bypassed by `EXECUTE 'DROP TABLE x'`. So literals are extracted and then
 *      re-examined: a literal whose FIRST token is a statement keyword is
 *      treated as executable.
 *
 *   3. DOLLAR-QUOTED BODIES ARE CODE. `$$ ... $$` and `$tag$ ... $tag$` are
 *      function and DO bodies. They are scanned exactly like top-level SQL.
 *
 *   4. ADDITIVE `ALTER` IS PERMITTED. `ADD COLUMN`, `ADD CONSTRAINT`, enabling
 *      or forcing row level security, `ALTER ROLE ... SET`,
 *      `ALTER PUBLICATION ... ADD TABLE` and `ALTER DEFAULT PRIVILEGES` all
 *      pass. Only the destructive forms are named, so the guard does not push
 *      authors into working around it.
 *
 * USAGE
 *   node scripts/ci/check-destructive-migrations.mjs [dir ...]
 * Default directory: supabase/migrations
 *
 * Exit 0 = clean. Exit 1 = at least one forbidden statement. Exit 2 = usage.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_DIRS = ['supabase/migrations'];

const OPEN_BLOCK = '/' + '*';
const CLOSE_BLOCK = '*' + '/';

/**
 * Strip line comments and nested block comments.
 * Quoting is respected so a `--` inside a string literal survives.
 */
export function stripComments(sql) {
  let out = '';
  let i = 0;
  let blockDepth = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (blockDepth > 0) {
      if (two === OPEN_BLOCK) { blockDepth += 1; i += 2; continue; }
      if (two === CLOSE_BLOCK) { blockDepth -= 1; i += 2; continue; }
      // Keep newlines so line numbers stay meaningful.
      out += sql[i] === '\n' ? '\n' : ' ';
      i += 1;
      continue;
    }

    if (two === OPEN_BLOCK) { blockDepth = 1; i += 2; continue; }

    if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') { i += 1; }
      continue;
    }

    // A single-quoted literal: copy it verbatim, comments inside it are text.
    if (sql[i] === "'") {
      out += sql[i]; i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { out += "''"; i += 2; continue; }
        if (sql[i] === "'") { out += "'"; i += 1; break; }
        out += sql[i]; i += 1;
      }
      continue;
    }

    // A dollar-quoted body: copy it verbatim, it is code.
    const dollar = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }

    out += sql[i];
    i += 1;
  }

  return out;
}

/**
 * Split comment-free SQL into the code text (literals blanked, dollar-quoted
 * bodies kept) plus every single-quoted literal with the line it started on.
 */
export function partition(sql) {
  let code = '';
  const literals = [];
  let i = 0;
  let line = 1;

  const advance = (chunk) => { line += (chunk.match(/\n/g) || []).length; };

  while (i < sql.length) {
    if (sql[i] === "'") {
      const startLine = line;
      let value = '';
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { value += "'"; i += 2; continue; }
        if (sql[i] === "'") { i += 1; break; }
        value += sql[i]; i += 1;
      }
      advance(value);
      literals.push({ value, line: startLine });
      // A placeholder keeps statement boundaries intact without leaking text.
      code += "''";
      continue;
    }

    const dollar = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      const body = sql.slice(i, stop);
      code += body;
      // A dollar-quoted body is code, and the literals INSIDE it are the ones
      // an `EXECUTE 'DROP ...'` hides in. Recurse so they are reported as
      // literals too, not only as part of the surrounding statement text.
      const inner = partition(body.slice(tag.length, Math.max(tag.length, body.length - tag.length)));
      for (const lit of inner.literals) {
        literals.push({ value: lit.value, line: line + lit.line - 1 });
      }
      advance(body);
      i = stop;
      continue;
    }

    if (sql[i] === '\n') line += 1;
    code += sql[i];
    i += 1;
  }

  return { code, literals };
}

/**
 * The forbidden statements. Each carries the reason in the terms CLAUDE.md uses,
 * so a failure message tells the author which rule they hit.
 */
const RULES = [
  {
    id: 'DROP',
    // Every DROP. The rule has no "but this one is safe" case: an additive
    // migration replaces with CREATE OR REPLACE and guards creation with a
    // pg_catalog existence check.
    pattern: /\bDROP\b/i,
    why: 'DROP is forbidden - migrations are additive only (CLAUDE.md -> Database Safety). Use CREATE OR REPLACE, or guard creation with a pg_catalog existence check.',
  },
  {
    id: 'TRUNCATE',
    // GRANT/REVOKE name TRUNCATE as a privilege; that is not a truncation.
    pattern: /\bTRUNCATE\b/i,
    refine: (statement) => !/^\s*(GRANT|REVOKE)\b/i.test(statement),
    why: 'TRUNCATE is forbidden - migrations are additive only (CLAUDE.md -> Database Safety).',
  },
  {
    id: 'DISABLE_RLS',
    pattern: /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i,
    why: 'Turning row level security off is forbidden (CLAUDE.md -> Database Safety; also scripts/ci/check-rls-migrations.sh).',
  },
  {
    id: 'NO_FORCE_RLS',
    pattern: /\bNO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/i,
    why: 'NO FORCE ROW LEVEL SECURITY weakens an existing row-security posture.',
  },
  {
    id: 'DISABLE_TRIGGER',
    pattern: /\bALTER\s+TABLE\b[\s\S]*?\bDISABLE\s+TRIGGER\b/i,
    why: 'ALTER TABLE ... DISABLE TRIGGER silently removes an enforced invariant.',
  },
  {
    id: 'RENAME',
    pattern: /\bALTER\s+(TABLE|VIEW|MATERIALIZED\s+VIEW|TYPE|SEQUENCE|INDEX|SCHEMA|FUNCTION|POLICY)\b[\s\S]*?\bRENAME\b/i,
    why: 'A RENAME is a destructive ALTER - the old name stops resolving for every consumer.',
  },
  {
    id: 'SET_SCHEMA',
    pattern: /\bALTER\s+(TABLE|VIEW|TYPE|SEQUENCE|FUNCTION)\b[\s\S]*?\bSET\s+SCHEMA\b/i,
    why: 'Moving an object between schemas is a destructive ALTER - the old path stops resolving.',
  },
  {
    id: 'ALTER_COLUMN_TYPE',
    pattern: /\bALTER\s+(COLUMN\s+)?[A-Za-z_"][\w".]*\s+(SET\s+DATA\s+)?TYPE\b/i,
    refine: (statement) => /\bALTER\s+TABLE\b/i.test(statement),
    why: 'Changing a column type rewrites the table and can lose data - additive migrations add a column instead.',
  },
];

/** Split on `;` that is not inside a dollar-quoted body. */
function statements(code) {
  const out = [];
  let current = '';
  let i = 0;
  let line = 1;
  let startLine = 1;

  while (i < code.length) {
    const dollar = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(code.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = code.indexOf(tag, i + tag.length);
      const stop = end === -1 ? code.length : end + tag.length;
      const body = code.slice(i, stop);
      current += body;
      line += (body.match(/\n/g) || []).length;
      i = stop;
      continue;
    }

    if (code[i] === ';') {
      out.push({ text: current, line: startLine });
      current = '';
      i += 1;
      startLine = line;
      continue;
    }

    if (code[i] === '\n') line += 1;
    if (current.trim() === '' && code[i].trim() !== '') startLine = line;
    current += code[i];
    i += 1;
  }

  if (current.trim()) out.push({ text: current, line: startLine });
  return out;
}

/** A string literal starting with one of these is executable SQL, not prose. */
const EXECUTABLE_LITERAL =
  /^\s*(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|SET|DELETE|UPDATE|INSERT|COMMENT|DO)\b/i;

export function scanSql(sql, file) {
  const findings = [];
  const stripped = stripComments(sql);
  const { code, literals } = partition(stripped);

  for (const statement of statements(code)) {
    for (const rule of RULES) {
      if (!rule.pattern.test(statement.text)) continue;
      if (rule.refine && !rule.refine(statement.text)) continue;
      findings.push({
        file,
        line: statement.line,
        rule: rule.id,
        why: rule.why,
        excerpt: statement.text.replace(/\s+/g, ' ').trim().slice(0, 120),
        source: 'statement',
      });
    }
  }

  // A literal that begins with a statement keyword is executable SQL somebody
  // routed through EXECUTE / format(). Scan it like code.
  for (const literal of literals) {
    if (!EXECUTABLE_LITERAL.test(literal.value)) continue;
    for (const rule of RULES) {
      if (!rule.pattern.test(literal.value)) continue;
      if (rule.refine && !rule.refine(literal.value)) continue;
      findings.push({
        file,
        line: literal.line,
        rule: rule.id,
        why: `${rule.why} (found inside a string literal that is executable SQL)`,
        excerpt: literal.value.replace(/\s+/g, ' ').trim().slice(0, 120),
        source: 'literal',
      });
    }
  }

  return findings;
}

export function scanDirectory(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return { findings: [], scanned: [] };
  }

  const files = entries
    .filter((e) => e.endsWith('.sql'))
    .filter((e) => {
      try { return statSync(join(dir, e)).isFile(); } catch { return false; }
    })
    .sort();

  const findings = [];
  for (const file of files) {
    findings.push(...scanSql(readFileSync(join(dir, file), 'utf8'), join(dir, file)));
  }
  return { findings, scanned: files.map((f) => join(dir, f)) };
}

export function main(argv) {
  const dirs = argv.length ? argv : DEFAULT_DIRS;
  const all = [];
  const scanned = [];

  for (const dir of dirs) {
    const result = scanDirectory(dir);
    all.push(...result.findings);
    scanned.push(...result.scanned);
  }

  if (!scanned.length) {
    console.error(`No .sql files found in: ${dirs.join(', ')}`);
    return 2;
  }

  if (all.length) {
    console.error(
      '::error::FORBIDDEN: destructive statement(s) in migrations (GENERA hard rule - CLAUDE.md -> Database Safety).'
    );
    for (const f of all) {
      console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.why}`);
      console.error(`      ${f.excerpt}`);
    }
    return 1;
  }

  console.log(
    `OK: ${scanned.length} migration file(s) scanned; no DROP, TRUNCATE, row-security disable or destructive ALTER.`
  );
  return 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-destructive-migrations.mjs');
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
