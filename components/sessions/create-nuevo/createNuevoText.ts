import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Words and small sums of the new look's form «Programar Sesión» (redesign 6, release SB). Pure.
 * Today's words come from the hook (`scheduleConfirmText`) or are written as today's view writes
 * them; the new ones are those approved with the mock-up (inventory 06-sesiones.md, the form's list).
 */

/** The modality's words in the new look («Híbrida» with its accent: approved change). */
export const MODALITY_LABELS: Record<'presencial' | 'online' | 'hibrida', string> = {
  presencial: 'Presencial',
  online: 'Online',
  hibrida: 'Híbrida',
};

/** The notice after «Programar» created the session(s) and something after it failed (approved change 3). */
export const DRAFTS_LEFT_TEXT = {
  una: 'La sesión quedó guardada como borrador. Revise la lista de sesiones antes de volver a programar, para no crearla dos veces.',
  serie:
    'Las sesiones quedaron guardadas como borrador. Revise la lista de sesiones antes de volver a programar, para no crearlas dos veces.',
} as const;

export type DraftsLeft = keyof typeof DRAFTS_LEFT_TEXT;

/**
 * The server's refusal when only one of «Tipo de Hora» and «Contrato» was chosen (its own words, the
 * API's). The new view shows it under the two selects when the server answers with exactly these
 * words (approved: «now also shown under the two selects»); today's toast stays.
 */
export const HOUR_PAIR_REFUSAL = 'El contrato y el tipo de hora deben configurarse juntos.';

/** The box's lead line (approved change 2). */
export const CHECKS_TITLE = 'Revise lo siguiente antes de continuar:';

/**
 * Today's question, cut in two for the pop-up: the question itself (the title) and what follows it
 * («Se notificará a los participantes.», the body). One copy of the words: the hook's.
 */
export function splitConfirmText(text: string): { title: string; body: string } {
  const at = text.indexOf('?');
  if (at < 0) return { title: text, body: '' };
  return { title: text.slice(0, at + 1), body: text.slice(at + 1).trim() };
}

/** One decimal with a comma («42,5»): approved change, in place of today's dot. */
export function decimalComma(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

const TIME = /^(\d{1,2}):(\d{2})$/;

/** The hours between two «HH:MM» times; 0 when either is missing or the end is not later. */
export function hoursBetween(start: string, end: string): number {
  const a = TIME.exec(start);
  const b = TIME.exec(end);
  if (!a || !b) return 0;
  const minutes = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  return minutes > 0 ? minutes / 60 : 0;
}

/** «1 dic 2026», for the summary and the pop-up. A date-only text is read and printed in the same zone. */
export function shortDate(iso: string): string {
  const parsed = parseISO(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return format(parsed, 'd MMM yyyy', { locale: es });
}

/** One date, or the first and the last of a series. */
export function datesRange(dates: string[]): string {
  if (dates.length === 0) return '—';
  if (dates.length === 1) return shortDate(dates[0]);
  return `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}`;
}

/** Saturday or Sunday, read as today's preview reads it (`parseISO`, then the weekday). */
export function isWeekendDate(iso: string): boolean {
  const day = parseISO(iso).getDay();
  return day === 0 || day === 6;
}
