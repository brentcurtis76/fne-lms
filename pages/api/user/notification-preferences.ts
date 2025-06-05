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

  if (req.method === 'GET') {
    try {
      // Fetch user preferences
      const { data: preferences, error: prefsError } = await supabaseAdmin
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (prefsError && prefsError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching preferences:', prefsError);
        return res.status(500).json({ error: 'Failed to fetch preferences' });
      }

      // If no preferences exist, create defaults
      if (!preferences) {
        // Get user role for smart defaults
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        const userRole = profile?.role || 'user';

        // Initialize with smart defaults
        const { data: notificationSettings } = await supabaseAdmin
          .rpc('initialize_notification_settings', {
            p_user_id: userId,
            p_user_role: userRole
          });

        // Create default preferences
        const defaultPreferences = {
          user_id: userId,
          in_app_enabled: true,
          email_enabled: true,
          email_frequency: 'immediate',
          quiet_hours_start: '22:00',
          quiet_hours_end: '07:00',
          weekend_quiet: false,
          priority_override: true,
          auto_group: true,
          max_per_hour: 5,
          do_not_disturb: false,
          mobile_optimization: false,
          notification_settings: notificationSettings || {}
        };

        const { data: newPrefs, error: createError } = await supabaseAdmin
          .from('user_notification_preferences')
          .insert(defaultPreferences)
          .select()
          .single();

        if (createError) {
          console.error('Error creating preferences:', createError);
          return res.status(500).json({ error: 'Failed to create preferences' });
        }

        return res.status(200).json({
          preferences: newPrefs.notification_settings || {},
          global_settings: {
            email_frequency: newPrefs.email_frequency,
            quiet_hours_start: newPrefs.quiet_hours_start,
            quiet_hours_end: newPrefs.quiet_hours_end,
            weekend_quiet: newPrefs.weekend_quiet,
            priority_override: newPrefs.priority_override,
            auto_group: newPrefs.auto_group,
            max_per_hour: newPrefs.max_per_hour,
            do_not_disturb: newPrefs.do_not_disturb,
            mobile_optimization: newPrefs.mobile_optimization
          }
        });
      }

      // Return existing preferences
      return res.status(200).json({
        preferences: preferences.notification_settings || {},
        global_settings: {
          email_frequency: preferences.email_frequency,
          quiet_hours_start: preferences.quiet_hours_start,
          quiet_hours_end: preferences.quiet_hours_end,
          weekend_quiet: preferences.weekend_quiet,
          priority_override: preferences.priority_override,
          auto_group: preferences.auto_group,
          max_per_hour: preferences.max_per_hour,
          do_not_disturb: preferences.do_not_disturb,
          mobile_optimization: preferences.mobile_optimization
        }
      });

    } catch (error) {
      console.error('Error in GET preferences:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { preferences, global_settings } = req.body;

      // Get current preferences for history tracking
      const { data: currentPrefs } = await supabaseAdmin
        .from('user_notification_preferences')
        .select('notification_settings')
        .eq('user_id', userId)
        .single();

      // Update preferences
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (preferences) {
        updateData.notification_settings = preferences;
      }

      if (global_settings) {
        Object.assign(updateData, global_settings);
      }

      const { data: updatedPrefs, error: updateError } = await supabaseAdmin
        .from('user_notification_preferences')
        .update(updateData)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating preferences:', updateError);
        return res.status(500).json({ error: 'Failed to update preferences' });
      }

      // Track preference changes for analytics
      if (preferences && currentPrefs) {
        for (const [notificationType, settings] of Object.entries(preferences)) {
          const oldSettings = currentPrefs.notification_settings?.[notificationType];
          if (JSON.stringify(oldSettings) !== JSON.stringify(settings)) {
            await supabaseAdmin
              .from('notification_preference_history')
              .insert({
                user_id: userId,
                notification_type: notificationType,
                old_settings: oldSettings || {},
                new_settings: settings,
                changed_by: 'user'
              });
          }
        }
      }

      return res.status(200).json({
        success: true,
        preferences: updatedPrefs.notification_settings || {},
        global_settings: {
          email_frequency: updatedPrefs.email_frequency,
          quiet_hours_start: updatedPrefs.quiet_hours_start,
          quiet_hours_end: updatedPrefs.quiet_hours_end,
          weekend_quiet: updatedPrefs.weekend_quiet,
          priority_override: updatedPrefs.priority_override,
          auto_group: updatedPrefs.auto_group,
          max_per_hour: updatedPrefs.max_per_hour,
          do_not_disturb: updatedPrefs.do_not_disturb,
          mobile_optimization: updatedPrefs.mobile_optimization
        }
      });

    } catch (error) {
      console.error('Error in PUT preferences:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}