import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Create admin client with service role key for elevated permissions
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Regular client for auth verification
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * API Endpoint: Award Badge and Announce to Community
 *
 * This endpoint:
 * 1. Awards a course completion badge to the user
 * 2. Creates a congratulatory post in the user's community workspace
 *
 * POST /api/badges/award-and-announce
 * Body: { course_id, course_name }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only allow POST method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get auth header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    // Verify the user is authenticated
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const { course_id, course_name } = req.body;

    if (!course_id || !course_name) {
      return res.status(400).json({ error: 'Missing required fields: course_id, course_name' });
    }

    // Get user profile for display name
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return res.status(500).json({ error: 'Failed to fetch user profile' });
    }

    const userName = profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile.first_name || profile.email.split('@')[0];

    // 1. Award the badge
    let badgeAwarded = false;
    try {
      const { data: badgeResult, error: badgeError } = await supabaseAdmin
        .rpc('award_course_completion_badge', {
          p_user_id: user.id,
          p_course_id: course_id,
          p_course_name: course_name
        });

      if (badgeError) {
        // Log but don't fail - badge system might not be configured
        console.warn('Badge award warning:', badgeError.message);
      } else {
        badgeAwarded = badgeResult !== null;
        console.log(`Badge award result for user ${user.id}:`, badgeAwarded ? 'awarded' : 'already exists');
      }
    } catch (badgeErr) {
      console.warn('Badge system not configured:', badgeErr);
    }

    // 2. Get user's community and workspace for congratulatory post
    let postCreated = false;
    try {
      // Get user's active community from user_roles
      const { data: userRole, error: roleError } = await supabaseAdmin
        .from('user_roles')
        .select('community_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('community_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (roleError) {
        console.warn('Error fetching user role:', roleError.message);
      }

      if (userRole?.community_id) {
        // Get or find the workspace for this community
        const { data: workspace, error: wsError } = await supabaseAdmin
          .from('community_workspaces')
          .select('id')
          .eq('community_id', userRole.community_id)
          .eq('is_active', true)
          .maybeSingle();

        if (wsError) {
          console.warn('Error fetching workspace:', wsError.message);
        }

        if (workspace?.id) {
          // Create congratulatory post
          const congratsContent = {
            text: `Ha completado el curso "${course_name}"`,
            formatted: `<p>Ha completado el curso <strong>"${course_name}"</strong></p>`
          };

          const { data: post, error: postError } = await supabaseAdmin
            .from('community_posts')
            .insert({
              workspace_id: workspace.id,
              author_id: user.id,
              type: 'text',
              content: congratsContent,
              visibility: 'community',
            })
            .select('id')
            .single();

          if (postError) {
            // Check if it's a table not found error
            if (postError.message.includes('does not exist')) {
              console.warn('Community posts table not configured');
            } else {
              console.warn('Error creating congratulatory post:', postError.message);
            }
          } else {
            postCreated = true;
            console.log(`Congratulatory post created for user ${user.id} in workspace ${workspace.id}`);
          }
        } else {
          console.log(`No workspace found for community ${userRole.community_id}`);
        }
      } else {
        console.log(`User ${user.id} has no community assigned`);
      }
    } catch (postErr) {
      console.warn('Error creating community post:', postErr);
    }

    return res.status(200).json({
      success: true,
      badge_awarded: badgeAwarded,
      post_created: postCreated,
      message: badgeAwarded
        ? 'Badge awarded and announcement created'
        : 'Badge already exists, announcement attempted'
    });

  } catch (error) {
    console.error('Unexpected error in award-and-announce API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
