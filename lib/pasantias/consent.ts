/**
 * es-CL consent copy for the Pasantías lead form.
 *
 * Two separate purposes, separately evidenced (D-12):
 *  1. processing consent — REQUIRED to submit the form; covers answering the
 *     request and sending the requested program. Evidenced by
 *     `consent_accepted_at` + `consent_notice_version`.
 *  2. marketing opt-in — OPTIONAL, unchecked by default; the only basis that
 *     may ever move a lead into Correos. Evidenced by `marketing_opt_in_at` +
 *     `marketing_notice_version`, written only when the person opts in.
 *
 * The required acknowledgement is never proof of the optional choice, so the
 * two sentences are deliberately distinct in wording and scope. Both are
 * stamped with `PRIVACY_NOTICE_VERSION` at write time.
 */

/** Required processing consent: respond to the request + deliver the program. */
export const CONSENT_PROCESSING_TEXT =
  'Autorizo a Fundación Nueva Educación a tratar mis datos personales para responder a esta ' +
  'solicitud y enviarme el programa completo de la pasantía. He leído la Política de Privacidad.';

/** Optional marketing opt-in: unchecked by default, revocable at any time. */
export const CONSENT_MARKETING_TEXT =
  '(Opcional) Quiero recibir novedades de Fundación Nueva Educación sobre sus programas y ' +
  'contenidos educativos por correo electrónico. Puedo darme de baja cuando quiera.';

/** Path the processing-consent sentence links to. */
export const PRIVACY_POLICY_PATH = '/privacidad';

/** Substring of {@link CONSENT_PROCESSING_TEXT} the form renders as the link. */
export const PRIVACY_POLICY_LINK_LABEL = 'Política de Privacidad';
