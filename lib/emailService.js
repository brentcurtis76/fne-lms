import { Resend } from 'resend';
import { supabase } from './supabase';

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY);

export class EmailNotificationService {
  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fne-lms.vercel.app';
    this.fromEmail = process.env.EMAIL_FROM_ADDRESS || 'notificaciones@fne-lms.com';
  }

  /**
   * Send immediate notification email
   */
  async sendImmediateNotification(user, notification) {
    try {
      // Check user preferences first
      const { data: preferences } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Check if email notifications are enabled
      if (!preferences?.email_enabled) {
        console.log('Email notifications disabled for user:', user.id);
        return null;
      }

      // Check notification type preferences
      const typeConfig = preferences.notification_types?.[notification.type];
      if (typeConfig && !typeConfig.email) {
        console.log('Email disabled for notification type:', notification.type);
        return null;
      }

      // Generate email template
      const template = await this.getEmailTemplate('immediate', notification, user);

      // Send email
      const result = await resend.emails.send({
        from: `Genera <${this.fromEmail}>`,
        to: user.email,
        subject: `🔔 ${notification.title}`,
        html: template,
        headers: {
          'X-Priority': this.getPriorityHeader(notification.priority),
          'X-Notification-Type': notification.type,
          'X-Notification-ID': notification.id
        }
      });

      console.log('Email sent successfully:', result);
      return result;
    } catch (error) {
      console.error('Error sending immediate notification email:', error);
      throw error;
    }
  }

  /**
   * Send digest email with multiple notifications
   */
  async sendDigestEmail(user, notifications, digestType) {
    try {
      if (!notifications.length) return null;

      const template = await this.getDigestTemplate(digestType, notifications, user);
      const subject = digestType === 'daily' 
        ? `📊 Resumen diario - ${notifications.length} notificaciones`
        : `📈 Resumen semanal - ${notifications.length} notificaciones`;

      const result = await resend.emails.send({
        from: `Genera <${this.fromEmail}>`,
        to: user.email,
        subject: subject,
        html: template,
        headers: {
          'X-Digest-Type': digestType,
          'X-Notification-Count': notifications.length.toString()
        }
      });

      console.log('Digest email sent successfully:', result);
      return result;
    } catch (error) {
      console.error('Error sending digest email:', error);
      throw error;
    }
  }

  /**
   * Get immediate notification email template
   */
  async getEmailTemplate(type, notification, user) {
    const actionUrl = notification.related_url 
      ? `${this.baseUrl}${notification.related_url}`
      : this.baseUrl;
    
    const preferencesUrl = `${this.baseUrl}/settings/notifications`;

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #0a0a0a 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .notification { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #fbbf24; }
          .notification h3 { margin: 0 0 10px 0; color: #0a0a0a; font-size: 18px; }
          .notification p { margin: 0 0 10px 0; color: #4a5568; line-height: 1.6; }
          .notification small { color: #718096; }
          .cta { display: inline-block; background: #fbbf24; color: #0a0a0a; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .cta:hover { background: #f9b61e; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
          .footer a { color: #0a0a0a; text-decoration: none; }
          .icon { width: 20px; height: 20px; display: inline-block; vertical-align: middle; margin-right: 8px; }
          @media (max-width: 600px) {
            .container { width: 100%; }
            .header { padding: 20px 15px; }
            .content { padding: 20px 15px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Nueva Notificación - Genera</h1>
          </div>
          
          <div class="content">
            <p style="color: #4a5568; margin-bottom: 20px;">
              Hola ${user.full_name || user.email},
            </p>
            
            <div class="notification">
              <h3>${notification.title}</h3>
              <p>${notification.description}</p>
              <small>📅 ${new Date(notification.created_at).toLocaleString('es-ES', {
                dateStyle: 'medium',
                timeStyle: 'short'
              })}</small>
            </div>
            
            ${notification.related_url ? `
              <div style="text-align: center;">
                <a href="${actionUrl}" class="cta">Ver en la plataforma</a>
              </div>
            ` : ''}
            
            <p style="color: #718096; font-size: 14px; margin-top: 30px;">
              ¿No quieres recibir estas notificaciones por email? 
              <a href="${preferencesUrl}" style="color: #0a0a0a;">Cambiar preferencias</a>
            </p>
          </div>
          
          <div class="footer">
            <p style="margin: 0 0 10px 0;">
              <strong>Fundación Nueva Educación</strong><br>
              Hub de Transformación
            </p>
            <p style="margin: 0; color: #a0aec0; font-size: 11px;">
              Este email fue enviado a ${user.email}<br>
              ${this.baseUrl}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get digest email template
   */
  async getDigestTemplate(digestType, notifications, user) {
    const notificationGroups = this.groupNotificationsByCategory(notifications);
    const preferencesUrl = `${this.baseUrl}/settings/notifications`;

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #0a0a0a 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .header p { margin: 10px 0 0 0; opacity: 0.9; }
          .content { padding: 30px 20px; }
          .category { margin-bottom: 30px; }
          .category h2 { color: #0a0a0a; font-size: 18px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #fbbf24; }
          .notification-item { background: #f8fafc; padding: 15px; margin-bottom: 10px; border-radius: 6px; border-left: 3px solid #e2e8f0; }
          .notification-item:hover { border-left-color: #fbbf24; }
          .notification-item h4 { margin: 0 0 5px 0; color: #2d3748; font-size: 14px; font-weight: 600; }
          .notification-item p { margin: 0; color: #718096; font-size: 13px; line-height: 1.5; }
          .notification-item small { color: #a0aec0; font-size: 11px; }
          .cta { display: inline-block; background: #fbbf24; color: #0a0a0a; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
          .summary { background: #edf2f7; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
          .summary strong { color: #0a0a0a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${digestType === 'daily' ? '📊 Resumen Diario' : '📈 Resumen Semanal'}</h1>
            <p>${notifications.length} notificaciones nuevas</p>
          </div>
          
          <div class="content">
            <p style="color: #4a5568; margin-bottom: 20px;">
              Hola ${user.full_name || user.email},
            </p>
            
            <div class="summary">
              <strong>Resumen:</strong> Tienes ${notifications.length} notificaciones no leídas
              ${digestType === 'daily' ? 'de las últimas 24 horas' : 'de la última semana'}.
            </div>
            
            ${Object.entries(notificationGroups).map(([category, items]) => `
              <div class="category">
                <h2>${this.getCategoryName(category)} (${items.length})</h2>
                ${items.slice(0, 5).map(notification => `
                  <div class="notification-item">
                    <h4>${notification.title}</h4>
                    <p>${notification.description}</p>
                    <small>${new Date(notification.created_at).toLocaleString('es-ES', {
                      dateStyle: 'short',
                      timeStyle: 'short'
                    })}</small>
                  </div>
                `).join('')}
                ${items.length > 5 ? `
                  <p style="text-align: center; color: #718096; font-size: 13px;">
                    ... y ${items.length - 5} más
                  </p>
                ` : ''}
              </div>
            `).join('')}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${this.baseUrl}" class="cta">Ver todas las notificaciones</a>
            </div>
            
            <p style="color: #718096; font-size: 14px; margin-top: 30px; text-align: center;">
              <a href="${preferencesUrl}" style="color: #0a0a0a;">Cambiar preferencias de notificación</a>
            </p>
          </div>
          
          <div class="footer">
            <p style="margin: 0 0 10px 0;">
              <strong>Fundación Nueva Educación</strong><br>
              Hub de Transformación
            </p>
            <p style="margin: 0; color: #a0aec0; font-size: 11px;">
              Este es un resumen ${digestType === 'daily' ? 'diario' : 'semanal'} enviado a ${user.email}<br>
              Puedes desactivar estos resúmenes en tus preferencias
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Helper: Group notifications by category
   */
  groupNotificationsByCategory(notifications) {
    return notifications.reduce((groups, notification) => {
      const category = notification.category || 'general';
      if (!groups[category]) groups[category] = [];
      groups[category].push(notification);
      return groups;
    }, {});
  }

  /**
   * Helper: Get category display name
   */
  getCategoryName(category) {
    const names = {
      admin: '🛡️ Administración',
      assignments: '📋 Asignaciones',
      courses: '📚 Cursos',
      messaging: '💬 Mensajes',
      social: '👥 Social',
      feedback: '💡 Retroalimentación',
      system: '⚙️ Sistema',
      workspace: '📁 Espacio de Trabajo',
      general: '📢 General'
    };
    return names[category] || category;
  }

  /**
   * Helper: Get email priority header
   */
  getPriorityHeader(priority) {
    switch (priority) {
      case 'high':
        return '1 (Highest)';
      case 'medium':
        return '3 (Normal)';
      case 'low':
        return '5 (Lowest)';
      default:
        return '3 (Normal)';
    }
  }
}