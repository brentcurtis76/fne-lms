/**
 * The coordinator's purpose notice and acknowledgement (FIRST N5).
 *
 * The coordinator enters OTHER people's data, so the acknowledgement is about
 * having informed them, not a consent of their own. There is no marketing
 * opt-in here, by design.
 *
 * N5 (plan r2): Brent approved this purpose text, exactly as written below, on
 * 2026-10-28 ("Sí, usar ese aviso"); version v2 is that approved wording. This
 * records a product/content approval only — it is not a claim of legal
 * sufficiency. Any wording change bumps INTAKE_NOTICE_VERSION, which every real
 * save stores in `pasantias_intake_participants.notice_version` (1–64 chars);
 * rows saved under an earlier version keep it.
 *
 * v3 (2026-11-10): Brent asked for the notice to change once the form began
 * to ask for each traveller's email ("Change it"). It now says what the email
 * is used for (the invitation letter) and that a traveller with a GENERA
 * account under that email can see their own trip. The wording of the two new
 * sentences was drafted in the session that built the panel and is shown to
 * Brent in its report; the acknowledgement is unchanged.
 */
export const INTAKE_NOTICE_VERSION = 'pasant-intake-2026-11-v3';

export const INTAKE_PURPOSE_TEXT =
  'FNE utilizará estos datos para organizar la pasantía: inscripción, pasajes, alojamiento y ' +
  'alimentación. El correo de cada persona se usará para enviarle su carta de invitación. ' +
  'El equipo FNE y quien tenga este enlace privado podrán consultar la nómina; cada persona ' +
  'podrá ver los datos de su propio viaje si tiene una cuenta en GENERA con ese correo. ' +
  'Comparte el enlace solo con las personas encargadas.';

export const INTAKE_ACKNOWLEDGEMENT_TEXT =
  'Confirmo que las personas de esta nómina saben que entrego sus datos a FNE para organizar la ' +
  'pasantía, y que la información que ingreso es correcta.';
