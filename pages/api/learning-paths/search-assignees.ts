import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, createServiceRoleClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { v4 as uuidv4 } from 'uuid';

interface SearchAssigneesRequest {
  pathId: string;
  searchType: 'users' | 'groups';
  query: string;
  schoolId?: string;
  page?: number;
  pageSize?: number;
}

interface SearchResult {
  id: string;
  name: string;
  email?: string;
  description?: string;
  member_count?: number;
  isAlreadyAssigned: boolean;
}

interface SearchAssigneesResponse {
  results: SearchResult[];
  hasMore: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

// UUID validation helper
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Sanitize search query
function sanitizeQuery(query: string): string {
  // Remove special characters that could break SQL
  return query.replace(/[%_\\]/g, '\\$&').trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Generate request ID and start timer for observability
  const requestId = uuidv4();
  const startTime = Date.now();
  
  console.log(`[Search Assignees] Request started`, { requestId, method: req.method });
  
  // Only allow POST method
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    console.log(`[Search Assignees] Auth failed`, { requestId });
    return sendAuthError(res, 'Authentication required');
  }
  
  // Check rate limit
  if (!checkRateLimit(user.id)) {
    console.warn(`[Search Assignees] Rate limit exceeded`, { 
      requestId, 
      userId: user.id,
      durationMs: Date.now() - startTime 
    });
    return res.status(429).json({ 
      error: 'Demasiadas solicitudes. Inténtalo de nuevo en un momento.' 
    });
  }

  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    // Check if user has permission to assign learning paths
    const hasPermission = await LearningPathsService.hasManagePermission(
      supabaseClient,
      user.id
    );
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'You do not have permission to assign learning paths' 
      });
    }

    // Validate request body
    const { pathId, searchType, query, schoolId, page = 1, pageSize = 20 } = req.body as SearchAssigneesRequest;

    if (!pathId || !searchType || typeof query !== 'string') {
      console.log(`[Search Assignees] Missing required fields`, { requestId });
      return res.status(400).json({ 
        error: 'pathId, searchType, and query are required' 
      });
    }

    if (!['users', 'groups'].includes(searchType)) {
      console.log(`[Search Assignees] Invalid searchType`, { requestId, searchType });
      return res.status(400).json({ 
        error: 'searchType must be either "users" or "groups"' 
      });
    }
    
    // Validate UUIDs
    if (!isValidUUID(pathId)) {
      console.log(`[Search Assignees] Invalid pathId UUID`, { requestId, pathId });
      return res.status(400).json({ 
        error: 'pathId inválido - debe ser un UUID válido' 
      });
    }
    
    if (schoolId && !isValidUUID(schoolId) && !/^\d+$/.test(schoolId)) {
      console.log(`[Search Assignees] Invalid schoolId`, { requestId, schoolId });
      return res.status(400).json({ 
        error: 'schoolId inválido - debe ser un ID válido' 
      });
    }
    
    // Cap page size to maximum 50
    const safePageSize = Math.min(Math.max(1, pageSize || 20), 50);
    const safePage = Math.max(1, page);
    
    // Sanitize query
    const sanitizedQuery = sanitizeQuery(query);

    // Verify the learning path exists
    const { data: path } = await supabaseClient
      .from('learning_paths')
      .select('id')
      .eq('id', pathId)
      .single();

    if (!path) {
      return res.status(404).json({ error: 'Learning path not found' });
    }

    // Calculate pagination with safe values
    const offset = (safePage - 1) * safePageSize;
    const searchQuery = sanitizedQuery.toLowerCase();

    let results: SearchResult[] = [];
    let totalCount = 0;

    if (searchType === 'users') {
      // Search users with optional school filtering
      let users, count, usersError;
      
      if (schoolId) {
        // Filter by school using a two-step approach to avoid relationship ambiguity
        // Use service role client to bypass RLS restrictions on user_roles table
        console.log(`[Search Assignees] Filtering users by school: ${schoolId}`);
        
        const serviceClient = createServiceRoleClient();
        const { data: userRoles, error: rolesError } = await serviceClient
          .from('user_roles')
          .select('user_id')
          .eq('school_id', schoolId)
          .eq('is_active', true);

        if (rolesError) {
          console.error('[Search Assignees] Failed to query user roles for school filter:', rolesError);
          throw new Error('No se pudo filtrar por colegio: error al consultar roles de usuario');
        }

        if (!userRoles || userRoles.length === 0) {
          console.log(`[Search Assignees] No users found for school: ${schoolId}`);
          users = [];
          count = 0;
          usersError = null;
        } else {
          console.log(`[Search Assignees] Found ${userRoles.length} users in school: ${schoolId}`);
          const userIds = userRoles.map(ur => ur.user_id);
          
          // Then get profiles for those users
          // Use service role client for authorized users to ensure complete visibility
          console.log(`[Search Assignees] Fetching profiles via service role for authorized user`);
          const profileClient = createServiceRoleClient();
          let userQuery = profileClient
            .from('profiles')
            .select('id, first_name, last_name, email', { count: 'exact' })
            .in('id', userIds);

          // Apply search filter if query is not empty
          if (searchQuery) {
            userQuery = userQuery.or(
              `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
            );
          }

          // Apply pagination
          const result = await userQuery
            .order('first_name')
            .range(offset, offset + safePageSize - 1);
          
          users = result.data;
          count = result.count;
          usersError = result.error;
        }
      } else {
        // No school filter - search all users
        let userQuery = supabaseClient
          .from('profiles')
          .select('id, first_name, last_name, email', { count: 'exact' });

        // Apply search filter if query is not empty
        if (searchQuery) {
          userQuery = userQuery.or(
            `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`
          );
        }

        // Apply pagination
        const result = await userQuery
          .order('first_name')
          .range(offset, offset + safePageSize - 1);
        
        users = result.data;
        count = result.count;
        usersError = result.error;
      }

      if (usersError) throw usersError;

      totalCount = count || 0;

      // Get existing assignments for these users
      const userIds = (users || []).map(u => u.id);
      
      let assignments = [];
      if (userIds.length > 0) {
        const { data: assignmentData, error: assignmentError } = await supabaseClient
          .from('learning_path_assignments')
          .select('user_id')
          .eq('path_id', pathId)
          .in('user_id', userIds);
        
        if (assignmentError) {
          console.error('Assignment query error:', assignmentError);
        } else {
          assignments = assignmentData || [];
        }
      }

      const assignedUserIds = new Set(assignments.map(a => a.user_id));

      // Format results
      results = (users || []).map(user => ({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`.trim(),
        email: user.email,
        isAlreadyAssigned: assignedUserIds.has(user.id)
      }));

    } else {
      // Search groups (using community_workspaces table) with optional school filtering
      let groups, count, groupsError;
      
      if (schoolId) {
        // Filter by school using user_roles to find community_ids (communities table doesn't exist)
        // Use service role client to bypass RLS restrictions on user_roles table
        console.log(`[Search Assignees] Filtering groups by school: ${schoolId}`);
        
        const serviceClient = createServiceRoleClient();
        const { data: userRoles, error: rolesError } = await serviceClient
          .from('user_roles')
          .select('community_id')
          .eq('school_id', schoolId)
          .not('community_id', 'is', null)
          .eq('is_active', true);

        if (rolesError) {
          console.error('[Search Assignees] Failed to query user roles for group filter:', rolesError);
          throw new Error('No se pudo filtrar grupos por colegio: error al consultar roles');
        }

        if (!userRoles || userRoles.length === 0) {
          console.log(`[Search Assignees] No groups found for school: ${schoolId}`);
          groups = [];
          count = 0;
          groupsError = null;
        } else {
          // Extract unique community_ids
          const communityIds = Array.from(new Set(userRoles.map((ur: any) => ur.community_id)));
          console.log(`[Search Assignees] Found ${communityIds.length} unique communities in school: ${schoolId}`);
          
          // Then get workspaces for those communities
          let groupQuery = supabaseClient
            .from('community_workspaces')
            .select('id, name, description, community_id', { count: 'exact' })
            .in('community_id', communityIds);

          // Apply search filter if query is not empty
          if (searchQuery) {
            groupQuery = groupQuery.or(
              `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
            );
          }

          // Apply pagination
          const result = await groupQuery
            .order('name')
            .range(offset, offset + safePageSize - 1);
          
          groups = result.data;
          count = result.count;
          groupsError = result.error;
        }
      } else {
        // No school filter - search all groups
        let groupQuery = supabaseClient
          .from('community_workspaces')
          .select('id, name, description, community_id', { count: 'exact' });

        // Apply search filter if query is not empty
        if (searchQuery) {
          groupQuery = groupQuery.or(
            `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
          );
        }

        // Apply pagination
        const result = await groupQuery
          .order('name')
          .range(offset, offset + safePageSize - 1);
        
        groups = result.data;
        count = result.count;
        groupsError = result.error;
      }

      if (groupsError) throw groupsError;

      totalCount = count || 0;

      // Get member counts and existing assignments
      if (groups && groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        const communityIds = groups.map(g => g.community_id);

        // Get member counts (using community_id from workspaces)
        // Use service role client to get accurate counts regardless of RLS
        const serviceClient = createServiceRoleClient();
        const { data: memberCounts } = await serviceClient
          .from('user_roles')
          .select('community_id')
          .in('community_id', communityIds)
          .eq('is_active', true);
        
        const countMap = (memberCounts || []).reduce((acc: any, item: any) => {
          acc[item.community_id] = (acc[item.community_id] || 0) + 1;
          return acc;
        }, {});

        // Get existing assignments
        const { data: assignments } = await supabaseClient
          .from('learning_path_assignments')
          .select('group_id')
          .eq('path_id', pathId)
          .in('group_id', groupIds);

        const assignedGroupIds = new Set((assignments || []).map(a => a.group_id));

        // Format results
        results = groups.map(group => ({
          id: group.id,
          name: group.name,
          description: group.description,
          member_count: countMap[group.community_id] || 0,
          isAlreadyAssigned: assignedGroupIds.has(group.id)
        }));
      }
    }

    // Calculate if there are more pages
    const hasMore = totalCount > offset + safePageSize;

    const response: SearchAssigneesResponse = {
      results,
      hasMore,
      totalCount,
      page: safePage,
      pageSize: safePageSize
    };

    console.log(`[Search Assignees] Success:`, {
      requestId,
      searchType,
      query: query || '(empty)',
      schoolId: schoolId || '(no filter)',
      resultsCount: results.length,
      totalCount,
      page: safePage,
      pageSize: safePageSize,
      hasMore,
      durationMs: Date.now() - startTime
    });

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('[Search Assignees] Error details:', {
      requestId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      pathId,
      searchType,
      query,
      schoolId,
      page: safePage,
      pageSize: safePageSize,
      durationMs: Date.now() - startTime
    });
    
    // Return more specific error messages
    if (error.message?.includes('No se pudo filtrar')) {
      return res.status(500).json({ 
        error: error.message,
        details: 'Error al aplicar el filtro de colegio'
      });
    }
    
    return res.status(500).json({ 
      error: error.message || 'Error al buscar asignados',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}