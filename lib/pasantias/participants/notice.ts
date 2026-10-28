/**
 * The coordinator's purpose notice and acknowledgement (FIRST N5).
 *
 * The coordinator enters OTHER people's data, so the acknowledgement is about
 * having informed them, not a consent of their own. There is no marketing
 * opt-in here, by design.
 *
 * RELEASE REVIEW ITEM (plan r2): the es-CL wording below needs human/legal
 * confirmation before release. It is not a claim of legal sufficiency. Any
 * wording change bumps INTAKE_NOTICE_VERSION, which every real save stores in
 * `pasantias_intake_participants.notice_version` (1–64 chars).
 */
export const INTAKE_NOTICE_VERSION = 'pasant-intake-2026-10-v1';

export const INTAKE_PURPOSE_TEXT =
  'Fundación Nueva Educación (FNE) usa estos datos solo para organizar la pasantía en Barcelona: ' +
  'pasajes, alojamiento, alimentación y la inscripción en el programa. Solo el equipo FNE puede verlos. ' +
  'Este formulario no envía correos: al enviar la nómina, queda disponible para el equipo FNE.';

export const INTAKE_ACKNOWLEDGEMENT_TEXT =
  'Confirmo que las personas de esta nómina saben que entrego sus datos a FNE para organizar la ' +
  'pasantía, y que la información que ingreso es correcta.';
