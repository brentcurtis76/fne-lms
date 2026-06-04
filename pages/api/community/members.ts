import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { rolePriorityIndex } from '../../../utils/roleUtils';

// Service-role client to bypass RLS safely on the server
const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type MemberProfile = {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string | null;
  school_id?: string | null;
  generation_id?: string | null;
  community_id?: string | null;
  created_at?: string;
  external_school_affiliation?: string | null;
  user_roles: Array<{
    id: string;
    user_id: string;
    role_type: string;
    school_id?: string | null;
    generation_id?: string | null;
    community_id?: string | null;
    is_active: boolean;
    assigned_at?: string;
    created_at?: string;
    reporting_scope?: Record<string, any>;
    feedback_scope?: Record<string, any>;
  }>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const sessionClient = createPagesServerClient({ req, res });
    const { data: sessionData } = await sessionClient.auth.getSession();
    const session = sessionData?.session;

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const communityId = (req.query.community_id || req.query.communityId) as string | undefined;
    if (!communityId) {
      return res.status(400).json({ error: 'community_id is required' });
    }

    // Fetch requester roles (service client for robustness)
    const { data: requesterRoles, error: requesterRolesError } = await serviceClient
      .from('user_roles')
      .select('role_type, community_id, is_active')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    if (requesterRolesError) {
      console.error('Error fetching requester roles:', requesterRolesError);
      return res.status(500).json({ error: 'Failed to verify permissions' });
    }

    const isAdmin = requesterRoles?.some(r => r.role_type === 'admin');
    const isMemberOfCommunity = requesterRoles?.some(r => r.community_id === communityId);

    if (!isAdmin && !isMemberOfCommunity) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Load all user_roles for this community (service client bypasses RLS)
    const { data: roleRows, error: rolesError } = await serviceClient
      .from('user_roles')
      .select('id, user_id, role_type, community_id, school_id, generation_id, is_active, assigned_at, created_at')
      .eq('community_id', communityId)
      .eq('is_active', true);

    if (rolesError) {
      console.error('Error fetching community role rows:', rolesError);
      return res.status(500).json({ error: 'Failed to fetch community members' });
    }

    if (!roleRows || roleRows.length === 0) {
      return res.status(200).json({ members: [] as MemberProfile[] });
    }

    const userIds = Array.from(new Set(roleRows.map(r => r.user_id)));

    // Fetch profiles for users
    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('id, email, first_name, last_name, avatar_url, school_id, generation_id, community_id, created_at, external_school_affiliation')
      .in('id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles for community members:', profilesError);
      return res.status(500).json({ error: 'Failed to fetch profiles' });
    }

    // Group by user so a user with multiple active roles in the community
    // appears once with all roles merged. Returning one object per role row
    // would create duplicate cards / duplicate React keys in the UI.
    const byUser = new Map<string, MemberProfile>();
    for (const rr of roleRows) {
      const roleEntry = {
        id: rr.id,
        user_id: rr.user_id,
        role_type: rr.role_type,
        school_id: rr.school_id ?? null,
        generation_id: rr.generation_id ?? null,
        community_id: rr.community_id ?? null,
        is_active: rr.is_active,
        assigned_at: rr.assigned_at,
        created_at: rr.created_at,
        reporting_scope: {},
        feedback_scope: {},
      };

      const existing = byUser.get(rr.user_id);
      if (existing) {
        existing.user_roles.push(roleEntry);
        continue;
      }

      const p = profiles?.find(pr => pr.id === rr.user_id);
      byUser.set(rr.user_id, {
        id: rr.user_id,
        email: p?.email,
        first_name: p?.first_name,
        last_name: p?.last_name,
        avatar_url: p?.avatar_url ?? null,
        school_id: p?.school_id ?? null,
        generation_id: p?.generation_id ?? null,
        community_id: p?.community_id ?? null,
        created_at: p?.created_at,
        external_school_affiliation: p?.external_school_affiliation ?? null,
        user_roles: [roleEntry],
      });
    }

    // Within each member, order roles by the canonical role precedence so that
    // callers that read user_roles[0] (e.g. the @mention role label) get the
    // most significant role deterministically rather than DB row order.
    for (const member of byUser.values()) {
      member.user_roles.sort((a, b) => {
        const pa = rolePriorityIndex(a.role_type);
        const pb = rolePriorityIndex(b.role_type);
        if (pa !== pb) return pa - pb;
        return a.id.localeCompare(b.id);
      });
    }

    // Deterministic ordering: by full name, then email (blank names sort last).
    const members: MemberProfile[] = Array.from(byUser.values()).sort((a, b) => {
      const an = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim().toLowerCase();
      const bn = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim().toLowerCase();
      if (an !== bn) {
        if (!an) return 1;
        if (!bn) return -1;
        return an.localeCompare(bn);
      }
      return (a.email ?? '').toLowerCase().localeCompare((b.email ?? '').toLowerCase());
    });

    return res.status(200).json({ members });
  } catch (error) {
    console.error('Unexpected error in community members API:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

