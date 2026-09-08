// @vitest-environment node
/**
 * R3 — the GradeLevel allowlist lives twice on purpose: in TypeScript
 * (GRADE_LEVEL_SORT_ORDER, used by the fast 400 in the API) and in SQL
 * (transversal_grade_sort_order, used by the fail-closed RPC). This test pins
 * the two together so neither can drift without a red gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GRADE_LEVEL_SORT_ORDER } from '../../types/assessment-builder';

const MIGRATION = resolve(__dirname, '../../supabase/migrations/20260908100000_save_transversal_context.sql');

function sqlMapping(): Record<string, number> {
  const sql = readFileSync(MIGRATION, 'utf8');
  const body = sql.slice(sql.indexOf('transversal_grade_sort_order(p_grade_level text)'));
  const caseBlock = body.slice(body.indexOf('SELECT CASE p_grade_level'), body.indexOf('ELSE NULL'));
  const out: Record<string, number> = {};
  for (const match of caseBlock.matchAll(/WHEN '([a-z0-9_]+)'\s+THEN (\d+)/g)) out[match[1]] = Number(match[2]);
  return out;
}

describe('transversal grade allowlist parity (TypeScript ↔ SQL)', () => {
  it('the SQL CASE maps exactly the same 16 GradeLevel keys to the same sort_order values', () => {
    const fromSql = sqlMapping();
    expect(Object.keys(fromSql)).toHaveLength(16);
    expect(fromSql).toEqual(GRADE_LEVEL_SORT_ORDER);
  });

  it('sort orders are unique and contiguous 1..16 (ab_grades.sort_order is UNIQUE)', () => {
    const values = Object.values(GRADE_LEVEL_SORT_ORDER).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });
});
