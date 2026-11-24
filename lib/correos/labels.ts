/** Plain Spanish names for the values the screens show. Safe in the browser. */

export const STATE_LABELS: Record<string, string> = {
  subscribed: 'Suscrito',
  pending: 'Pendiente',
  unsubscribed: 'Se dio de baja',
};

export const JOINED_VIA_LABELS: Record<string, string> = {
  manual: 'Agregada a mano',
  csv_import: 'Importada desde un archivo',
  profiles: 'Usuario de la plataforma',
  pasantia_leads: 'Interesada en pasantías',
  signup_form: 'Formulario de inscripción',
  tractor_signups: 'Formulario antiguo',
  other: 'Otro origen',
};

export const UNSUBSCRIBED_BY_LABELS: Record<string, string> = {
  person: 'por decisión propia',
  admin: 'por un administrador',
};

export const BLOCK_REASON_LABELS: Record<string, string> = {
  bounce: 'Su correo rebotó de forma permanente',
  complaint: 'Marcó un correo nuestro como spam',
  manual: 'Bloqueada a mano',
  failed: 'Los envíos a su dirección fallaron',
  suppressed: 'Bloqueada',
  erased: 'Se borraron sus datos',
};

export function labelFor(map: Record<string, string>, value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  return map[value] ?? fallback;
}

/** A date as «24 nov 2026», in Chile's time. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}
