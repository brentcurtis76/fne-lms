// @vitest-environment node
/**
 * Task-specific tests: Remove weight fields from assessment builder modals
 * and rename "Expectativas" to "Calibración".
 *
 * Since this is a pure UI change (form state, JSX, nav text), these tests
 * verify the source files no longer contain removed/changed text patterns.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const INDEX_FILE = path.join(
  process.cwd(),
  'pages/admin/assessment-builder/[templateId]/index.tsx'
);

const EXPECTATIONS_FILE = path.join(
  process.cwd(),
  'pages/admin/assessment-builder/[templateId]/expectations.tsx'
);

const indexSrc = fs.readFileSync(INDEX_FILE, 'utf-8');
const expectationsSrc = fs.readFileSync(EXPECTATIONS_FILE, 'utf-8');

// ── index.tsx — form state ──────────────────────────────────────────────────

describe('index.tsx — weight removed from form state types', () => {
  it('objectiveForm state type does NOT include weight', () => {
    // The state declaration should not have "weight: number" inside objectiveForm type block
    // We look for the type declaration block pattern
    const objectiveFormBlock = indexSrc.match(
      /const \[objectiveForm.*?setObjectiveForm\] = useState<\{[\s\S]*?\}>/
    );
    expect(objectiveFormBlock).not.toBeNull();
    expect(objectiveFormBlock![0]).not.toContain('weight');
  });

  it('moduleForm state type does NOT include weight', () => {
    const moduleFormBlock = indexSrc.match(
      /const \[moduleForm.*?setModuleForm\] = useState<\{[\s\S]*?\}>/
    );
    expect(moduleFormBlock).not.toBeNull();
    expect(moduleFormBlock![0]).not.toContain('weight');
  });

  it('indicatorForm state type does NOT include weight', () => {
    const indicatorFormBlock = indexSrc.match(
      /const \[indicatorForm.*?setIndicatorForm\] = useState<\{[\s\S]*?\}>/
    );
    expect(indicatorFormBlock).not.toBeNull();
    expect(indicatorFormBlock![0]).not.toContain('weight');
  });
});

// ── index.tsx — form submission bodies ────────────────────────────────────

describe('index.tsx — weight removed from form submission bodies', () => {
  it('handleSaveObjective does NOT send weight in PUT body', () => {
    // weight: objectiveForm.weight pattern must not exist
    expect(indexSrc).not.toContain('weight: objectiveForm.weight');
  });

  it('handleSaveModule does NOT send weight in PUT/POST body', () => {
    expect(indexSrc).not.toContain('weight: moduleForm.weight');
  });

  it('handleSaveIndicator does NOT send weight in body', () => {
    expect(indexSrc).not.toContain('weight: indicatorForm.weight');
  });
});

// ── index.tsx — tree view display ─────────────────────────────────────────

describe('index.tsx — Peso display removed from tree view', () => {
  it('objective tree row does NOT show "Peso: {objective.weight}"', () => {
    expect(indexSrc).not.toContain('Peso: {objective.weight}');
  });

  it('module tree row does NOT show "Peso: {module.weight}"', () => {
    expect(indexSrc).not.toContain('Peso: {module.weight}');
  });
});

// ── index.tsx — modal JSX ────────────────────────────────────────────────

describe('index.tsx — weight input fields removed from modal JSX', () => {
  it('does NOT contain objective-weight input id', () => {
    expect(indexSrc).not.toContain('objective-weight');
  });

  it('does NOT contain module-weight input id', () => {
    expect(indexSrc).not.toContain('module-weight');
  });

  it('does NOT contain indicator-weight input id', () => {
    expect(indexSrc).not.toContain('indicator-weight');
  });

  it('indicator modal category selector is no longer inside a grid-cols-2 wrapper (weight removed)', () => {
    // The old pattern had "Category and weight row" comment
    expect(indexSrc).not.toContain('Category and weight row');
    // The new pattern has "Category" comment
    expect(indexSrc).toContain('{/* Category */}');
  });
});

// ── index.tsx — navigation links ─────────────────────────────────────────

describe('index.tsx — nav links renamed to "Calibración"', () => {
  it('does NOT contain "Expectativas" as nav button text', () => {
    // Verify the old label is gone
    expect(indexSrc).not.toMatch(/>\s*Expectativas\s*<\/a>/);
  });

  it('contains TWO "Calibración" nav link labels', () => {
    const matches = indexSrc.match(/>\s*Calibración\s*</g);
    // Two links: draft action bar + published/archived action bar
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ── IndicatorData interface — weight MUST remain ─────────────────────────

describe('index.tsx — IndicatorData interface preserves weight', () => {
  it('IndicatorData interface still has weight: number (maps to DB data)', () => {
    // The interface definition should still contain weight
    // Find the line range for IndicatorData interface (has nested objects, so use line-based search)
    const lines = indexSrc.split('\n');
    const startIdx = lines.findIndex(l => l.includes('interface IndicatorData {'));
    expect(startIdx).toBeGreaterThan(-1);
    // Find closing brace at column 0 (end of top-level interface)
    let endIdx = startIdx + 1;
    while (endIdx < lines.length && !lines[endIdx].match(/^\}/)) endIdx++;
    const interfaceBlock = lines.slice(startIdx, endIdx + 1).join('\n');
    expect(interfaceBlock).toContain('weight: number');
  });
});

// ── expectations.tsx — renamed strings ───────────────────────────────────

describe('expectations.tsx — page title and info header renamed', () => {
  it('page title is "Calibración" (not "Expectativas por Año")', () => {
    expect(expectationsSrc).toContain('title="Calibración"');
    expect(expectationsSrc).not.toContain('title="Expectativas por Año"');
  });

  it('info panel header reads "Cómo calibrar el template:"', () => {
    expect(expectationsSrc).toContain('Cómo calibrar el template:');
    expect(expectationsSrc).not.toContain('Cómo configurar expectativas:');
  });
});
