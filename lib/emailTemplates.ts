/**
 * Genera - Email Templates for Notification System
 * Reusable templates for digest emails and immediate notifications
 */

export interface EmailTemplate {
  subject: string | ((data: any) => string);
  generateHTML: (data: any) => string;
  generateText?: (data: any) => string;
}

// Brand colors and styles - Genera palette
const styles = {
  colors: {
    primary: '#0a0a0a',      // Genera Black
    secondary: '#fbbf24',    // Genera Yellow
    success: '#0db14b',
    warning: '#fbbf24',
    danger: '#ef4044',
    gray: '#666666',
    lightGray: '#f5f5f5',
    white: '#ffffff'
  },
  fonts: {
    family: 'Arial, sans-serif',
    sizes: {
      h1: '24px',
      h2: '20px',
      h3: '18px',
      body: '14px',
      small: '12px'
    }
  }
};

// Category labels in Spanish
export const categoryLabels: Record<string, string> = {
  courses: 'Cursos',
  assignments: 'Tareas',
  messaging: 'Mensajería',
  social: 'Social',
  feedback: 'Retroalimentación',
  system: 'Sistema',
  admin: 'Administración',
  workspace: 'Espacio de Trabajo',
  profile: 'Perfil'
};

// Priority labels and colors
export const priorityConfig = {
  high: { label: 'Alta', color: styles.colors.danger },
  medium: { label: 'Media', color: styles.colors.warning },
  low: { label: 'Baja', color: styles.colors.success }
};

/**
 * Base email layout wrapper
 */
function emailLayout(content: string, preheader?: string): string {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Genera</title>
      <!--[if mso]>
      <noscript>
        <xml>
          <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      </noscript>
      <![endif]-->
    </head>
    <body style="margin: 0; padding: 0; font-family: ${styles.fonts.family}; background-color: #f0f0f0;">
      ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${preheader}</div>` : ''}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding: 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="background-color: ${styles.colors.white}; border-radius: 10px; overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="background-color: ${styles.colors.primary}; padding: 30px 40px; text-align: center;">
                  <h1 style="margin: 0; color: ${styles.colors.white}; font-size: 28px; font-weight: 300; letter-spacing: 0.2em;">
                    GENERA
                  </h1>
                  <p style="margin: 10px 0 0 0; color: ${styles.colors.secondary}; font-size: 12px; letter-spacing: 0.15em;">
                    HUB DE TRANSFORMACIÓN
                  </p>
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="padding: 40px;">
                  ${content}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: ${styles.colors.lightGray}; padding: 30px 40px; text-align: center;">
                  <p style="margin: 0 0 10px 0; color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.small};">
                    © ${new Date().getFullYear()} Genera - Fundación Nueva Educación. Todos los derechos reservados.
                  </p>
                  <p style="margin: 0; color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.small};">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/configuration?tab=preferences" 
                       style="color: ${styles.colors.primary}; text-decoration: none;">
                      Administrar preferencias de notificación
                    </a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

/**
 * Daily Digest Email Template
 */
export const dailyDigestTemplate: EmailTemplate = {
  subject: '📊 Resumen Diario - Genera',
  
  generateHTML: (data: {
    userName: string;
    notifications: Record<string, any[]>;
    totalCount: number;
    date: Date;
  }) => {
    const categoriesHTML = Object.entries(data.notifications)
      .map(([category, notifications]) => `
        <div style="margin-bottom: 30px;">
          <h3 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h3}; margin: 0 0 15px 0;">
            ${categoryLabels[category] || category} (${notifications.length})
          </h3>
          ${notifications.map(notif => `
            <div style="margin-bottom: 15px; padding: 15px; background-color: ${styles.colors.lightGray}; border-radius: 8px; border-left: 4px solid ${priorityConfig[notif.importance]?.color || styles.colors.primary};">
              <h4 style="margin: 0 0 5px 0; color: ${styles.colors.primary}; font-size: 16px;">
                ${notif.title}
              </h4>
              <p style="margin: 0 0 10px 0; color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body};">
                ${notif.description}
              </p>
              <div style="font-size: ${styles.fonts.sizes.small}; color: #999;">
                ${new Date(notif.created_at).toLocaleString('es-CL', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                ${notif.importance !== 'normal' ? `
                  <span style="
                    display: inline-block;
                    margin-left: 10px;
                    padding: 2px 8px;
                    background-color: ${priorityConfig[notif.importance]?.color};
                    color: ${styles.colors.white};
                    border-radius: 4px;
                    font-size: 11px;
                  ">
                    Prioridad ${priorityConfig[notif.importance]?.label}
                  </span>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `)
      .join('');

    const content = `
      <h2 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h2}; margin: 0 0 10px 0;">
        ¡Hola ${data.userName}! 👋
      </h2>
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; margin: 0 0 30px 0;">
        Aquí está tu resumen diario de notificaciones del ${data.date.toLocaleDateString('es-CL', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}.
      </p>
      
      <div style="background-color: ${styles.colors.secondary}; color: ${styles.colors.primary}; padding: 15px; border-radius: 8px; margin-bottom: 30px; text-align: center;">
        <p style="margin: 0; font-size: ${styles.fonts.sizes.h3}; font-weight: bold;">
          ${data.totalCount} notificaciones nuevas
        </p>
      </div>
      
      ${categoriesHTML}
      
      <div style="margin-top: 40px; text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/notifications" 
           style="
             display: inline-block;
             padding: 12px 30px;
             background-color: ${styles.colors.secondary};
             color: ${styles.colors.primary};
             text-decoration: none;
             border-radius: 6px;
             font-weight: bold;
             font-size: ${styles.fonts.sizes.body};
           ">
          Ver todas las notificaciones
        </a>
      </div>
    `;
    
    return emailLayout(content, `${data.totalCount} notificaciones nuevas hoy`);
  }
};

/**
 * Weekly Digest Email Template
 */
export const weeklyDigestTemplate: EmailTemplate = {
  subject: '📈 Resumen Semanal - Genera',
  
  generateHTML: (data: {
    userName: string;
    notifications: Record<string, any[]>;
    totalCount: number;
    weekStart: Date;
    weekEnd: Date;
  }) => {
    // Group notifications by day
    const notificationsByDay: Record<string, any[]> = {};
    
    Object.values(data.notifications).flat().forEach(notif => {
      const day = new Date(notif.created_at).toLocaleDateString('es-CL', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
      if (!notificationsByDay[day]) {
        notificationsByDay[day] = [];
      }
      notificationsByDay[day].push(notif);
    });

    const daysHTML = Object.entries(notificationsByDay)
      .map(([day, notifications]) => `
        <div style="margin-bottom: 25px;">
          <h4 style="color: ${styles.colors.primary}; font-size: 16px; margin: 0 0 10px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">
            ${day} (${notifications.length})
          </h4>
          ${notifications.slice(0, 5).map(notif => `
            <div style="margin-bottom: 10px; padding: 10px; background-color: ${styles.colors.lightGray}; border-radius: 6px;">
              <strong style="color: ${styles.colors.primary}; font-size: 14px;">${notif.title}</strong>
              <p style="margin: 5px 0 0 0; color: ${styles.colors.gray}; font-size: 13px;">
                ${notif.description}
              </p>
            </div>
          `).join('')}
          ${notifications.length > 5 ? `
            <p style="margin: 10px 0; color: ${styles.colors.gray}; font-size: 13px; font-style: italic;">
              ... y ${notifications.length - 5} más
            </p>
          ` : ''}
        </div>
      `)
      .join('');

    const content = `
      <h2 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h2}; margin: 0 0 10px 0;">
        ¡Hola ${data.userName}! 📊
      </h2>
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; margin: 0 0 30px 0;">
        Aquí está tu resumen semanal del ${data.weekStart.toLocaleDateString('es-CL')} al ${data.weekEnd.toLocaleDateString('es-CL')}.
      </p>
      
      <div style="display: flex; gap: 15px; margin-bottom: 30px;">
        <div style="flex: 1; background-color: ${styles.colors.primary}; color: ${styles.colors.white}; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0; font-size: 28px;">${data.totalCount}</h3>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Notificaciones totales</p>
        </div>
        <div style="flex: 1; background-color: ${styles.colors.secondary}; color: ${styles.colors.primary}; padding: 20px; border-radius: 8px; text-align: center;">
          <h3 style="margin: 0; font-size: 28px;">${Object.keys(data.notifications).length}</h3>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Categorías activas</p>
        </div>
      </div>
      
      <h3 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h3}; margin: 0 0 20px 0;">
        Resumen por día
      </h3>
      
      ${daysHTML}
      
      <div style="margin-top: 40px; text-align: center;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/notifications" 
           style="
             display: inline-block;
             padding: 12px 30px;
             background-color: ${styles.colors.secondary};
             color: ${styles.colors.primary};
             text-decoration: none;
             border-radius: 6px;
             font-weight: bold;
             font-size: ${styles.fonts.sizes.body};
           ">
          Ver todas las notificaciones
        </a>
      </div>
    `;
    
    return emailLayout(content, `Resumen de ${data.totalCount} notificaciones esta semana`);
  }
};

/**
 * Immediate Notification Email Template
 */
export const immediateNotificationTemplate: EmailTemplate = {
  subject: (data: { title: string }) => `🔔 ${data.title} - Genera`,
  
  generateHTML: (data: {
    userName: string;
    title: string;
    description: string;
    category: string;
    importance: string;
    actionUrl?: string;
    actionText?: string;
  }) => {
    const content = `
      <h2 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h2}; margin: 0 0 20px 0;">
        ${data.title}
      </h2>
      
      <div style="margin-bottom: 20px;">
        <span style="
          display: inline-block;
          padding: 5px 12px;
          background-color: ${styles.colors.lightGray};
          color: ${styles.colors.primary};
          border-radius: 20px;
          font-size: 13px;
        ">
          ${categoryLabels[data.category] || data.category}
        </span>
        ${data.importance !== 'normal' ? `
          <span style="
            display: inline-block;
            margin-left: 10px;
            padding: 5px 12px;
            background-color: ${priorityConfig[data.importance]?.color};
            color: ${styles.colors.white};
            border-radius: 20px;
            font-size: 13px;
          ">
            Prioridad ${priorityConfig[data.importance]?.label}
          </span>
        ` : ''}
      </div>
      
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; line-height: 1.6; margin: 0 0 30px 0;">
        ${data.description}
      </p>
      
      ${data.actionUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.actionUrl}" 
             style="
               display: inline-block;
               padding: 12px 30px;
               background-color: ${styles.colors.secondary};
               color: ${styles.colors.primary};
               text-decoration: none;
               border-radius: 6px;
               font-weight: bold;
               font-size: ${styles.fonts.sizes.body};
             ">
            ${data.actionText || 'Ver más detalles'}
          </a>
        </div>
      ` : ''}
      
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.small}; margin: 0;">
        Esta notificación fue enviada porque tienes las notificaciones inmediatas activadas para ${categoryLabels[data.category] || data.category}.
      </p>
    `;
    
    return emailLayout(content, data.title);
  }
};

/**
 * Meeting Summary Email Template
 * Sent when a facilitator finalizes a meeting summary to the meeting audience.
 */
export interface MeetingSummaryData {
  title: string;
  meetingDates: Date[];
  facilitatorName: string;
  finalizerName: string;
  audience: string;
  attendees: string[];
  summaryHtml: string;
  notesHtml: string;
  agreementsHtml: string;
  commitmentsHtml: string;
  facilitatorMessageHtml?: string;
}

function formatMeetingDate(date: Date): string {
  return date.toLocaleDateString('es-CL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatMeetingDateShort(date: Date): string {
  return date.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isBlankHtml(html: string | undefined | null): boolean {
  if (!html) return true;
  const stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  return stripped.length === 0;
}

export const meetingSummaryTemplate: EmailTemplate = {
  subject: (data: MeetingSummaryData) => `📝 Resumen: ${data.title} - Genera`,

  generateHTML: (data: MeetingSummaryData) => {
    const sortedDates = [...data.meetingDates].sort((a, b) => a.getTime() - b.getTime());
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];

    const dateLine = sortedDates.length > 1 && firstDate && lastDate
      ? `Realizada en ${sortedDates.length} sesiones entre ${formatMeetingDateShort(firstDate)} y ${formatMeetingDateShort(lastDate)}`
      : firstDate
        ? formatMeetingDate(firstDate)
        : '';

    const attendeesChips = data.attendees.length > 0
      ? data.attendees.map(name => `
          <span style="
            display: inline-block;
            margin: 0 6px 6px 0;
            padding: 4px 10px;
            background-color: ${styles.colors.lightGray};
            color: ${styles.colors.primary};
            border-radius: 14px;
            font-size: ${styles.fonts.sizes.small};
          ">${name}</span>
        `).join('')
      : `<span style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.small};">Sin asistentes registrados</span>`;

    const facilitatorMessageSection = !isBlankHtml(data.facilitatorMessageHtml) ? `
      <div style="
        background-color: #fff8e1;
        border-left: 4px solid ${styles.colors.secondary};
        padding: 16px 20px;
        border-radius: 6px;
        margin: 0 0 30px 0;
        color: ${styles.colors.primary};
        font-size: ${styles.fonts.sizes.body};
        line-height: 1.6;
      ">
        <p style="margin: 0 0 8px 0; font-weight: bold; font-size: ${styles.fonts.sizes.small}; text-transform: uppercase; letter-spacing: 0.06em; color: ${styles.colors.gray};">
          Mensaje del facilitador
        </p>
        ${data.facilitatorMessageHtml}
      </div>
    ` : '';

    const notesSection = !isBlankHtml(data.notesHtml) ? `
      <div style="margin: 0 0 30px 0;">
        <h3 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h3}; margin: 0 0 12px 0;">
          Notas
        </h3>
        <div style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.body}; line-height: 1.6;">
          ${data.notesHtml}
        </div>
      </div>
    ` : '';

    const content = `
      <h2 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h2}; margin: 0 0 6px 0;">
        ${data.title}
      </h2>
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; margin: 0 0 4px 0;">
        <strong>Comunidad:</strong> ${data.audience}
      </p>
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; margin: 0 0 4px 0;">
        ${dateLine}
      </p>
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.small}; margin: 0 0 24px 0;">
        Facilitador: ${data.facilitatorName} · Finalizado por: ${data.finalizerName}
      </p>

      ${facilitatorMessageSection}

      <div style="margin: 0 0 30px 0;">
        <h3 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h3}; margin: 0 0 12px 0;">
          Resumen
        </h3>
        <div style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.body}; line-height: 1.6;">
          ${data.summaryHtml}
        </div>
      </div>

      ${notesSection}

      <div style="margin: 0 0 30px 0;">
        <h3 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h3}; margin: 0 0 12px 0;">
          Acuerdos
        </h3>
        <ol style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.body}; line-height: 1.6; padding-left: 20px; margin: 0;">
          ${data.agreementsHtml}
        </ol>
      </div>

      <div style="margin: 0 0 30px 0;">
        <h3 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h3}; margin: 0 0 12px 0;">
          Compromisos
        </h3>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse: collapse; font-size: ${styles.fonts.sizes.body};">
          <thead>
            <tr>
              <th align="left" style="padding: 8px 10px; background-color: ${styles.colors.lightGray}; color: ${styles.colors.primary}; border-bottom: 2px solid #e5e5e5; font-size: ${styles.fonts.sizes.small};">
                Compromiso
              </th>
              <th align="left" style="padding: 8px 10px; background-color: ${styles.colors.lightGray}; color: ${styles.colors.primary}; border-bottom: 2px solid #e5e5e5; font-size: ${styles.fonts.sizes.small};">
                Responsable
              </th>
              <th align="left" style="padding: 8px 10px; background-color: ${styles.colors.lightGray}; color: ${styles.colors.primary}; border-bottom: 2px solid #e5e5e5; font-size: ${styles.fonts.sizes.small};">
                Fecha límite
              </th>
            </tr>
          </thead>
          <tbody>
            ${data.commitmentsHtml}
          </tbody>
        </table>
      </div>

      <div style="margin: 0 0 10px 0;">
        <h3 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h3}; margin: 0 0 12px 0;">
          Asistentes
        </h3>
        <div>${attendeesChips}</div>
      </div>
    `;

    return emailLayout(content, `Resumen: ${data.title}`);
  },

  generateText: (data: MeetingSummaryData) => {
    const sortedDates = [...data.meetingDates].sort((a, b) => a.getTime() - b.getTime());
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];

    const dateLine = sortedDates.length > 1 && firstDate && lastDate
      ? `Realizada en ${sortedDates.length} sesiones entre ${formatMeetingDateShort(firstDate)} y ${formatMeetingDateShort(lastDate)}`
      : firstDate
        ? formatMeetingDate(firstDate)
        : 'Sin fecha registrada';

    const htmlToText = (html: string): string =>
      html
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();

    const sections: string[] = [];
    sections.push(data.title);
    sections.push(`Comunidad: ${data.audience}`);
    sections.push(dateLine);
    sections.push(`Facilitador: ${data.facilitatorName} · Finalizado por: ${data.finalizerName}`);

    if (!isBlankHtml(data.facilitatorMessageHtml)) {
      sections.push(`\nMENSAJE DEL FACILITADOR\n${htmlToText(data.facilitatorMessageHtml!)}`);
    }

    sections.push(`\nRESUMEN\n${htmlToText(data.summaryHtml)}`);

    if (!isBlankHtml(data.notesHtml)) {
      sections.push(`\nNOTAS\n${htmlToText(data.notesHtml)}`);
    }

    sections.push(`\nACUERDOS\n${htmlToText(data.agreementsHtml)}`);
    sections.push(`\nCOMPROMISOS\n${htmlToText(data.commitmentsHtml)}`);

    const attendeesText = data.attendees.length > 0
      ? data.attendees.join(', ')
      : 'Sin asistentes registrados';
    sections.push(`\nASISTENTES\n${attendeesText}`);

    sections.push(`\n---\n© ${new Date().getFullYear()} Genera - Fundación Nueva Educación.`);

    return sections.join('\n');
  },
};

/**
 * Test Email Template (for debugging)
 */
export const testEmailTemplate: EmailTemplate = {
  subject: '🧪 Prueba de Email - Genera',
  
  generateHTML: (data: { userName: string; testType: string }) => {
    const content = `
      <h2 style="color: ${styles.colors.primary}; font-size: ${styles.fonts.sizes.h2}; margin: 0 0 20px 0;">
        Email de Prueba
      </h2>
      
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; margin: 0 0 20px 0;">
        Hola ${data.userName},
      </p>
      
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; margin: 0 0 20px 0;">
        Este es un email de prueba del sistema de notificaciones de Genera.
      </p>
      
      <div style="background-color: ${styles.colors.lightGray}; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: ${styles.colors.primary};">
          <strong>Tipo de prueba:</strong> ${data.testType}
        </p>
        <p style="margin: 10px 0 0 0; color: ${styles.colors.primary};">
          <strong>Fecha y hora:</strong> ${new Date().toLocaleString('es-CL')}
        </p>
      </div>
      
      <p style="color: ${styles.colors.gray}; font-size: ${styles.fonts.sizes.body}; margin: 20px 0;">
        Si recibes este email, significa que el sistema de notificaciones está funcionando correctamente.
      </p>
    `;
    
    return emailLayout(content, 'Email de prueba del sistema');
  }
};