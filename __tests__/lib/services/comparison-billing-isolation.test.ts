// @vitest-environment node
/**
 * Z7-A6 — executable architecture boundary between comparison evidence and money.
 *
 * The comparison GET may read Zoom/attendance/ledger evidence. Its UI may issue one
 * explicit admin override POST. No other write/RPC path is allowed, and the override
 * route itself may call only the named transactional RPC (never mutate the ledger
 * directly). Reading source here is deliberate: this assertion covers the complete
 * production paths, not a hand-built double that can silently diverge from them.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const comparisonRoute = readFileSync(
  resolve(ROOT, 'pages/api/admin/sessions/[id]/hours-comparison.ts'),
  'utf8'
);
const comparisonPanel = readFileSync(
  resolve(ROOT, 'components/sessions/HoursComparisonPanel.tsx'),
  'utf8'
);
const overrideRoute = readFileSync(
  resolve(ROOT, 'pages/api/admin/sessions/[id]/hour-override.ts'),
  'utf8'
);

const WRITE_OR_RPC = /\.(?:insert|update|upsert|delete|rpc)\s*\(/g;

function comparisonMutations(source: string): string[] {
  return source.match(WRITE_OR_RPC) ?? [];
}

describe('Z7-A6 comparison data is isolated from billing writes', () => {
  it('the comparison GET has no write or RPC path', () => {
    expect(comparisonMutations(comparisonRoute)).toEqual([]);
  });

  it('the panel has exactly one read path and one explicit admin-override path', () => {
    const fetchTargets = [...comparisonPanel.matchAll(/fetch\(`([^`]+)`/g)].map((match) => match[1]);
    expect(fetchTargets).toEqual([
      '/api/admin/sessions/${sessionId}/hours-comparison',
      '/api/admin/sessions/${sessionId}/hour-override',
    ]);
    expect(comparisonPanel).toContain("method: 'POST'");
  });

  it('the override endpoint calls only apply_session_hour_override and never writes the ledger directly', () => {
    expect([...overrideRoute.matchAll(/\.rpc\('([^']+)'/g)].map((match) => match[1])).toEqual([
      'apply_session_hour_override',
    ]);
    expect(overrideRoute).not.toContain("from('contract_hours_ledger')");
  });

  it('is mutation-sensitive: a comparison-triggered ledger update makes the boundary red', () => {
    const mutant = `${comparisonRoute}\nserviceClient.from('contract_hours_ledger').update({ hours: 0 });`;
    expect(comparisonMutations(mutant)).toEqual(['.update(']);
    expect(comparisonMutations(comparisonRoute)).toEqual([]);
  });
});
