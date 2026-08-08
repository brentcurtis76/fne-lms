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
import { formatDateTime } from '../../../lib/signups';
import {
  LEAD_STATUS_LABELS,
  PasantiaLeadCard,
  allowedLeadTransitions,
  type PasantiaLead,
} from '../../../components/admin/PasantiaLeadCard';

const LEAD_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/** Shared by the source-level assertions ([A-new-3], r2 B1/S1). */
const pageSource = readFileSync(
  join(__dirname, '..', '..', '..', 'pages', 'admin', 'pasantia-leads.tsx'),
  'utf8'
);

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

  /**
   * r3 item 2. The `utm_*` columns store DECODED values, the query string in
   * `source_path` stores them ENCODED, and `sanitizeSourcePath` refuses any
   * stored path containing whitespace — so a substring test can never match a
   * multi-word UTM value, and the banner was dead for that whole class of lead.
   */
  it.each([
    ['%20', '/pasantias?utm_campaign=pasantias%20e2e'],
    ['+', '/pasantias?utm_campaign=pasantias+e2e'],
  ])('flags a repeated multi-word UTM value encoded with %s', (_encoding, sourcePath) => {
    renderCard(makeLead({ source_path: sourcePath, utm_campaign: 'pasantias e2e' }));

    expect(screen.getByTestId(`lead-attribution-shared-${LEAD_ID}`)).toHaveTextContent(
      'una sola observación anotada dos veces'
    );
  });

  it('does not claim a repeat when the UTM value merely appears inside the path', () => {
    // `/pasantias` contains the string `pasantias`, but the path carries no
    // `utm_source` at all — the two fields really are independent here.
    renderCard(makeLead({ source_path: '/pasantias', utm_source: 'pasantias' }));

    expect(screen.queryByTestId(`lead-attribution-shared-${LEAD_ID}`)).toBeNull();
  });

  it('does not claim a repeat when the path carries a different value under that key', () => {
    renderCard(
      makeLead({ source_path: '/pasantias?utm_source=facebook', utm_source: 'newsletter' })
    );

    expect(screen.queryByTestId(`lead-attribution-shared-${LEAD_ID}`)).toBeNull();
  });

  it('does not match a UTM value stored under a different key', () => {
    renderCard(
      makeLead({ source_path: '/pasantias?utm_medium=newsletter', utm_source: 'newsletter' })
    );

    expect(screen.queryByTestId(`lead-attribution-shared-${LEAD_ID}`)).toBeNull();
  });

  it.each([null, '/pasantias'])('neither throws nor flags for source_path %s', (sourcePath) => {
    renderCard(makeLead({ source_path: sourcePath, utm_source: 'newsletter' }));

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

describe('brochure_sent_at label (r2 B1)', () => {
  it('says "Programa enviado" in all three places, byte-identical, and never "Ficha"', () => {
    // The label names the document the auto-reply actually mails — the priced
    // programme — never the price-free ficha the visitor downloads themselves.
    // Capitalized "Ficha" is what a UI label would carry; the common noun in
    // comments stays lowercase.
    expect(pageSource).not.toContain('Ficha');

    // Export row key, table header and EMPTY_EXPORT_ROW: exactly three
    // occurrences of the same quoted literal. `ReportExporter.exportToCSV`
    // uses headers as both printed text and row-key path, so the three must
    // stay byte-identical or the CSV silently exports a blank column.
    expect(pageSource.match(/'Programa enviado'/g)).toHaveLength(3);
  });
});

describe('single set of ids per lead (r2 S1)', () => {
  it('the page namespaces its two always-mounted layouts', () => {
    // Tailwind hides one layout with CSS; it does not unmount it. Distinct
    // prefixes are what keep htmlFor bound to the *visible* control.
    expect(pageSource).toContain('domPrefix="desktop-"');
    expect(pageSource).toContain('domPrefix="mobile-"');
  });

  it('two mounts with the page prefixes emit unique ids and testids', () => {
    const lead = makeLead();
    const { container } = render(
      <div>
        <PasantiaLeadCard
          lead={lead}
          domPrefix="desktop-"
          onStatusChange={vi.fn()}
          onNotesSave={vi.fn()}
        />
        <PasantiaLeadCard
          lead={lead}
          domPrefix="mobile-"
          onStatusChange={vi.fn()}
          onNotesSave={vi.fn()}
        />
      </div>
    );

    const ids = Array.from(container.querySelectorAll('[id]')).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    const testIds = Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid')
    );
    expect(testIds.length).toBeGreaterThan(0);
    expect(new Set(testIds).size).toBe(testIds.length);

    // Every label points at exactly one control — the one beside it.
    const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.htmlFor).toBeTruthy();
      expect(container.querySelectorAll(`[id="${label.htmlFor}"]`)).toHaveLength(1);
    }
  });

  /**
   * r3 item 3. The assertion above renders one `new` lead, so it never sees the
   * terminal branch — where the <select> is replaced by a <div> and the label
   * above it used to keep pointing at an id no longer in the document.
   */
  it.each(LEAD_STATUSES)('every label[for] resolves for a %s lead', (status) => {
    const { container } = render(
      <PasantiaLeadCard
        lead={makeLead({ status })}
        onStatusChange={vi.fn()}
        onNotesSave={vi.fn()}
      />
    );

    const labels = Array.from(container.querySelectorAll('label')) as HTMLLabelElement[];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.htmlFor).toBeTruthy();
      expect(container.querySelectorAll(`[id="${label.htmlFor}"]`)).toHaveLength(1);
    }

    // The caption is still on screen for a terminal lead; it just is not a label.
    expect(within(container).getByText('Cambiar estado')).toBeInTheDocument();
  });
});

describe('programme-sent timestamp on the shared card (r2 S2)', () => {
  it('renders the sent timestamp under "Programa enviado"', () => {
    const sentAt = '2026-08-05T15:30:00.000Z';
    renderCard(makeLead({ brochure_sent_at: sentAt }));

    expect(screen.getByText('Programa enviado')).toBeInTheDocument();
    // Exact textContent, not toHaveTextContent: the es-CL formatter emits a
    // narrow no-break space that whitespace normalization would mangle.
    expect(screen.getByTestId(`lead-brochure-sent-${LEAD_ID}`).textContent).toBe(
      formatDateTime(sentAt)
    );
  });

  it('shows the — empty state when nothing has been sent', () => {
    renderCard(makeLead({ brochure_sent_at: null }));

    expect(screen.getByTestId(`lead-brochure-sent-${LEAD_ID}`)).toHaveTextContent('—');
  });
});
