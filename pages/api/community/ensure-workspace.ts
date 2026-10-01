import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireVerifiedCaller } from '../../../lib/api-auth';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/community/ensure-workspace
 * Creates a community_workspaces row if one doesn't exist yet.
 * Uses the service role client so any authenticated community member
 * can trigger workspace creation (RLS blocks client-side INSERTs).
 *
 * Body: { communityId: string }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate: identity comes from the auth server; the cookie's stored
  // `user` is client-controlled (SM-B015).
  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }

  // communityId is interpolated into the PostgREST `or` filter below, so it
  // must be a bare UUID: anything else could add its own filter terms.
  const { communityId } = req.body;
  if (!communityId || typeof communityId !== 'string' || !UUID_RE.test(communityId)) {
    return res.status(400).json({ error: 'communityId is required' });
  }

  // Verify the user belongs to this community (or is admin)
  const userId = caller.user.id;
  const { data: membership } = await serviceClient
    .from('user_roles')
    .select('id, role_type')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`community_id.eq.${communityId},role_type.eq.admin`)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: 'No access to this community' });
  }

  // Check if workspace already exists
  const { data: existing } = await serviceClient
    .from('community_workspaces')
    .select('id, community_id, name')
    .eq('community_id', communityId)
    .maybeSingle();

  if (existing) {
    return res.status(200).json({ workspace: existing, created: false });
  }

  // Get community info for the workspace name
  const { data: community, error: communityError } = await serviceClient
    .from('growth_communities')
    .select('id, name')
    .eq('id', communityId)
    .single();

  if (communityError || !community) {
    return res.status(404).json({ error: 'Community not found' });
  }

  // Create workspace
  const { data: workspace, error: createError } = await serviceClient
    .from('community_workspaces')
    .insert({
      community_id: communityId,
      name: `Espacio de ${community.name}`,
      description: `Espacio colaborativo para ${community.name}`,
      settings: {
        features: { meetings: true, documents: true, messaging: true, feed: true },
        permissions: { all_can_post: true, all_can_upload: true }
      }
    })
    .select('id, community_id, name')
    .single();

  if (createError) {
    console.error('[ensure-workspace] Error creating workspace:', createError);
    return res.status(500).json({ error: 'Failed to create workspace' });
  }

  return res.status(201).json({ workspace, created: true });
}
