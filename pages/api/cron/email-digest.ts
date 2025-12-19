import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { dailyDigestTemplate, weeklyDigestTemplate } from '../../../lib/emailTemplates';

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

interface DigestNotification {
  id: string;
  title: string;
  description: string;
  category: string;
  created_at: string;
  importance: string;
  related_url?: string;
}

interface UserDigest {
  user_id: string;
  email: string;
  full_name: string;
  notification_ids: string[];
  digest_type: 'daily' | 'weekly';
}

interface PendingDigest {
  user_id: string;
  notification_ids: string[];
  digest_type: 'daily' | 'weekly';
  profiles: {
    email: string;
    full_name: string;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Verify the request is from Vercel Cron (or allow manual trigger for testing)
  const authHeader = req.headers.authorization;
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get digest type from query or determine based on day
  let digestType = req.query.type as 'daily' | 'weekly';
  
  // If no type specified, determine based on day of week
  if (!digestType) {
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    digestType = today === 1 ? 'weekly' : 'daily'; // Monday = weekly, other days = daily
  }
  
  if (digestType !== 'daily' && digestType !== 'weekly') {
    return res.status(400).json({ error: 'Invalid digest type. Must be "daily" or "weekly"' });
  }

  try {
    console.log(`📧 Starting ${digestType} email digest process...`);

    // Get all pending digests for today
    const scheduledFor = new Date();
    scheduledFor.setHours(9, 0, 0, 0); // 9 AM today

    const { data: pendingDigests, error: digestError } = await supabaseAdmin
      .from('email_digest_queue')
      .select(`
        user_id,
        notification_ids,
        digest_type,
        profiles!inner(email, full_name)
      `)
      .eq('digest_type', digestType)
      .lte('scheduled_for', scheduledFor.toISOString())
      .is('sent_at', null);

    if (digestError) {
      console.error('Error fetching pending digests:', digestError);
      return res.status(500).json({ error: 'Failed to fetch pending digests' });
    }

    if (!pendingDigests || pendingDigests.length === 0) {
      console.log(`No pending ${digestType} digests found`);
      return res.status(200).json({ 
        success: true, 
        message: `No ${digestType} digests to send`,
        count: 0 
      });
    }

    console.log(`Found ${pendingDigests.length} ${digestType} digests to process`);

    let successCount = 0;
    let errorCount = 0;

    // Process each user's digest
    for (const digest of pendingDigests || []) {
      try {
        // Handle the Supabase join result properly
        const profileData = Array.isArray(digest.profiles) ? digest.profiles[0] : digest.profiles;
        
        const userDigest: UserDigest = {
          user_id: digest.user_id,
          email: profileData?.email || '',
          full_name: profileData?.full_name || '',
          notification_ids: digest.notification_ids,
          digest_type: digestType
        };

        // Fetch the actual notifications
        const { data: notifications, error: notifError } = await supabaseAdmin
          .from('user_notifications')
          .select('*')
          .in('id', userDigest.notification_ids)
          .order('created_at', { ascending: false });

        if (notifError || !notifications || notifications.length === 0) {
          console.error(`Failed to fetch notifications for user ${userDigest.user_id}`);
          errorCount++;
          continue;
        }

        // Group notifications by category
        const groupedNotifications = groupNotificationsByCategory(notifications);

        // Send the digest email
        const emailSent = await sendDigestEmail(userDigest, groupedNotifications, digestType);

        if (emailSent) {
          // Mark digest as sent
          await supabaseAdmin
            .from('email_digest_queue')
            .update({ sent_at: new Date().toISOString() })
            .eq('user_id', userDigest.user_id)
            .eq('digest_type', digestType)
            .lte('scheduled_for', scheduledFor.toISOString());

          successCount++;
          console.log(`✅ Sent ${digestType} digest to user ${userDigest.user_id}`);
        } else {
          errorCount++;
        }

      } catch (error) {
        console.error(`Error processing digest for user:`, error);
        errorCount++;
      }
    }

    // Log summary
    console.log(`📊 ${digestType} digest summary: ${successCount} sent, ${errorCount} failed`);

    return res.status(200).json({
      success: true,
      digest_type: digestType,
      total_processed: pendingDigests.length,
      success_count: successCount,
      error_count: errorCount
    });

  } catch (error) {
    console.error('Email digest cron error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Group notifications by category for better organization
 */
function groupNotificationsByCategory(notifications: DigestNotification[]): Record<string, DigestNotification[]> {
  return notifications.reduce((acc, notif) => {
    if (!acc[notif.category]) {
      acc[notif.category] = [];
    }
    acc[notif.category].push(notif);
    return acc;
  }, {} as Record<string, DigestNotification[]>);
}

/**
 * Send digest email to user
 * This is a placeholder - integrate with your email service
 */
async function sendDigestEmail(
  userDigest: UserDigest,
  groupedNotifications: Record<string, DigestNotification[]>,
  digestType: 'daily' | 'weekly'
): Promise<boolean> {
  try {
    console.log(`📨 Sending ${digestType} digest to user ${userDigest.user_id}`);
    
    // Count total notifications
    const totalNotifications = Object.values(groupedNotifications).reduce(
      (sum, notifications) => sum + notifications.length,
      0
    );

    // Use appropriate template
    const template = digestType === 'daily' ? dailyDigestTemplate : weeklyDigestTemplate;
    
    // Prepare template data
    const templateData = digestType === 'daily' ? {
      userName: userDigest.full_name,
      notifications: groupedNotifications,
      totalCount: totalNotifications,
      date: new Date()
    } : {
      userName: userDigest.full_name,
      notifications: groupedNotifications,
      totalCount: totalNotifications,
      weekStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      weekEnd: new Date()
    };

    // Generate HTML content
    const htmlContent = template.generateHTML(templateData);

    // Get subject (handle both string and function types)
    const subject = typeof template.subject === 'function' 
      ? template.subject(templateData) 
      : template.subject;

    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
    // For now, just log what would be sent
    console.log({
      to: userDigest.email,
      subject: subject,
      user_name: userDigest.full_name,
      notification_count: totalNotifications,
      categories: Object.keys(groupedNotifications),
      digest_type: digestType
    });

    // In production, you would call your email service here
    // Example with SendGrid:
    /*
    const msg = {
      to: userDigest.email,
      from: 'notificaciones@fne.cl',
      subject: subject,
      html: htmlContent,
    };
    
    await sendgrid.send(msg);
    */

    return true; // Simulated success
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

