import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';

const supabase = createClient(
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
  // Verify cron secret for security
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Unauthorized cron attempt:', authHeader);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CRON] Starting enrollment monitoring check...');

    // Query 1: All-time check for zero/null total_lessons
    const { count: allTimeCount, error: error1 } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .or('total_lessons.is.null,total_lessons.eq.0');

    if (error1) {
      console.error('[CRON] Error checking all-time enrollments:', error1);
      return res.status(500).json({ error: 'Query failed', details: error1.message });
    }

    // Query 2: Last 24h check for newly created enrollments with zero total_lessons
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: last24hCount, error: error2 } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .or('total_lessons.is.null,total_lessons.eq.0')
      .gte('created_at', yesterday);

    if (error2) {
      console.error('[CRON] Error checking last 24h enrollments:', error2);
      return res.status(500).json({ error: 'Query failed', details: error2.message });
    }

    const hasIssue = (allTimeCount || 0) > 0 || (last24hCount || 0) > 0;
    const timestamp = new Date().toISOString();

    // Log results
    console.log('[CRON] Enrollment monitoring results:', {
      zero_total_all_time: allTimeCount || 0,
      zero_total_last_24h: last24hCount || 0,
      status: hasIssue ? 'ALERT' : 'ok',
      timestamp
    });

    // Alert if regressions detected
    if (hasIssue) {
      const alertMessage = `⚠️ ENROLLMENT DATA QUALITY ALERT\n\n` +
        `Total enrollments with zero total_lessons: ${allTimeCount || 0}\n` +
        `New enrollments (last 24h): ${last24hCount || 0}\n\n` +
        `This indicates the auto-fill trigger may have failed or been bypassed.\n` +
        `Action required: Investigate course_enrollments table immediately.`;

      console.error('[CRON] ALERT:', alertMessage);

      // Send notification to admins via existing NotificationService
      try {
        // Get admin users to notify
        const { data: adminUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role_type', 'admin')
          .eq('is_active', true)
          .limit(10);

        if (adminUsers && adminUsers.length > 0) {
          const notificationPromises = adminUsers.map(admin =>
            NotificationService.createNotification({
              user_id: admin.user_id,
              title: 'Enrollment Data Quality Alert',
              description: alertMessage,
              category: 'system_alert',
              related_url: '/admin/course-assignments',
              importance: 'high',
              read_at: null,
              event_type: 'data_quality_alert',
              idempotency_key: `enrollment_alert_${timestamp}_${admin.user_id}`
            })
          );

          await Promise.all(notificationPromises);
          console.log('[CRON] Alert notifications sent to', adminUsers.length, 'admins');
        }
      } catch (notifError) {
        console.error('[CRON] Failed to send alert notifications:', notifError);
      }
    } else {
      console.log('[CRON] No issues detected - all enrollments have valid total_lessons');
    }

    return res.status(200).json({
      status: hasIssue ? 'ALERT' : 'ok',
      zero_total_all_time: allTimeCount || 0,
      zero_total_last_24h: last24hCount || 0,
      timestamp,
      alert_sent: hasIssue
    });

  } catch (error) {
    console.error('[CRON] Monitoring error:', error);
    return res.status(500).json({
      error: 'Monitoring failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
