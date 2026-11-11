import { NextApiRequest, NextApiResponse } from 'next';
import { deliverOutboundEmail } from '../../lib/email/provider';
import { PUBLIC_OUTBOUND_EMAIL } from '../../lib/email/outbound-policy';
import { rateLimit } from '../../lib/rateLimit';
import { SPAM_SUBJECT_TAG, assessFormSubmission } from '../../lib/formSpamGuard';
import { escapeHtml } from '../../lib/utils/html-escape';

interface ContactFormData {
  nombre: string;
  email: string;
  institucion: string;
  cargo?: string;
  interes: string;
  mensaje: string;
  /** Hidden trap field (pages/index.tsx). People never see or fill it. */
  website?: string;
  /** Milliseconds between the form mounting and its submission. */
  elapsedMs?: number;
}

const CONTACT_RECIPIENT = 'info@nuevaeducacion.org';

/**
 * Shown when a submission is refused as automated. Deliberately a visible
 * error with another way in, never a fake success: if the screening is ever
 * wrong about a person, they must be able to tell and still reach FNE.
 */
const CONTACT_BLOCKED_MESSAGE =
  `No pudimos enviar tu mensaje desde este formulario. Por favor escríbenos directamente a ${CONTACT_RECIPIENT}.`;

// Best-effort dampening only, matching the other public form endpoints
// (see pages/api/tractor-signup.ts). It does nothing against the bots that
// actually hit this form — one submission at a time, hours apart — which is
// what lib/formSpamGuard.ts is for.
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
    const { nombre, email, institucion, cargo, interes, mensaje, website, elapsedMs }: ContactFormData =
      req.body;

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

    // Bot screening (lib/formSpamGuard.ts). Two clues, at least one of them
    // strong, refuse the submission with a visible error; one strong clue on
    // its own still delivers it, marked in the subject. Nothing that could be
    // a real message is dropped quietly.
    const spam = assessFormSubmission({
      honeypot: website,
      elapsedMs,
      expectTiming: true,
      email,
      textFields: [
        { label: 'Nombre', value: nombre },
        { label: 'Institución', value: institucion },
        { label: 'Mensaje', value: mensaje, freeText: true },
      ],
    });

    if (spam.verdict === 'blocked') {
      // Kept in the server log with the same fields a delivered message logs,
      // so a wrongly refused submission can still be traced.
      console.warn('[contact] submission refused as automated:', {
        nombre,
        email,
        institucion,
        signals: spam.reasons.map((reason) => reason.signal),
        score: spam.score,
        timestamp: new Date().toISOString(),
      });
      return res.status(422).json({ error: CONTACT_BLOCKED_MESSAGE });
    }

    const possibleSpam = spam.verdict === 'flagged';

    const interestText = interestMap[interes] || interes;

    // Every value below is user-supplied: escape before interpolating into HTML.
    const safeNombre = escapeHtml(nombre);
    const safeEmail = escapeHtml(email);
    const safeInstitucion = escapeHtml(institucion);
    const safeCargo = escapeHtml(cargo);
    const safeInterestText = escapeHtml(interestText);
    const safeMensaje = escapeHtml(mensaje).replace(/\n/g, '<br>');

    // The reasons are this module's own fixed sentences plus a field label;
    // escaped anyway, like everything else that reaches the template.
    const spamNotice = possibleSpam
      ? `
            <div class="spam-notice">
              <strong>Posible spam.</strong> Este mensaje se entregó igual, por si es de una persona real. Motivo:
              <ul>${spam.reasons.map((reason) => `<li>${escapeHtml(reason.detail)}</li>`).join('')}</ul>
            </div>
            `
      : '';

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
            .spam-notice { background-color: #fff4d6; border-left: 4px solid #b7791f; padding: 12px 15px; font-size: 14px; }
            .spam-notice ul { margin: 6px 0 0 0; padding-left: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📧 Contacto Vía Web - FNE</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px;">Mensaje recibido desde el formulario de contacto del sitio web</p>
            </div>
${spamNotice}
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
    const subject = `${possibleSpam ? `${SPAM_SUBJECT_TAG} ` : ''}[Contacto Web FNE] ${subjectSafe(nombre)} - ${subjectSafe(institucion)} (${subjectSafe(interestText)})`;

    // Send the internal notification via Resend (house transactional sender).
    // Soft-fail: a missing key or a transport error is logged, never surfaced
    // to the visitor — the form still reports success, as it did before.
    let emailSent = false;

    try {
      const delivery = await deliverOutboundEmail({
        authorization: PUBLIC_OUTBOUND_EMAIL,
        message: {
          from: process.env.EMAIL_FROM_ADDRESS || 'Genera <notificaciones@nuevaeducacion.org>',
          to: CONTACT_RECIPIENT,
          reply_to: email,
          subject,
          html: htmlContent
        },
      });
      emailSent = delivery.status === 'provider_accepted';
      if (!emailSent) console.error('[contact] notification email not accepted', { status: delivery.status });
    } catch (error) {
      console.error('[contact] outbound email threw:', error);
    }

    // Log successful submission
    console.log('✅ Contact form submission processed:', {
      nombre,
      email,
      institucion,
      interes: interestText,
      timestamp: new Date().toISOString(),
      emailSent,
      possibleSpam
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
