import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    // Create a test email using the professional template
    const testEmailHtml = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #00365b 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .notification { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #fdb933; }
          .notification h3 { margin: 0 0 10px 0; color: #00365b; font-size: 18px; }
          .notification p { margin: 0 0 10px 0; color: #4a5568; line-height: 1.6; }
          .cta { display: inline-block; background: #fdb933; color: #00365b; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
          .success { color: #22c55e; font-weight: 600; }
          .info { background: #eff6ff; border: 1px solid #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Sistema de Email Activado</h1>
          </div>
          
          <div class="content">
            <p style="color: #4a5568; margin-bottom: 20px;">
              ¡Hola!
            </p>
            
            <div class="notification">
              <h3>🚀 Email System Test Successful</h3>
              <p>Este es un email de prueba para verificar que el sistema de notificaciones de FNE LMS está funcionando correctamente.</p>
              <p><strong>Timestamp:</strong> ${new Date().toLocaleString('es-ES')}</p>
            </div>
            
            <div class="info">
              <h4 style="margin: 0 0 10px 0; color: #00365b;">🎯 ¿Qué significa esto?</h4>
              <p style="margin: 0; color: #4a5568; font-size: 14px;">
                Si recibiste este email, significa que:
              </p>
              <ul style="color: #4a5568; font-size: 14px; margin: 10px 0;">
                <li>✅ El servicio de email está configurado correctamente</li>
                <li>✅ Las plantillas profesionales funcionan</li>
                <li>✅ Los usuarios empezarán a recibir notificaciones automáticamente</li>
                <li>✅ Los reportes de gastos ya están enviando emails</li>
              </ul>
            </div>
            
            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app" class="cta">Ir a la plataforma</a>
            </div>
          </div>
          
          <div class="footer">
            <p style="margin: 0 0 10px 0;">
              <strong>Fundación Nueva Educación</strong><br>
              Plataforma de Crecimiento
            </p>
            <p style="margin: 0; color: #a0aec0; font-size: 11px;">
              Email de prueba enviado a ${email}<br>
              Sistema activado: ${new Date().toISOString()}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send test email through our email API
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://fne-lms.vercel.app'}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: email,
        subject: '✅ FNE LMS - Sistema de Email Activado',
        html: testEmailHtml
      })
    });

    const emailResult = await response.json();

    return res.status(200).json({
      success: true,
      message: 'Test email sent',
      emailResult,
      configuration: {
        resendConfigured: !!process.env.RESEND_API_KEY,
        fromAddress: process.env.EMAIL_FROM_ADDRESS || 'notificaciones@nuevaeducacion.org',
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'https://fne-lms.vercel.app'
      }
    });

  } catch (error) {
    console.error('Error sending test email:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}