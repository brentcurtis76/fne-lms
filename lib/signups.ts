import type { SupabaseClient } from '@supabase/supabase-js';
import { Validators } from './types/api-auth.types';

export const TRACTOR_SIGNUP_SOURCE = 'lideres_generacion_tractor';
export const GENERAL_SIGNUP_SOURCE = 'registro_general';
export const SANTA_MARTA_NETWORK_NAME = 'Santa Marta';

export const SIGNUP_SOURCES = [TRACTOR_SIGNUP_SOURCE, GENERAL_SIGNUP_SOURCE] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

export const SIGNUP_SOURCE_LABELS: Record<SignupSource, string> = {
  [TRACTOR_SIGNUP_SOURCE]: 'Líderes Tractor',
  [GENERAL_SIGNUP_SOURCE]: 'Registro general',
};

// Per-source body line for the grant invitation email. A Record (not a
// conditional) so adding a source forces an explicit copy decision.
export const SIGNUP_SOURCE_INVITE_BODY: Record<SignupSource, string> = {
  [TRACTOR_SIGNUP_SOURCE]:
    'Ya puedes activar tu cuenta para ingresar a la plataforma Genera como parte de Líderes de la Generación Tractor.',
  [GENERAL_SIGNUP_SOURCE]: 'Ya puedes activar tu cuenta para ingresar a la plataforma Genera.',
};

export function isKnownSignupSource(value: unknown): value is SignupSource {
  return typeof value === 'string' && (SIGNUP_SOURCES as readonly string[]).includes(value);
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

export interface SchoolOption {
  id: number;
  name: string;
}

export interface GenerationOption {
  id: string;
  name: string;
  school_id: number;
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && Validators.isUUID(value);
}

export async function getAllSchools(supabase: SupabaseClient): Promise<SchoolOption[]> {
  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return (schools ?? [])
    .map((school: { id?: number | string | null; name?: string | null }) => ({
      id: Number(school.id),
      name: school.name ?? '',
    }))
    .filter((school: SchoolOption) => Number.isSafeInteger(school.id) && school.id > 0 && school.name.length > 0);
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

export interface GenerationOutcome {
  applied: boolean;
  warning: string | null;
}

export const GENERATION_WARNINGS = {
  stale: 'La generación del registro ya no corresponde al colegio; se otorgó sin generación.',
  crossSchool: 'La generación no se aplicó porque el perfil pertenece a otro colegio.',
  differentGeneration: 'El perfil ya tiene otra generación asignada; no se modificó.',
} as const;

/**
 * Pure application of the fill-only-if-safe generation contract (see the table
 * in docs/planning/reviews/feat-registro-gen-review-request.md). Only ever
 * targets profiles.generation_id — user_roles.generation_id is reserved for
 * lider_generacion and is never written by signup flows.
 *
 * `resolution` is the outcome of the async ownership check: generationId is
 * the validated id (or null), warning carries the stale-generation message
 * when validation failed.
 */
export function deriveGenerationOutcome(
  resolution: { generationId: string | null; warning: string | null },
  profile: { school_id: number | string | null; generation_id: string | null } | null,
  schoolId: number
): { writeGenerationId: string | null; generation: GenerationOutcome } {
  if (!resolution.generationId) {
    return { writeGenerationId: null, generation: { applied: false, warning: resolution.warning } };
  }

  // New user: the profile is created with the validated generation.
  if (!profile) {
    return {
      writeGenerationId: resolution.generationId,
      generation: { applied: true, warning: null },
    };
  }

  // A profile without a school is being backfilled to the signup's school,
  // so the generation can follow it.
  const profileMatchesSchool = !profile.school_id || Number(profile.school_id) === schoolId;
  if (!profileMatchesSchool) {
    return {
      writeGenerationId: null,
      generation: { applied: false, warning: GENERATION_WARNINGS.crossSchool },
    };
  }

  if (!profile.generation_id) {
    return {
      writeGenerationId: resolution.generationId,
      generation: { applied: true, warning: null },
    };
  }

  if (profile.generation_id === resolution.generationId) {
    // Already correct — nothing to write.
    return { writeGenerationId: null, generation: { applied: true, warning: null } };
  }

  return {
    writeGenerationId: null,
    generation: { applied: false, warning: GENERATION_WARNINGS.differentGeneration },
  };
}

// Single ownership check: the generation must exist AND belong to the school.
// The denormalized schools.has_generations flag is never consulted here.
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
