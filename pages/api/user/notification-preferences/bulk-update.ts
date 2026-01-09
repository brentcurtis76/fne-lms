import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role for bypassing RLS
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract the authorization token
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  // Verify the user
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  
  if (authError || !user) {
    console.error('Auth error:', authError);
    return res.status(401).json({ error: 'Invalid authentication' });
  }

  const userId = user.id;

  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Invalid preferences data' });
    }

    // Get current preferences
    const { data: currentPrefs, error: fetchError } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('notification_settings')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching current preferences:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch current preferences' });
    }

    const currentSettings = currentPrefs?.notification_settings || {};
    const updatedSettings = { ...currentSettings };

    // Track all changes for history
    const changes = [];

    // Apply bulk updates
    for (const [notificationType, updates] of Object.entries(preferences)) {
      if (!updatedSettings[notificationType]) {
        // Initialize with defaults if not exists
        updatedSettings[notificationType] = {
          in_app_enabled: true,
          email_enabled: false,
          frequency: 'immediate',
          priority: 'medium'
        };
      }

      // Track change for history
      const oldSettings = { ...updatedSettings[notificationType] };
      
      // Apply updates
      Object.assign(updatedSettings[notificationType], updates);

      // Only track if there was an actual change
      if (JSON.stringify(oldSettings) !== JSON.stringify(updatedSettings[notificationType])) {
        changes.push({
          user_id: userId,
          notification_type: notificationType,
          old_settings: oldSettings,
          new_settings: updatedSettings[notificationType],
          changed_by: 'user'
        });
      }
    }

    // Update preferences in database
    const { error: updateError } = await supabaseAdmin
      .from('user_notification_preferences')
      .update({
        notification_settings: updatedSettings,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating preferences:', updateError);
      return res.status(500).json({ error: 'Failed to update preferences' });
    }

    // Insert history records for all changes
    if (changes.length > 0) {
      const { error: historyError } = await supabaseAdmin
        .from('notification_preference_history')
        .insert(changes);

      if (historyError) {
        console.error('Error inserting preference history:', historyError);
        // Don't fail the request if history insert fails
      }
    }

    // Return updated preferences
    return res.status(200).json({
      success: true,
      preferences: updatedSettings,
      changes_count: changes.length
    });

  } catch (error) {
    console.error('Error in bulk update:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}