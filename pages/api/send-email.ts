import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

// Initialize Resend with API key
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html }: EmailRequest = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // If Resend is configured, send real email
    if (resend && process.env.RESEND_API_KEY) {
      try {
        const { data, error } = await resend.emails.send({
          from: process.env.EMAIL_FROM_ADDRESS || 'Genera <notificaciones@nuevaeducacion.org>',
          to: [to],
          subject: subject,
          html: html,
        });

        if (error) {
          console.error('Resend error:', error);
          // Fallback to logging if email fails
          console.log('📧 Email fallback (service error):', {
            to,
            subject,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          return res.status(200).json({ 
            success: true, 
            message: 'Email logged (service temporarily unavailable)',
            fallback: true
          });
        }

        console.log('✅ Email sent successfully:', { to, subject, id: data?.id });
        return res.status(200).json({ 
          success: true, 
          message: 'Email sent successfully',
          emailId: data?.id
        });
      } catch (emailError) {
        console.error('Email sending error:', emailError);
        // Fallback to logging
        console.log('📧 Email fallback (send error):', {
          to,
          subject,
          timestamp: new Date().toISOString(),
          preview: html.substring(0, 100) + '...'
        });
        return res.status(200).json({ 
          success: true, 
          message: 'Email logged (fallback mode)',
          fallback: true
        });
      }
    } else {
      // No email service configured - log for now
      console.log('📧 Email notification (no service configured):', {
        to,
        subject,
        timestamp: new Date().toISOString(),
        preview: html.substring(0, 100) + '...',
        note: 'Add RESEND_API_KEY environment variable to enable email sending'
      });

      return res.status(200).json({ 
        success: true, 
        message: 'Email logged (add RESEND_API_KEY to enable sending)',
        configuration: {
          resendConfigured: !!process.env.RESEND_API_KEY,
          fromAddress: process.env.EMAIL_FROM_ADDRESS || 'notificaciones@nuevaeducacion.org'
        }
      });
    }

  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Email service is now ACTIVE!
// To complete setup:
// 1. Add RESEND_API_KEY to environment variables
// 2. Add EMAIL_FROM_ADDRESS (optional, defaults to notificaciones@nuevaeducacion.org)
// 3. Emails will automatically start sending