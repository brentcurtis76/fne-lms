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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEAD_STATUSES, canTransitionLead } from '../../../lib/pasantias/leads';
import { formatDateTime } from '../../../lib/signups';
import { ReportExporter } from '../../../lib/exportUtils';
import {
  LEAD_CSV_HEADERS,
  LEAD_EXPORT_MAX_CONTACTS,
  LEAD_EXPORT_MESSAGES,
  LEAD_EXPORT_TOO_LARGE_CODE,
  LEAD_STATUS_LABELS,
  LeadExportError,
  LeadProgramLabels,
  PasantiaLeadCard,
  allowedLeadTransitions,
  collectLeadExportSnapshot,
  leadCsvRow,
  leadExportQueryString,
  leadProgramLabels,
  leadsQueryString,
  timestampMicros,
  type LeadExportSnapshotPayload,
  type PasantiaLead,
} from '../../../components/admin/PasantiaLeadCard';

const LEAD_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/** Shared by the source-level assertions ([A-new-3], r2 B1/S1). */
const pageSource = readFileSync(
  join(__dirname, '..', '..', '..', 'pages', 'admin', 'pasantia-leads.tsx'),
  'utf8'
);

/** Since PASANT-B004 the CSV row builder lives beside the card, so the guards read it too. */
const cardSource = readFileSync(
  join(__dirname, '..', '..', '..', 'components', 'admin', 'PasantiaLeadCard.tsx'),
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
    for (const source of [pageSource, cardSource]) {
      expect(source).not.toMatch(/\.join\(\s*['"],['"]\s*\)/);
      expect(source).not.toMatch(/new Blob\(/);
      expect(source).not.toContain('text/csv');
      expect(source).not.toContain('createObjectURL');
    }
  });

  it('downloads only what the complete-export check returned', () => {
    // The download is built from the collector's result and nothing else: no
    // `leads` (the page on screen) and no rows accumulated outside it.
    expect(pageSource).toContain('const contacts = await collectLeadExportSnapshot(');
    expect(pageSource).toContain('data: contacts.map(leadCsvRow)');
    expect(pageSource).not.toMatch(/data:\s*leads\b/);
    // The call, not the identifier: handleExport's JSDoc names
    // `ReportExporter.exportToCSV` before the collector runs. Exactly one call,
    // so a second download path cannot hide behind the first.
    const collectorCall = pageSource.indexOf('const contacts = await collectLeadExportSnapshot(');
    const exportCall = pageSource.indexOf('ReportExporter.exportToCSV(');
    expect(pageSource.split('ReportExporter.exportToCSV(')).toHaveLength(2);
    expect(collectorCall).toBeGreaterThan(-1);
    expect(exportCall).toBeGreaterThan(-1);
    expect(collectorCall).toBeLessThan(exportCall);
  });

  it('exports from one snapshot request, and no paged walker is left (C009)', () => {
    // The removed walker's name must not survive anywhere a caller could reach
    // it: a stale caller fails loudly instead of quietly paging again.
    for (const source of [pageSource, cardSource]) {
      expect(source).not.toContain('collectAllMatchingLeads');
      expect(source).not.toContain('LEAD_EXPORT_PAGE_SIZE');
      expect(source).not.toContain('LEAD_EXPORT_MAX_PAGES');
    }
    // One export query builder call, and the screen's paged one is not used for it.
    expect(pageSource.split('leadExportQueryString(')).toHaveLength(2);
    const handleExport = pageSource.slice(
      pageSource.indexOf('const handleExport = async'),
      pageSource.indexOf('ReportExporter.exportToCSV(')
    );
    expect(handleExport).toContain('leadExportQueryString(exportFilters)');
    expect(handleExport).not.toContain('leadsQueryString(');
    expect(handleExport.split('await fetch(')).toHaveLength(2);
  });
});

describe('brochure_sent_at label (r2 B1)', () => {
  it('says "Programa enviado" in all three places, byte-identical, and never "Ficha"', () => {
    // The label names the document the auto-reply actually mails — the priced
    // programme — never the price-free ficha the visitor downloads themselves.
    // Capitalized "Ficha" is what a UI label would carry; the common noun in
    // comments stays lowercase.
    expect(pageSource).not.toContain('Ficha');
    expect(cardSource).not.toContain('Ficha');

    // Table header (page), CSV header and CSV row key (card, since PASANT-B004
    // replaced EMPTY_EXPORT_ROW with LEAD_CSV_HEADERS): exactly three
    // occurrences of the same quoted literal. `ReportExporter.exportToCSV`
    // uses headers as both printed text and row-key path, so they must stay
    // byte-identical or the CSV silently exports a blank column.
    expect(pageSource.match(/'Programa enviado'/g)).toHaveLength(1);
    expect(cardSource.match(/'Programa enviado'/g)).toHaveLength(2);
    expect(LEAD_CSV_HEADERS).toContain('Programa enviado');
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

// ---------------------------------------------------------------------------
// PASANT-B004 (C009) — program interests, CSV content and the complete export.
// ---------------------------------------------------------------------------

/** Program names typed here, independently of `cohort-public`, so a drift there fails here. */
const INSPIRA_NAME = 'Pasantía INSPIRA';
const MIRADA_NAME = 'INSPIRA Mirada Profunda';

function interestRow(program: string, consentAt: string, version: string) {
  return { program, consent_accepted_at: consentAt, consent_notice_version: version, created_at: consentAt };
}

const BOTH_PROGRAMS = [
  interestRow('inspira', '2026-10-10T09:00:00.000Z', 'v2'),
  interestRow('mirada-profunda', '2026-10-11T09:30:00.000Z', 'v3'),
];

describe('program labels (C009-programs)', () => {
  it('names both programs of a contact that asked about both, once each', () => {
    const labels = leadProgramLabels(
      makeLead({ cohort: 'enero-2027', program_interests: BOTH_PROGRAMS })
    );

    expect(labels.map((entry) => entry.label)).toEqual([INSPIRA_NAME, MIRADA_NAME]);
    expect(labels.every((entry) => entry.kind === 'program')).toBe(true);
  });

  it('names exactly the one program of a single-interest contact', () => {
    const labels = leadProgramLabels(
      makeLead({ cohort: 'enero-2027', program_interests: [BOTH_PROGRAMS[1]] })
    );

    expect(labels.map((entry) => entry.label)).toEqual([MIRADA_NAME]);
  });

  it('labels a pre-January contact as history, never as a program', () => {
    const labels = leadProgramLabels(makeLead({ cohort: 'octubre-2026', program_interests: [] }));

    expect(labels).toHaveLength(1);
    expect(labels[0].kind).toBe('historical');
    expect(labels[0].label).toContain('Histórico');
    expect(labels[0].label).toContain('octubre-2026');
    expect(labels[0].label).toContain('sin programa registrado');
    expect(labels[0].label).not.toContain('INSPIRA');
  });

  it('treats a contact without the interests field like one without interests', () => {
    // A PATCH response carries no interests; the label must not invent one.
    const labels = leadProgramLabels(makeLead({ cohort: 'octubre-2026', program_interests: undefined }));

    expect(labels[0].kind).toBe('historical');
  });

  it('labels a January contact without an interest row as unclassified', () => {
    const labels = leadProgramLabels(makeLead({ cohort: 'enero-2027', program_interests: [] }));

    expect(labels).toEqual([
      { key: 'unclassified', label: 'Sin clasificar · sin programa registrado', kind: 'unclassified' },
    ]);
  });

  it('shows an unexpected stored program as inert text, with a DOM-safe key', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const lead = makeLead({
      cohort: 'enero-2027',
      program_interests: [interestRow(hostile, '2026-10-10T09:00:00.000Z', 'v2')],
    });

    const labels = leadProgramLabels(lead);
    expect(labels[0].kind).toBe('unknown');
    expect(labels[0].key).toBe('unknown-0');

    const { container } = render(<LeadProgramLabels lead={lead} testId="labels" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('labels')).toHaveTextContent(hostile);
  });

  it('the card lists every interest with its own consent evidence', () => {
    renderCard(makeLead({ cohort: 'enero-2027', program_interests: BOTH_PROGRAMS }));

    const inspira = screen.getByTestId(`lead-program-inspira-${LEAD_ID}`);
    const mirada = screen.getByTestId(`lead-program-mirada-profunda-${LEAD_ID}`);

    expect(inspira).toHaveTextContent(INSPIRA_NAME);
    expect(inspira).toHaveTextContent('versión v2');
    expect(inspira.textContent).toContain(formatDateTime(BOTH_PROGRAMS[0].consent_accepted_at));
    expect(mirada).toHaveTextContent(MIRADA_NAME);
    expect(mirada).toHaveTextContent('versión v3');
    expect(mirada.textContent).toContain(formatDateTime(BOTH_PROGRAMS[1].consent_accepted_at));
  });

  it('the card says a historical contact has no program and assigns none', () => {
    renderCard(makeLead({ cohort: 'octubre-2026', program_interests: [] }));

    expect(screen.getByTestId(`lead-program-historical-${LEAD_ID}`)).toHaveTextContent('Histórico');
    expect(screen.getByTestId(`lead-programs-${LEAD_ID}`)).not.toHaveTextContent('INSPIRA');
    expect(screen.getByText(/no se le asigna ninguno/)).toBeInTheDocument();
  });

  it('the page shows the same labels on desktop and mobile', () => {
    expect(pageSource).toContain('testId={`pasantia-lead-programs-${lead.id}`}');
    expect(pageSource).toContain('testId={`pasantia-lead-programs-mobile-${lead.id}`}');
  });
});

describe('leadsQueryString', () => {
  it('carries every filter plus the page, and nothing for an empty filter', () => {
    expect(
      leadsQueryString({ status: 'contacted', search: 'Pérez & Co', program: 'inspira' }, 3, 500)
    ).toBe('status=contacted&search=P%C3%A9rez+%26+Co&program=inspira&page=3&pageSize=500');
    expect(leadsQueryString({ status: null, search: '', program: null }, 1, 50)).toBe(
      'page=1&pageSize=50'
    );
  });
});

describe('leadExportQueryString (C009)', () => {
  it('carries the same filters plus export=1, and never a page', () => {
    expect(
      leadExportQueryString({ status: 'contacted', search: 'Pérez & Co', program: 'inspira' })
    ).toBe('status=contacted&search=P%C3%A9rez+%26+Co&program=inspira&export=1');
    expect(leadExportQueryString({ status: null, search: '', program: 'sin-programa' })).toBe(
      'program=sin-programa&export=1'
    );
    expect(leadExportQueryString({ status: null, search: '', program: null })).toBe('export=1');
  });

  it('encodes the filters exactly as the screen query does', () => {
    const filters = { status: 'new' as const, search: 'a,b)c "x"', program: 'mirada-profunda' };
    const screen = new URLSearchParams(leadsQueryString(filters, 1, 50));
    const exported = new URLSearchParams(leadExportQueryString(filters));

    for (const key of ['status', 'search', 'program']) {
      expect(exported.get(key)).toBe(screen.get(key));
    }
    expect(exported.has('page')).toBe(false);
    expect(exported.has('pageSize')).toBe(false);
  });
});

/** RFC 4180, independently of the exporter: quoted fields, doubled quotes, embedded newlines. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // A bare CR outside quotes is a row break to spreadsheet readers too.
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      if (char === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += char;
    }
  }
  record.push(field);
  records.push(record);
  return records;
}

/** Run the SHARED exporter and capture the text it would have downloaded. */
function exportCsvText(leads: PasantiaLead[]): string {
  const captured: string[] = [];
  class CapturingBlob {
    constructor(parts: unknown[]) {
      captured.push(parts.map(String).join(''));
    }
  }
  vi.stubGlobal('Blob', CapturingBlob);
  const urlStatics = URL as unknown as { createObjectURL?: unknown };
  const originalCreateObjectURL = urlStatics.createObjectURL;
  urlStatics.createObjectURL = vi.fn(() => 'blob:synthetic');
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    ReportExporter.exportToCSV({
      filename: 'synthetic',
      title: 'synthetic',
      headers: [...LEAD_CSV_HEADERS],
      data: leads.map(leadCsvRow),
    });
  } finally {
    click.mockRestore();
    urlStatics.createObjectURL = originalCreateObjectURL;
    vi.unstubAllGlobals();
  }
  expect(captured).toHaveLength(1);
  return captured[0];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CSV content through the shared exporter (C009-complete-export)', () => {
  it('row keys are exactly the headers, so no column exports blank', () => {
    expect(Object.keys(leadCsvRow(makeLead()))).toEqual([...LEAD_CSV_HEADERS]);
    expect(new Set(LEAD_CSV_HEADERS).size).toBe(LEAD_CSV_HEADERS.length);
  });

  it('exports both program names in one cell for a two-interest contact', () => {
    const row = leadCsvRow(makeLead({ cohort: 'enero-2027', program_interests: BOTH_PROGRAMS }));

    expect(row.Programas).toBe(`${INSPIRA_NAME}; ${MIRADA_NAME}`);
    expect(row.Cohorte).toBe('enero-2027');
  });

  it('exports the historical label, not a program, for a pre-January contact', () => {
    const row = leadCsvRow(makeLead({ cohort: 'octubre-2026', program_interests: [] }));

    expect(row.Programas).toContain('Histórico');
    expect(row.Programas).not.toContain('INSPIRA');
  });

  it('an empty export is a valid CSV holding only the headers', () => {
    const records = parseCsv(exportCsvText([]));

    expect(records).toEqual([[...LEAD_CSV_HEADERS]]);
  });

  it('keeps hostile cells inside their own field and neutralizes every formula', () => {
    const hostile = makeLead({
      // Embedded, not leading: `leadFullName` trims the ends.
      first_name: 'Ana\tTab',
      institution: 'Colegio, "Uno"',
      role_title: '-2+3',
      message: 'línea 1\nlínea 2',
      notes: 'antes\rdespués',
      utm_source: '=HYPERLINK("http://example.test")',
      utm_medium: '  +SUM(1;2)',
      utm_campaign: '@cmd',
      source_path: '/pasantias?q=<script>',
    });
    const plain = makeLead({ id: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', email: 'b@example.com' });

    const records = parseCsv(exportCsvText([hostile, plain]));

    // Header + two rows, every row exactly as wide as the header: no cell
    // spilled into a neighbour or onto a new line.
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record).toHaveLength(LEAD_CSV_HEADERS.length);
    }

    const cell = (record: string[], header: (typeof LEAD_CSV_HEADERS)[number]) =>
      record[LEAD_CSV_HEADERS.indexOf(header)];
    const row = records[1];

    expect(cell(row, 'Institución')).toBe('Colegio, "Uno"');
    expect(cell(row, 'Mensaje')).toBe('línea 1\nlínea 2');
    // A bare CR would end the row early in a spreadsheet; it arrives as a newline
    // inside the quoted field instead.
    expect(cell(row, 'Notas')).toBe('antes\ndespués');
    expect(cell(row, 'UTM source')).toBe('\'=HYPERLINK("http://example.test")');
    expect(cell(row, 'UTM medium')).toBe("'  +SUM(1;2)");
    expect(cell(row, 'UTM campaign')).toBe("'@cmd");
    expect(cell(row, 'Cargo')).toBe("'-2+3");
    expect(cell(row, 'Nombre')).toBe("'Ana\tTab Pérez");
    expect(cell(row, 'Ruta de origen')).toBe('/pasantias?q=<script>');

    // And nothing anywhere in the file opens a formula.
    for (const record of records.slice(1)) {
      for (const value of record) {
        expect(value).not.toMatch(/^\s*[=+\-@]/);
      }
    }
    expect(cell(records[2], 'Email')).toBe('b@example.com');
  });
});

describe('timestampMicros', () => {
  it('keeps the microseconds Date.parse would drop', () => {
    const a = timestampMicros('2026-10-01T12:00:00.000001+00:00');
    const b = timestampMicros('2026-10-01T12:00:00.000002+00:00');

    expect(a).not.toBeNull();
    expect(b! - a!).toBe(1);
  });

  it('reads the offsets and fraction lengths PostgreSQL emits as the same instant', () => {
    const expected = timestampMicros('2026-10-01T12:00:00.5Z');

    expect(timestampMicros('2026-10-01T12:00:00.500000+00:00')).toBe(expected);
    expect(timestampMicros('2026-10-01T09:00:00.5-03')).toBe(expected);
    expect(timestampMicros('2026-10-01 12:00:00.5+0000')).toBe(expected);
  });

  it.each([null, '', 'ayer', '2026-10-01', '2026-10-01T12:00:00'])('refuses %j', (value) => {
    expect(timestampMicros(value)).toBeNull();
  });
});

/**
 * A synthetic table of `n` contacts in the API's order. Every seven contacts
 * share one timestamp, so page boundaries of 500 fall INSIDE runs of equal
 * timestamps — the case where an order without a tie-break repeats and skips.
 */
function syntheticContacts(n: number): PasantiaLead[] {
  const base = Date.UTC(2026, 9, 1, 12, 0, 0);
  const rows = Array.from({ length: n }, (_, index) => {
    const group = Math.floor(index / 7);
    const createdAt = `${new Date(base + group * 1000).toISOString().slice(0, 19)}.123456+00:00`;
    return makeLead({
      id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      email: `escala-${index}@example.com`,
      created_at: createdAt,
      cohort: index % 5 === 0 ? 'octubre-2026' : 'enero-2027',
      program_interests:
        index % 5 === 0 ? [] : index % 3 === 0 ? BOTH_PROGRAMS : [BOTH_PROGRAMS[index % 2]],
    });
  });
  // Newest first, id descending within a timestamp — the API's documented order,
  // computed here with plain code-unit comparison (same format and offset throughout).
  const descending = (x: string, y: string) => (x < y ? 1 : x > y ? -1 : 0);
  return rows.sort((a, b) =>
    a.created_at === b.created_at ? descending(a.id, b.id) : descending(a.created_at, b.created_at)
  );
}

/** A well-behaved snapshot answer over a fixed table, counting its calls. */
function snapshotServer(rows: PasantiaLead[]) {
  const fetchSnapshot = vi.fn(
    async (): Promise<LeadExportSnapshotPayload> => ({ snapshot: true, total: rows.length, leads: rows })
  );
  return { fetchSnapshot };
}

/** A fixed answer, malformed on purpose, through the collector's own type. */
function answering(payload: unknown) {
  return vi.fn(async () => payload as LeadExportSnapshotPayload);
}

describe('collectLeadExportSnapshot (C009 snapshot, C009-scale unit layer)', () => {
  it('returns every one of 1205 contacts exactly once, after exactly one request', async () => {
    const rows = syntheticContacts(1205);
    const { fetchSnapshot } = snapshotServer(rows);

    const collected = await collectLeadExportSnapshot(fetchSnapshot);

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(collected).toHaveLength(1205);
    expect(new Set(collected.map((lead) => lead.id)).size).toBe(1205);
    expect(collected[0].id).toBe(rows[0].id);
    expect(collected[1204].id).toBe(rows[1204].id);
    expect(new Set(collected.map((lead) => lead.email))).toEqual(
      new Set(rows.map((lead) => lead.email))
    );
  });

  it('the 1205-contact CSV has 1205 data rows with every label kind', async () => {
    const rows = syntheticContacts(1205);
    const collected = await collectLeadExportSnapshot(snapshotServer(rows).fetchSnapshot);

    const records = parseCsv(exportCsvText(collected));
    const programs = records.slice(1).map((record) => record[LEAD_CSV_HEADERS.indexOf('Programas')]);

    expect(records).toHaveLength(1206);
    expect(programs).toContain(`${INSPIRA_NAME}; ${MIRADA_NAME}`);
    expect(programs).toContain(INSPIRA_NAME);
    expect(programs).toContain(MIRADA_NAME);
    expect(programs.some((value) => value.startsWith('Histórico'))).toBe(true);
  });

  it('an empty match is an empty export, after one request', async () => {
    const { fetchSnapshot } = snapshotServer([]);

    await expect(collectLeadExportSnapshot(fetchSnapshot)).resolves.toEqual([]);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('keeps the paged export’s 100 000-contact ceiling and the API’s 413 code', () => {
    expect(LEAD_EXPORT_MAX_CONTACTS).toBe(100_000);
    expect(LEAD_EXPORT_MAX_CONTACTS).toBe(500 * 200);
    expect(LEAD_EXPORT_TOO_LARGE_CODE).toBe('LEADS_EXPORT_TOO_LARGE');
  });

  it('accepts exactly 100 000 contacts, the ceiling itself', async () => {
    const createdAt = '2026-10-01T12:00:00.123456+00:00';
    const rows = Array.from({ length: 100_000 }, (_, i) =>
      makeLead({
        id: `00000000-0000-4000-8000-${(99_999 - i).toString(16).padStart(12, '0')}`,
        created_at: createdAt,
        program_interests: [],
      })
    );

    const collected = await collectLeadExportSnapshot(snapshotServer(rows).fetchSnapshot);

    expect(collected).toHaveLength(100_000);
  });

  it('refuses 100 001 as too many, not as incomplete', async () => {
    const fetchSnapshot = answering({ snapshot: true, total: 100_001, leads: [] });

    await expect(collectLeadExportSnapshot(fetchSnapshot)).rejects.toThrow(
      LEAD_EXPORT_MESSAGES.tooLarge
    );
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  const SIX = () => syntheticContacts(6);

  it.each<[string, () => unknown]>([
    ['no payload', () => null],
    ['an array payload', () => SIX()],
    ['no snapshot marker', () => ({ total: 6, leads: SIX() })],
    ['a marker that is not exactly true', () => ({ snapshot: 'true', total: 6, leads: SIX() })],
    ['an extra key (a paged answer)', () => ({ snapshot: true, total: 6, leads: SIX(), pagination: {} })],
    ['no total', () => ({ snapshot: true, leads: SIX(), watermark: null })],
    ['a negative total', () => ({ snapshot: true, total: -1, leads: [] })],
    ['a fractional total', () => ({ snapshot: true, total: 5.5, leads: SIX() })],
    ['a string total', () => ({ snapshot: true, total: '6', leads: SIX() })],
    ['leads not an array', () => ({ snapshot: true, total: 6, leads: {} })],
    ['fewer rows than the total (truncated)', () => ({ snapshot: true, total: 6, leads: SIX().slice(0, 5) })],
    ['more rows than the total', () => ({ snapshot: true, total: 5, leads: SIX() })],
    [
      'a repeated contact',
      () => {
        const rows = SIX();
        rows[3] = rows[2];
        return { snapshot: true, total: 6, leads: rows };
      },
    ],
    [
      'an id that is not a uuid',
      () => {
        const rows = SIX();
        rows[3] = { ...rows[3], id: 'not-a-uuid' };
        return { snapshot: true, total: 6, leads: rows };
      },
    ],
    [
      'a null row',
      () => {
        const rows: (PasantiaLead | null)[] = SIX();
        rows[1] = null;
        return { snapshot: true, total: 6, leads: rows };
      },
    ],
    [
      'a row without its interests list',
      () => {
        const rows = SIX();
        rows[4] = { ...rows[4], program_interests: undefined };
        return { snapshot: true, total: 6, leads: rows };
      },
    ],
    [
      'rows out of the stable order',
      () => {
        const rows = SIX();
        [rows[3], rows[4]] = [rows[4], rows[3]];
        return { snapshot: true, total: 6, leads: rows };
      },
    ],
    [
      'an unreadable created_at',
      () => {
        const rows = SIX();
        rows[2] = { ...rows[2], created_at: 'ayer' };
        return { snapshot: true, total: 6, leads: rows };
      },
    ],
  ])('refuses %s as incomplete, after one request', async (_label, payload) => {
    const fetchSnapshot = answering(payload());

    await expect(collectLeadExportSnapshot(fetchSnapshot)).rejects.toThrow(
      LEAD_EXPORT_MESSAGES.incomplete
    );
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('propagates a refused request (an expired session) and returns nothing', async () => {
    const fetchSnapshot = vi.fn(async (): Promise<LeadExportSnapshotPayload> => {
      throw new LeadExportError('Unauthorized. No se descargó ningún archivo.');
    });

    await expect(collectLeadExportSnapshot(fetchSnapshot)).rejects.toThrow('Unauthorized');
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });
});
