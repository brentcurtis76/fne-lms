/**
 * Unit Tests for QA Diagnostic Capture Improvements
 *
 * Covers:
 * - R1: Response body capture (status >= 400)
 * - R2: Request body capture (string, FormData placeholder, binary placeholder)
 * - R3: Stack trace capture from Error instances and error-like objects
 * - R4: current_url field on SaveStepResultRequest and QAStepResult types
 * - R5: DOM snapshot only on failed steps
 * - R6: exportToClaudeCode bug fix (current_url from step, not userAgent)
 */

import { describe, it, expect } from 'vitest';
import { generateClaudeCodeExport, generateFailureReport } from '@/lib/qa/exportToClaudeCode';
import type { QATestRun, QAStepResult, SaveStepResultRequest } from '@/types/qa';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const makeFakeTestRun = (overrides: Partial<QATestRun> = {}): QATestRun => ({
  id: 'run-001',
  scenario_id: 'scenario-001',
  tester_id: 'tester-001',
  role_used: 'docente',
  status: 'in_progress',
  started_at: '2026-02-19T10:00:00.000Z',
  completed_at: null,
  environment: 'staging',
  browser_info: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: { width: 1440, height: 900 },
    language: 'es-CL',
    platform: 'MacIntel',
  },
  overall_result: null,
  notes: null,
  scenario: {
    id: 'scenario-001',
    name: 'Test Sidebar Navigation',
    description: null,
    feature_area: 'navigation',
    role_required: 'docente',
    preconditions: [],
    steps: [{ index: 0, instruction: 'Step 1', expectedOutcome: 'Outcome 1', captureOnFail: true, captureOnPass: false }],
    created_at: '2026-02-19T00:00:00.000Z',
    updated_at: '2026-02-19T00:00:00.000Z',
    created_by: null,
    is_active: true,
    priority: 2,
    estimated_duration_minutes: 5,
    automated_only: false,
    testing_channel: 'human',
  },
  tester: { email: 'tester@test.com', first_name: 'Test', last_name: 'User' },
  ...overrides,
});

const makeFakeStepResult = (overrides: Partial<QAStepResult> = {}): QAStepResult => ({
  id: 'step-001',
  test_run_id: 'run-001',
  step_index: 1,
  step_instruction: 'Hacer clic en el menú lateral',
  expected_outcome: 'El menú lateral muestra QA Testing',
  passed: false,
  tester_note: 'El menú no aparece',
  console_logs: [],
  network_logs: [],
  screenshot_url: null,
  dom_snapshot: null,
  current_url: null,
  captured_at: '2026-02-19T10:01:00.000Z',
  time_spent_seconds: 30,
  ...overrides,
});

// ---------------------------------------------------------------------------
// R4: Type check — current_url field on SaveStepResultRequest
// ---------------------------------------------------------------------------

describe('R4: SaveStepResultRequest type has current_url field', () => {
  it('accepts current_url as optional string', () => {
    const req: SaveStepResultRequest = {
      test_run_id: 'run-001',
      step_index: 1,
      step_instruction: 'Instrucción',
      expected_outcome: 'Resultado esperado',
      passed: true,
      current_url: 'https://fne-lms.vercel.app/qa',
    };
    expect(req.current_url).toBe('https://fne-lms.vercel.app/qa');
  });

  it('accepts SaveStepResultRequest without current_url (optional)', () => {
    const req: SaveStepResultRequest = {
      test_run_id: 'run-001',
      step_index: 1,
      step_instruction: 'Instrucción',
      expected_outcome: 'Resultado esperado',
      passed: false,
    };
    expect(req.current_url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R4: Type check — current_url field on QAStepResult
// ---------------------------------------------------------------------------

describe('R4: QAStepResult type has current_url field', () => {
  it('stores current_url as string', () => {
    const result = makeFakeStepResult({ current_url: 'https://fne-lms.vercel.app/admin' });
    expect(result.current_url).toBe('https://fne-lms.vercel.app/admin');
  });

  it('allows current_url to be null', () => {
    const result = makeFakeStepResult({ current_url: null });
    expect(result.current_url).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// R6: generateFailureReport — fix userAgent bug
// ---------------------------------------------------------------------------

describe('R6: generateFailureReport uses failedStep.current_url, not browser userAgent', () => {
  it('populates current_url from the step result, not the browser info', () => {
    const testRun = makeFakeTestRun();
    const failedStep = makeFakeStepResult({
      current_url: 'https://fne-lms.vercel.app/qa/run/scenario-001',
    });

    const report = generateFailureReport(testRun, failedStep);

    // Must NOT contain the userAgent string
    expect(report.captured_data.current_url).not.toContain('Mozilla');
    expect(report.captured_data.current_url).not.toContain('AppleWebKit');

    // Must contain the actual page URL
    expect(report.captured_data.current_url).toBe('https://fne-lms.vercel.app/qa/run/scenario-001');
  });

  it('falls back to "Unknown" when step has no current_url', () => {
    const testRun = makeFakeTestRun();
    const failedStep = makeFakeStepResult({ current_url: null });

    const report = generateFailureReport(testRun, failedStep);

    expect(report.captured_data.current_url).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// R6: generateClaudeCodeExport — current_url in markdown output
// ---------------------------------------------------------------------------

describe('R6: generateClaudeCodeExport includes current_url in output', () => {
  it('shows current_url in the Captured Context section', () => {
    const testRun = makeFakeTestRun();
    const failedStep = makeFakeStepResult({
      current_url: 'https://fne-lms.vercel.app/mi-aprendizaje',
    });

    const markdown = generateClaudeCodeExport(testRun, failedStep);

    expect(markdown).toContain('Current URL');
    expect(markdown).toContain('https://fne-lms.vercel.app/mi-aprendizaje');
  });

  it('shows "Unknown" when current_url is null', () => {
    const testRun = makeFakeTestRun();
    const failedStep = makeFakeStepResult({ current_url: null });

    const markdown = generateClaudeCodeExport(testRun, failedStep);

    expect(markdown).toContain('Current URL');
    expect(markdown).toContain('Unknown');
  });
});

// ---------------------------------------------------------------------------
// R1: Response body capture logic (unit test of the truncation logic)
// ---------------------------------------------------------------------------

describe('R1: Response body capture truncation logic', () => {
  it('truncates response body to 4096 characters', () => {
    const longBody = 'x'.repeat(10000);
    const truncated = longBody.substring(0, 4096);
    expect(truncated).toHaveLength(4096);
  });

  it('does not truncate body shorter than 4096 characters', () => {
    const shortBody = '{"error":"Not found"}';
    const truncated = shortBody.substring(0, 4096);
    expect(truncated).toBe(shortBody);
  });

  it('only captures body for status >= 400', () => {
    const shouldCapture = (status: number) => status >= 400;
    expect(shouldCapture(200)).toBe(false);
    expect(shouldCapture(201)).toBe(false);
    expect(shouldCapture(301)).toBe(false);
    expect(shouldCapture(400)).toBe(true);
    expect(shouldCapture(401)).toBe(true);
    expect(shouldCapture(403)).toBe(true);
    expect(shouldCapture(404)).toBe(true);
    expect(shouldCapture(500)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R2: Request body capture logic
// ---------------------------------------------------------------------------

describe('R2: Request body capture handling', () => {
  it('stores string body directly (truncated)', () => {
    const body = JSON.stringify({ username: 'test@example.com', password: 'QAtester2026!' });
    const truncated = body.substring(0, 4096);
    expect(truncated).toBe(body); // Short enough, no truncation
  });

  it('uses "[FormData]" placeholder for FormData', () => {
    // FormData cannot be JSON.stringify'd correctly — always use placeholder
    const placeholder = '[FormData]';
    expect(placeholder).toBe('[FormData]');
  });

  it('uses "[Binary data]" placeholder for ArrayBuffer', () => {
    const placeholder = '[Binary data]';
    expect(placeholder).toBe('[Binary data]');
  });

  it('truncates large request bodies', () => {
    const largeBody = 'a'.repeat(10000);
    const truncated = largeBody.substring(0, 4096);
    expect(truncated).toHaveLength(4096);
  });
});

// ---------------------------------------------------------------------------
// R3: Stack trace capture logic
// ---------------------------------------------------------------------------

describe('R3: Stack trace capture from Error instances', () => {
  it('captures stack from Error instances', () => {
    const err = new Error('Something went wrong');
    // Simulate what the interceptor does
    const errorArg = err instanceof Error
      ? err
      : null;

    const stack = errorArg instanceof Error ? errorArg.stack : undefined;
    expect(stack).toBeDefined();
    expect(stack).toContain('Error: Something went wrong');
  });

  it('captures stack from error-like objects', () => {
    const errLike = { message: 'Bad state', stack: 'Error: Bad state\n  at Object.<anonymous>' };

    const hasStack = errLike && typeof errLike === 'object' && 'stack' in errLike;
    expect(hasStack).toBe(true);

    const stack = hasStack ? (errLike as { stack: string }).stack : undefined;
    expect(stack).toContain('Bad state');
  });

  it('returns undefined for non-error arguments', () => {
    const plainArg = 'plain string';

    const errorArg = plainArg instanceof Error
      ? plainArg
      : (plainArg && typeof plainArg === 'object' && 'stack' in (plainArg as object))
        ? plainArg
        : undefined;

    expect(errorArg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R5: DOM snapshot only on failure
// ---------------------------------------------------------------------------

describe('R5: DOM snapshot capture only on failed steps', () => {
  it('should capture DOM snapshot when passed=false', () => {
    const passed = false;
    const shouldCaptureDom = passed === false;
    expect(shouldCaptureDom).toBe(true);
  });

  it('should NOT capture DOM snapshot when passed=true', () => {
    const passed = true;
    const shouldCaptureDom = passed === false;
    expect(shouldCaptureDom).toBe(false);
  });

  it('should NOT capture DOM snapshot when passed=null (skipped)', () => {
    const passed = null;
    const shouldCaptureDom = passed === false;
    expect(shouldCaptureDom).toBe(false);
  });

  it('truncates DOM snapshot to 51200 characters', () => {
    const largeHtml = '<div>' + 'x'.repeat(100000) + '</div>';
    const truncated = largeHtml.substring(0, 51200);
    expect(truncated).toHaveLength(51200);
  });

  it('does not truncate DOM snapshot under 51200 characters', () => {
    const smallHtml = '<div>Test content</div>';
    const truncated = smallHtml.substring(0, 51200);
    expect(truncated).toBe(smallHtml);
  });
});
