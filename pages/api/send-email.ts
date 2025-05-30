import { NextApiRequest, NextApiResponse } from 'next';

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html }: EmailRequest = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // For now, we'll log the email details and return success
    // In production, you would integrate with an email service like:
    // - Resend
    // - SendGrid
    // - AWS SES
    // - Mailgun
    
    console.log('📧 Email notification:', {
      to,
      subject,
      timestamp: new Date().toISOString(),
      preview: html.substring(0, 100) + '...'
    });

    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return res.status(200).json({ 
      success: true, 
      message: 'Email notification logged (ready for email service integration)' 
    });

  } catch (error) {
    console.error('Error processing email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Example integration with Resend (commented out):
/*
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html }: EmailRequest = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await resend.emails.send({
      from: 'FNE LMS <noreply@fne-lms.vercel.app>',
      to: [to],
      subject: subject,
      html: html,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
*/