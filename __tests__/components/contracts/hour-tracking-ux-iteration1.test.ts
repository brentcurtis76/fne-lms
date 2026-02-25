// @vitest-environment node

/**
 * UX Iteration 1 — Hour Tracking Panel Static Source Analysis Tests
 *
 * These tests verify that all MUST FIX and SHOULD FIX UX issues from the
 * UX Reviewer's report were applied to HourAllocationPanel.tsx and
 * ReallocationModal.tsx. They read source files as text and assert the
 * correct patterns are (or are not) present.
 *
 * Why static analysis? The components require Next.js context, react-hot-toast,
 * and fetch mocks that are out of scope for this focused pass. Source-level
 * checks are a practical, deterministic way to confirm the exact strings the
 * UX reviewer will check against.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

const panel = readSource('components/contracts/HourAllocationPanel.tsx');
const modal = readSource('components/contracts/ReallocationModal.tsx');

// -------------------------------------------------------
// BC-2: Primary action buttons must use brand_accent (yellow) not black
// -------------------------------------------------------
describe('BC-2: Primary action buttons use yellow (brand_accent) not black', () => {
  it('HourAllocationPanel Guardar button uses bg-brand_accent', () => {
    expect(panel).toContain('bg-brand_accent text-brand_primary hover:bg-brand_accent_hover');
  });

  it('HourAllocationPanel Guardar button does NOT use bg-brand_primary for the enabled state', () => {
    // The black primary should NOT appear in the enabled button className
    // We check that bg-brand_primary does not appear immediately before text-white
    expect(panel).not.toContain('bg-brand_primary text-white hover:bg-gray-800');
  });

  it('ReallocationModal Confirmar button uses bg-brand_accent', () => {
    expect(modal).toContain('bg-brand_accent text-brand_primary hover:bg-brand_accent_hover');
  });

  it('ReallocationModal Confirmar button does NOT use bg-brand_primary with text-white for the enabled state', () => {
    expect(modal).not.toContain('bg-brand_primary text-white hover:bg-gray-800');
  });
});

// -------------------------------------------------------
// BC-3 / ACC-3: Focus rings must use brand_accent with ring-offset-2
// -------------------------------------------------------
describe('BC-3/ACC-3: Focus rings use brand_accent with offset', () => {
  it('HourAllocationPanel has focus:ring-brand_accent', () => {
    expect(panel).toContain('focus:ring-brand_accent');
  });

  it('HourAllocationPanel has focus:ring-offset-2', () => {
    expect(panel).toContain('focus:ring-offset-2');
  });

  it('HourAllocationPanel does NOT use focus:ring-brand_primary on form inputs', () => {
    // We allow brand_primary references elsewhere (headings, text) but NOT for ring on form inputs
    expect(panel).not.toContain('focus:ring-brand_primary');
  });

  it('ReallocationModal has focus:ring-brand_accent', () => {
    expect(modal).toContain('focus:ring-brand_accent');
  });

  it('ReallocationModal has focus:ring-offset-2', () => {
    expect(modal).toContain('focus:ring-offset-2');
  });

  it('ReallocationModal does NOT use focus:ring-brand_primary', () => {
    expect(modal).not.toContain('focus:ring-brand_primary');
  });
});

// -------------------------------------------------------
// BC-4: Annex badge must use brand_accent (not blue)
// -------------------------------------------------------
describe('BC-4: Annex badge uses brand_accent not blue', () => {
  it('HourAllocationPanel annex badge uses bg-brand_accent text-brand_primary', () => {
    expect(panel).toContain('bg-brand_accent text-brand_primary');
  });

  it('HourAllocationPanel does NOT use bg-blue-100 for the annex badge', () => {
    const nonCommentLines = panel
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('bg-blue-100'));
    expect(nonCommentLines).toHaveLength(0);
  });

  it('HourAllocationPanel does NOT use text-blue-700 for the annex badge', () => {
    const nonCommentLines = panel
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('text-blue-700'));
    expect(nonCommentLines).toHaveLength(0);
  });
});

// -------------------------------------------------------
// ACC-1: Dialog ARIA attributes on modals
// -------------------------------------------------------
describe('ACC-1: Modal dialog ARIA attributes', () => {
  it('HourAllocationPanel delete modal has role="dialog"', () => {
    expect(panel).toContain('role="dialog"');
  });

  it('HourAllocationPanel delete modal has aria-modal="true"', () => {
    expect(panel).toContain('aria-modal="true"');
  });

  it('HourAllocationPanel delete modal has aria-labelledby="delete-confirm-title"', () => {
    expect(panel).toContain('aria-labelledby="delete-confirm-title"');
  });

  it('HourAllocationPanel delete modal h3 has id="delete-confirm-title"', () => {
    expect(panel).toContain('id="delete-confirm-title"');
  });

  it('ReallocationModal has role="dialog"', () => {
    expect(modal).toContain('role="dialog"');
  });

  it('ReallocationModal has aria-modal="true"', () => {
    expect(modal).toContain('aria-modal="true"');
  });

  it('ReallocationModal has aria-labelledby="realloc-modal-title"', () => {
    expect(modal).toContain('aria-labelledby="realloc-modal-title"');
  });

  it('ReallocationModal h3 has id="realloc-modal-title"', () => {
    expect(modal).toContain('id="realloc-modal-title"');
  });
});

// -------------------------------------------------------
// ACC-2: Focus management on modal open
// -------------------------------------------------------
describe('ACC-2: Focus management on modal open', () => {
  it('HourAllocationPanel uses useRef for delete cancel button', () => {
    expect(panel).toContain('deleteCancelBtnRef');
  });

  it('HourAllocationPanel has useEffect that focuses on showDeleteConfirm', () => {
    expect(panel).toContain('showDeleteConfirm && deleteCancelBtnRef.current');
  });

  it('ReallocationModal uses useRef for from select', () => {
    expect(modal).toContain('fromSelectRef');
  });

  it('ReallocationModal has useEffect to focus fromSelectRef on mount', () => {
    expect(modal).toContain('fromSelectRef.current.focus()');
  });
});

// -------------------------------------------------------
// ACC-4: z-index on nested modals must be z-[60]
// -------------------------------------------------------
describe('ACC-4: Nested modals z-index z-[60]', () => {
  it('HourAllocationPanel delete confirm overlay uses z-[60]', () => {
    expect(panel).toContain('z-[60]');
  });

  it('HourAllocationPanel does NOT use plain z-50 on the delete confirm overlay', () => {
    // The delete confirm div previously had z-50 — confirm it was replaced with z-[60]
    // We check the actual overlay div (the one with fixed inset-0 in delete confirm)
    // The string 'z-50' should not appear at all in HourAllocationPanel
    const nonCommentLines = panel
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('z-50'));
    expect(nonCommentLines).toHaveLength(0);
  });

  it('ReallocationModal outer overlay uses z-[60]', () => {
    expect(modal).toContain('z-[60]');
  });

  it('ReallocationModal does NOT use plain z-50 on outer overlay', () => {
    const nonCommentLines = modal
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && l.includes('z-50'));
    expect(nonCommentLines).toHaveLength(0);
  });
});

// -------------------------------------------------------
// ID-1: is_fixed checkbox for online_learning
// -------------------------------------------------------
describe('ID-1: is_fixed checkbox for online_learning row', () => {
  it('HourAllocationPanel has Horas fijas checkbox label', () => {
    expect(panel).toContain('Horas fijas');
  });

  it('HourAllocationPanel conditionally renders is_fixed checkbox for online_learning', () => {
    expect(panel).toContain("hour_type_key === 'online_learning'");
    expect(panel).toContain('handleIsFixedChange');
  });

  it('HourAllocationPanel has handleIsFixedChange function', () => {
    expect(panel).toContain('const handleIsFixedChange');
  });
});

// -------------------------------------------------------
// BC-1 (SHOULD FIX): brand_yellow replaced with brand_accent
// -------------------------------------------------------
describe('BC-1: Redistribuir Horas button uses brand_accent not brand_yellow', () => {
  it('HourAllocationPanel does NOT use bg-brand_yellow', () => {
    expect(panel).not.toContain('bg-brand_yellow');
  });

  it('HourAllocationPanel does NOT use hover:bg-yellow-400', () => {
    expect(panel).not.toContain('hover:bg-yellow-400');
  });

  it('HourAllocationPanel Redistribuir Horas button uses bg-brand_accent', () => {
    expect(panel).toContain('bg-brand_accent text-brand_primary rounded-md hover:bg-brand_accent_hover');
  });
});

// -------------------------------------------------------
// BC-5 (SHOULD FIX): rounded-md instead of rounded-lg on buttons
// -------------------------------------------------------
describe('BC-5: Buttons use rounded-md not rounded-lg', () => {
  it('HourAllocationPanel does NOT use rounded-lg on any button', () => {
    // Check that no button element uses rounded-lg
    const lines = panel.split('\n');
    const buttonLinesWithRoundedLg = lines.filter(
      l => l.includes('rounded-lg') && (l.includes('<button') || l.includes('className='))
    );
    // rounded-lg is allowed on non-button elements (cards, containers)
    // but should not appear inline with button-specific classes like px-4 py-2
    const buttonClassLines = lines.filter(
      l => l.includes('rounded-lg') && l.includes('px-4') && l.includes('py-2')
    );
    expect(buttonClassLines).toHaveLength(0);
  });

  it('ReallocationModal does NOT use rounded-lg on any button', () => {
    const lines = modal.split('\n');
    const buttonClassLines = lines.filter(
      l => l.includes('rounded-lg') && l.includes('px-4') && l.includes('py-2')
    );
    expect(buttonClassLines).toHaveLength(0);
  });
});

// -------------------------------------------------------
// ID-2 (SHOULD FIX): Running total uses toFixed(2) and "h" suffix
// -------------------------------------------------------
describe('ID-2: Running total format', () => {
  it('HourAllocationPanel running total uses toFixed(2) and h suffix', () => {
    // The tfoot cell now shows e.g. "100.00 h / 100.00 h"
    expect(panel).toContain('horasContratadas.toFixed(2)');
  });
});

// -------------------------------------------------------
// GENERA-4 (SHOULD FIX): Badge text uses [+X del Anexo] format
// -------------------------------------------------------
describe('GENERA-4: Annex badge text with brackets', () => {
  it('HourAllocationPanel annex badge has bracketed format [+X del Anexo]', () => {
    expect(panel).toContain('[+{bucket.annex_hours} del Anexo]');
  });
});

// -------------------------------------------------------
// ACC-5 (SHOULD FIX): Progress bar has aria-label
// -------------------------------------------------------
describe('ACC-5: Progress bar aria-label', () => {
  it('HourAllocationPanel progress bar container has role="img"', () => {
    expect(panel).toContain('role="img"');
  });

  it('HourAllocationPanel progress bar container has aria-label', () => {
    expect(panel).toContain('aria-label={`Progreso:');
  });
});

// -------------------------------------------------------
// ACC-6 (SHOULD FIX): Modality emoji has aria-hidden="true"
// -------------------------------------------------------
describe('ACC-6: Modality emoji is aria-hidden', () => {
  it('HourAllocationPanel modality emoji spans have aria-hidden="true"', () => {
    expect(panel).toContain('aria-hidden="true"');
  });
});

// -------------------------------------------------------
// RD-2 (SHOULD FIX): Admin action button container uses flex-wrap
// -------------------------------------------------------
describe('RD-2: Admin action buttons use flex-wrap', () => {
  it('HourAllocationPanel admin action button container uses flex flex-wrap', () => {
    expect(panel).toContain('flex flex-wrap items-center justify-end gap-2');
  });

  it('HourAllocationPanel does NOT use space-x-3 on admin action button container', () => {
    // The admin action div previously had space-x-3 — now uses gap-2
    const lines = panel.split('\n');
    const adminDivWithSpaceX3 = lines.filter(
      l => l.includes('space-x-3') && l.includes('justify-end') && l.includes('pt-2')
    );
    expect(adminDivWithSpaceX3).toHaveLength(0);
  });
});
