/**
 * Privacy-notice versioning and the data-controller identity block.
 *
 * The privacy notice must be citable: every consent record stores the exact
 * notice version the person accepted (D-12), so the version and its publication
 * date are fixed constants — never derived from the current date. Bumping the
 * notice text means bumping BOTH constants below in the same change.
 *
 * `LEGAL_IDENTITY` is the controller identity shown in the notice and required
 * in the legal footer of outbound campaign email. Fields still pending owner
 * sign-off (Appendix A, item A-10) carry `LEGAL_IDENTITY_PENDING` so an
 * unfilled value is visible rather than silently empty.
 */

/** Version stamped into `consent_notice_version` / `marketing_notice_version`. */
export const PRIVACY_NOTICE_VERSION = '2026-07-v1';

/** Publication date of {@link PRIVACY_NOTICE_VERSION}, ISO 8601 date-only (UTC). */
export const PRIVACY_NOTICE_UPDATED_AT = '2026-07-30';

/**
 * es-CL rendering of {@link PRIVACY_NOTICE_UPDATED_AT} (dd-mm-yyyy).
 * Written out rather than formatted at runtime: a `Date` built from a date-only
 * string is UTC midnight and renders as the previous day in America/Santiago.
 */
export const PRIVACY_NOTICE_UPDATED_LABEL = '30-07-2026';

/** Marker for legal-identity fields awaiting owner sign-off (Appendix A-10). */
export const LEGAL_IDENTITY_PENDING = '[PENDIENTE: Apéndice A-10]';

export interface LegalIdentity {
  /** Razón social of the data controller. */
  legalName: string;
  /** RUT — pending Appendix A-10. */
  taxId: string;
  /** Street address for the postal-address requirement — pending Appendix A-10. */
  streetAddress: string;
  city: string;
  country: string;
  /** Contact address for data-subject requests (Ley 21.719). */
  contactEmail: string;
}

export const LEGAL_IDENTITY: LegalIdentity = {
  legalName: 'Fundación Nueva Educación',
  taxId: LEGAL_IDENTITY_PENDING,
  streetAddress: LEGAL_IDENTITY_PENDING,
  city: 'Santiago',
  country: 'Chile',
  contactEmail: 'info@nuevaeducacion.org',
};
