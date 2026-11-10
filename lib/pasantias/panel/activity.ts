/**
 * Presentation of the Pasantías panel activity log: stored rows → plain es-CL
 * sentences. Pure and browser-safe — no Supabase, no Node built-ins — so the
 * data-access module only reads rows and hands them here.
 */
import type { ProgramId } from '../cohort-public';
import { storedDateLabel } from '../participants/dates';
import { displayRut } from '../participants/rut';
import { FOCUS_LABELS, type FocusCode } from '../participants/types';
import {
  DOCUMENT_KIND_LABELS,
  FLIGHT_LABELS,
  LODGING_LABELS,
  SALUTATION_LABELS,
  type ActivityAction,
  type DocumentKind,
  type FlightStatus,
  type LodgingStatus,
  type PanelActivity,
  type Salutation,
} from './types';

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

const CORRECTION_LABELS: Record<string, string> = {
  first_names: 'Nombres',
  last_names: 'Apellidos',
  rut: 'RUT',
  passport_number: 'Pasaporte',
  arrival_date: 'Llegada',
  departure_date: 'Regreso',
  focus: 'Foco',
  email: 'Correo',
};

const FLIGHT_DATE_KEYS: Record<string, string> = {
  scl_departure_date: 'Salida de SCL',
  bcn_arrival_date: 'Llegada a BCN',
  bcn_departure_date: 'Salida de BCN',
  scl_arrival_date: 'Llegada a SCL',
};

/** `2027-01-10` → `10-01-2027`; anything else → `sin indicar`. */
function plainDate(value: unknown): string {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? `${match[3]}-${match[2]}-${match[1]}` : 'sin indicar';
}

function quoted(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'sin indicar' : `«${String(value)}»`;
}

/**
 * One stored change, `{"old": …, "new": …}` (the SQL functions' shape).
 */
function change(value: unknown): { before: unknown; after: unknown } {
  const c = (value ?? {}) as Row;
  return { before: c.old, after: c.new };
}

/** Plain es-CL sentences for one stored activity row. Unknown shapes yield a generic line. */
export function describeActivity(action: string, details: unknown, program: ProgramId | null): string[] {
  const d = (details && typeof details === 'object' ? details : {}) as Row;
  const fields = (d.fields && typeof d.fields === 'object' ? d.fields : {}) as Row;
  const lines: string[] = [];

  if (action === 'logistics_updated') {
    for (const [key, stored] of Object.entries(fields)) {
      const { before, after } = change(stored);
      if (key === 'flight_status') {
        lines.push(`Pasaje: ${FLIGHT_LABELS[before as FlightStatus] ?? '—'} → ${FLIGHT_LABELS[after as FlightStatus] ?? '—'}`);
      } else if (key === 'lodging_status') {
        lines.push(
          `Alojamiento: ${LODGING_LABELS[before as LodgingStatus] ?? '—'} → ${LODGING_LABELS[after as LodgingStatus] ?? '—'}`
        );
      } else if (key === 'deposit_received') {
        lines.push(`Abono 50%: ${after === true ? 'recibido' : 'no recibido'}`);
      } else if (key === 'balance_received') {
        lines.push(`Saldo 50%: ${after === true ? 'recibido' : 'no recibido'}`);
      } else if (key === 'salutation') {
        lines.push(`Tratamiento: ${SALUTATION_LABELS[after as Salutation] ?? 'sin indicar'}`);
      } else if (key === 'notes') {
        lines.push('Notas actualizadas');
      } else if (FLIGHT_DATE_KEYS[key]) {
        lines.push(`${FLIGHT_DATE_KEYS[key]}: ${plainDate(before)} → ${plainDate(after)}`);
      }
    }
    if (d.bulk === true && lines.length > 0) lines[0] = `${lines[0]} (cambio masivo)`;
    return lines.length > 0 ? lines : ['Seguimiento actualizado'];
  }

  if (action === 'participant_corrected') {
    for (const [key, stored] of Object.entries(fields)) {
      const { before, after } = change(stored);
      if (key === 'dietary') {
        lines.push('Alimentación actualizada');
      } else if (key === 'rut') {
        lines.push(`RUT: ${displayRut(str(before))} → ${displayRut(str(after))}`);
      } else if (key === 'focus') {
        const focusLabel = (value: unknown) => FOCUS_LABELS[value as FocusCode] ?? 'Sin indicar';
        lines.push(`Foco: ${focusLabel(before)} → ${focusLabel(after)}`);
      } else if ((key === 'arrival_date' || key === 'departure_date') && program) {
        const kind = key === 'arrival_date' ? 'arrival' : 'departure';
        const dateLabel = (value: unknown) => storedDateLabel(program, kind, strOrNull(value)).split(' · ')[0];
        lines.push(`${CORRECTION_LABELS[key]}: ${dateLabel(before)} → ${dateLabel(after)}`);
      } else if (CORRECTION_LABELS[key]) {
        lines.push(`${CORRECTION_LABELS[key]}: ${quoted(before)} → ${quoted(after)}`);
      }
    }
    return lines.length > 0 ? lines : ['Datos corregidos'];
  }

  const kindLabel = DOCUMENT_KIND_LABELS[d.kind as DocumentKind] ?? 'Documento';
  const fileName = str(d.file_name);
  if (action === 'document_uploaded') return [`Documento subido: ${kindLabel}${fileName ? ` · ${fileName}` : ''}`];
  if (action === 'document_removed') return [`Documento eliminado: ${kindLabel}${fileName ? ` · ${fileName}` : ''}`];
  if (action === 'letter_generated') return ['Carta de invitación generada'];
  if (action === 'letter_sent') {
    return [d.automatic === true ? 'Carta de invitación enviada por correo (envío automático)' : 'Carta de invitación enviada por correo'];
  }
  return ['Cambio registrado'];
}

function actorDisplayName(profile: Row | undefined, actorId: string): string {
  if (!actorId) return 'Sistema';
  if (!profile) return 'Administrador';
  const full = [str(profile.first_name), str(profile.last_name)].filter(Boolean).join(' ').trim();
  return full || str(profile.name) || 'Administrador';
}

/** The distinct admin ids named by a list of stored activity rows. */
export function activityActorIds(rows: readonly Row[]): string[] {
  return Array.from(new Set(rows.map((row) => str(row.actor_id)).filter(Boolean)));
}

/** Stored activity rows plus the admins' profile rows → what the panel shows. */
export function toPanelActivity(
  rows: readonly Row[],
  profileRows: readonly Row[],
  program: ProgramId | null
): PanelActivity[] {
  return rows.map((row) => ({
    id: str(row.id),
    action: str(row.action) as ActivityAction,
    actorName: actorDisplayName(
      profileRows.find((profile) => str(profile.id) === str(row.actor_id)),
      str(row.actor_id)
    ),
    createdAt: str(row.created_at),
    lines: describeActivity(str(row.action), row.details, program),
  }));
}
