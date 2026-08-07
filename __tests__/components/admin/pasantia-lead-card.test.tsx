// @vitest-environment jsdom
/**
 * A8 [A-new-1] [A-new-2] [A-new-3] [A2] — the lead detail surface.
 *
 * `PasantiaLeadCard` exists so these can be asserted without the page's
 * dependency tree (MainLayout, next/router, the Supabase auth helpers,
 * react-hot-toast) — the same reason `TractorSignupCard` was extracted.
 *
 * The [A-new-3] source guard lives HERE rather than in a sibling file: the
 * phase's scope is ten files, and a guard over the page's CSV path is closer to
 * this surface than to anything else A8 ships.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEAD_STATUSES, canTransitionLead } from '../../../lib/pasantias/leads';
import {
  LEAD_STATUS_LABELS,
  PasantiaLeadCard,
  allowedLeadTransitions,
  type PasantiaLead,
} from '../../../components/admin/PasantiaLeadCard';

const LEAD_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeLead(overrides: Partial<PasantiaLead> = {}): PasantiaLead {
  return {
    id: LEAD_ID,
    cohort: 'octubre-2026',
    first_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@example.com',
    institution: 'Colegio Sintético',
    phone: null,
    role_title: 'Directora',
    num_people: 3,
    message: 'Mensaje sintético de prueba.',
    notes: null,
    status: 'new',
    source_path: '/pasantias',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    consent_accepted_at: '2026-08-01T12:00:00.000Z',
    consent_notice_version: 'v1',
    marketing_opt_in: false,
    marketing_opt_in_at: null,
    brochure_sent_at: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

function renderCard(lead: PasantiaLead) {
  const onStatusChange = vi.fn();
  const onNotesSave = vi.fn();
  const utils = render(
    <PasantiaLeadCard lead={lead} onStatusChange={onStatusChange} onNotesSave={onNotesSave} />
  );
  return { ...utils, onStatusChange, onNotesSave };
}

/**
 * The two shapes the column can genuinely hold today.
 *
 * The first is one `sanitizeSourcePath` would have ACCEPTED — single leading
 * `/`, no whitespace, no control characters — so it is storable through the
 * public route as it stands. The second is one it would have REFUSED, and it is
 * here because the table is written by service-role code: a future importer is
 * not obliged to call the sanitizer, and this surface must not depend on it.
 */
const HOSTILE_SOURCE_PATHS = [
  '/pasantias?q=<script>alert(1)</script>',
  'javascript:alert(1)',
];

describe('source_path rendering ([A-new-1])', () => {
  it.each(HOSTILE_SOURCE_PATHS)('renders %s as text, never as a link', (sourcePath) => {
    const { container } = renderCard(makeLead({ source_path: sourcePath }));

    expect(screen.getByTestId(`lead-source-path-${LEAD_ID}`)).toHaveTextContent(sourcePath);

    // No anchor anywhere in the card, and nothing carries the value in an href.
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelectorAll(`[href]`)).toHaveLength(0);
    expect(container.innerHTML).not.toContain('href');
  });

  it('does not execute or unescape the stored markup', () => {
    const { container } = renderCard(makeLead({ source_path: HOSTILE_SOURCE_PATHS[0] }));

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });
});

describe('status transitions ([A2])', () => {
  it.each(LEAD_STATUSES.filter((status) => allowedLeadTransitions(status).length > 0))(
    'offers exactly the legal targets for a %s lead',
    (status) => {
      renderCard(makeLead({ status }));

      const select = screen.getByTestId(`lead-status-select-${LEAD_ID}`);
      const offered = within(select)
        .getAllByRole('option')
        .map((option) => (option as HTMLOptionElement).value)
        .filter(Boolean);

      const expected = LEAD_STATUSES.filter((candidate) => canTransitionLead(status, candidate));

      expect(offered).toEqual(expected);
      // And never the status it already has — a no-op is not a transition.
      expect(offered).not.toContain(status);
    }
  );

  it('offers nothing for a converted lead and says why', () => {
    renderCard(makeLead({ status: 'converted' }));

    expect(screen.queryByTestId(`lead-status-select-${LEAD_ID}`)).toBeNull();
    expect(screen.getByTestId(`lead-status-final-${LEAD_ID}`)).toHaveTextContent('Estado final');
  });

  it('reports the chosen transition to its caller', () => {
    const { onStatusChange } = renderCard(makeLead({ status: 'contacted' }));

    fireEvent.change(screen.getByTestId(`lead-status-select-${LEAD_ID}`), {
      target: { value: 'converted' },
    });

    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange.mock.calls[0][1]).toBe('converted');
  });

  it('labels every status in es-CL', () => {
    renderCard(makeLead({ status: 'new' }));

    const select = screen.getByTestId(`lead-status-select-${LEAD_ID}`);
    expect(within(select).getByRole('option', { name: LEAD_STATUS_LABELS.contacted })).toBeTruthy();
    expect(within(select).getByRole('option', { name: LEAD_STATUS_LABELS.dismissed })).toBeTruthy();
  });

  it('hands the notes draft back on save', () => {
    const { onNotesSave } = renderCard(makeLead());

    fireEvent.change(screen.getByTestId(`lead-notes-${LEAD_ID}`), {
      target: { value: 'Llamar el lunes' },
    });
    fireEvent.click(screen.getByTestId(`lead-notes-save-${LEAD_ID}`));

    expect(onNotesSave).toHaveBeenCalledTimes(1);
    expect(onNotesSave.mock.calls[0][1]).toBe('Llamar el lunes');
  });
});

describe('attribution ([A-new-2])', () => {
  it('flags a landing path that merely repeats the UTM values', () => {
    renderCard(
      makeLead({ source_path: '/pasantias?utm_source=newsletter', utm_source: 'newsletter' })
    );

    expect(screen.getByTestId(`lead-utm-source-${LEAD_ID}`)).toHaveTextContent('newsletter');
    expect(screen.getByTestId(`lead-attribution-shared-${LEAD_ID}`)).toHaveTextContent(
      'una sola observación anotada dos veces'
    );
  });

  it('says nothing about sharing when the path carries no UTM', () => {
    renderCard(makeLead({ source_path: '/pasantias', utm_source: 'newsletter' }));

    expect(screen.queryByTestId(`lead-attribution-shared-${LEAD_ID}`)).toBeNull();
  });

  it('never frames the two fields as corroborating each other', () => {
    const { container } = renderCard(
      makeLead({
        source_path: '/pasantias?utm_source=newsletter',
        utm_source: 'newsletter',
        utm_medium: 'email',
        utm_campaign: 'octubre',
      })
    );

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/confirmad[oa]/i);
    expect(text).not.toMatch(/verificad[oa]/i);
    expect(text).not.toMatch(/corrobora/i);
  });
});

describe('CSV export path ([A-new-3])', () => {
  const pageSource = readFileSync(
    join(__dirname, '..', '..', '..', 'pages', 'admin', 'pasantia-leads.tsx'),
    'utf8'
  );

  it('exports through lib/exportUtils', () => {
    expect(pageSource).toMatch(/from '\.\.\/\.\.\/lib\/exportUtils'/);
    expect(pageSource).toContain('ReportExporter.exportToCSV');
  });

  it('builds no CSV of its own', () => {
    // `csvEscape` → `neutralizeSpreadsheetFormula` is the whole reason the
    // shared exporter is mandatory here: institution, message, source_path and
    // the three utm_* columns are all visitor-typed.
    expect(pageSource).not.toMatch(/\.join\(\s*['"],['"]\s*\)/);
    expect(pageSource).not.toMatch(/new Blob\(/);
    expect(pageSource).not.toContain('text/csv');
    expect(pageSource).not.toContain('createObjectURL');
  });
});
