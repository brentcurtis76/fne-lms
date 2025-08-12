import { NextApiRequest, NextApiResponse } from 'next';
import { trackFormSubmission } from '../../lib/formSubmissionTracker';

interface ContactFormData {
  nombre: string;
  email: string;
  institucion: string;
  cargo?: string;
  interes: string;
  mensaje: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { nombre, email, institucion, cargo, interes, mensaje }: ContactFormData = req.body;

    // Validate required fields
    if (!nombre || !email || !institucion || !interes || !mensaje) {
      return res.status(400).json({ 
        error: 'Faltan campos obligatorios',
        missing: {
          nombre: !nombre,
          email: !email,
          institucion: !institucion,
          interes: !interes,
          mensaje: !mensaje
        }
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de email inválido' });
    }

    // Map interest values to readable names
    const interestMap: { [key: string]: string } = {
      'pasantias': 'Pasantías en Barcelona',
      'aula-generativa': 'Aula Generativa',
      'consultoria': 'Consultoría educativa',
      'formacion': 'Formación de equipos',
      'otro': 'Otro proyecto'
    };

    const interestText = interestMap[interes] || interes;

    // Create HTML email template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #000; }
            .value { margin-top: 5px; padding: 10px; background-color: white; border-left: 4px solid #000; }
            .message { background-color: white; padding: 15px; border-left: 4px solid #000; margin-top: 10px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Nuevo Mensaje de Contacto - FNE</h1>
            </div>
            
            <div class="content">
              <div class="field">
                <div class="label">Nombre:</div>
                <div class="value">${nombre}</div>
              </div>
              
              <div class="field">
                <div class="label">Email:</div>
                <div class="value">${email}</div>
              </div>
              
              <div class="field">
                <div class="label">Institución:</div>
                <div class="value">${institucion}</div>
              </div>
              
              ${cargo ? `
              <div class="field">
                <div class="label">Cargo:</div>
                <div class="value">${cargo}</div>
              </div>
              ` : ''}
              
              <div class="field">
                <div class="label">Área de Interés:</div>
                <div class="value">${interestText}</div>
              </div>
              
              <div class="field">
                <div class="label">Mensaje:</div>
                <div class="message">${mensaje.replace(/\n/g, '<br>')}</div>
              </div>
            </div>
            
            <div class="footer">
              <p>Este mensaje fue enviado desde el formulario de contacto de nuevaeducacion.org</p>
              <p>Fecha: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Track form submission for limit monitoring
    const trackingResult = await trackFormSubmission({
      senderEmail: email,
      senderName: nombre,
      formType: 'contact'
    });

    // Log tracking info
    if (trackingResult.message) {
      console.log(trackingResult.message);
    }

    // Block submission if limit reached
    if (trackingResult.count >= 50) {
      return res.status(429).json({ 
        error: 'Límite mensual alcanzado',
        message: 'Hemos alcanzado el límite mensual de envíos. Por favor, contáctanos directamente a info@nuevaeducacion.org o intenta nuevamente el próximo mes.',
        count: trackingResult.count,
        limit: 50
      });
    }

    // Send email via Formspree
    let emailSent = false;
    let emailError = null;

    if (process.env.FORMSPREE_ENDPOINT) {
      try {
        const response = await fetch(process.env.FORMSPREE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            name: nombre,
            _replyto: email,
            _subject: `Nuevo contacto de ${nombre} - ${institucion} (${interestText})`,
            institucion: institucion,
            cargo: cargo || 'No especificado',
            interes: interestText,
            message: mensaje,
            _template: 'table', // Use table template for better formatting
            // Additional formatted message
            full_message: `
NUEVO MENSAJE DE CONTACTO - FUNDACIÓN NUEVA EDUCACIÓN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INFORMACIÓN DEL CONTACTO:

• Nombre: ${nombre}
• Email: ${email}
• Institución: ${institucion}
${cargo ? `• Cargo: ${cargo}` : ''}
• Área de Interés: ${interestText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MENSAJE:

${mensaje}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Este mensaje fue enviado desde el formulario de contacto de nuevaeducacion.org
Fecha: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
            `,
          }),
        });

        const result = await response.json();
        
        console.log('Formspree Response:', {
          status: response.status,
          ok: response.ok,
          result: result
        });
        
        if (response.ok && result.ok) {
          emailSent = true;
          console.log('✅ Email sent successfully to info@nuevaeducacion.org via Formspree');
        } else {
          emailError = result.error || result.errors?.join(', ') || 'Email sending failed';
          console.error('Formspree error:', result);
        }
      } catch (error: any) {
        console.error('Formspree error:', error);
        emailError = error.message || 'Email sending failed';
      }
    } else {
      // No email service configured - log for now
      console.log('📧 Email notification (no service configured):', {
        to: 'info@nuevaeducacion.org',
        subject: `Nuevo contacto de ${nombre} - ${institucion} (${interestText})`,
        timestamp: new Date().toISOString(),
        note: 'Add FORMSPREE_ENDPOINT environment variable to enable email sending'
      });
    }

    // Log successful submission
    console.log('✅ Contact form submission processed:', {
      nombre,
      email,
      institucion,
      interes: interestText,
      timestamp: new Date().toISOString(),
      emailSent: emailSent || !emailError
    });

    // Send confirmation email to the user
    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 20px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>¡Gracias por contactarnos!</h1>
            </div>
            
            <div class="content">
              <p>Hola ${nombre},</p>
              
              <p>Hemos recibido tu mensaje sobre <strong>${interestText}</strong> y te responderemos a la brevedad.</p>
              
              <p>Nuestro equipo revisará tu consulta y se pondrá en contacto contigo pronto para conversar sobre cómo podemos acompañar el proceso de transformación educativa en ${institucion}.</p>
              
              <p>¡Gracias por tu interés en la Nueva Educación!</p>
              
              <p>Saludos,<br>
              <strong>Equipo Fundación Nueva Educación</strong></p>
            </div>
            
            <div class="footer">
              <p>Fundación Nueva Educación | ATE certificada por RPA Mineduc</p>
              <p>info@nuevaeducacion.org</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Note: Web3Forms doesn't support sending confirmation emails to users
    // The user will see the success message on the form instead

    return res.status(200).json({ 
      success: true, 
      message: 'Mensaje enviado exitosamente. Te responderemos pronto.',
      emailSent: emailSent || !emailError
    });

  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'Hubo un problema al procesar tu mensaje. Por favor intenta nuevamente.' 
    });
  }
}