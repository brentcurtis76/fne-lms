// @vitest-environment node
/**
 * Negative controls for the additive-migration guard.
 *
 * A guard that has never been seen to FAIL is not evidence of anything. The
 * reviewer's finding was a `DROP TRIGGER IF EXISTS` that shipped past a `grep`
 * for one specific string, so the replacement is only worth having if it can be
 * shown to catch each forbidden form, on synthetic migrations written for this
 * suite, and to leave the additive forms this repository actually uses alone.
 *
 * Every case below writes a real .sql file into a temporary directory and runs
 * the real checker over it. Nothing is mocked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scanSql,
  scanDirectory,
  stripComments,
} from '../../scripts/ci/check-destructive-migrations.mjs';

const OPENB = '/' + '*';
const CLOSEB = '*' + '/';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'genera-migration-guard-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function scan(sql: string) {
  return scanSql(sql, 'synthetic.sql');
}

function scanAsFile(name: string, sql: string) {
  const sub = mkdtempSync(join(dir, 'case-'));
  writeFileSync(join(sub, name), sql, 'utf8');
  return scanDirectory(sub);
}

// ---------------------------------------------------------------------------
// The forbidden forms. One synthetic migration each.
// ---------------------------------------------------------------------------

describe('the guard fails on every forbidden statement', () => {
  const FORBIDDEN: Array<[string, string, string]> = [
    ['DROP TABLE', 'DROP TABLE public.profiles;', 'DROP'],
    ['DROP TRIGGER IF EXISTS (the exact statement the reviewer found)',
      'DROP TRIGGER IF EXISTS protect_must_change_password ON public.profiles;', 'DROP'],
    ['DROP POLICY', 'DROP POLICY IF EXISTS p ON public.profiles;', 'DROP'],
    ['DROP FUNCTION', 'DROP FUNCTION public.gate_password_change();', 'DROP'],
    ['DROP COLUMN', 'ALTER TABLE public.profiles DROP COLUMN must_change_password;', 'DROP'],
    ['DROP CONSTRAINT', 'ALTER TABLE public.t DROP CONSTRAINT t_check;', 'DROP'],
    ['TRUNCATE', 'TRUNCATE public.security_audit_events;', 'TRUNCATE'],
    ['TRUNCATE ... CASCADE', 'TRUNCATE TABLE public.profiles CASCADE;', 'TRUNCATE'],
    ['row-security disable', 'ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;', 'DISABLE_RLS'],
    ['NO FORCE row security', 'ALTER TABLE public.clientes NO FORCE ROW LEVEL SECURITY;', 'NO_FORCE_RLS'],
    ['DISABLE TRIGGER', 'ALTER TABLE public.profiles DISABLE TRIGGER protect_must_change_password;', 'DISABLE_TRIGGER'],
    ['RENAME a table', 'ALTER TABLE public.profiles RENAME TO profiles_old;', 'RENAME'],
    ['RENAME a column', 'ALTER TABLE public.profiles RENAME COLUMN must_change_password TO mcp;', 'RENAME'],
    ['SET SCHEMA', 'ALTER TABLE public.profiles SET SCHEMA archive;', 'SET_SCHEMA'],
    ['change a column type', 'ALTER TABLE public.profiles ALTER COLUMN school_id TYPE text;', 'ALTER_COLUMN_TYPE'],
  ];

  for (const [label, sql, rule] of FORBIDDEN) {
    it(`catches ${label}`, () => {
      const findings = scan(sql);
      expect(findings.length, `${label} was not caught`).toBeGreaterThan(0);
      expect(findings.map((f: any) => f.rule)).toContain(rule);
    });
  }

  it('catches a forbidden statement hidden inside a DO block', () => {
    const findings = scan(`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class) THEN
    DROP TABLE public.profiles;
  END IF;
END
$$;
`);
    expect(findings.map((f: any) => f.rule)).toContain('DROP');
  });

  it('catches a forbidden statement smuggled through EXECUTE of a string literal', () => {
    // The bypass a literal-stripping guard would hand an author for free.
    const findings = scan(`
DO $$
BEGIN
  EXECUTE 'DROP TABLE public.security_audit_events';
END
$$;
`);
    expect(findings.map((f: any) => f.rule)).toContain('DROP');
    expect(findings.some((f: any) => f.source === 'literal')).toBe(true);
  });

  it('reports the file and a line number, not just a boolean', () => {
    const { findings } = scanAsFile('20990101000000_bad.sql', '\n\n\nDROP TABLE public.x;\n');
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toMatch(/20990101000000_bad\.sql$/);
    expect(findings[0].line).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// The additive forms this repository actually uses must keep passing, or the
// guard becomes something authors route around.
// ---------------------------------------------------------------------------

describe('the guard permits the additive statements this repository uses', () => {
  const PERMITTED: Array<[string, string]> = [
    ['CREATE TABLE IF NOT EXISTS', 'CREATE TABLE IF NOT EXISTS public.t (id uuid PRIMARY KEY);'],
    ['ADD COLUMN', 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;'],
    ['ADD CONSTRAINT', 'ALTER TABLE public.t ADD CONSTRAINT t_check CHECK (id IS NOT NULL);'],
    ['enable row security', 'ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;'],
    ['force row security', 'ALTER TABLE public.t FORCE ROW LEVEL SECURITY;'],
    ['SET NOT NULL', 'ALTER TABLE public.t ALTER COLUMN id SET NOT NULL;'],
    ['CREATE OR REPLACE FUNCTION', 'CREATE OR REPLACE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;'],
    ['CREATE POLICY', 'CREATE POLICY p ON public.t AS RESTRICTIVE FOR ALL TO authenticated USING (true);'],
    ['CREATE INDEX', 'CREATE INDEX IF NOT EXISTS t_idx ON public.t (id);'],
    ['ALTER ROLE ... SET', "ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.gate_password_change';"],
    ['ALTER PUBLICATION ... ADD TABLE', 'ALTER PUBLICATION supabase_realtime ADD TABLE public.t;'],
    ['ALTER DEFAULT PRIVILEGES', 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;'],
    ['GRANT naming TRUNCATE as a privilege', 'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.t TO service_role;'],
    ['REVOKE naming TRUNCATE as a privilege', 'REVOKE TRUNCATE ON public.t FROM authenticated;'],
    ['COMMENT prose that mentions the forbidden words',
      "COMMENT ON TABLE public.t IS 'authenticated holds SELECT only, so TRUNCATE cannot bypass the policy and no DROP is reachable.';"],
    ['a line comment that mentions the forbidden words', '-- We never DROP or TRUNCATE anything here.\nSELECT 1;'],
    ['a block comment that mentions the forbidden words',
      ['/' + '*', ' * A prose header: DROP, TRUNCATE and turning row security off are all forbidden.', ' *' + '/', 'SELECT 1;'].join('\n')],
    ['the catalog-guarded additive CREATE TRIGGER this branch now uses', `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'profiles' AND t.tgname = 'protect_must_change_password'
  ) THEN
    CREATE TRIGGER protect_must_change_password
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.protect_must_change_password();
  END IF;
END
$$;`],
  ];

  for (const [label, sql] of PERMITTED) {
    it(`permits ${label}`, () => {
      expect(scan(sql)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// The comment stripper, directly. It is the part that decides what is code.
// ---------------------------------------------------------------------------

describe('comment handling', () => {
  it('does not treat a double dash inside a string literal as a comment', () => {
    const stripped = stripComments("SELECT 'a -- not a comment', 1;");
    expect(stripped).toContain('-- not a comment');
    expect(stripped).toContain(', 1');
  });

  it('handles nested block comments', () => {
    const sql = [OPENB, ' outer ', OPENB, ' inner ', CLOSEB, ' still outer ', CLOSEB, 'SELECT 1;'].join('');
    const stripped = stripComments(sql);
    expect(stripped).not.toContain('inner');
    expect(stripped).toContain('SELECT 1');
  });
});

// ---------------------------------------------------------------------------
// And the real repository, which is the assertion that actually gates CI.
// ---------------------------------------------------------------------------

describe('the repository itself', () => {
  it('has migrations to scan, and none of them is destructive', () => {
    const result = scanDirectory('supabase/migrations');
    expect(result.scanned.length).toBeGreaterThan(15);
    expect(result.findings).toEqual([]);
  });

  it('scans every .sql file in supabase/migrations (the walk is not silently short)', () => {
    const onDisk = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
    expect(scanDirectory('supabase/migrations').scanned).toHaveLength(onDisk.length);
  });
});
