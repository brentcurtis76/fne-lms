/**
 * Chilean Public Holidays Utility
 *
 * Exports `getChileanHolidays(year)` returning all 16 Chilean public holidays
 * for the given year, including variable-date holidays.
 *
 * Variable holiday calculations:
 *   - Viernes Santo: Easter Sunday minus 2 days
 *   - Sabado Santo: Easter Sunday minus 1 day
 *   - Easter Sunday: computed via the Anonymous Gregorian algorithm
 *     (also known as the Meeus/Jones/Butcher algorithm)
 *   - Dia Nacional de los Pueblos Indigenas: Southern Hemisphere winter
 *     solstice, typically June 20 or 21 — lookup table for 2025–2035
 */

export interface ChileanHoliday {
  fecha: string;   // YYYY-MM-DD
  nombre: string;
}

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian
 * (Meeus/Jones/Butcher) algorithm.
 *
 * Reference: https://en.wikipedia.org/wiki/Date_of_Easter#Anonymous_Gregorian_algorithm
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Add `days` days to a Date, returning a new Date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Format a Date as YYYY-MM-DD string.
 */
function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Lookup table for Dia Nacional de los Pueblos Indigenas (winter solstice).
 * June 20 or 21, depending on the year.
 * Sources: Chilean SHOA and astronomical solstice tables.
 */
const PUEBLOS_INDIGENAS_DAY: Record<number, number> = {
  2024: 20,
  2025: 20,
  2026: 21,
  2027: 21,
  2028: 20,
  2029: 21,
  2030: 21,
  2031: 21,
  2032: 20,
  2033: 21,
  2034: 21,
  2035: 21,
};

/**
 * Returns the day-of-June for "Dia Nacional de los Pueblos Indigenas" for the
 * given year.  Falls back to June 21 for years outside the lookup table.
 */
function getPueblosIndigenasDay(year: number): number {
  return PUEBLOS_INDIGENAS_DAY[year] ?? 21;
}

/**
 * Returns all 16 Chilean public holidays for the given year.
 *
 * Fixed holidays (14):
 *   Jan 1   Ano Nuevo
 *   May 1   Dia del Trabajo
 *   May 21  Glorias Navales
 *   Jun 29  San Pedro y San Pablo
 *   Jul 16  Virgen del Carmen
 *   Aug 15  Asuncion de la Virgen
 *   Sep 18  Fiestas Patrias
 *   Sep 19  Dia de las Glorias del Ejercito
 *   Oct 12  Encuentro de Dos Mundos
 *   Oct 31  Dia de las Iglesias Evangelicas y Protestantes
 *   Nov 1   Dia de Todos los Santos
 *   Dec 8   Inmaculada Concepcion
 *   Dec 25  Navidad
 *
 * Variable holidays (3):
 *   Viernes Santo    = Easter - 2 days
 *   Sabado Santo     = Easter - 1 day
 *   Pueblos Indigenas = June 20 or 21 (winter solstice)
 */
export function getChileanHolidays(year: number): ChileanHoliday[] {
  const easter = getEasterSunday(year);
  const viernesSanto = addDays(easter, -2);
  const sabadoSanto  = addDays(easter, -1);
  const pueblosDay   = getPueblosIndigenasDay(year);

  const holidays: ChileanHoliday[] = [
    // January
    { fecha: `${year}-01-01`, nombre: 'Año Nuevo' },

    // Easter variable dates (March/April)
    { fecha: toISODate(viernesSanto), nombre: 'Viernes Santo' },
    { fecha: toISODate(sabadoSanto),  nombre: 'Sábado Santo' },

    // May
    { fecha: `${year}-05-01`, nombre: 'Día del Trabajo' },
    { fecha: `${year}-05-21`, nombre: 'Glorias Navales' },

    // June — variable solstice date
    { fecha: `${year}-06-${String(pueblosDay).padStart(2, '0')}`, nombre: 'Día Nacional de los Pueblos Indígenas' },

    // June (fixed)
    { fecha: `${year}-06-29`, nombre: 'San Pedro y San Pablo' },

    // July
    { fecha: `${year}-07-16`, nombre: 'Virgen del Carmen' },

    // August
    { fecha: `${year}-08-15`, nombre: 'Asunción de la Virgen' },

    // September
    { fecha: `${year}-09-18`, nombre: 'Fiestas Patrias' },
    { fecha: `${year}-09-19`, nombre: 'Día de las Glorias del Ejército' },

    // October
    { fecha: `${year}-10-12`, nombre: 'Encuentro de Dos Mundos' },
    { fecha: `${year}-10-31`, nombre: 'Día de las Iglesias Evangélicas y Protestantes' },

    // November
    { fecha: `${year}-11-01`, nombre: 'Día de Todos los Santos' },

    // December
    { fecha: `${year}-12-08`, nombre: 'Inmaculada Concepción' },
    { fecha: `${year}-12-25`, nombre: 'Navidad' },
  ];

  // Sort by date ascending
  return holidays.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
