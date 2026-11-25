/**
 * I4 on the screens (a cell beginning with `=`, `+`, `-` or `@`, or holding HTML, is shown as plain text), the
 * import result (each count, and that they add up to the total), and the reason fields (nothing pre-chosen).
 * Invented people only.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ContactDetails } from '../../components/correos/ContactDetails';
import { AddResult } from '../../components/correos/AddResult';
import { EMPTY_REASON, ReasonFields, reasonComplete, reasonMessage } from '../../components/correos/ReasonFields';
import { Pager } from '../../components/correos/Pager';
import { countOf, formatCount, NOUNS } from '../../lib/correos/labels';
import { REASON_MESSAGES } from '../../lib/correos/reason';
import type { ContactDetail } from '../../lib/correos/contacts';

const HOSTILE: ContactDetail = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'hostil@example.test',
  first_name: '=HYPERLINK("http://x")',
  last_name: '<script>alert(1)</script>',
  organization: '<img src=x onerror=alert(1)>',
  source: 'csv_import',
  legal_basis: 'manual_verified',
  basis_note: '@cmd +1 -1',
  basis_recorded_at: '2026-11-20T12:00:00Z',
  consent_notice_version: null,
  created_at: '2026-11-20T12:00:00Z',
  unsubscribed_at: null,
  erased: false,
  block: { blocked: true, reason: 'complaint', since: '2026-11-21T12:00:00Z' },
  memberships: [
    {
      list_id: '11111111-1111-4111-8111-111111111111', list_name: '<b>Lista</b>', state: 'pending', joined_via: 'csv_import',
      legal_basis: 'manual_verified', basis_note: null, basis_recorded_at: '2026-11-20T12:00:00Z', consent_notice_version: null,
      subscribed_at: null, unsubscribed_at: null, unsubscribed_by: null,
    },
    {
      list_id: '11111111-1111-4111-8111-222222222222', list_name: 'Directivos', state: 'unsubscribed', joined_via: 'manual',
      legal_basis: 'manual_verified', basis_note: null, basis_recorded_at: '2026-11-20T12:00:00Z', consent_notice_version: null,
      subscribed_at: '2026-11-20T12:00:00Z', unsubscribed_at: '2026-11-22T12:00:00Z', unsubscribed_by: 'person',
    },
  ],
};

describe('I4: a person’s cells are shown as plain text', () => {
  const html = renderToStaticMarkup(<ContactDetails contact={HOSTILE} />);

  it('HTML in a cell is escaped, never markup', () => {
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Lista</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('a formula-looking cell shows exactly as typed', () => {
    expect(html).toContain('=HYPERLINK(&quot;http://x&quot;)');
    expect(html).toContain('@cmd +1 -1');
  });

  it('C2: the page shows each list with its state, and the block and why', () => {
    expect(html).toContain('Pendiente');
    expect(html).toContain('Se dio de baja');
    expect(html).toContain('por decisión propia');
    expect(html).toContain('Marcó un correo nuestro como spam');
  });

  it('no Correos screen piece uses dangerouslySetInnerHTML', () => {
    const roots = ['components/correos', 'pages/admin/correos'];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name)) files.push(full);
      }
    };
    for (const root of roots) walk(join(process.cwd(), root));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(readFileSync(file, 'utf8')).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('the import result', () => {
  it('shows each count and that they add up to the total', () => {
    const html = renderToStaticMarkup(
      <AddResult counts={{ total: 12000, accepted: 9000, duplicate: 1500, blocked: 600, left: 400, invalid: 500, contacts_created: 8000, memberships_created: 9000 }} />
    );
    expect(html).toContain('Se dieron de baja por decisión propia, no se volvieron a agregar');
    expect(html).toMatch(/Bloqueadas/);
    expect(html).toMatch(/Direcciones mal escritas/);
    expect(html).toMatch(/suman 12\.000, el total/);
  });

  it('says so when they do not add up', () => {
    const html = renderToStaticMarkup(
      <AddResult counts={{ total: 10, accepted: 1, duplicate: 0, blocked: 0, left: 0, invalid: 0, contacts_created: 1, memberships_created: 1 }} />
    );
    expect(html).toMatch(/suman 1 y el total es 10/);
  });
});

describe('C1 and I2 on the screen: the reason has nothing pre-chosen', () => {
  it('no basis radio is checked at first, and the empty reason is not complete', () => {
    const html = renderToStaticMarkup(<ReasonFields idPrefix="t" value={EMPTY_REASON} onChange={() => undefined} />);
    expect(html).not.toMatch(/\schecked(=""|\s|>)/);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(reasonComplete(EMPTY_REASON)).toBe(false);
    expect(reasonComplete({ legal_basis: 'manual_verified', basis_note: ' ', consent_notice_version: '' })).toBe(false);
    expect(reasonComplete({ legal_basis: 'consent_form', basis_note: 'Nota', consent_notice_version: '' })).toBe(false);
    expect(reasonComplete({ legal_basis: 'consent_form', basis_note: 'Nota', consent_notice_version: '' }, { versionFromForm: false })).toBe(true);
  });
});

describe('counts: one Chilean form, singular and plural', () => {
  it('groups thousands with a dot, always', () => {
    expect([0, 7, 999, 1000, 1200, 11200, 20000, 1234567].map(formatCount)).toEqual(['0', '7', '999', '1.000', '1.200', '11.200', '20.000', '1.234.567']);
    expect(countOf(1, NOUNS.persona)).toBe('1 persona');
    expect(countOf(11200, NOUNS.persona)).toBe('11.200 personas');
  });

  it('the result says «Se revisó 1 usuario» and «Se agregó 1»', () => {
    const html = renderToStaticMarkup(
      <AddResult noun={NOUNS.usuario} counts={{ total: 1, accepted: 1, duplicate: 0, blocked: 0, left: 0, invalid: 0, contacts_created: 1, memberships_created: 1 }} />
    );
    expect(html).toContain('Se revisó 1 usuario.');
    expect(html).toContain('Se agregó 1.');
    expect(html).toContain('role="status"');
    const many = renderToStaticMarkup(
      <AddResult counts={{ total: 1200, accepted: 2, duplicate: 1198, blocked: 0, left: 0, invalid: 0, contacts_created: 2, memberships_created: 2 }} />
    );
    expect(many).toContain('Se revisaron 1.200 filas.');
    expect(many).toContain('Se agregaron 2.');
  });

  it('the page buttons count in the same form', () => {
    const html = renderToStaticMarkup(<Pager page={2} pageSize={25} total={11200} onPageChange={() => undefined} noun={NOUNS.persona} />);
    expect(html).toContain('Mostrando 26–50 de 11.200 personas');
    expect(renderToStaticMarkup(<Pager page={1} pageSize={25} total={1} onPageChange={() => undefined} noun={NOUNS.persona} />)).toContain('Mostrando 1 de 1 persona');
  });
});

describe('the reason error says exactly what is missing', () => {
  it('basis, note and version each by name', () => {
    expect(reasonMessage(EMPTY_REASON)).toBe(`${REASON_MESSAGES.basis} ${REASON_MESSAGES.note}`);
    expect(reasonMessage({ legal_basis: 'manual_verified', basis_note: ' ', consent_notice_version: '' })).toBe(REASON_MESSAGES.note);
    expect(reasonMessage({ legal_basis: '', basis_note: 'Nota', consent_notice_version: '' })).toBe(REASON_MESSAGES.basis);
    expect(reasonMessage({ legal_basis: 'consent_form', basis_note: 'Nota', consent_notice_version: '' })).toBe(REASON_MESSAGES.version);
    expect(reasonMessage({ legal_basis: 'consent_form', basis_note: 'Nota', consent_notice_version: '' }, { versionFromForm: false })).toBeNull();
  });

  it('with showErrors each message sits next to its field', () => {
    const html = renderToStaticMarkup(<ReasonFields idPrefix="t" value={{ legal_basis: 'consent_form', basis_note: '', consent_notice_version: '' }} onChange={() => undefined} showErrors />);
    expect(html).toContain(REASON_MESSAGES.note);
    expect(html).toContain(REASON_MESSAGES.version);
    expect(html).not.toContain(REASON_MESSAGES.basis);
  });
});
