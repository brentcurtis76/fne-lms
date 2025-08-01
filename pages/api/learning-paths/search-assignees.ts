import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '../../../lib/api-auth';
import { LearningPathsService } from '../../../lib/services/learningPathsService';

interface SearchAssigneesRequest {
  pathId: string;
  searchType: 'users' | 'groups';
  query: string;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  // Authenticate user
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
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
    const { pathId, searchType, query, page = 1, pageSize = 20 } = req.body as SearchAssigneesRequest;

    if (!pathId || !searchType || typeof query !== 'string') {
      return res.status(400).json({ 
        error: 'pathId, searchType, and query are required' 
      });
    }

    if (!['users', 'groups'].includes(searchType)) {
      return res.status(400).json({ 
        error: 'searchType must be either "users" or "groups"' 
      });
    }

    // Verify the learning path exists
    const { data: path } = await supabaseClient
      .from('learning_paths')
      .select('id')
      .eq('id', pathId)
      .single();

    if (!path) {
      return res.status(404).json({ error: 'Learning path not found' });
    }

    // Calculate pagination
    const offset = (page - 1) * pageSize;
    const searchQuery = query.trim().toLowerCase();

    let results: SearchResult[] = [];
    let totalCount = 0;

    if (searchType === 'users') {
      // Search users
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
      const { data: users, count, error: usersError } = await userQuery
        .order('first_name')
        .range(offset, offset + pageSize - 1);

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
      // Search groups (using community_workspaces table)
      let groupQuery = supabaseClient
        .from('community_workspaces')
        .select('id, name, description', { count: 'exact' });

      // Apply search filter if query is not empty
      if (searchQuery) {
        groupQuery = groupQuery.or(
          `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
        );
      }

      // Apply pagination
      const { data: groups, count, error: groupsError } = await groupQuery
        .order('name')
        .range(offset, offset + pageSize - 1);

      if (groupsError) throw groupsError;

      totalCount = count || 0;

      // Get member counts and existing assignments
      if (groups && groups.length > 0) {
        const groupIds = groups.map(g => g.id);

        // Get member counts
        const { data: memberCounts } = await supabaseClient
          .from('user_roles')
          .select('community_id')
          .in('community_id', groupIds)
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
          member_count: countMap[group.id] || 0,
          isAlreadyAssigned: assignedGroupIds.has(group.id)
        }));
      }
    }

    // Calculate if there are more pages
    const hasMore = totalCount > offset + pageSize;

    const response: SearchAssigneesResponse = {
      results,
      hasMore,
      totalCount,
      page,
      pageSize
    };

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Search assignees error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to search assignees' 
    });
  }
}