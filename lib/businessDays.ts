import { getSupabaseClient } from '@/lib/supabase-wrapper';

/**
 * Fetches Chilean holidays for a given year range from the feriados_chile table.
 * NOTE: This function uses the browser Supabase client and is intended for client-side
 * usage. For API routes (Phase 2+), pass a server-side Supabase client directly.
 */
export async function getHolidays(startYear: number, endYear: number): Promise<Date[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('feriados_chile')
    .select('fecha')
    .gte('year', startYear)
    .lte('year', endYear);

  if (error) throw new Error(`Failed to fetch holidays: ${error.message}`);
  return (data || []).map((h: { fecha: string }) => new Date(h.fecha + 'T00:00:00'));
}

/**
 * Checks if a date is a weekend (Saturday = 6, Sunday = 0).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Checks if a date matches any holiday in the provided list.
 * Comparison is date-only (ignores time) using YYYY-MM-DD strings.
 */
export function isHoliday(date: Date, holidays: Date[]): boolean {
  const dateStr = date.toISOString().split('T')[0];
  return holidays.some(h => h.toISOString().split('T')[0] === dateStr);
}

/**
 * Adds N business days to a start date, skipping weekends and Chilean holidays.
 * The start date itself is not evaluated — only days after it are counted.
 * Adding 0 days returns the start date unchanged.
 * Returns the resulting date.
 */
export function addBusinessDays(startDate: Date, days: number, holidays: Date[]): Date {
  const current = new Date(startDate);
  let added = 0;
  while (added < days) {
    current.setDate(current.getDate() + 1);
    if (!isWeekend(current) && !isHoliday(current, holidays)) {
      added++;
    }
  }
  return current;
}

/**
 * Calculates all licitacion timeline dates from a publication date.
 *
 * Timeline logic (all in business days from previous deadline):
 *   - fecha_limite_solicitud_bases  = fechaPublicacion + 5 business days
 *   - fecha_limite_consultas        = fecha_limite_solicitud_bases + 3 business days
 *   - fecha_inicio_propuestas       = fecha_limite_consultas + 1 business day
 *   - fecha_limite_propuestas       = fecha_limite_consultas + 5 business days
 *   - fecha_limite_evaluacion       = fecha_limite_propuestas + 3 business days
 *
 * Returns an object with all five calculated deadline dates.
 */
export function calculateLicitacionTimeline(
  fechaPublicacion: Date,
  holidays: Date[]
): {
  fecha_limite_solicitud_bases: Date;
  fecha_limite_consultas: Date;
  fecha_inicio_propuestas: Date;
  fecha_limite_propuestas: Date;
  fecha_limite_evaluacion: Date;
} {
  const fecha_limite_solicitud_bases = addBusinessDays(fechaPublicacion, 5, holidays);
  const fecha_limite_consultas = addBusinessDays(fecha_limite_solicitud_bases, 3, holidays);
  const fecha_inicio_propuestas = addBusinessDays(fecha_limite_consultas, 1, holidays);
  const fecha_limite_propuestas = addBusinessDays(fecha_limite_consultas, 5, holidays);
  const fecha_limite_evaluacion = addBusinessDays(fecha_limite_propuestas, 3, holidays);

  return {
    fecha_limite_solicitud_bases,
    fecha_limite_consultas,
    fecha_inicio_propuestas,
    fecha_limite_propuestas,
    fecha_limite_evaluacion
  };
}
