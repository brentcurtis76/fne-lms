import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Valid enum values - must match database enum types
// NOTE: 'community_workspace' is used (not 'community') to be explicit
// that this refers to community_workspaces table, not growth_communities
const VALID_ENTITY_TYPES = ['user', 'community_workspace'] as const;
const VALID_CONTENT_TYPES = ['course', 'learning_path'] as const;

// UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * GET /api/admin/assignment-matrix/audit-log
 *
 * Fetches assignment audit history for a specific entity or content.
 * At least one filter (entity or content) is required to prevent full table dumps.
 *
 * Query params:
 * - entityType: 'user' | 'community' (required if entityId provided)
 * - entityId: UUID of the entity (required if entityType provided)
 * - contentType: 'course' | 'learning_path' (required if contentId provided)
 * - contentId: UUID of the content (required if contentType provided)
 * - page: page number (default: 1)
 * - pageSize: items per page (default: 20, max: 50)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Metodo ${req.method} no permitido` });
  }

  try {
    const supabaseClient = createPagesServerClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is admin, consultor, or equipo_directivo
    const { data: userRoles } = await supabaseService
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const allowedRoles = ['admin', 'consultor', 'equipo_directivo'];
    const hasAccess = userRoles?.some(r => allowedRoles.includes(r.role_type));

    if (!hasAccess) {
      return res.status(403).json({ error: 'Solo administradores, consultores y equipo directivo pueden acceder' });
    }

    // Parse query params
    const entityType = req.query.entityType as string | undefined;
    const entityId = req.query.entityId as string | undefined;
    const contentType = req.query.contentType as string | undefined;
    const contentId = req.query.contentId as string | undefined;
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const pageSizeParam = Math.max(parseInt((req.query.pageSize as string) || '20', 10), 1);
    const pageSize = Math.min(pageSizeParam, 50);
    const offset = (page - 1) * pageSize;

    // Validate: at least one filter required
    const hasEntityFilter = entityType && entityId;
    const hasContentFilter = contentType && contentId;

    if (!hasEntityFilter && !hasContentFilter) {
      return res.status(400).json({
        error: 'Se requiere al menos un filtro: (entityType + entityId) o (contentType + contentId)'
      });
    }

    // Validate entity type if provided
    if (entityType && !VALID_ENTITY_TYPES.includes(entityType as any)) {
      return res.status(400).json({
        error: `entityType invalido. Valores permitidos: ${VALID_ENTITY_TYPES.join(', ')}`
      });
    }

    // Validate entity ID is UUID if provided
    if (entityId && !isValidUUID(entityId)) {
      return res.status(400).json({ error: 'entityId debe ser un UUID valido' });
    }

    // Validate content type if provided
    if (contentType && !VALID_CONTENT_TYPES.includes(contentType as any)) {
      return res.status(400).json({
        error: `contentType invalido. Valores permitidos: ${VALID_CONTENT_TYPES.join(', ')}`
      });
    }

    // Validate content ID is UUID if provided
    if (contentId && !isValidUUID(contentId)) {
      return res.status(400).json({ error: 'contentId debe ser un UUID valido' });
    }

    // Build query
    let query = supabaseService
      .from('assignment_audit_log')
      .select('*', { count: 'exact' })
      .order('performed_at', { ascending: false });

    // Apply filters (already validated above)
    if (hasEntityFilter) {
      query = query.eq('entity_type', entityType).eq('entity_id', entityId);
    }

    if (hasContentFilter) {
      query = query.eq('content_type', contentType).eq('content_id', contentId);
    }

    // Apply pagination
    query = query.range(offset, offset + pageSize - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      console.error('[audit-log API] Query error:', error);
      return res.status(500).json({ error: 'Error al obtener historial de auditoría' });
    }

    if (!logs || logs.length === 0) {
      return res.status(200).json({
        logs: [],
        total: 0,
        page,
        pageSize
      });
    }

    // Enrich logs with performer names and content titles
    const enrichedLogs = await enrichAuditLogs(supabaseService, logs);

    return res.status(200).json({
      logs: enrichedLogs,
      total: count || 0,
      page,
      pageSize
    });
  } catch (error: any) {
    console.error('[audit-log API] Error:', error);
    return res.status(500).json({ error: error.message || 'Error al obtener historial de auditoría' });
  }
}

interface AuditLogEntry {
  id: string;
  action: 'assigned' | 'unassigned';
  entity_type: 'user' | 'community_workspace';
  entity_id: string;
  content_type: 'course' | 'learning_path';
  content_id: string;
  source: 'direct' | 'learning_path';
  source_learning_path_id: string | null;
  performed_by: string;
  performed_at: string;
  metadata: Record<string, any>;
}

interface EnrichedAuditLog extends AuditLogEntry {
  performerName: string | null;
  performerEmail: string | null;
  entityName: string | null;
  contentTitle: string | null;
  sourceLPName: string | null;
}

async function enrichAuditLogs(
  supabase: any,
  logs: AuditLogEntry[]
): Promise<EnrichedAuditLog[]> {
  // Collect unique IDs for batch fetching
  const performerIds = new Set<string>();
  const userEntityIds = new Set<string>();
  const workspaceEntityIds = new Set<string>();
  const courseIds = new Set<string>();
  const lpIds = new Set<string>();
  const sourceLPIds = new Set<string>();

  logs.forEach(log => {
    performerIds.add(log.performed_by);

    if (log.entity_type === 'user') {
      userEntityIds.add(log.entity_id);
    } else if (log.entity_type === 'community_workspace') {
      workspaceEntityIds.add(log.entity_id);
    }

    if (log.content_type === 'course') {
      courseIds.add(log.content_id);
    } else {
      lpIds.add(log.content_id);
    }

    if (log.source_learning_path_id) {
      sourceLPIds.add(log.source_learning_path_id);
    }
  });

  // Batch fetch all related data
  const [performers, users, workspaces, courses, learningPaths, sourceLPs] = await Promise.all([
    // Performers (users who performed the action)
    performerIds.size > 0
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', Array.from(performerIds))
          .then((r: any) => r.data || [])
      : Promise.resolve([]),

    // User entities
    userEntityIds.size > 0
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', Array.from(userEntityIds))
          .then((r: any) => r.data || [])
      : Promise.resolve([]),

    // Community workspace entities (NOT growth_communities)
    workspaceEntityIds.size > 0
      ? supabase
          .from('community_workspaces')
          .select('id, name')
          .in('id', Array.from(workspaceEntityIds))
          .then((r: any) => r.data || [])
      : Promise.resolve([]),

    // Courses
    courseIds.size > 0
      ? supabase
          .from('courses')
          .select('id, title')
          .in('id', Array.from(courseIds))
          .then((r: any) => r.data || [])
      : Promise.resolve([]),

    // Learning paths
    lpIds.size > 0
      ? supabase
          .from('learning_paths')
          .select('id, name')
          .in('id', Array.from(lpIds))
          .then((r: any) => r.data || [])
      : Promise.resolve([]),

    // Source learning paths
    sourceLPIds.size > 0
      ? supabase
          .from('learning_paths')
          .select('id, name')
          .in('id', Array.from(sourceLPIds))
          .then((r: any) => r.data || [])
      : Promise.resolve([])
  ]);

  // Create lookup maps with explicit types
  const performerMap = new Map<string, { name: string; email: string }>(
    performers.map((p: any) => [
      p.id,
      { name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email, email: p.email }
    ])
  );

  const userMap = new Map<string, string>(
    users.map((u: any) => [
      u.id,
      `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email
    ])
  );

  const workspaceMap = new Map<string, string>(workspaces.map((w: any) => [w.id, w.name]));
  const courseMap = new Map<string, string>(courses.map((c: any) => [c.id, c.title]));
  const lpMap = new Map<string, string>(learningPaths.map((lp: any) => [lp.id, lp.name]));
  const sourceLPMap = new Map<string, string>(sourceLPs.map((lp: any) => [lp.id, lp.name]));

  // Enrich logs
  return logs.map(log => {
    const performer = performerMap.get(log.performed_by);

    let entityName: string | null = null;
    if (log.entity_type === 'user') {
      entityName = userMap.get(log.entity_id) || null;
    } else if (log.entity_type === 'community_workspace') {
      entityName = workspaceMap.get(log.entity_id) || null;
    }

    const contentTitle = log.content_type === 'course'
      ? courseMap.get(log.content_id) || null
      : lpMap.get(log.content_id) || null;

    const sourceLPName = log.source_learning_path_id
      ? sourceLPMap.get(log.source_learning_path_id) || null
      : null;

    return {
      ...log,
      performerName: performer?.name || null,
      performerEmail: performer?.email || null,
      entityName,
      contentTitle,
      sourceLPName
    };
  });
}
