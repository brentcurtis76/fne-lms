/**
 * The program's own dates as the invitation letter and "Mi pasantía" word them.
 * Browser-safe; read from `cohort-public`, never typed here.
 */
import { programById, type ProgramId } from '../cohort-public';

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function parts(iso: string): { day: number; month: string; year: string } {
  const [year, month, day] = iso.split('-');
  return { day: Number(day), month: MONTHS_ES[Number(month) - 1], year };
}

/** `entre el 18 y el 28 de enero de 2027`, from the program's own dates. */
export function letterDateRange(programId: ProgramId): string {
  const { startDate, endDate } = programById(programId);
  const start = parts(startDate);
  const end = parts(endDate);
  if (start.month === end.month && start.year === end.year) {
    return `entre el ${start.day} y el ${end.day} de ${end.month} de ${end.year}`;
  }
  const startYear = start.year === end.year ? '' : ` de ${start.year}`;
  return `entre el ${start.day} de ${start.month}${startYear} y el ${end.day} de ${end.month} de ${end.year}`;
}
