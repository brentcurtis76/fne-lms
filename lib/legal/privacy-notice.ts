/**
 * Privacy-notice versioning and the data-controller identity block.
 *
 * The privacy notice must be citable: every consent record stores the exact
 * notice version the person accepted (D-12), so the version and its publication
 * date are fixed constants — never derived from the current date. Bumping the
 * notice text means bumping BOTH constants below in the same change.
 *
 * `LEGAL_IDENTITY` is the controller identity shown in the notice and required
 * in the legal footer of outbound campaign email. The name the audience knows —
 * "Fundación Nueva Educación" — is a *nombre de fantasía*; the data controller
 * is a different legal entity, so brand and legal name are separate fields.
 * Any footer or legal block must show BOTH: the brand name plus the legal name,
 * RUT and postal address (Appendix A-10).
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

export interface LegalIdentity {
  /** Nombre de fantasía — the name the audience recognises. Never shown alone. */
  brandName: string;
  /** Razón social of the data controller — the legal entity behind the brand. */
  legalName: string;
  /** RUT of the controller, formatted as displayed. */
  taxId: string;
  /** Street address for the postal-address requirement. */
  streetAddress: string;
  city: string;
  country: string;
  /** Contact address for data-subject requests (Ley 21.719). */
  contactEmail: string;
}

/** Controller identity per Appendix A-10 (owner-approved 2026-07-31). */
export const LEGAL_IDENTITY: LegalIdentity = {
  brandName: 'Fundación Nueva Educación',
  legalName: 'Fundación Instituto Relacional',
  taxId: 'RUT 65.166.503-5',
  streetAddress: 'Carlos Silva Vildósola 10448',
  city: 'La Reina, Santiago',
  country: 'Chile',
  contactEmail: 'info@nuevaeducacion.org',
};
