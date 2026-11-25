/**
 * The reason for permission ("where the permission to write to these people came from"). It never has a
 * pre-chosen value: the admin chooses the legal basis and types the note, every time. A request without them is
 * refused here, before the database is called.
 */

export const LEGAL_BASES = ['consent_form', 'customer_relationship', 'manual_verified'] as const;
export type LegalBasis = (typeof LEGAL_BASES)[number];

/** Plain Spanish names, in the order the screen offers them (none is pre-chosen). */
export const LEGAL_BASIS_LABELS: Record<LegalBasis, string> = {
  consent_form: 'Dio su consentimiento en un formulario',
  customer_relationship: 'Tiene una relación de trabajo con nosotros',
  manual_verified: 'Lo verificamos a mano con la persona',
};

export const MAX_NOTE_LENGTH = 2000;
export const MAX_NOTICE_VERSION_LENGTH = 100;

export interface Reason {
  legal_basis: LegalBasis;
  basis_note: string;
  /** Only with `consent_form`. */
  consent_notice_version: string | null;
}

export type ReasonResult = { ok: true; reason: Reason } | { ok: false; message: string };

export const REASON_MESSAGES = {
  basis: 'Elige de dónde viene el permiso para escribirles. No hay una opción marcada de antemano.',
  basisNotAllowed: 'Ese motivo no corresponde a esta forma de agregar personas.',
  note: 'Escribe una nota sobre el permiso: cómo y cuándo lo dieron.',
  noteTooLong: `La nota puede tener hasta ${MAX_NOTE_LENGTH} caracteres.`,
  version: 'Indica la versión del aviso de privacidad que aceptaron en el formulario.',
  versionTooLong: `La versión del aviso puede tener hasta ${MAX_NOTICE_VERSION_LENGTH} caracteres.`,
} as const;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface ReasonOptions {
  /** The bases this way of adding people accepts. Default: all three. */
  allowed?: readonly LegalBasis[];
  /** Whether a consent form needs the notice version typed here (false when each row carries its own). */
  versionFromRequest?: boolean;
}

/** Reads `legal_basis`, `basis_note` and `consent_notice_version` from a request body. */
export function parseReason(body: unknown, options: ReasonOptions = {}): ReasonResult {
  const { allowed = LEGAL_BASES, versionFromRequest = true } = options;
  const source = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const basis = text(source.legal_basis);
  if (!(LEGAL_BASES as readonly string[]).includes(basis)) return { ok: false, message: REASON_MESSAGES.basis };
  if (!allowed.includes(basis as LegalBasis)) return { ok: false, message: REASON_MESSAGES.basisNotAllowed };

  const note = text(source.basis_note);
  if (!note) return { ok: false, message: REASON_MESSAGES.note };
  if (note.length > MAX_NOTE_LENGTH) return { ok: false, message: REASON_MESSAGES.noteTooLong };

  let version: string | null = null;
  if (basis === 'consent_form' && versionFromRequest) {
    version = text(source.consent_notice_version);
    if (!version) return { ok: false, message: REASON_MESSAGES.version };
    if (version.length > MAX_NOTICE_VERSION_LENGTH) return { ok: false, message: REASON_MESSAGES.versionTooLong };
  }
  return { ok: true, reason: { legal_basis: basis as LegalBasis, basis_note: note, consent_notice_version: version } };
}
