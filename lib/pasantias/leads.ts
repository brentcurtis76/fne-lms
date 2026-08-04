/**
 * Pasantías INSPIRA leads — status transition graph + submission validation.
 *
 * The transition graph (D-03) is AUTHORITATIVE AT THE API BOUNDARY, not in
 * SQL. `pasantias_leads` grants no authenticated write of any kind (D-04), so
 * every mutation reaches the table through a service-role client inside a
 * guarded API route, and every one of those routes asks `canTransitionLead`
 * first. The table's own CHECK constrains the SET of legal statuses; it says
 * nothing about which moves between them are legal — that is this file's job.
 *
 * Validation lives here too so the public route and its tests share one
 * definition of "a well-formed lead". Nothing in this module touches the
 * database, sends mail, or imports `cohort-commercial` (D-01).
 */
import { COHORT_ID } from './cohort-public';
import { isValidEmail, normalizeEmail, normalizeText } from '../signups';

/** The four statuses the table's CHECK constraint allows. */
export const LEAD_STATUSES = ['new', 'contacted', 'converted', 'dismissed'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === 'string' && (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * D-03, verbatim: `new→contacted`, `new→dismissed`, `contacted→converted`,
 * `contacted→dismissed`, `dismissed→new` (admin re-open, or an automatic
 * re-open when the person submits the public form again). `converted` is
 * terminal — nothing leaves it.
 *
 * A Record over every status (not a lookup with a default) so that adding a
 * status forces an explicit decision about its outgoing edges.
 */
const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ['contacted', 'dismissed'],
  contacted: ['converted', 'dismissed'],
  converted: [],
  dismissed: ['new'],
};

/**
 * Whether a lead may move from one status to another.
 *
 * Unknown statuses are denied rather than thrown on: callers pass values read
 * straight out of a row or a request body. A no-op move (`from === to`) is
 * also denied — it is never a transition, and a caller that wants "leave the
 * status alone" must not write the column at all.
 */
export function canTransitionLead(from: unknown, to: unknown): boolean {
  if (!isLeadStatus(from) || !isLeadStatus(to)) {
    return false;
  }
  return LEAD_TRANSITIONS[from].includes(to);
}

/**
 * Length caps for the public endpoint. The table stores unbounded `text`, so
 * these are the only bound on what an anonymous caller can push into a row.
 */
export const LEAD_FIELD_LIMITS = {
  firstName: 80,
  lastName: 80,
  email: 140,
  institution: 140,
  phone: 40,
  message: 1000,
  /** Not one of the six caps the phase criteria name — see roleTitle below. */
  roleTitle: 140,
  utm: 140,
  sourcePath: 200,
} as const;

export const LEAD_NUM_PEOPLE_MIN = 1;
export const LEAD_NUM_PEOPLE_MAX = 60;

/** Shape the public form posts. Every field arrives untrusted. */
export interface LeadSubmissionBody {
  cohort?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  institution?: unknown;
  phone?: unknown;
  roleTitle?: unknown;
  numPeople?: unknown;
  message?: unknown;
  consent?: unknown;
  marketingOptIn?: unknown;
  /** Where on the site the form was submitted from. Browser-reported. */
  sourcePath?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
  /** Honeypot. Handled by the route before validation ever runs. */
  website?: unknown;
}

/** A submission that passed validation. Ready to become column values. */
export interface ValidatedLead {
  cohort: string;
  firstName: string;
  lastName: string;
  /** Trimmed, original casing — what the person typed. */
  email: string;
  /** `lower(btrim(email))`, matching the table's CHECK constraint. */
  emailNormalized: string;
  institution: string;
  phone: string | null;
  roleTitle: string | null;
  numPeople: number | null;
  message: string | null;
  /** Optional and defaulting to false: a default may never assert consent. */
  marketingOptIn: boolean;
  /** Same-site relative path, or null when absent or refused — see `sanitizeSourcePath`. */
  sourcePath: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/**
 * Both members declare both fields (one of them as `undefined`) because this
 * repo compiles with `strict: false`: without `strictNullChecks`, TypeScript
 * does not narrow a union by a boolean-literal discriminant on the false
 * branch, so `result.errors` would not type-check after `if (!result.ok)`.
 */
export type LeadValidationResult =
  | { ok: true; value: ValidatedLead; errors?: undefined }
  | { ok: false; value?: undefined; errors: Record<string, string> };

/** es-CL messages, keyed by the request-body field they belong to. */
export const LEAD_VALIDATION_MESSAGES = {
  firstNameRequired: 'Ingresa tu nombre.',
  lastNameRequired: 'Ingresa tu apellido.',
  emailRequired: 'Ingresa tu correo electrónico.',
  emailInvalid: 'El formato del correo electrónico no es válido.',
  institutionRequired: 'Ingresa tu institución.',
  consentRequired: 'Debes autorizar el tratamiento de tus datos para enviar el formulario.',
  cohortInvalid: 'La cohorte indicada no corresponde a la pasantía vigente.',
  numPeopleInvalid: `Indica un número de participantes entre ${LEAD_NUM_PEOPLE_MIN} y ${LEAD_NUM_PEOPLE_MAX}.`,
  tooLong: (max: number) => `Máximo ${max} caracteres.`,
} as const;

/** Trim, collapse whitespace, and turn "" into null for the optional columns. */
function optionalText(value: unknown): string | null {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

/**
 * `source_path` — attribution only, and the least trustworthy field on the
 * form: the browser reports it, so a hand-crafted POST can put anything there.
 * A6b reads it back into the admin surface, so an absolute URL stored here
 * would later render as an off-site link the admin did not choose.
 *
 * Accepted: a same-site relative path — starts with `/`, not `//` or `/\`
 * (both of which browsers resolve as protocol-relative to another host), and
 * free of whitespace and control characters. Requiring the leading `/` is what
 * rules out every scheme, `https:` and `javascript:` alike.
 *
 * Anything else is DROPPED to null rather than rejected with a 400. Nobody
 * typed this value, so there is no form field to render an error against, and
 * a visitor must never lose a submission over telemetry they never saw. The
 * over-cap case is dropped for the same reason, which is why this field has no
 * entry in `LEAD_VALIDATION_MESSAGES`. Losing one lead's attribution is the
 * cheap failure; losing the lead is not.
 *
 * Note this runs on the RAW string and rewrites nothing: the value is returned
 * byte-identical or not at all. `normalizeText` would collapse `\s+` to a
 * single space, and a `trim()` would strip a surrounding CR/LF — either turns
 * an injected value into a valid-looking path instead of refusing it.
 * Surrounding whitespace is therefore a REFUSAL rather than something to clean
 * up: a browser reporting `location.pathname` never produces it, so its
 * presence says the value was hand-crafted. The cap applies to that same raw
 * length. A6b still escapes on render, as it must for any stored string.
 */
export function sanitizeSourcePath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  // The RAW value throughout — no trim, no normalization (see above).
  const path = value;
  if (!path || path.length > LEAD_FIELD_LIMITS.sourcePath) {
    return null;
  }
  // Whitespace (incl. CR/LF/tab, leading and trailing alike), the C0 control
  // block and DEL. A genuine path percent-encodes all of these.
  if (/[\s\u0000-\u001f\u007f]/.test(path)) {
    return null;
  }
  if (path[0] !== '/' || path[1] === '/' || path[1] === '\\') {
    return null;
  }
  return path;
}

/**
 * Validate a public lead submission.
 *
 * Every problem is collected rather than returned on the first failure: the
 * form renders per-field errors, so a one-error-at-a-time response would make
 * a visitor resubmit once per mistake.
 */
export function validateLeadSubmission(body: LeadSubmissionBody): LeadValidationResult {
  const errors: Record<string, string> = {};

  const cohort = normalizeText(body.cohort);
  const firstName = normalizeText(body.firstName);
  const lastName = normalizeText(body.lastName);
  const email = normalizeText(body.email);
  const emailNormalized = normalizeEmail(email);
  const institution = normalizeText(body.institution);
  const phone = optionalText(body.phone);
  const roleTitle = optionalText(body.roleTitle);
  const message = optionalText(body.message);
  const utmSource = optionalText(body.utmSource);
  const utmMedium = optionalText(body.utmMedium);
  const utmCampaign = optionalText(body.utmCampaign);
  // Never contributes an error — an unusable value becomes null (see above).
  const sourcePath = sanitizeSourcePath(body.sourcePath);

  if (!firstName) {
    errors.firstName = LEAD_VALIDATION_MESSAGES.firstNameRequired;
  } else if (firstName.length > LEAD_FIELD_LIMITS.firstName) {
    errors.firstName = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.firstName);
  }

  if (!lastName) {
    errors.lastName = LEAD_VALIDATION_MESSAGES.lastNameRequired;
  } else if (lastName.length > LEAD_FIELD_LIMITS.lastName) {
    errors.lastName = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.lastName);
  }

  if (!email) {
    errors.email = LEAD_VALIDATION_MESSAGES.emailRequired;
  } else if (email.length > LEAD_FIELD_LIMITS.email) {
    errors.email = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.email);
  } else if (!isValidEmail(email)) {
    errors.email = LEAD_VALIDATION_MESSAGES.emailInvalid;
  }

  if (!institution) {
    errors.institution = LEAD_VALIDATION_MESSAGES.institutionRequired;
  } else if (institution.length > LEAD_FIELD_LIMITS.institution) {
    errors.institution = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.institution);
  }

  // The required processing consent (D-12). Strictly `true`: an absent, empty
  // or truthy-ish value is not evidence that anyone accepted anything.
  if (body.consent !== true) {
    errors.consent = LEAD_VALIDATION_MESSAGES.consentRequired;
  }

  // The cohort is pinned by the public module, so a stale cached form or a
  // hand-crafted POST cannot file a lead against a cohort that is not running.
  if (cohort !== COHORT_ID) {
    errors.cohort = LEAD_VALIDATION_MESSAGES.cohortInvalid;
  }

  if (phone && phone.length > LEAD_FIELD_LIMITS.phone) {
    errors.phone = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.phone);
  }

  if (roleTitle && roleTitle.length > LEAD_FIELD_LIMITS.roleTitle) {
    errors.roleTitle = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.roleTitle);
  }

  if (message && message.length > LEAD_FIELD_LIMITS.message) {
    errors.message = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.message);
  }

  for (const [field, value] of [
    ['utmSource', utmSource],
    ['utmMedium', utmMedium],
    ['utmCampaign', utmCampaign],
  ] as const) {
    if (value && value.length > LEAD_FIELD_LIMITS.utm) {
      errors[field] = LEAD_VALIDATION_MESSAGES.tooLong(LEAD_FIELD_LIMITS.utm);
    }
  }

  const numPeople = parseNumPeople(body.numPeople);
  if (numPeople === 'invalid') {
    errors.numPeople = LEAD_VALIDATION_MESSAGES.numPeopleInvalid;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      cohort,
      firstName,
      lastName,
      email,
      emailNormalized,
      institution,
      phone,
      roleTitle,
      numPeople: numPeople === 'invalid' ? null : numPeople,
      message,
      // Optional, and false unless the person actively opted in (D-12).
      marketingOptIn: body.marketingOptIn === true,
      sourcePath,
      utmSource,
      utmMedium,
      utmCampaign,
    },
  };
}

/**
 * `null` when absent, the integer when valid, `'invalid'` otherwise. The
 * accepted range mirrors the table's `num_people` CHECK, so a value that
 * passes here can never be rejected by the database.
 */
function parseNumPeople(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed)) {
    return 'invalid';
  }
  if (parsed < LEAD_NUM_PEOPLE_MIN || parsed > LEAD_NUM_PEOPLE_MAX) {
    return 'invalid';
  }
  return parsed;
}
