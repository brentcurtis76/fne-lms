import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { rateLimit } from '../../lib/rateLimit';
import { escapeHtml } from '../../lib/utils/html-escape';

interface ContactFormData {
  nombre: string;
  email: string;
  institucion: string;
  cargo?: string;
  interes: string;
  mensaje: string;
}

const CONTACT_RECIPIENT = 'info@nuevaeducacion.org';

// Best-effort dampening only, matching the other public form endpoints
// (see pages/api/tractor-signup.ts).
const contactRateLimit = rateLimit({ limit: 5, windowMs: 60 * 1000 }, 'contact');

// Map interest values to readable names. The first five keys are what the
// homepage select actually submits (pages/index.tsx); the last three are
// legacy values kept as aliases so older payloads still resolve to a label.
const interestMap: { [key: string]: string } = {
  'inspira': 'Inspira (Pasantía en Barcelona)',
  'inicia': 'Inicia',
  'evoluciona': 'Evoluciona',
  'aula-generativa': 'Aula Generativa',
  'otro': 'Otro proyecto',
  'pasantias': 'Pasantías en Barcelona',
  'consultoria': 'Consultoría educativa',
  'formacion': 'Formación de equipos'
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const allowed = await contactRateLimit(req, res);
  if (!allowed) {
    return; // 429 already sent by the limiter
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

    const interestText = interestMap[interes] || interes;

    // Every value below is user-supplied: escape before interpolating into HTML.
    const safeNombre = escapeHtml(nombre);
    const safeEmail = escapeHtml(email);
    const safeInstitucion = escapeHtml(institucion);
    const safeCargo = escapeHtml(cargo);
    const safeInterestText = escapeHtml(interestText);
    const safeMensaje = escapeHtml(mensaje).replace(/\n/g, '<br>');

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
              <h1>📧 Contacto Vía Web - FNE</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px;">Mensaje recibido desde el formulario de contacto del sitio web</p>
            </div>

            <div class="content">
              <div class="field">
                <div class="label">Nombre:</div>
                <div class="value">${safeNombre}</div>
              </div>

              <div class="field">
                <div class="label">Email:</div>
                <div class="value">${safeEmail}</div>
              </div>

              <div class="field">
                <div class="label">Institución:</div>
                <div class="value">${safeInstitucion}</div>
              </div>

              ${cargo ? `
              <div class="field">
                <div class="label">Cargo:</div>
                <div class="value">${safeCargo}</div>
              </div>
              ` : ''}

              <div class="field">
                <div class="label">Área de Interés:</div>
                <div class="value">${safeInterestText}</div>
              </div>

              <div class="field">
                <div class="label">Mensaje:</div>
                <div class="message">${safeMensaje}</div>
              </div>
            </div>

            <div class="footer">
              <p><strong>📧 Contacto Vía Web - Fundación Nueva Educación</strong></p>
              <p>Este mensaje fue enviado desde el formulario de contacto de nuevaeducacion.org</p>
              <p>Fecha: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Subject is plain text, not HTML — HTML-escaping it would surface literal
    // entities in the inbox. Strip line breaks so a hostile value cannot shape
    // the subject line.
    const subjectSafe = (value: string) => String(value).replace(/[\r\n]+/g, ' ').trim();
    const subject = `[Contacto Web FNE] ${subjectSafe(nombre)} - ${subjectSafe(institucion)} (${subjectSafe(interestText)})`;

    // Send the internal notification via Resend (house transactional sender).
    // Soft-fail: a missing key or a transport error is logged, never surfaced
    // to the visitor — the form still reports success, as it did before.
    let emailSent = false;

    if (!process.env.RESEND_API_KEY) {
      console.log('[contact] RESEND_API_KEY missing; notification email not sent', {
        to: CONTACT_RECIPIENT,
        interes: interestText,
        timestamp: new Date().toISOString()
      });
    } else {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { error } = await resend.emails.send({
          from: process.env.EMAIL_FROM_ADDRESS || 'Genera <notificaciones@nuevaeducacion.org>',
          to: CONTACT_RECIPIENT,
          reply_to: email,
          subject,
          html: htmlContent
        });

        if (error) {
          console.error('[contact] Resend failed:', error);
        } else {
          emailSent = true;
        }
      } catch (error) {
        console.error('[contact] Resend threw:', error);
      }
    }

    // Log successful submission
    console.log('✅ Contact form submission processed:', {
      nombre,
      email,
      institucion,
      interes: interestText,
      timestamp: new Date().toISOString(),
      emailSent
    });

    return res.status(200).json({
      success: true,
      message: 'Mensaje enviado exitosamente. Te responderemos pronto.',
      emailSent
    });

  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Hubo un problema al procesar tu mensaje. Por favor intenta nuevamente.'
    });
  }
}
