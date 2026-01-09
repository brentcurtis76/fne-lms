// Standard grade ranges used across the Genera platform
export const GRADE_RANGES = [
  // Early childhood ranges
  { value: 'P1-P2', label: 'P1-P2' },
  { value: 'P1-P3', label: 'P1-P3' },
  { value: 'P1-PreKinder', label: 'P1-PreKinder' },
  { value: 'P1-Kinder', label: 'P1-Kinder' },
  { value: 'P2-P3', label: 'P2-P3' },
  { value: 'P2-PreKinder', label: 'P2-PreKinder' },
  { value: 'P2-Kinder', label: 'P2-Kinder' },
  { value: 'P3-PreKinder', label: 'P3-PreKinder' },
  { value: 'P3-Kinder', label: 'P3-Kinder' },
  { value: 'PreKinder-Kinder', label: 'PreKinder-Kinder' },
  
  // P1 to primary/secondary
  { value: 'P1-2do', label: 'P1-2do' },
  { value: 'P1-3ro', label: 'P1-3ro' },
  { value: 'P1-4to', label: 'P1-4to' },
  { value: 'P1-5to', label: 'P1-5to' },
  { value: 'P1-6to', label: 'P1-6to' },
  { value: 'P1-8vo', label: 'P1-8vo' },
  { value: 'P1-12vo', label: 'P1-12vo' },
  
  // PreKinder to primary/secondary
  { value: 'PreKinder-2do', label: 'PreKinder-2do' },
  { value: 'PreKinder-3ro', label: 'PreKinder-3ro' },
  { value: 'PreKinder-4to', label: 'PreKinder-4to' },
  { value: 'PreKinder-5to', label: 'PreKinder-5to' },
  { value: 'PreKinder-6to', label: 'PreKinder-6to' },
  { value: 'PreKinder-8vo', label: 'PreKinder-8vo' },
  { value: 'PreKinder-12vo', label: 'PreKinder-12vo' },
  
  // Kinder to primary/secondary
  { value: 'Kinder-2do', label: 'Kinder-2do' },
  { value: 'Kinder-3ro', label: 'Kinder-3ro' },
  { value: 'Kinder-4to', label: 'Kinder-4to' },
  { value: 'Kinder-5to', label: 'Kinder-5to' },
  { value: 'Kinder-6to', label: 'Kinder-6to' },
  { value: 'Kinder-8vo', label: 'Kinder-8vo' },
  { value: 'Kinder-12vo', label: 'Kinder-12vo' },
  
  // Primary ranges
  { value: '1ro-2do', label: '1ro-2do' },
  { value: '1ro-3ro', label: '1ro-3ro' },
  { value: '1ro-4to', label: '1ro-4to' },
  { value: '1ro-5to', label: '1ro-5to' },
  { value: '1ro-6to', label: '1ro-6to' },
  { value: '1ro-8vo', label: '1ro-8vo' },
  { value: '1ro-12vo', label: '1ro-12vo' },
  { value: '3ro-4to', label: '3ro-4to' },
  { value: '3ro-5to', label: '3ro-5to' },
  { value: '3ro-6to', label: '3ro-6to' },
  { value: '3ro-8vo', label: '3ro-8vo' },
  { value: '3ro-12vo', label: '3ro-12vo' },
  { value: '5to-6to', label: '5to-6to' },
  { value: '5to-8vo', label: '5to-8vo' },
  { value: '5to-12vo', label: '5to-12vo' },
  
  // Secondary ranges
  { value: '7mo-8vo', label: '7mo-8vo' },
  { value: '7mo-12vo', label: '7mo-12vo' },
  { value: '9no-12vo', label: '9no-12vo' },
  
  // Special groups
  { value: 'Equipo Directivo', label: 'Equipo Directivo' },
  { value: 'Docentes', label: 'Docentes' },
  { value: 'Asistentes de la Educación', label: 'Asistentes de la Educación' },
  { value: 'Apoderados', label: 'Apoderados' },
  { value: 'Otro', label: 'Otro' }
] as const;

export type GradeRange = typeof GRADE_RANGES[number]['value'];