// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ACTION_POLICY,
  scanWorkflowDirectory,
  scanWorkflowText,
} from '../../scripts/ci/check-action-runtimes.mjs';

const CURRENT_ACTIONS = `
steps:
  - uses: actions/checkout@v7
  - uses: actions/setup-node@v7
    with:
      node-version: 22
  - uses: supabase/setup-cli@v3
  - uses: actions/upload-artifact@v7
`;

describe('GitHub Action runtime policy', () => {
  it('accepts the reviewed Node 24 action majors and Node 22 job runtime', () => {
    expect(scanWorkflowText(CURRENT_ACTIONS).findings).toEqual([]);
  });

  it.each([
    ['actions/checkout@v4', 'actions/checkout'],
    ['actions/setup-node@v4', 'actions/setup-node'],
    ['supabase/setup-cli@v1', 'supabase/setup-cli'],
    ['actions/upload-artifact@v4', 'actions/upload-artifact'],
  ])('rejects the retired action ref %s', (use, repository) => {
    const result = scanWorkflowText(`steps:\n  - uses: ${use}`);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'RETIRED_ACTION_RUNTIME',
        message: expect.stringContaining(repository),
      }),
    ]));
  });

  it.each([
    "node-version: '20'",
    'node-version: 20',
    'node-version: 20.x',
    'node-version: 20.*',
    'node-version: 20.19',
    'node-version: 20.19.1',
    'node-version: lts/iron',
  ])
    ('rejects the retired job runtime %s', (selection) => {
      const result = scanWorkflowText(`steps:\n  - uses: actions/setup-node@v7\n    with:\n      ${selection}`);
      expect(result.findings.map((finding) => finding.rule)).toContain('EOL_NODE_SELECTION');
    });

  it('fails closed when a new external action has not been reviewed', () => {
    const result = scanWorkflowText('steps:\n  - uses: example/unreviewed@v1');
    expect(result.findings.map((finding) => finding.rule)).toContain('UNREVIEWED_ACTION');
  });

  it('does not mistake commented examples for active action uses', () => {
    const result = scanWorkflowText('# - uses: actions/checkout@v4');
    expect(result.actions).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it('scans the real workflow non-vacuously and finds only reviewed actions', () => {
    const result = scanWorkflowDirectory('.github/workflows');
    expect(result.files).toEqual(['.github/workflows/ci.yml']);
    expect(result.actions).toHaveLength(17);
    expect(new Set(result.actions.map((action) => action.repository)))
      .toEqual(new Set(ACTION_POLICY.keys()));
    expect(result.findings).toEqual([]);
  });
});
