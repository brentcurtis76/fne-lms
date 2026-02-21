/**
 * Licitacion Deadline Checker
 *
 * Page-load deadline reminder system (no cron).
 * Checks active licitaciones for upcoming deadlines and fires notifications
 * with daily-granularity idempotency keys to prevent duplicate firings.
 *
 * Called from the check-deadlines API endpoint which is triggered fire-and-forget
 * from page useEffect hooks in the dashboard and detail pages.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import notificationService from './notificationService';

// Active estados that can have deadline reminders
const ACTIVE_ESTADOS = [
  'publicacion_pendiente',
  'recepcion_bases_pendiente',
  'propuestas_pendientes',
  'evaluacion_pendiente',
  'adjudicacion_pendiente',
  'contrato_pendiente',
];

interface LicitacionWithDates {
  id: string;
  numero_licitacion: string;
  school_id: number;
  estado: string;
  fecha_limite_solicitud_bases: string | null;
  fecha_limite_consultas: string | null;
  fecha_inicio_propuestas: string | null;
  fecha_limite_propuestas: string | null;
  fecha_limite_evaluacion: string | null;
}

/**
 * Get today's date string in America/Santiago timezone (YYYY-MM-DD).
 */
function getTodaySantiago(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
}

/**
 * Get tomorrow's date string in America/Santiago timezone (YYYY-MM-DD).
 */
function getTomorrowSantiago(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
}

/**
 * Deadline check config: maps estado → list of {dateField, todayEvent, oneDayEvent}
 * Only deadlines relevant to the current estado are checked.
 */
interface DeadlineConfig {
  dateField: keyof LicitacionWithDates;
  todayEvent: string;
  oneDayEvent: string;
}

const ESTADO_DEADLINES: Record<string, DeadlineConfig[]> = {
  recepcion_bases_pendiente: [
    {
      dateField: 'fecha_limite_solicitud_bases',
      todayEvent: 'licitacion_bases_deadline',
      oneDayEvent: 'licitacion_bases_deadline_1d',
    },
    {
      dateField: 'fecha_limite_consultas',
      todayEvent: 'licitacion_consultas_deadline',
      oneDayEvent: 'licitacion_consultas_deadline_1d',
    },
  ],
  propuestas_pendientes: [
    {
      dateField: 'fecha_limite_propuestas',
      todayEvent: 'licitacion_propuestas_deadline',
      oneDayEvent: 'licitacion_propuestas_deadline_1d',
    },
  ],
  evaluacion_pendiente: [
    {
      dateField: 'fecha_limite_evaluacion',
      todayEvent: 'licitacion_evaluacion_deadline_1d', // No separate "today" event in spec; reuse 1d event
      oneDayEvent: 'licitacion_evaluacion_deadline_1d',
    },
  ],
};

/**
 * Main entry point: check all active licitaciones for deadline reminders.
 * Fires notifications via notificationService (service role).
 *
 * @param supabase - Service role Supabase client
 * @returns Number of notifications fired
 */
export async function checkAndFireDeadlineReminders(
  supabase: SupabaseClient
): Promise<number> {
  const today = getTodaySantiago();
  const tomorrow = getTomorrowSantiago();
  let notificationsFired = 0;

  try {
    // Fetch active licitaciones with timeline dates
    const { data: licitaciones, error } = await supabase
      .from('licitaciones')
      .select(
        'id, numero_licitacion, school_id, estado, ' +
        'fecha_limite_solicitud_bases, fecha_limite_consultas, ' +
        'fecha_inicio_propuestas, fecha_limite_propuestas, fecha_limite_evaluacion'
      )
      .in('estado', ACTIVE_ESTADOS);

    if (error) {
      console.error('Deadline checker: error fetching licitaciones:', error.message);
      return 0;
    }

    if (!licitaciones || licitaciones.length === 0) {
      return 0;
    }

    const typedLicitaciones = licitaciones as unknown as LicitacionWithDates[];

    // Fetch school names in one query to avoid N+1
    const schoolIds = [...new Set(typedLicitaciones.map(l => l.school_id))];
    const { data: schools } = await supabase
      .from('schools')
      .select('id, name')
      .in('id', schoolIds);

    const schoolNameMap: Record<number, string> = {};
    if (schools) {
      for (const s of schools) {
        schoolNameMap[s.id] = s.name;
      }
    }

    for (const lic of typedLicitaciones) {
      const deadlineConfigs = ESTADO_DEADLINES[lic.estado] || [];

      for (const config of deadlineConfigs) {
        const dateValue = lic[config.dateField] as string | null | undefined;
        if (!dateValue || typeof dateValue !== 'string') continue;

        const eventData = {
          licitacion_id: lic.id,
          numero_licitacion: lic.numero_licitacion,
          school_id: lic.school_id,
          school_name: schoolNameMap[lic.school_id] || '',
        };

        if (dateValue === today) {
          // Deadline is today
          try {
            await notificationService.triggerNotification(config.todayEvent, eventData);
            notificationsFired++;
          } catch (err) {
            console.error(`Deadline checker: failed to fire ${config.todayEvent}:`, err);
          }
        } else if (dateValue === tomorrow) {
          // Deadline is tomorrow
          try {
            await notificationService.triggerNotification(config.oneDayEvent, eventData);
            notificationsFired++;
          } catch (err) {
            console.error(`Deadline checker: failed to fire ${config.oneDayEvent}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error('Deadline checker: unexpected error:', err);
  }

  return notificationsFired;
}
