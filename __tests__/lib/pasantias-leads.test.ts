// @vitest-environment node
/**
 * lib/pasantias/leads.ts — the D-03 transition graph and the public form's
 * validation contract.
 *
 * The graph test walks the FULL 4×4 product of statuses rather than listing
 * the five legal edges: a helper that allows one extra move is a lead moving
 * somewhere the plan forbids, and only an exhaustive matrix catches that.
 */
import { describe, it, expect } from 'vitest';
import { COHORT_ID } from '../../lib/pasantias/cohort-public';
import {
  LEAD_FIELD_LIMITS,
  LEAD_NUM_PEOPLE_MAX,
  LEAD_NUM_PEOPLE_MIN,
  LEAD_STATUSES,
  LEAD_VALIDATION_MESSAGES,
  canTransitionLead,
  isLeadStatus,
  sanitizeSourcePath,
  validateLeadSubmission,
  type LeadStatus,
  type LeadSubmissionBody,
} from '../../lib/pasantias/leads';

/** D-03, transcribed independently of the implementation's data structure. */
const ALLOWED_EDGES: ReadonlyArray<readonly [LeadStatus, LeadStatus]> = [
  ['new', 'contacted'],
  ['new', 'dismissed'],
  ['contacted', 'converted'],
  ['contacted', 'dismissed'],
  ['dismissed', 'new'],
];

function isAllowed(from: LeadStatus, to: LeadStatus): boolean {
  return ALLOWED_EDGES.some(([a, b]) => a === from && b === to);
}

function validBody(overrides: Partial<LeadSubmissionBody> = {}): LeadSubmissionBody {
  return {
    cohort: COHORT_ID,
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.com',
    institution: 'Colegio Uno',
    consent: true,
    ...overrides,
  };
}

describe('canTransitionLead — D-03 graph', () => {
  it('allows exactly the five edges the plan defines', () => {
    const allowed = LEAD_STATUSES.flatMap((from) =>
      LEAD_STATUSES.filter((to) => canTransitionLead(from, to)).map((to) => `${from}→${to}`)
    );

    expect(allowed.sort()).toEqual(
      ALLOWED_EDGES.map(([from, to]) => `${from}→${to}`).sort()
    );
  });

  // The exhaustive matrix: 16 pairs, each asserted in both directions of the
  // claim, so neither a missing edge nor an extra one can pass.
  for (const from of LEAD_STATUSES) {
    for (const to of LEAD_STATUSES) {
      const expected = isAllowed(from, to);
      it(`${from} → ${to} is ${expected ? 'allowed' : 'denied'}`, () => {
        expect(canTransitionLead(from, to)).toBe(expected);
      });
    }
  }

  it('converted is terminal', () => {
    for (const to of LEAD_STATUSES) {
      expect(canTransitionLead('converted', to)).toBe(false);
    }
  });

  it('denies a no-op move', () => {
    for (const status of LEAD_STATUSES) {
      expect(canTransitionLead(status, status)).toBe(false);
    }
  });

  it('denies unknown statuses on either side instead of throwing', () => {
    expect(canTransitionLead('pending', 'new')).toBe(false);
    expect(canTransitionLead('new', 'pending')).toBe(false);
    expect(canTransitionLead(null, 'new')).toBe(false);
    expect(canTransitionLead('dismissed', undefined)).toBe(false);
    expect(canTransitionLead(1, 2)).toBe(false);
  });
});

describe('isLeadStatus', () => {
  it('accepts the four statuses the table CHECK allows and nothing else', () => {
    for (const status of LEAD_STATUSES) {
      expect(isLeadStatus(status)).toBe(true);
    }
    expect(isLeadStatus('pending')).toBe(false);
    expect(isLeadStatus('')).toBe(false);
    expect(isLeadStatus(undefined)).toBe(false);
  });
});

describe('validateLeadSubmission — required fields', () => {
  it('accepts a minimal valid submission', () => {
    const result = validateLeadSubmission(validBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.firstName).toBe('Ana');
    expect(result.value.email).toBe('ana@example.com');
    expect(result.value.cohort).toBe(COHORT_ID);
    // Optional fields absent → null, never '' (the columns are nullable text).
    expect(result.value.phone).toBeNull();
    expect(result.value.roleTitle).toBeNull();
    expect(result.value.numPeople).toBeNull();
    expect(result.value.message).toBeNull();
    expect(result.value.utmSource).toBeNull();
  });

  it('reports every missing required field at once, in es-CL', () => {
    const result = validateLeadSubmission({});
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toEqual({
      firstName: LEAD_VALIDATION_MESSAGES.firstNameRequired,
      lastName: LEAD_VALIDATION_MESSAGES.lastNameRequired,
      email: LEAD_VALIDATION_MESSAGES.emailRequired,
      institution: LEAD_VALIDATION_MESSAGES.institutionRequired,
      consent: LEAD_VALIDATION_MESSAGES.consentRequired,
      cohort: LEAD_VALIDATION_MESSAGES.cohortInvalid,
    });
  });

  it('rejects a malformed email', () => {
    const result = validateLeadSubmission(validBody({ email: 'ana@example' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toBe(LEAD_VALIDATION_MESSAGES.emailInvalid);
  });

  it('normalizes the email to lower(btrim(email)) so the table CHECK holds', () => {
    const result = validateLeadSubmission(validBody({ email: '  Ana@Example.COM  ' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.email).toBe('Ana@Example.COM');
    expect(result.value.emailNormalized).toBe('ana@example.com');
    expect(result.value.emailNormalized).toBe(result.value.email.trim().toLowerCase());
  });
});

describe('validateLeadSubmission — consent (D-12)', () => {
  it('requires consent to be strictly true', () => {
    for (const value of [false, undefined, null, 'true', 'on', 1, {}]) {
      const result = validateLeadSubmission(validBody({ consent: value }));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors.consent).toBe(LEAD_VALIDATION_MESSAGES.consentRequired);
    }
  });

  it('defaults the marketing opt-in to false — a default never asserts consent', () => {
    for (const value of [undefined, false, 'true', 'on', 1]) {
      const result = validateLeadSubmission(validBody({ marketingOptIn: value }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.marketingOptIn).toBe(false);
    }
  });

  it('records the marketing opt-in only when it is strictly true', () => {
    const result = validateLeadSubmission(validBody({ marketingOptIn: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.marketingOptIn).toBe(true);
  });
});

describe('validateLeadSubmission — cohort pinning', () => {
  it('rejects any cohort other than the public module id', () => {
    for (const cohort of ['abril-2026', 'noviembre-2026', '', undefined]) {
      const result = validateLeadSubmission(validBody({ cohort }));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors.cohort).toBe(LEAD_VALIDATION_MESSAGES.cohortInvalid);
    }
  });
});

describe('validateLeadSubmission — length caps', () => {
  const cases: ReadonlyArray<[keyof LeadSubmissionBody, number]> = [
    ['firstName', LEAD_FIELD_LIMITS.firstName],
    ['lastName', LEAD_FIELD_LIMITS.lastName],
    ['institution', LEAD_FIELD_LIMITS.institution],
    ['phone', LEAD_FIELD_LIMITS.phone],
    ['roleTitle', LEAD_FIELD_LIMITS.roleTitle],
    ['message', LEAD_FIELD_LIMITS.message],
    ['utmSource', LEAD_FIELD_LIMITS.utm],
    ['utmMedium', LEAD_FIELD_LIMITS.utm],
    ['utmCampaign', LEAD_FIELD_LIMITS.utm],
  ];

  for (const [field, max] of cases) {
    it(`${field} accepts ${max} characters and rejects ${max + 1}`, () => {
      const atLimit = validateLeadSubmission(validBody({ [field]: 'a'.repeat(max) }));
      expect(atLimit.ok).toBe(true);

      const overLimit = validateLeadSubmission(validBody({ [field]: 'a'.repeat(max + 1) }));
      expect(overLimit.ok).toBe(false);
      if (overLimit.ok) return;
      expect(overLimit.errors[field]).toBe(LEAD_VALIDATION_MESSAGES.tooLong(max));
    });
  }

  it('caps the email length before checking its shape', () => {
    const long = `${'a'.repeat(LEAD_FIELD_LIMITS.email)}@example.com`;
    const result = validateLeadSubmission(validBody({ email: long }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toBe(LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.email));
  });
});

describe('validateLeadSubmission — numPeople', () => {
  it('accepts the inclusive bounds of the table CHECK', () => {
    for (const value of [LEAD_NUM_PEOPLE_MIN, LEAD_NUM_PEOPLE_MAX, 12, '12']) {
      const result = validateLeadSubmission(validBody({ numPeople: value }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.numPeople).toBe(Number(value));
    }
  });

  it('treats an absent or empty value as null', () => {
    for (const value of [undefined, null, '']) {
      const result = validateLeadSubmission(validBody({ numPeople: value }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.numPeople).toBeNull();
    }
  });

  it('rejects anything the table CHECK would reject', () => {
    for (const value of [0, -1, LEAD_NUM_PEOPLE_MAX + 1, 2.5, 'doce', '12a', NaN]) {
      const result = validateLeadSubmission(validBody({ numPeople: value }));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors.numPeople).toBe(LEAD_VALIDATION_MESSAGES.numPeopleInvalid);
    }
  });
});

describe('sanitizeSourcePath — browser-reported, therefore untrusted', () => {
  it('keeps a same-site relative path, query and fragment included', () => {
    for (const path of [
      '/pasantias',
      '/pasantias?utm_source=google',
      '/pasantias/barcelona#formulario',
      '/',
      '/ruta%20con%20espacios',
    ]) {
      expect(sanitizeSourcePath(path)).toBe(path);
    }
  });

  it('accepts the cap and drops one character past it', () => {
    const atLimit = `/${'a'.repeat(LEAD_FIELD_LIMITS.sourcePath - 1)}`;
    expect(atLimit).toHaveLength(LEAD_FIELD_LIMITS.sourcePath);
    expect(sanitizeSourcePath(atLimit)).toBe(atLimit);

    expect(sanitizeSourcePath(`${atLimit}a`)).toBeNull();
  });

  it('drops every off-site and injected shape instead of storing it', () => {
    const refused = [
      // Absolute URLs and schemes — no leading `/`.
      'https://evil.example',
      'http://evil.example/pasantias',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      // Protocol-relative: the browser would resolve both against evil.example.
      '//evil.example',
      '//evil.example/pasantias',
      '/\\evil.example',
      // Header/log injection.
      '/pasantias\r\nX-Injected: 1',
      '/pasantias\nX-Injected: 1',
      '/pasantias\tvalue',
      '/pasantias\u0000',
      '/pas antias',
      // Relative-but-not-rooted.
      'pasantias',
      '../pasantias',
      '',
      '   ',
    ];

    for (const value of refused) {
      expect(sanitizeSourcePath(value)).toBeNull();
    }
  });

  it('drops non-strings rather than coercing them', () => {
    for (const value of [undefined, null, 42, true, {}, ['/pasantias']]) {
      expect(sanitizeSourcePath(value)).toBeNull();
    }
  });

  it('trims surrounding whitespace before judging the value', () => {
    expect(sanitizeSourcePath('  /pasantias  ')).toBe('/pasantias');
  });
});

describe('validateLeadSubmission — sourcePath', () => {
  it('carries an accepted path through to the validated lead', () => {
    const result = validateLeadSubmission(validBody({ sourcePath: '/pasantias?utm_source=ig' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sourcePath).toBe('/pasantias?utm_source=ig');
  });

  it('nulls a refused path WITHOUT failing the submission — nobody typed it', () => {
    for (const value of ['https://evil.example', '//evil.example', 'x'.repeat(400), undefined]) {
      const result = validateLeadSubmission(validBody({ sourcePath: value }));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.sourcePath).toBeNull();
      expect(result.errors).toBeUndefined();
    }
  });
});
