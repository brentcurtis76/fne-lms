// Email Showcase Script - Send examples of all Genera email types
const { Resend } = require('resend');

const resend = new Resend('re_QqHY8LSE_Q56Na4bf3nhqLMnu1bVvrYLe');
const testEmail = 'info@nuevaeducacion.org'; // Using verified email for now

// FNE Brand Colors and Styling
const emailStyles = `
  body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
  .header { background: linear-gradient(135deg, #0a0a0a 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
  .header p { margin: 10px 0 0 0; opacity: 0.9; }
  .content { padding: 30px 20px; }
  .notification { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #fbbf24; }
  .notification h3 { margin: 0 0 10px 0; color: #0a0a0a; font-size: 18px; }
  .notification p { margin: 0 0 10px 0; color: #4a5568; line-height: 1.6; }
  .notification small { color: #718096; }
  .cta { display: inline-block; background: #fbbf24; color: #0a0a0a; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .cta:hover { background: #f9b61e; }
  .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
  .footer a { color: #0a0a0a; text-decoration: none; }
  .category { margin-bottom: 25px; }
  .category h2 { color: #0a0a0a; font-size: 18px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #fbbf24; }
  .notification-item { background: #f8fafc; padding: 15px; margin-bottom: 10px; border-radius: 6px; border-left: 3px solid #e2e8f0; }
  .notification-item h4 { margin: 0 0 5px 0; color: #2d3748; font-size: 14px; font-weight: 600; }
  .notification-item p { margin: 0; color: #718096; font-size: 13px; line-height: 1.5; }
  .summary { background: #edf2f7; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
  .summary strong { color: #0a0a0a; }
  .urgent { border-left-color: #ef4044 !important; }
  .success { border-left-color: #22c55e !important; }
  .info { border-left-color: #3b82f6 !important; }
  @media (max-width: 600px) {
    .container { width: 100%; }
    .header { padding: 20px 15px; }
    .content { padding: 20px 15px; }
  }
`;

const emailTemplates = [
  // 1. Assignment Reminder
  {
    subject: '📋 Recordatorio: Tarea pendiente - Análisis de Casos',
    type: 'Assignment Reminder',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 Recordatorio de Tarea</h1>
          </div>
          <div class="content">
            <p>Hola Juan Pérez,</p>
            <div class="notification urgent">
              <h3>Tarea pendiente: Análisis de Casos</h3>
              <p>Tienes una tarea pendiente que vence en <strong>2 días</strong>.</p>
              <p><strong>Curso:</strong> Gestión Educativa Avanzada</p>
              <p><strong>Fecha límite:</strong> 28 de Junio, 2025</p>
              <small>📅 Creada hace 5 días</small>
            </div>
            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app/assignments/123" class="cta">Ver Tarea</a>
            </div>
            <p style="color: #718096; font-size: 14px; margin-top: 30px;">
              <a href="https://fne-lms.vercel.app/profile/notifications" style="color: #0a0a0a;">Cambiar preferencias de notificación</a>
            </p>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>Hub de Transformación</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 2. Course Completion
  {
    subject: '🎉 ¡Felicitaciones! Has completado el curso',
    type: 'Course Completion',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ¡Curso Completado!</h1>
          </div>
          <div class="content">
            <p>¡Excelente trabajo, María González!</p>
            <div class="notification success">
              <h3>Has completado: Liderazgo Educativo</h3>
              <p>🏆 <strong>Progreso:</strong> 100% completado</p>
              <p>📚 <strong>Lecciones:</strong> 12/12 completadas</p>
              <p>⭐ <strong>Evaluación:</strong> Aprobado</p>
              <p>🕐 <strong>Tiempo total:</strong> 15 horas</p>
              <small>📅 Completado el ${new Date().toLocaleDateString('es-ES')}</small>
            </div>
            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app/student/course/456" class="cta">Ver Certificado</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>¡Sigue creciendo profesionalmente!</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 3. New Message Alert
  {
    subject: '💬 Nuevo mensaje en Espacio Colaborativo',
    type: 'New Message Alert',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💬 Nuevo Mensaje</h1>
          </div>
          <div class="content">
            <p>Hola Carlos López,</p>
            <div class="notification info">
              <h3>Mensaje de Ana Ruiz</h3>
              <p>"¿Podrían revisar el documento que subí? Necesito feedback para el proyecto final."</p>
              <p><strong>En:</strong> Grupo de Trabajo - Proyecto Integrador</p>
              <small>📅 Hace 15 minutos</small>
            </div>
            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app/community/workspace" class="cta">Ver Mensaje</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>Mantente conectado con tu equipo</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 4. Feedback Submission (Admin)
  {
    subject: '💡 Nueva retroalimentación enviada',
    type: 'Feedback Submission',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💡 Nueva Retroalimentación</h1>
          </div>
          <div class="content">
            <p>Hola Administrador,</p>
            <div class="notification">
              <h3>Retroalimentación de Luis Morales</h3>
              <p><strong>Tipo:</strong> Sugerencia de mejora</p>
              <p><strong>Mensaje:</strong> "Sería genial tener notificaciones push en la app móvil para no perderse ninguna actualización importante."</p>
              <p><strong>Categoría:</strong> Funcionalidad</p>
              <p><strong>Prioridad:</strong> Media</p>
              <small>📅 ${new Date().toLocaleString('es-ES')}</small>
            </div>
            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app/admin/feedback" class="cta">Revisar Feedback</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>Panel de Administración</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 5. Expense Report Notification
  {
    subject: '💰 Nuevo reporte de gastos enviado',
    type: 'Expense Report',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 Reporte de Gastos</h1>
          </div>
          <div class="content">
            <p>Estimada Gisela Naranjo,</p>
            <div class="notification">
              <h3>Nuevo reporte de gastos</h3>
              <p><strong>Enviado por:</strong> Roberto Silva</p>
              <p><strong>Monto total:</strong> $125.000 CLP</p>
              <p><strong>Período:</strong> Junio 2025</p>
              <p><strong>Categoría:</strong> Capacitación y materiales</p>
              <p><strong>Descripción:</strong> Gastos de transporte y materiales para taller de liderazgo</p>
              <small>📅 Enviado el ${new Date().toLocaleDateString('es-ES')}</small>
            </div>
            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app/expense-reports" class="cta">Revisar Reporte</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>Sistema de Rendición de Gastos</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 6. Daily Digest
  {
    subject: '📊 Resumen diario - 5 notificaciones nuevas',
    type: 'Daily Digest',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📊 Resumen Diario</h1>
            <p>5 notificaciones nuevas</p>
          </div>
          <div class="content">
            <p>Hola Patricia Mendoza,</p>
            <div class="summary">
              <strong>Resumen:</strong> Tienes 5 notificaciones no leídas de las últimas 24 horas.
            </div>
            
            <div class="category">
              <h2>📋 Asignaciones (2)</h2>
              <div class="notification-item">
                <h4>Nueva tarea: Evaluación Diagnóstica</h4>
                <p>Fecha límite: 30 de Junio</p>
                <small>Hace 2 horas</small>
              </div>
              <div class="notification-item">
                <h4>Recordatorio: Entrega de Proyecto</h4>
                <p>Vence mañana a las 23:59</p>
                <small>Hace 4 horas</small>
              </div>
            </div>

            <div class="category">
              <h2>💬 Mensajes (2)</h2>
              <div class="notification-item">
                <h4>Mensaje de Coordinador Académico</h4>
                <p>Reunión de seguimiento programada</p>
                <small>Hace 1 hora</small>
              </div>
              <div class="notification-item">
                <h4>Respuesta en grupo de trabajo</h4>
                <p>Ana comentó en tu propuesta</p>
                <small>Hace 3 horas</small>
              </div>
            </div>

            <div class="category">
              <h2>📚 Cursos (1)</h2>
              <div class="notification-item">
                <h4>Nueva lección disponible</h4>
                <p>Módulo 3: Estrategias de Comunicación</p>
                <small>Hace 6 horas</small>
              </div>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://fne-lms.vercel.app" class="cta">Ver todas las notificaciones</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>
            Este es un resumen diario enviado a patricia.mendoza@ejemplo.cl</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 7. Weekly Summary
  {
    subject: '📈 Resumen semanal - Tu progreso en FNE',
    type: 'Weekly Summary',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📈 Resumen Semanal</h1>
            <p>Semana del 19-25 de Junio</p>
          </div>
          <div class="content">
            <p>Hola Fernando Rojas,</p>
            <div class="summary">
              <strong>Esta semana:</strong> Completaste 3 lecciones, enviaste 2 tareas y participaste en 8 discusiones.
            </div>
            
            <div class="category">
              <h2>🏆 Logros de la Semana</h2>
              <div class="notification-item">
                <h4>✅ Completaste: Módulo de Evaluación</h4>
                <p>100% de progreso en tiempo récord</p>
              </div>
              <div class="notification-item">
                <h4>⭐ Participación destacada</h4>
                <p>8 contribuciones en espacios colaborativos</p>
              </div>
              <div class="notification-item">
                <h4>📝 Tareas entregadas a tiempo</h4>
                <p>2/2 asignaciones completadas</p>
              </div>
            </div>

            <div class="category">
              <h2>📅 Próxima Semana</h2>
              <div class="notification-item">
                <h4>Tarea pendiente: Análisis Crítico</h4>
                <p>Vence el viernes 2 de Julio</p>
              </div>
              <div class="notification-item">
                <h4>Nueva lección: Liderazgo Transformacional</h4>
                <p>Disponible desde el lunes</p>
              </div>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://fne-lms.vercel.app/dashboard" class="cta">Ver Dashboard</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>
            Resumen semanal - Mantente al día con tu progreso</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 8. Password Reset
  {
    subject: '🔐 Solicitud de cambio de contraseña',
    type: 'Password Reset',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Cambio de Contraseña</h1>
          </div>
          <div class="content">
            <p>Hola Usuario,</p>
            <div class="notification urgent">
              <h3>Solicitud de cambio de contraseña</h3>
              <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
              <p><strong>Si fuiste tú:</strong> Haz clic en el botón de abajo para continuar.</p>
              <p><strong>Si no fuiste tú:</strong> Ignora este email. Tu contraseña permanecerá igual.</p>
              <small>⏰ Este enlace expira en 1 hora</small>
            </div>
            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app/reset-password?token=abc123" class="cta">Cambiar Contraseña</a>
            </div>
            <p style="color: #ef4044; font-size: 14px; margin-top: 30px;">
              🔒 Por tu seguridad, nunca compartas este enlace con nadie.
            </p>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>Sistema de Seguridad</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 9. Welcome Email
  {
    subject: '🎉 ¡Bienvenido a Genera!',
    type: 'Welcome Email',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ¡Bienvenido a FNE!</h1>
          </div>
          <div class="content">
            <p>¡Hola y bienvenido, Nuevo Usuario!</p>
            <div class="notification success">
              <h3>Tu cuenta ha sido creada exitosamente</h3>
              <p>Ya puedes acceder a todos los recursos del Hub de Transformación de Fundación Nueva Educación.</p>
              <p><strong>Usuario:</strong> nuevo.usuario@ejemplo.cl</p>
              <p><strong>Rol:</strong> Docente</p>
              <small>📅 Cuenta creada el ${new Date().toLocaleDateString('es-ES')}</small>
            </div>
            
            <div style="margin: 25px 0;">
              <h4 style="color: #0a0a0a; margin-bottom: 15px;">🚀 Primeros pasos:</h4>
              <ul style="color: #4a5568; line-height: 1.8;">
                <li>✅ Completa tu perfil</li>
                <li>📚 Explora los cursos disponibles</li>
                <li>👥 Únete a tu espacio colaborativo</li>
                <li>🔔 Configura tus preferencias de notificación</li>
              </ul>
            </div>

            <div style="text-align: center;">
              <a href="https://fne-lms.vercel.app/profile" class="cta">Completar Perfil</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>¡Tu crecimiento profesional comienza aquí!</p>
          </div>
        </div>
      </body>
      </html>
    `
  },

  // 10. System Maintenance
  {
    subject: '🔧 Mantenimiento programado de la plataforma',
    type: 'System Maintenance',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="utf-8"><style>${emailStyles}</style></head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔧 Mantenimiento Programado</h1>
          </div>
          <div class="content">
            <p>Estimados usuarios de Genera,</p>
            <div class="notification info">
              <h3>Mantenimiento de la plataforma</h3>
              <p>Realizaremos un mantenimiento programado para mejorar el rendimiento y agregar nuevas funcionalidades.</p>
              <p><strong>Fecha:</strong> Domingo 1 de Julio, 2025</p>
              <p><strong>Horario:</strong> 02:00 - 04:00 AM (Chile)</p>
              <p><strong>Duración estimada:</strong> 2 horas</p>
              <p><strong>Impacto:</strong> La plataforma no estará disponible durante este período</p>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="margin: 0 0 10px 0; color: #856404;">💡 ¿Qué puedes hacer?</h4>
              <ul style="margin: 0; color: #856404; font-size: 14px;">
                <li>Descarga cualquier material que necesites</li>
                <li>Completa las tareas pendientes antes del mantenimiento</li>
                <li>Guarda tu progreso en cursos activos</li>
              </ul>
            </div>

            <p style="color: #22c55e; font-weight: 600;">
              ✨ Mejoras que incluiremos: Mejor rendimiento, nueva interfaz de mensajería y sistema de notificaciones mejorado.
            </p>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>Equipo Técnico</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
];

async function sendEmailShowcase() {
  console.log('🎭 Starting Genera Email Showcase...');
  console.log(`📧 Sending ${emailTemplates.length} email examples to: ${testEmail}`);
  
  const results = [];
  
  for (let i = 0; i < emailTemplates.length; i++) {
    const template = emailTemplates[i];
    
    try {
      console.log(`\n📬 Sending ${i + 1}/${emailTemplates.length}: ${template.type}`);
      
      const { data, error } = await resend.emails.send({
        from: 'Genera Showcase <onboarding@resend.dev>',
        to: [testEmail],
        subject: `[${i + 1}/${emailTemplates.length}] ${template.subject}`,
        html: template.html
      });

      if (error) {
        console.error(`❌ Error sending ${template.type}:`, error.message);
        results.push({ type: template.type, status: 'error', error: error.message });
      } else {
        console.log(`✅ Sent successfully - ID: ${data?.id}`);
        results.push({ type: template.type, status: 'success', id: data?.id });
      }

      // Add small delay between emails
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`❌ Failed to send ${template.type}:`, error.message);
      results.push({ type: template.type, status: 'error', error: error.message });
    }
  }

  console.log('\n🎉 Email Showcase Complete!');
  console.log('\n📊 Summary:');
  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📧 Total sent to: ${testEmail}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed emails:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`   - ${r.type}: ${r.error}`);
    });
  }
  
  console.log('\n🔍 Check your inbox for all the email examples!');
  return results;
}

// Run the showcase
sendEmailShowcase().catch(console.error);