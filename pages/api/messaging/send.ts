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

    // Get user profile for sender information
    const { data: senderProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, role')
      .eq('id', user.id)
      .single();

    const { recipient_id, content, subject, thread_id, context } = req.body;
    
    if (!recipient_id || !content) {
      return res.status(400).json({ error: 'Missing recipient_id or content' });
    }

    // Create message record
    const messageData = {
      sender_id: user.id,
      recipient_id,
      content,
      subject: subject || 'Mensaje directo',
      thread_id: thread_id || null,
      context: context || 'direct_message',
      sent_at: new Date().toISOString(),
      notification_sent: false
    };

    const { data: messageResult, error: messageError } = await supabaseAdmin
      .from('workspace_messages')
      .insert(messageData)
      .select()
      .single();

    if (messageError) {
      console.error('Error creating message:', messageError);
      return res.status(500).json({ error: 'Failed to send message: ' + messageError.message });
    }

    // Trigger message notification
    try {
      const senderName = senderProfile ? 
        `${senderProfile.first_name} ${senderProfile.last_name}`.trim() : 
        'Un usuario';

      await NotificationService.triggerNotification('message_sent', {
        message_id: messageResult.id,
        sender_id: user.id,
        recipient_id: recipient_id,
        sender_name: senderName,
        content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        context: context || 'mensaje directo'
      });

      // Mark notification as sent
      await supabaseAdmin
        .from('workspace_messages')
        .update({ notification_sent: true })
        .eq('id', messageResult.id);

      console.log(`✅ Message notification triggered for recipient ${recipient_id}`);
    } catch (notificationError) {
      console.error('❌ Failed to trigger message notification:', notificationError);
      // Don't fail the API call if notifications fail
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Message sent successfully',
      messageId: messageResult.id
    });

  } catch (error) {
    console.error('Unexpected error in messaging API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}