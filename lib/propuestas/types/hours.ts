export type DistributionType = 'bloque' | 'cadencia' | 'flexible';

export interface BlockEvent {
  month: number; // 1-12
  days: number; // duration in days
  hoursPerDay?: number; // defaults to 8
}

export interface HourBucket {
  id: string;
  label: string;
  hours: number; // total hours for this bucket
  distributionType: DistributionType;
  modalidad: 'presencial' | 'online' | 'asincronico' | 'hibrido';
  // For 'bloque': concentrated events (talleres residenciales, visitas)
  blockEvents?: BlockEvent[];
  // For 'cadencia': regular recurring sessions
  hoursPerSession?: number;
  sessionsPerMonth?: number; // defaults to 1
  activeMonths?: number[]; // which months (1-12) this runs
  // For 'flexible': available year-round, used at discretion
  // (no extra fields needed, just hours)
  // Relative program month (1-8) — required for bloque, ignored for cadencia/flexible
  mes?: number;
  notes?: string;
}

export interface ProposalHoursConfig {
  startMonth: number; // 3=March, 4=April, etc.
  programMonths: number; // typically 10
  year: number; // program year
  buckets: HourBucket[];
}

// The 12 predefined bucket templates (user toggles on/off and configures)
export const BUCKET_TEMPLATES: Omit<HourBucket, 'hours'>[] = [
  { id: 'taller-1', label: 'Taller 1', distributionType: 'bloque', modalidad: 'presencial' },
  { id: 'taller-2', label: 'Taller 2', distributionType: 'bloque', modalidad: 'presencial' },
  {
    id: 'acomp-directivo',
    label: 'Acompañamiento Directivo a la Dirección',
    distributionType: 'cadencia',
    modalidad: 'presencial',
  },
  {
    id: 'asesoria-cambio',
    label: 'Asesoría en Gestión del Cambio',
    distributionType: 'cadencia',
    modalidad: 'presencial',
  },
  {
    id: 'acomp-equipo',
    label: 'Acompañamiento al Equipo de Gestión',
    distributionType: 'cadencia',
    modalidad: 'presencial',
  },
  {
    id: 'asesoria-online',
    label: 'Asesoría Directiva Online',
    distributionType: 'cadencia',
    modalidad: 'online',
  },
  {
    id: 'acomp-tecnico-online',
    label: 'Acompañamiento Técnico Online',
    distributionType: 'cadencia',
    modalidad: 'online',
  },
  {
    id: 'taller-gt',
    label: 'Taller Residencial para Líderes de Generación Tractor',
    distributionType: 'bloque',
    modalidad: 'presencial',
  },
  {
    id: 'taller-innova',
    label: 'Taller Residencial para Líderes de Proyecto Innova',
    distributionType: 'bloque',
    modalidad: 'presencial',
  },
  {
    id: 'taller-directivo',
    label: 'Taller Residencial para el Equipo Directivo',
    distributionType: 'bloque',
    modalidad: 'presencial',
  },
  {
    id: 'plataforma',
    label: 'Plataforma de Crecimiento',
    distributionType: 'flexible',
    modalidad: 'asincronico',
  },
  {
    id: 'asesor-intl',
    label: 'Visita de Asesor Internacional in-situ',
    distributionType: 'bloque',
    modalidad: 'presencial',
  },
];
