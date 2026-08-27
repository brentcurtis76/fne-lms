/**
 * API endpoint for managing supervisor assignments to networks
 * Handles assigning/removing supervisor_de_red roles
 *
 * SECURITY (B2a): auth → role check → validation → logic, per the repo API
 * pattern. The caller is authenticated and verified as an ACTIVE admin via
 * `checkIsAdmin()`; privileged queries then run on `createServiceRoleClient()`,
 * a server-only client that carries the service-role key and never the caller's
 * JWT. The previous implementation passed `supabaseKey` to the auth-helpers
 * client, which kept sending the CALLER's session JWT as the bearer — PostgREST
 * resolved `authenticated`, not `service_role`, so RLS filtered every lookup
 * this handler makes about OTHER users.
 *
 * Every lookup here fails CLOSED: a failed query is a 500, never treated as
 * "not found" (404) or "no conflicting role" (proceed). `maybeSingle()` keeps a
 * genuine zero-row miss as data:null with NO error, which is what makes the two
 * outcomes distinguishable at all.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { checkIsAdmin, createServiceRoleClient } from '../../../../lib/api-auth';
import { assignSupervisorRole } from '../../../../utils/roleUtils';

interface AssignSupervisorRequest {
  networkId: string;
  userId: string;
}

interface RemoveSupervisorRequest {
  networkId: string;
  userId: string;
}

/**
 * Both ids are uuid columns; a malformed value would reach PostgREST as an
 * invalid cast (22P02) and surface as a 500. Reject it as the 400 it is.
 */
const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { isAdmin, user } = await checkIsAdmin(req, res);

    if (!user) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo administradores pueden gestionar supervisores' });
    }

    const supabaseAdmin = createServiceRoleClient();

    switch (req.method) {
      case 'POST':
        return handleAssignSupervisor(supabaseAdmin, req.body as AssignSupervisorRequest, user.id, res);
      case 'DELETE':
        return handleRemoveSupervisor(supabaseAdmin, req.body as RemoveSupervisorRequest, res);
      case 'GET':
        return handleGetAvailableUsers(supabaseAdmin, req.query.networkId as string, res);
      default:
        res.setHeader('Allow', ['POST', 'DELETE', 'GET']);
        return res.status(405).json({ error: 'Método no permitido' });
    }
  } catch (error) {
    console.error('Error in networks/supervisors API:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

/**
 * POST /api/admin/networks/supervisors - Assign supervisor to network
 */
async function handleAssignSupervisor(
  supabase: any,
  body: AssignSupervisorRequest,
  adminId: string,
  res: NextApiResponse
) {
  try {
    const { networkId, userId } = body || {};

    // Validate input
    if (!networkId || !userId) {
      return res.status(400).json({ error: 'Network ID y User ID son requeridos' });
    }
    if (!isUuid(networkId) || !isUuid(userId)) {
      return res.status(400).json({ error: 'Network ID y User ID deben ser UUID válidos' });
    }

    // Verify network exists. The column is `nombre` — redes_de_colegios has no
    // `name` column, and selecting one errored the whole query; with the error
    // discarded, every assignment answered 404 "Red no encontrada".
    const { data: network, error: networkError } = await supabase
      .from('redes_de_colegios')
      .select('id, nombre')
      .eq('id', networkId)
      .maybeSingle();

    if (networkError) {
      console.error('Error looking up network for supervisor assignment:', networkError);
      return res.status(500).json({ error: 'Error al verificar la red' });
    }
    if (!network) {
      return res.status(404).json({ error: 'Red no encontrada' });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      console.error('Error looking up user for supervisor assignment:', userError);
      return res.status(500).json({ error: 'Error al verificar el usuario' });
    }
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // ONE error-checked query for every active supervisor role the user holds.
    // It backs both rules: a duplicate assignment to the SAME network is
    // rejected, and an active supervisor of ANOTHER network cannot be assigned
    // simultaneously (one-active-network-per-supervisor). The previous code
    // selected the non-existent `redes_de_colegios(name)` here, so the query
    // always errored, the error was discarded, and the rule never fired.
    const { data: activeSupervisorRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        id,
        red_id,
        redes_de_colegios (
          nombre
        )
      `)
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error looking up existing supervisor roles:', rolesError);
      return res.status(500).json({ error: 'Error al verificar las asignaciones de supervisor existentes' });
    }

    const existingRoles = activeSupervisorRoles || [];

    const duplicateRole = existingRoles.find((role: any) => role.red_id === networkId);
    if (duplicateRole) {
      return res.status(409).json({
        error: `El usuario ${user.first_name} ${user.last_name} ya es supervisor de la red "${network.nombre}"`
      });
    }

    const otherNetworkRole = existingRoles[0];
    if (otherNetworkRole) {
      const otherRed = Array.isArray(otherNetworkRole.redes_de_colegios)
        ? otherNetworkRole.redes_de_colegios[0]
        : otherNetworkRole.redes_de_colegios;
      const otherName = otherRed?.nombre;
      return res.status(409).json({
        error: otherName
          ? `El usuario ya es supervisor de otra red: "${otherName}". Un usuario solo puede supervisar una red a la vez.`
          : 'El usuario ya tiene un rol de supervisor activo. Un usuario solo puede supervisar una red a la vez.'
      });
    }

    // Use the roleUtils function to assign supervisor role
    const result = await assignSupervisorRole(supabase, userId, networkId, adminId);

    if (!result.success) {
      const status =
        result.failure === 'network_not_found' ? 404 :
        result.failure === 'duplicate' || result.failure === 'other_network' ? 409 :
        result.failure === 'not_admin' ? 403 :
        500;
      return res.status(status).json({ error: result.error || 'Error al asignar supervisor' });
    }

    // Hygiene, mirroring the removal path and assign-role.ts: the cache is a
    // degraded-path projection only (it cannot authorize — see roleUtils), so a
    // refresh failure is logged, never fatal to an assignment that succeeded.
    const { error: cacheRefreshError } = await supabase.rpc('refresh_user_roles_cache');
    if (cacheRefreshError) {
      console.error('[supervisors API] Failed to refresh user_roles_cache:', cacheRefreshError);
    }

    return res.status(201).json({
      success: true,
      message: `${user.first_name} ${user.last_name} asignado exitosamente como supervisor de la red "${network.nombre}"`
    });
  } catch (error) {
    console.error('Error in handleAssignSupervisor:', error);
    return res.status(500).json({ error: 'Error al asignar supervisor' });
  }
}

/**
 * DELETE /api/admin/networks/supervisors - Remove supervisor from network
 */
async function handleRemoveSupervisor(supabase: any, body: RemoveSupervisorRequest, res: NextApiResponse) {
  try {
    const { networkId, userId } = body || {};

    // Validate input
    if (!networkId || !userId) {
      return res.status(400).json({ error: 'Network ID y User ID son requeridos' });
    }
    if (!isUuid(networkId) || !isUuid(userId)) {
      return res.status(400).json({ error: 'Network ID y User ID deben ser UUID válidos' });
    }

    // Find existing supervisor role.
    //
    // Two defects made this lookup impossible to satisfy, so removing a
    // supervisor always answered 404:
    //   - `user_roles` has TWO foreign keys into `profiles`
    //     (`user_roles_user_id_fkey`, `user_roles_assigned_by_fkey`), so a bare
    //     `profiles(...)` embed is ambiguous — PostgREST answers PGRST201.
    //   - `redes_de_colegios` has no `name` column; it is `nombre`.
    // Both errors were discarded by destructuring only `{ data }`.
    // `maybeSingle()` keeps "no such assignment" as data:null rather than an
    // error, so a genuine 404 stays a 404 once errors are checked.
    const { data: supervisorRole, error: supervisorLookupError } = await supabase
      .from('user_roles')
      .select(`
        id,
        redes_de_colegios (
          nombre
        ),
        profiles:user_id (
          first_name,
          last_name,
          email
        )
      `)
      .eq('user_id', userId)
      .eq('role_type', 'supervisor_de_red')
      .eq('red_id', networkId)
      .eq('is_active', true)
      .maybeSingle();

    // Fail CLOSED: a failed lookup is not proof the assignment is absent.
    if (supervisorLookupError) {
      console.error('Error looking up supervisor role:', supervisorLookupError);
      return res.status(500).json({ error: 'Error al verificar la asignación de supervisor' });
    }

    if (!supervisorRole) {
      return res.status(404).json({ error: 'Asignación de supervisor no encontrada' });
    }

    // Deactivate the role — never delete it, the row is the audit trail.
    // `user_roles` has NO `updated_at` column (baseline.sql:11380), and writing
    // one made PostgREST reject the update (PGRST204), so every removal died
    // here with a 500 even after the lookup above was repaired. The payload is
    // exactly { is_active: false }, mirroring remove-role.ts, and the update
    // reads back the row it touched: an update that matched nothing is a
    // failure, not a success.
    const { data: deactivatedRows, error: deactivateError } = await supabase
      .from('user_roles')
      .update({ is_active: false })
      .eq('id', supervisorRole.id)
      .select('id');

    if (deactivateError) {
      console.error('Error removing supervisor role:', deactivateError);
      return res.status(500).json({ error: 'Error al remover supervisor' });
    }

    if (!deactivatedRows || deactivatedRows.length === 0) {
      console.error('Supervisor role deactivation matched no rows:', supervisorRole.id);
      return res.status(500).json({ error: 'Error al remover supervisor' });
    }

    // Hygiene (see remove-role.ts): the revocation is already enforced by
    // getUserRoles() failing closed; this keeps the cache from serving a stale
    // active row on the degraded path.
    const { error: cacheRefreshError } = await supabase.rpc('refresh_user_roles_cache');
    if (cacheRefreshError) {
      console.error('[supervisors API] Failed to refresh user_roles_cache:', cacheRefreshError);
    }

    // The role is already deactivated by this point, so nothing here may throw:
    // a missing embed must not report failure for a removal that succeeded.
    const profile: any = Array.isArray(supervisorRole.profiles)
      ? supervisorRole.profiles[0]
      : supervisorRole.profiles;
    const red: any = Array.isArray(supervisorRole.redes_de_colegios)
      ? supervisorRole.redes_de_colegios[0]
      : supervisorRole.redes_de_colegios;
    const supervisorName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
      profile?.email ||
      'El supervisor';

    return res.status(200).json({
      success: true,
      message: `${supervisorName} removido exitosamente como supervisor de la red "${red?.nombre ?? ''}"`
    });
  } catch (error) {
    console.error('Error in handleRemoveSupervisor:', error);
    return res.status(500).json({ error: 'Error al remover supervisor' });
  }
}

/**
 * GET /api/admin/networks/supervisors?networkId=xxx - Get available users for supervisor assignment
 */
async function handleGetAvailableUsers(supabase: any, networkId: string, res: NextApiResponse) {
  try {
    if (!networkId) {
      return res.status(400).json({ error: 'Network ID es requerido' });
    }

    // Get users who are not already supervisors of any network
    const { data: availableUsers, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        created_at,
        user_roles!left (
          role_type,
          is_active,
          red_id
        )
      `)
      .is('user_roles.role_type', null)
      .or('user_roles.role_type.neq.supervisor_de_red,user_roles.is_active.eq.false', { foreignTable: 'user_roles' })
      .order('first_name, last_name');

    if (error) {
      console.error('Error fetching available users:', error);
      return res.status(500).json({ error: 'Error al obtener usuarios disponibles' });
    }

    // Filter out users who already have active supervisor roles
    const filteredUsers = availableUsers?.filter((user: any) => {
      const hasSupervisorRole = user.user_roles?.some((role: any) =>
        role.role_type === 'supervisor_de_red' && role.is_active === true
      );
      return !hasSupervisorRole;
    }) || [];

    // Clean up the response
    const cleanUsers = filteredUsers.map((user: any) => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
      created_at: user.created_at
    }));

    return res.status(200).json({
      success: true,
      users: cleanUsers
    });
  } catch (error) {
    console.error('Error in handleGetAvailableUsers:', error);
    return res.status(500).json({ error: 'Error al obtener usuarios disponibles' });
  }
}
