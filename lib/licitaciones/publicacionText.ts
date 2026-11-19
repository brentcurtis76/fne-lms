/**
 * Publication text of a tender (step 2), as a pure function.
 *
 * The deadline printed is the bases-request deadline: before the publication
 * is confirmed, the one computed from the date typed (the timeline route's
 * answer); once confirmed, the stored one. With neither, the placeholder.
 */
import type { LicitacionDetail, TimelineDates } from '@/types/licitaciones';

export const FECHA_PENDIENTE = '[fecha pendiente]';

export function formatDateInline(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const day = parseInt(parts[2], 10);
  const month = months[parseInt(parts[1], 10) - 1] || '';
  return `${day} de ${month} de ${parts[0]}`;
}

type PublicacionSource = Pick<
  LicitacionDetail,
  'estado' | 'email_licitacion' | 'fecha_limite_solicitud_bases' | 'school' | 'cliente'
>;

/** True once the publication has been confirmed (the stored dates are the real ones). */
export function isPublicacionConfirmada(licitacion: Pick<LicitacionDetail, 'estado'>): boolean {
  return licitacion.estado !== 'borrador' && licitacion.estado !== 'publicacion_pendiente';
}

/**
 * Builds the publication text, or '' when the tender has no school or client
 * to name. `typedTimeline` is the timeline computed from the date typed.
 */
export function buildPublicacionText(
  licitacion: PublicacionSource,
  typedTimeline?: Partial<TimelineDates> | null
): string {
  if (!licitacion.school || !licitacion.cliente) return '';
  const schoolName = licitacion.cliente.nombre_fantasia || licitacion.school.name;
  const comuna = licitacion.cliente.comuna || '';

  const deadline = isPublicacionConfirmada(licitacion)
    ? licitacion.fecha_limite_solicitud_bases
    : typedTimeline?.fecha_limite_solicitud_bases;
  const fechaLimite = deadline ? formatDateInline(deadline) : FECHA_PENDIENTE;

  return (
    `Con el objetivo de asesorar al equipo directivo y líderes del establecimiento ` +
    `en el cambio de cultura organizacional centrada en la innovación educativa y ` +
    `en el Modelo Relacional es que el ${schoolName}, de la comuna de ${comuna}, ` +
    `llamamos a concurso público para la contratación de servicios ATE con el ` +
    `siguiente requerimiento: asesoría al equipo directivo para liderar a la escuela ` +
    `hacia una cultura colaborativa, de aprendizaje profundo, con metodologías de ` +
    `vanguardia y con la base en un enfoque en lo relacional.\n\n` +
    `Bases de la licitación se pueden solicitar hasta el ${fechaLimite} al ` +
    `correo ${licitacion.email_licitacion}`
  );
}
