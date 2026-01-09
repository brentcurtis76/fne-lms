import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';

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

    const { mentioned_user_id, context, discussion_id, content } = req.body;
    
    if (!mentioned_user_id || !context) {
      return res.status(400).json({ error: 'Missing mentioned_user_id or context' });
    }

    // Get user profile for mention author information
    const { data: authorProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();

    // Create mention record
    const mentionData = {
      author_id: user.id,
      mentioned_user_id,
      context,
      discussion_id: discussion_id || null,
      content: content || '',
      created_at: new Date().toISOString()
    };

    const { data: mentionResult, error: mentionError } = await supabaseAdmin
      .from('user_mentions')
      .insert(mentionData)
      .select()
      .single();

    if (mentionError) {
      console.error('Error creating mention:', mentionError);
      return res.status(500).json({ error: 'Failed to create mention: ' + mentionError.message });
    }

    // Trigger mention notification
    try {
      const authorName = authorProfile ? 
        `${authorProfile.first_name} ${authorProfile.last_name}`.trim() : 
        'Un usuario';

      await NotificationService.triggerNotification('user_mentioned', {
        mention_id: mentionResult.id,
        author_id: user.id,
        mentioned_user_id: mentioned_user_id,
        author_name: authorName,
        context: context,
        discussion_id: discussion_id || null,
        content_preview: content ? content.substring(0, 100) : ''
      });

      console.log(`✅ Mention notification triggered for user ${mentioned_user_id}`);
    } catch (notificationError) {
      console.error('❌ Failed to trigger mention notification:', notificationError);
      // Don't fail the API call if notifications fail
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Mention created successfully',
      mentionId: mentionResult.id
    });

  } catch (error) {
    console.error('Unexpected error in mention API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}