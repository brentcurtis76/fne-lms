#!/usr/bin/env node
/**
 * Keep GitHub Actions off retired runtimes and make new third-party actions an
 * explicit review event. GitHub can temporarily force an old action onto a new
 * runtime, which keeps CI green while printing deprecation annotations; this
 * guard makes that drift fail locally and in the Migration safety guard job.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACTION_POLICY = new Map([
  ['actions/checkout', 7],
  ['actions/setup-node', 7],
  ['actions/upload-artifact', 7],
  ['supabase/setup-cli', 3],
]);

function workflowFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...workflowFiles(path));
    else if (['.yml', '.yaml'].includes(extname(path))) files.push(path);
  }
  return files.sort();
}

export function scanWorkflowText(text, file = '<workflow>') {
  const findings = [];
  const actions = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (/^\s*#/.test(line)) return;

    const uses = /\buses:\s*([^\s@]+)@([^\s#]+)/.exec(line);
    if (uses) {
      const [, repository, ref] = uses;
      if (repository.startsWith('./')) return;
      actions.push({ repository, ref, file, line: lineNumber });

      const minimum = ACTION_POLICY.get(repository);
      if (minimum === undefined) {
        findings.push({
          rule: 'UNREVIEWED_ACTION', file, line: lineNumber,
          message: `${repository}@${ref} is not in the reviewed action policy`,
        });
        return;
      }

      const version = /^v(\d+)(?:\.\d+\.\d+)?$/.exec(ref);
      if (!version) {
        findings.push({
          rule: 'UNREVIEWED_REF', file, line: lineNumber,
          message: `${repository}@${ref} must use a reviewed vN or vN.N.N release ref`,
        });
      } else if (Number(version[1]) < minimum) {
        findings.push({
          rule: 'RETIRED_ACTION_RUNTIME', file, line: lineNumber,
          message: `${repository}@${ref} is below the reviewed minimum v${minimum}`,
        });
      }
    }

    const node = /^\s*node-version:\s*['"]?([^'"\s#]+)['"]?/.exec(line);
    const normalizedNode = node?.[1].toLowerCase();
    const selectsNode20 = normalizedNode
      && (/^20(?:\.(?:x|\*)|(?:\.\d+){1,2})?$/.test(normalizedNode)
        || /^(?:lts\/)?iron$/.test(normalizedNode));
    if (selectsNode20) {
      findings.push({
        rule: 'EOL_NODE_SELECTION', file, line: lineNumber,
        message: `node-version ${node[1]} selects retired Node 20; CI jobs use Node 22`,
      });
    }
  });

  return { actions, findings };
}

export function scanWorkflowDirectory(dir = '.github/workflows') {
  const files = workflowFiles(dir);
  const actions = [];
  const findings = [];

  for (const file of files) {
    const result = scanWorkflowText(readFileSync(file, 'utf8'), file);
    actions.push(...result.actions);
    findings.push(...result.findings);
  }

  const seen = new Set(actions.map((action) => action.repository));
  for (const repository of ACTION_POLICY.keys()) {
    if (!seen.has(repository)) {
      findings.push({
        rule: 'MISSING_REVIEWED_ACTION', file: dir, line: 0,
        message: `${repository} disappeared; revise the policy deliberately if removal is intended`,
      });
    }
  }

  return { files, actions, findings };
}

export function main(args = process.argv.slice(2)) {
  if (args.length > 1) {
    console.error('usage: node scripts/ci/check-action-runtimes.mjs [workflow-dir]');
    return 2;
  }

  const dir = resolve(args[0] || '.github/workflows');
  const result = scanWorkflowDirectory(dir);
  if (result.findings.length) {
    console.error(`GitHub Action runtime guard failed (${result.findings.length} finding(s)):`);
    for (const finding of result.findings) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      console.error(`- [${finding.rule}] ${location}: ${finding.message}`);
    }
    return 1;
  }

  console.log(`GitHub Action runtime guard OK — ${result.actions.length} uses across ${result.files.length} workflow file(s)`);
  return 0;
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exitCode = main();
