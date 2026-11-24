// @vitest-environment node
/**
 * L4 (no brand in the kit) and L5 (the kit imports nothing of the host app). The stand-in until release 5's
 * build check: it walks every file under lib/correos/ and fails on
 *   - an import that leaves the folder and is not an installed package (any file, tests included);
 *   - a path alias such as `@/…` (it always points into the host app);
 *   - a brand word ("Genera", "Nueva Educación", "nuevaeducacion") outside the tests;
 *   - an environment variable read outside the tests.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const ROOT = process.cwd();
const KIT = path.join(ROOT, 'lib', 'correos');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

const SPECIFIER = [
  /\b(?:import|export)\s+(?:type\s+)?[^'";]*?\sfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bvi\.(?:mock|importActual|doMock)\s*\(\s*['"]([^'"]+)['"]/g,
];

function specifiers(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of SPECIFIER) for (const match of source.matchAll(pattern)) found.add(match[1]);
  return [...found];
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);
const builtins = new Set(builtinModules);

/** The problems with one import in one file of the kit; empty when it is allowed. */
function importProblem(file: string, specifier: string): string | null {
  if (specifier.startsWith('.')) {
    const target = path.resolve(path.dirname(file), specifier);
    return target === KIT || target.startsWith(KIT + path.sep) ? null : `leaves lib/correos: ${specifier}`;
  }
  if (specifier.startsWith('/') || specifier.startsWith('@/') || specifier.startsWith('~')) {
    return `points into the host app: ${specifier}`;
  }
  if (specifier.startsWith('node:') || builtins.has(specifier)) return null;
  const name = packageName(specifier);
  if (!declared.has(name)) return `not a declared package: ${specifier}`;
  if (!fs.existsSync(path.join(ROOT, 'node_modules', name, 'package.json'))) return `not installed: ${specifier}`;
  return null;
}

const BRAND_WORDS = [/\bgenera\b/i, /nueva\s+educaci[oó]n/i, /nuevaeducacion/i];

function brandProblems(source: string): string[] {
  return BRAND_WORDS.filter((word) => word.test(source)).map((word) => `brand word ${word}`);
}

const isTest = (file: string) => file.split(path.sep).includes('__tests__') || /\.test\.[jt]sx?$/.test(file);

describe('L5: the kit imports nothing of the host app', () => {
  const files = walk(KIT);

  it('finds the kit files', () => {
    expect(files.some((f) => f.endsWith(path.join('lib', 'correos', 'template.tsx')))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join('lib', 'correos', 'test-send.ts')))).toBe(true);
  });

  it('every import stays inside lib/correos or names an installed package', () => {
    const offenders = files.flatMap((file) =>
      specifiers(fs.readFileSync(file, 'utf8'))
        .map((spec) => importProblem(file, spec))
        .filter(Boolean)
        .map((problem) => `${path.relative(ROOT, file)}: ${problem}`)
    );
    expect(offenders).toEqual([]);
  });

  it('names no brand and reads no environment variable outside the tests', () => {
    const offenders = files
      .filter((file) => !isTest(file))
      .flatMap((file) => {
        const source = fs.readFileSync(file, 'utf8');
        const problems = brandProblems(source);
        if (/process\s*\.\s*env|import\.meta\.env/.test(source)) problems.push('reads the environment');
        return problems.map((problem) => `${path.relative(ROOT, file)}: ${problem}`);
      });
    expect(offenders).toEqual([]);
  });

  it('catches what it is meant to catch (negative controls)', () => {
    const file = path.join(KIT, 'template.tsx');
    expect(importProblem(file, '../email/provider')).toMatch(/leaves/);
    expect(importProblem(file, '../../lib/api-auth')).toMatch(/leaves/);
    expect(importProblem(file, '@/lib/api-auth')).toMatch(/host app/);
    expect(importProblem(file, 'not-a-real-package-xyz')).toMatch(/not a declared/);
    expect(importProblem(file, './markup')).toBeNull();
    expect(importProblem(path.join(KIT, '__tests__', 'x.test.ts'), '../types')).toBeNull();
    expect(importProblem(file, '@react-email/components')).toBeNull();
    expect(importProblem(file, 'node:fs')).toBeNull();
    // Built from parts so that this file's own scan does not read the sample as real imports.
    const im = 'im' + 'port';
    expect(specifiers(`${im} { a } from '../x';\n${im} type { B } from "@/y";\nconst c = await ${im}('z');`)).toEqual(
      expect.arrayContaining(['../x', '@/y', 'z'])
    );
    expect(brandProblems('const n = "GENERA";')).toHaveLength(1);
    expect(brandProblems('Fundación Nueva Educación')).toHaveLength(1);
    expect(brandProblems('Fundacion nueva educacion')).toHaveLength(1);
    expect(brandProblems('x@boletin.NuevaEducacion.org')).toHaveLength(1);
    expect(brandProblems('información general para generar')).toEqual([]);
  });
});
