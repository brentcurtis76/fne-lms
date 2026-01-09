import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract the authorization token
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  // Verify the user and check admin role
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  
  if (authError || !user) {
    console.error('Auth error:', authError);
    return res.status(401).json({ error: 'Invalid authentication' });
  }

  // Check if user is admin
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // Get analytics type from query
    const { type = 'overview' } = req.query;

    switch (type) {
      case 'overview':
        return await getOverviewAnalytics(res);
      
      case 'preference-trends':
        return await getPreferenceTrends(res);
      
      case 'notification-effectiveness':
        return await getNotificationEffectiveness(res);
      
      case 'user-engagement':
        return await getUserEngagement(res);
      
      default:
        return res.status(400).json({ error: 'Invalid analytics type' });
    }
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getOverviewAnalytics(res: NextApiResponse) {
  try {
    // Get total users with preferences
    const { count: totalUsers } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('*', { count: 'exact', head: true });

    // Get users with DND enabled
    const { count: dndUsers } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('*', { count: 'exact', head: true })
      .eq('do_not_disturb', true);

    // Get users with quiet hours enabled
    const { count: quietHoursUsers } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('*', { count: 'exact', head: true })
      .eq('weekend_quiet', true);

    // Get email frequency distribution
    const { data: emailFrequencies } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('email_frequency')
      .order('email_frequency');

    const frequencyDistribution = emailFrequencies?.reduce((acc, pref) => {
      acc[pref.email_frequency] = (acc[pref.email_frequency] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get recent preference changes
    const { data: recentChanges } = await supabaseAdmin
      .from('notification_preference_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    // Analyze most changed notification types
    const changesByType = recentChanges?.reduce((acc, change) => {
      if (change.notification_type) {
        acc[change.notification_type] = (acc[change.notification_type] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return res.status(200).json({
      success: true,
      data: {
        overview: {
          total_users: totalUsers || 0,
          dnd_enabled: dndUsers || 0,
          quiet_hours_enabled: quietHoursUsers || 0,
          dnd_percentage: totalUsers ? ((dndUsers || 0) / totalUsers * 100).toFixed(1) : 0
        },
        email_frequency_distribution: frequencyDistribution || {},
        most_changed_types: Object.entries(changesByType || {})
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([type, count]) => ({ type, count })),
        recent_changes_count: recentChanges?.length || 0
      }
    });
  } catch (error) {
    console.error('Overview analytics error:', error);
    throw error;
  }
}

async function getPreferenceTrends(res: NextApiResponse) {
  try {
    // Get preference changes over last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: changes } = await supabaseAdmin
      .from('notification_preference_history')
      .select('*')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at');

    // Group by day
    const changesByDay = changes?.reduce((acc, change) => {
      const day = new Date(change.created_at).toISOString().split('T')[0];
      if (!acc[day]) acc[day] = [];
      acc[day].push(change);
      return acc;
    }, {} as Record<string, any[]>);

    // Analyze trends
    const trends = Object.entries(changesByDay || {}).map(([date, dayChanges]) => {
      const changesArray = dayChanges as any[];
      const emailDisabled = changesArray.filter(c => 
        c.new_settings?.email_enabled === false && 
        c.old_settings?.email_enabled === true
      ).length;

      const emailEnabled = changesArray.filter(c => 
        c.new_settings?.email_enabled === true && 
        c.old_settings?.email_enabled === false
      ).length;

      return {
        date,
        total_changes: changesArray.length,
        email_disabled: emailDisabled,
        email_enabled: emailEnabled
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        trends,
        total_changes: changes?.length || 0,
        date_range: {
          start: thirtyDaysAgo.toISOString(),
          end: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Preference trends error:', error);
    throw error;
  }
}

async function getNotificationEffectiveness(res: NextApiResponse) {
  try {
    // Get notification read rates by type
    const { data: notifications } = await supabaseAdmin
      .from('user_notifications')
      .select('category, read_at, created_at')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const effectivenessByCategory = notifications?.reduce((acc, notif) => {
      if (!acc[notif.category]) {
        acc[notif.category] = { total: 0, read: 0 };
      }
      acc[notif.category].total++;
      if (notif.read_at) {
        acc[notif.category].read++;
      }
      return acc;
    }, {} as Record<string, { total: number; read: number }>);

    // Calculate read rates
    const readRates = Object.entries(effectivenessByCategory || {}).map(([category, stats]) => ({
      category,
      total_notifications: stats.total,
      read_count: stats.read,
      read_rate: stats.total > 0 ? (stats.read / stats.total * 100).toFixed(1) : 0
    }));

    // Get digest queue stats
    const { count: pendingDigests } = await supabaseAdmin
      .from('email_digest_queue')
      .select('*', { count: 'exact', head: true })
      .is('sent_at', null);

    const { count: sentDigests } = await supabaseAdmin
      .from('email_digest_queue')
      .select('*', { count: 'exact', head: true })
      .not('sent_at', 'is', null)
      .gte('sent_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    return res.status(200).json({
      success: true,
      data: {
        read_rates_by_category: readRates.sort((a, b) => Number(b.read_rate) - Number(a.read_rate)),
        digest_stats: {
          pending_digests: pendingDigests || 0,
          sent_last_week: sentDigests || 0
        }
      }
    });
  } catch (error) {
    console.error('Notification effectiveness error:', error);
    throw error;
  }
}

async function getUserEngagement(res: NextApiResponse) {
  try {
    // Get users grouped by their preference patterns
    const { data: preferences } = await supabaseAdmin
      .from('user_notification_preferences')
      .select('*');

    const engagementPatterns = {
      highly_engaged: 0, // All notifications enabled
      moderately_engaged: 0, // Some notifications enabled
      low_engaged: 0, // Most notifications disabled
      disengaged: 0 // DND or all notifications off
    };

    preferences?.forEach(pref => {
      if (pref.do_not_disturb) {
        engagementPatterns.disengaged++;
        return;
      }

      const settings = pref.notification_settings || {};
      const enabledCount = Object.values(settings).filter((s: any) => 
        s.in_app_enabled || s.email_enabled
      ).length;

      const totalTypes = Object.keys(settings).length;

      if (totalTypes === 0 || enabledCount === 0) {
        engagementPatterns.disengaged++;
      } else if (enabledCount === totalTypes) {
        engagementPatterns.highly_engaged++;
      } else if (enabledCount > totalTypes / 2) {
        engagementPatterns.moderately_engaged++;
      } else {
        engagementPatterns.low_engaged++;
      }
    });

    // Get most popular notification types
    const typePopularity: Record<string, number> = {};
    
    preferences?.forEach(pref => {
      const settings = pref.notification_settings || {};
      Object.entries(settings).forEach(([type, config]: [string, any]) => {
        if (config.in_app_enabled || config.email_enabled) {
          typePopularity[type] = (typePopularity[type] || 0) + 1;
        }
      });
    });

    const popularTypes = Object.entries(typePopularity)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({
        type,
        enabled_count: count,
        percentage: preferences ? (count / preferences.length * 100).toFixed(1) : 0
      }));

    return res.status(200).json({
      success: true,
      data: {
        engagement_patterns: engagementPatterns,
        popular_notification_types: popularTypes,
        total_users_analyzed: preferences?.length || 0
      }
    });
  } catch (error) {
    console.error('User engagement error:', error);
    throw error;
  }
}