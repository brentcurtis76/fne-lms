import type { SupabaseClient } from '@supabase/supabase-js';

export const TRACTOR_SIGNUP_SOURCE = 'lideres_generacion_tractor';
export const GENERAL_SIGNUP_SOURCE = 'registro_general';
export const SANTA_MARTA_NETWORK_NAME = 'Santa Marta';

export const SIGNUP_SOURCES = [TRACTOR_SIGNUP_SOURCE, GENERAL_SIGNUP_SOURCE] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

export const SIGNUP_SOURCE_LABELS: Record<SignupSource, string> = {
  [TRACTOR_SIGNUP_SOURCE]: 'Líderes Tractor',
  [GENERAL_SIGNUP_SOURCE]: 'Registro general',
};

export function isKnownSignupSource(value: unknown): value is SignupSource {
  return value === TRACTOR_SIGNUP_SOURCE || value === GENERAL_SIGNUP_SOURCE;
}

export type TractorSignupRole = 'docente' | 'equipo_directivo';
export type TractorSignupStatus = 'pending' | 'granted' | 'dismissed';

export interface SantaMartaSchool {
  id: number;
  name: string;
}

export const TRACTOR_ROLE_LABELS: Record<TractorSignupRole, string> = {
  docente: 'Docente',
  equipo_directivo: 'Equipo Directivo',
};

export const TRACTOR_STATUS_LABELS: Record<TractorSignupStatus, string> = {
  pending: 'Pendiente',
  granted: 'Acceso otorgado',
  dismissed: 'Descartado',
};

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function isValidEmail(email: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email);
}

export function isTractorSignupRole(value: unknown): value is TractorSignupRole {
  return value === 'docente' || value === 'equipo_directivo';
}

export function isTractorSignupStatus(value: unknown): value is TractorSignupStatus {
  return value === 'pending' || value === 'granted' || value === 'dismissed';
}

export function isValidBirthDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return false;
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const minUtc = Date.UTC(1900, 0, 1);
  const dateUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

  return dateUtc >= minUtc && dateUtc <= todayUtc;
}

export function getFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

export async function getSantaMartaSchools(supabase: SupabaseClient): Promise<SantaMartaSchool[]> {
  const { data: network, error: networkError } = await supabase
    .from('redes_de_colegios')
    .select('id')
    .eq('nombre', SANTA_MARTA_NETWORK_NAME)
    .maybeSingle();

  if (networkError) {
    throw networkError;
  }

  if (!network?.id) {
    return [];
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from('red_escuelas')
    .select('school_id')
    .eq('red_id', network.id);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const schoolIds = Array.from(
    new Set(
      (assignments ?? [])
        .map((row: { school_id?: number | string | null }) => Number(row.school_id))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0)
    )
  );

  if (schoolIds.length === 0) {
    return [];
  }

  const { data: schools, error: schoolsError } = await supabase
    .from('schools')
    .select('id, name')
    .in('id', schoolIds)
    .order('name', { ascending: true });

  if (schoolsError) {
    throw schoolsError;
  }

  return (schools ?? [])
    .map((school: { id?: number | string | null; name?: string | null }) => ({
      id: Number(school.id),
      name: school.name ?? '',
    }))
    .filter((school: SantaMartaSchool) => Number.isSafeInteger(school.id) && school.name.length > 0);
}

export async function isSantaMartaSchoolId(
  supabase: SupabaseClient,
  schoolId: number
): Promise<boolean> {
  const schools = await getSantaMartaSchools(supabase);
  return schools.some((school) => school.id === schoolId);
}

export interface SchoolWithGenerations {
  id: number;
  name: string;
  has_generations: boolean;
}

export interface GenerationOption {
  id: string;
  name: string;
  school_id: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function getAllSchools(supabase: SupabaseClient): Promise<SchoolWithGenerations[]> {
  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, has_generations')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (schools ?? [])
    .map((school: { id?: number | string | null; name?: string | null; has_generations?: boolean | null }) => ({
      id: Number(school.id),
      name: school.name ?? '',
      has_generations: school.has_generations === true,
    }))
    .filter((school: SchoolWithGenerations) => Number.isSafeInteger(school.id) && school.id > 0 && school.name.length > 0);
}

export async function getAllGenerations(supabase: SupabaseClient): Promise<GenerationOption[]> {
  const { data: generations, error } = await supabase
    .from('generations')
    .select('id, name, school_id')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (generations ?? [])
    .map((generation: { id?: string | null; name?: string | null; school_id?: number | string | null }) => ({
      id: generation.id ?? '',
      name: generation.name ?? '',
      school_id: Number(generation.school_id),
    }))
    .filter(
      (generation: GenerationOption) =>
        isValidUuid(generation.id) &&
        generation.name.length > 0 &&
        Number.isSafeInteger(generation.school_id) &&
        generation.school_id > 0
    );
}

// Single ownership check: the generation must exist AND belong to the school.
// has_generations is a denormalized display flag and is never consulted here.
export async function findGenerationForSchool(
  supabase: SupabaseClient,
  generationId: string,
  schoolId: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from('generations')
    .select('id')
    .eq('id', generationId)
    .eq('school_id', schoolId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

export interface ExistingRole {
  role_type: string;
  school_id: number | null;
}

export const ROLE_LABEL_BY_TYPE: Record<string, string> = {
  admin: 'Admin',
  consultor: 'Consultor',
  equipo_directivo: 'Equipo Directivo',
  lider_generacion: 'Líder Generación',
  lider_comunidad: 'Líder Comunidad',
  community_manager: 'Community Manager',
  docente: 'Docente',
  supervisor_de_red: 'Supervisor de Red',
  encargado_licitacion: 'Encargado Licitación',
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CL');
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatExistingRoles(roles: ExistingRole[]): string {
  return roles
    .map((role) => ROLE_LABEL_BY_TYPE[role.role_type] ?? role.role_type)
    .filter(Boolean)
    .join(', ');
}
