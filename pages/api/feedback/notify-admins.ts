import { NextApiRequest, NextApiResponse } from 'next';
import notificationService from '../../../lib/notificationService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { feedbackData } = req.body;

    if (!feedbackData) {
      return res.status(400).json({ error: 'Missing feedback data' });
    }

    // Trigger the notification using the server-side service
    const result = await notificationService.triggerNotification('new_feedback', feedbackData);

    if (result.success) {
      res.status(200).json({ 
        success: true, 
        message: 'Notifications sent successfully',
        notificationsCreated: result.notificationsCreated 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error || 'Failed to send notifications' 
      });
    }

  } catch (error: any) {
    console.error('Error in notify-admins API:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    });
  }
}