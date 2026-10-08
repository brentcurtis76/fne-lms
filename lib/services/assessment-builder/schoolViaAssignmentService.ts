/**
 * School-level registros: one Equipo Directivo responsible per (school, vía)
 * for every vía whose rule is 'school_responsible' (today Liderazgo and
 * Propósito; see viaRules.ts).
 *
 * Every write goes through the service_role RPCs of migration
 * 20261008120000_via_assignment_rules.sql, which re-check the rule, the actor
 * and the candidate inside the write transaction:
 * - assign_school_via_responsible: first assignment, or a re-send to the same
 *   person (idempotent; repairs a missing registro or grant).
 * - replace_school_via_responsible: allowed only while none of the vía's
 *   registros has been touched; otherwise refused as a whole.
 *
 * Reads use the service client after the API has authorized the caller for
 * the requested school.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AREA_LABELS, type TransformationArea } from '@/types/assessment-builder';
import { applyEligibleTemplateFilter } from '@/lib/services/assessment-builder/templateEligibility';
import { loadViaRules, viasWithTarget } from '@/lib/services/assessment-builder/viaRules';

export type SchoolViaMode = 'assign' | 'replace';

export type SchoolViaOutcome = 'created' | 'attached' | 'already_exists' | 'cancelled' | 'archived';

export interface SchoolViaDetail {
  templateId: string;
  templateName: string;
  instanceId: string;
  outcome: SchoolViaOutcome;
}

export type SchoolViaWriteResult =
  | { kind: 'ok'; mode: 'assigned' | 'resent' | 'replaced'; details: SchoolViaDetail[] }
  | { kind: 'error'; code: string; status: 400 | 403 | 409 | 422 | 500; message: string; templates?: string[] };

/** Stable refusal codes raised by the RPCs → HTTP status + es-CL message. */
const REFUSALS: Record<string, { status: 400 | 403 | 409 | 422 | 500; message: string }> = {
  invalid_arguments: { status: 400, message: 'Parámetros de asignación inválidos.' },
  via_rule_missing: { status: 409, message: 'Esta vía no tiene regla de asignación.' },
  via_not_school_level: {
    status: 409,
    message: 'Esta vía se asigna al docente de cada curso, no a un responsable del equipo directivo.',
  },
  permission_denied: { status: 403, message: 'No tiene permiso para asignar responsables en esta escuela.' },
  responsible_not_eligible: {
    status: 422,
    message: 'La persona seleccionada no es parte activa del equipo directivo de esta escuela.',
  },
  responsible_already_assigned: {
    status: 409,
    message: 'Esta vía ya tiene un responsable. Use «Reemplazar» para cambiarlo.',
  },
  no_active_responsible: { status: 409, message: 'Esta vía aún no tiene responsable. Use «Asignar».' },
  same_responsible: { status: 409, message: 'La persona seleccionada ya es la responsable de esta vía.' },
  registros_already_started: {
    status: 409,
    message:
      'No se puede reemplazar: la persona responsable ya comenzó al menos un registro de esta vía. ' +
      'Contacte a la Fundación para resolverlo.',
  },
  context_missing: {
    status: 409,
    message: 'Complete el contexto transversal de la escuela antes de asignar responsables.',
  },
  snapshot_missing: {
    status: 500,
    message: 'Una plantilla publicada de esta vía no tiene versión publicada. Contacte a la Fundación.',
  },
};

const OUTCOMES: ReadonlySet<string> = new Set(['created', 'attached', 'already_exists', 'cancelled', 'archived']);

function parseDetails(raw: unknown): SchoolViaDetail[] | null {
  if (!Array.isArray(raw)) return null;
  const details: SchoolViaDetail[] = [];
  for (const item of raw) {
    const d = item as Record<string, unknown>;
    if (typeof d?.template_id !== 'string' || typeof d.instance_id !== 'string' || !OUTCOMES.has(String(d.outcome))) {
      return null;
    }
    details.push({
      templateId: d.template_id,
      templateName: typeof d.template_name === 'string' ? d.template_name : '',
      instanceId: d.instance_id,
      outcome: d.outcome as SchoolViaOutcome,
    });
  }
  return details;
}

/** Names of the registros a refused replace reported as already started. */
async function startedTemplateNames(detail: unknown): Promise<string[] | undefined> {
  try {
    const rows = JSON.parse(String(detail ?? '')) as { template_id?: string }[];
    const ids = rows.map((r) => r.template_id).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return undefined;
    const { data } = await supabaseAdmin.from('assessment_templates').select('name').in('id', ids);
    return ((data ?? []) as { name: string }[]).map((t) => t.name);
  } catch {
    return undefined;
  }
}

/**
 * Assigns, re-sends or replaces the responsible of a school-level vía.
 * `by` is the authenticated caller; the RPC re-verifies that they are an
 * active admin or an active equipo_directivo of `schoolId`.
 */
export async function writeSchoolViaResponsible(args: {
  mode: SchoolViaMode;
  schoolId: number;
  area: string;
  userId: string;
  by: string;
}): Promise<SchoolViaWriteResult> {
  const fn = args.mode === 'replace' ? 'replace_school_via_responsible' : 'assign_school_via_responsible';
  const params =
    args.mode === 'replace'
      ? { p_school_id: args.schoolId, p_area: args.area, p_new_user_id: args.userId, p_by: args.by }
      : { p_school_id: args.schoolId, p_area: args.area, p_user_id: args.userId, p_by: args.by };

  const { data, error } = await supabaseAdmin.rpc(fn, params);
  if (error) {
    const code = String(error.message ?? '').trim();
    const known = REFUSALS[code];
    if (!known) {
      console.error(`[schoolVia] ${fn} failed:`, error.message);
      return { kind: 'error', code: 'unexpected', status: 500, message: 'No se pudo completar la asignación. Intente nuevamente.' };
    }
    const templates = code === 'registros_already_started' ? await startedTemplateNames((error as any).details) : undefined;
    return { kind: 'error', code, status: known.status, message: known.message, templates };
  }

  const row = (data ?? null) as { mode?: unknown; details?: unknown } | null;
  const details = parseDetails(row?.details);
  const mode = row?.mode;
  if (!details || (mode !== 'assigned' && mode !== 'resent' && mode !== 'replaced')) {
    return { kind: 'error', code: 'unexpected', status: 500, message: 'La asignación devolvió un resultado inesperado.' };
  }
  return { kind: 'ok', mode, details };
}

export interface SchoolViaPerson {
  id: string;
  name: string;
  email: string | null;
}

export interface SchoolViaOverviewRow {
  area: TransformationArea;
  label: string;
  /** Published, non-archived templates of the vía. */
  templates: { id: string; name: string }[];
  responsible: (SchoolViaPerson & { assignedAt: string }) | null;
  /**
   * Published templates the current responsible does not hold yet (no registro
   * for the school, or no grant): a «Reenviar» delivers them. Cancelled or
   * archived registros are not counted; a re-send never recreates them.
   */
  pendingTemplates: { id: string; name: string }[];
}

export type SchoolViaOverview =
  | { kind: 'ok'; vias: SchoolViaOverviewRow[] }
  | { kind: 'error'; message: string };

async function profilesById(ids: string[]): Promise<Map<string, SchoolViaPerson>> {
  const map = new Map<string, SchoolViaPerson>();
  if (ids.length === 0) return map;
  const { data } = await supabaseAdmin.from('profiles').select('id, name, first_name, last_name, email').in('id', ids);
  for (const p of (data ?? []) as any[]) {
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    map.set(p.id, { id: p.id, name: full || p.name || p.email || 'Sin nombre', email: p.email ?? null });
  }
  return map;
}

/** Every school-level vía with its published templates, responsible and pending delivery. */
export async function getSchoolViaOverview(schoolId: number): Promise<SchoolViaOverview> {
  const rules = await loadViaRules(supabaseAdmin);
  if (rules.kind === 'error') return { kind: 'error', message: rules.message };
  const areas = viasWithTarget(rules.rules, 'school_responsible');
  if (areas.length === 0) return { kind: 'ok', vias: [] };

  const templatesQuery: any = supabaseAdmin.from('assessment_templates').select('id, name, area, status, is_archived');
  const [{ data: templates, error: tErr }, { data: responsibles, error: rErr }, { data: links, error: lErr }] =
    await Promise.all([
      applyEligibleTemplateFilter(templatesQuery).in('area', areas).order('name'),
      supabaseAdmin
        .from('school_via_responsibles')
        .select('area, user_id, assigned_at')
        .eq('school_id', schoolId)
        .eq('is_active', true),
      supabaseAdmin
        .from('school_via_instance_links')
        .select('template_id, instance_id, assessment_instances(cancelled_at, status, assessment_instance_assignees(user_id, can_edit, can_submit))')
        .eq('school_id', schoolId),
    ]);
  if (tErr || rErr || lErr) {
    console.error('[schoolVia] overview read failed:', tErr?.message ?? rErr?.message ?? lErr?.message);
    return { kind: 'error', message: 'No se pudo leer el estado de los registros del equipo directivo.' };
  }

  const people = await profilesById(((responsibles ?? []) as any[]).map((r) => r.user_id));
  const linkByTemplate = new Map<string, any>(((links ?? []) as any[]).map((l) => [l.template_id, l]));

  const vias = areas.map((area): SchoolViaOverviewRow => {
    const viaTemplates = ((templates ?? []) as any[])
      .filter((t) => t.area === area)
      .map((t) => ({ id: t.id as string, name: t.name as string }));
    const resp = ((responsibles ?? []) as any[]).find((r) => r.area === area);
    const person = resp ? people.get(resp.user_id) : undefined;
    const pendingTemplates = resp
      ? viaTemplates.filter((t) => {
          const link = linkByTemplate.get(t.id);
          if (!link) return true;
          const inst = link.assessment_instances;
          if (!inst || inst.cancelled_at || inst.status === 'archived') return false;
          // Delivered only when the responsible can both edit and submit: the
          // RPC upgrades any weaker grant on a re-send.
          return !((inst.assessment_instance_assignees ?? []) as any[]).some(
            (a) => a.user_id === resp.user_id && a.can_edit === true && a.can_submit === true
          );
        })
      : [];
    return {
      area,
      label: AREA_LABELS[area] ?? area,
      templates: viaTemplates,
      responsible: resp
        ? { ...(person ?? { id: resp.user_id, name: 'Sin nombre', email: null }), assignedAt: resp.assigned_at }
        : null,
      pendingTemplates,
    };
  });
  return { kind: 'ok', vias };
}

/** Active Equipo Directivo members of the school: the only possible responsibles. */
export async function listResponsibleCandidates(
  schoolId: number
): Promise<{ kind: 'ok'; people: SchoolViaPerson[] } | { kind: 'error'; message: string }> {
  const { data, error } = await supabaseAdmin
    .from('user_roles')
    .select('user_id')
    .eq('school_id', schoolId)
    .eq('role_type', 'equipo_directivo')
    .eq('is_active', true);
  if (error) {
    console.error('[schoolVia] candidates read failed:', error.message);
    return { kind: 'error', message: 'No se pudo leer el equipo directivo de la escuela.' };
  }
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.user_id as string))];
  const people = await profilesById(ids);
  return {
    kind: 'ok',
    people: ids
      .map((id) => people.get(id) ?? { id, name: 'Sin nombre', email: null })
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  };
}
