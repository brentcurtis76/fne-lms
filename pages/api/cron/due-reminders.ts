import { NextApiRequest, NextApiResponse } from 'next';
import NotificationService from '../../../lib/notificationService';

/**
 * Cron job API endpoint for processing due date reminders
 * This should be called daily (e.g., at 9 AM) by a cron service
 * 
 * Usage:
 * - Add to vercel.json: { "cron": [{ "path": "/api/cron/due-reminders", "schedule": "0 9 * * *" }] }
 * - Or call manually: curl -X POST https://your-domain.com/api/cron/due-reminders
 * - Or use external cron service like cron-job.org
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify this is a POST request (for security)
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Optional: Add API key verification for security
    const cronApiKey = req.headers['x-cron-key'] || req.body.cronKey;
    const expectedKey = process.env.CRON_API_KEY;
    
    if (expectedKey && cronApiKey !== expectedKey) {
      console.log('❌ Unauthorized cron job access attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('⏰ Starting due date reminder cron job...');
    const startTime = new Date();

    // Get assignments due in the next 24 hours
    const dueAssignments = await NotificationService.getDueAssignments(24);
    
    console.log(`📋 Found ${dueAssignments.length} assignments due within 24 hours`);

    if (dueAssignments.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No due assignments found',
        processedCount: 0,
        executionTime: Date.now() - startTime.getTime()
      });
    }

    let successCount = 0;
    let errorCount = 0;

    // Process each assignment
    for (const assignment of dueAssignments) {
      try {
        // Format due time for notification
        const dueDate = new Date(assignment.due_date);
        const dueTime = dueDate.toLocaleTimeString('es-CL', { 
          hour: '2-digit', 
          minute: '2-digit',
          timeZone: 'America/Santiago'
        });

        // Trigger due date reminder notification
        await NotificationService.triggerNotification('assignment_due_soon', {
          assignment_id: assignment.id,
          course_id: assignment.course_id,
          student_id: assignment.student_id,
          assignment_name: assignment.title,
          course_name: (assignment.courses as any)?.name || 'Curso',
          due_time: dueTime,
          due_date: assignment.due_date
        });

        // Mark reminder as sent to prevent duplicates
        await NotificationService.markReminderSent(assignment.id);
        
        successCount++;
        console.log(`✅ Reminder sent for assignment: ${assignment.title} (${assignment.id})`);

      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to process assignment ${assignment.id}:`, error);
      }
    }

    const executionTime = Date.now() - startTime.getTime();
    
    console.log(`⏰ Due reminder cron job completed in ${executionTime}ms`);
    console.log(`✅ Success: ${successCount}, ❌ Errors: ${errorCount}`);

    return res.status(200).json({ 
      success: true, 
      message: `Processed ${dueAssignments.length} due assignments`,
      processedCount: dueAssignments.length,
      successCount,
      errorCount,
      executionTime
    });

  } catch (error) {
    console.error('❌ Due reminder cron job failed:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Cron job failed: ' + error.message 
    });
  }
}