import React, { useState } from 'react';
import { GetStaticProps } from 'next';

// Email template data (same as the showcase script)
const emailTemplates = [
  {
    subject: '📋 Recordatorio: Tarea pendiente - Análisis de Casos',
    type: 'Assignment Reminder',
    category: 'Assignments',
    description: 'Reminds students about pending assignments with due dates and direct links.',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #00365b 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .notification { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #fdb933; }
          .urgent { border-left-color: #ef4044 !important; }
          .notification h3 { margin: 0 0 10px 0; color: #00365b; font-size: 18px; }
          .notification p { margin: 0 0 10px 0; color: #4a5568; line-height: 1.6; }
          .notification small { color: #718096; }
          .cta { display: inline-block; background: #fdb933; color: #00365b; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
        </style>
      </head>
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
              <a href="#" class="cta">Ver Tarea</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>Plataforma de Crecimiento</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    subject: '🎉 ¡Felicitaciones! Has completado el curso',
    type: 'Course Completion',
    category: 'Courses',
    description: 'Congratulates users on course completion with progress summary and certificate access.',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #00365b 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .notification { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #fdb933; }
          .success { border-left-color: #22c55e !important; }
          .notification h3 { margin: 0 0 10px 0; color: #00365b; font-size: 18px; }
          .notification p { margin: 0 0 10px 0; color: #4a5568; line-height: 1.6; }
          .notification small { color: #718096; }
          .cta { display: inline-block; background: #fdb933; color: #00365b; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
        </style>
      </head>
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
              <small>📅 Completado el 26 de Junio, 2025</small>
            </div>
            <div style="text-align: center;">
              <a href="#" class="cta">Ver Certificado</a>
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
  {
    subject: '📊 Resumen diario - 5 notificaciones nuevas',
    type: 'Daily Digest',
    category: 'Digests',
    description: 'Daily summary email with categorized notifications and activity overview.',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #00365b 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .header p { margin: 10px 0 0 0; opacity: 0.9; }
          .content { padding: 30px 20px; }
          .category { margin-bottom: 25px; }
          .category h2 { color: #00365b; font-size: 18px; margin: 0 0 15px 0; padding-bottom: 10px; border-bottom: 2px solid #fdb933; }
          .notification-item { background: #f8fafc; padding: 15px; margin-bottom: 10px; border-radius: 6px; border-left: 3px solid #e2e8f0; }
          .notification-item h4 { margin: 0 0 5px 0; color: #2d3748; font-size: 14px; font-weight: 600; }
          .notification-item p { margin: 0; color: #718096; font-size: 13px; line-height: 1.5; }
          .notification-item small { color: #a0aec0; font-size: 11px; }
          .cta { display: inline-block; background: #fdb933; color: #00365b; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
          .summary { background: #edf2f7; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
          .summary strong { color: #00365b; }
        </style>
      </head>
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

            <div style="text-align: center; margin: 30px 0;">
              <a href="#" class="cta">Ver todas las notificaciones</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>
            Este es un resumen diario enviado automáticamente</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    subject: '💰 Nuevo reporte de gastos enviado',
    type: 'Expense Report',
    category: 'Administrative',
    description: 'Notification for new expense report submissions with financial details.',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #00365b 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .notification { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #fdb933; }
          .notification h3 { margin: 0 0 10px 0; color: #00365b; font-size: 18px; }
          .notification p { margin: 0 0 10px 0; color: #4a5568; line-height: 1.6; }
          .notification small { color: #718096; }
          .cta { display: inline-block; background: #fdb933; color: #00365b; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
        </style>
      </head>
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
              <small>📅 Enviado el 26 de Junio, 2025</small>
            </div>
            <div style="text-align: center;">
              <a href="#" class="cta">Revisar Reporte</a>
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
  {
    subject: '🎉 ¡Bienvenido a FNE LMS!',
    type: 'Welcome Email',
    category: 'Onboarding',
    description: 'Welcome message for new users with getting started guide.',
    html: `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
          .header { background: linear-gradient(135deg, #00365b 0%, #004d82 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px 20px; }
          .notification { background: #f8fafc; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #fdb933; }
          .success { border-left-color: #22c55e !important; }
          .notification h3 { margin: 0 0 10px 0; color: #00365b; font-size: 18px; }
          .notification p { margin: 0 0 10px 0; color: #4a5568; line-height: 1.6; }
          .notification small { color: #718096; }
          .cta { display: inline-block; background: #fdb933; color: #00365b; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
          .footer { background: #f7fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ¡Bienvenido a FNE!</h1>
          </div>
          <div class="content">
            <p>¡Hola y bienvenido, Nuevo Usuario!</p>
            <div class="notification success">
              <h3>Tu cuenta ha sido creada exitosamente</h3>
              <p>Ya puedes acceder a todos los recursos de la Plataforma de Crecimiento de Fundación Nueva Educación.</p>
              <p><strong>Usuario:</strong> nuevo.usuario@ejemplo.cl</p>
              <p><strong>Rol:</strong> Docente</p>
              <small>📅 Cuenta creada el 26 de Junio, 2025</small>
            </div>
            
            <div style="margin: 25px 0;">
              <h4 style="color: #00365b; margin-bottom: 15px;">🚀 Primeros pasos:</h4>
              <ul style="color: #4a5568; line-height: 1.8;">
                <li>✅ Completa tu perfil</li>
                <li>📚 Explora los cursos disponibles</li>
                <li>👥 Únete a tu espacio colaborativo</li>
                <li>🔔 Configura tus preferencias de notificación</li>
              </ul>
            </div>

            <div style="text-align: center;">
              <a href="#" class="cta">Completar Perfil</a>
            </div>
          </div>
          <div class="footer">
            <p><strong>Fundación Nueva Educación</strong><br>¡Tu crecimiento profesional comienza aquí!</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
];

interface EmailShowcaseProps {
  templates: typeof emailTemplates;
}

const EmailShowcase: React.FC<EmailShowcaseProps> = ({ templates }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  const categories = Array.from(new Set(templates.map(t => t.category)));

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-[#00365b] text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold">📧 FNE LMS Email Showcase</h1>
          <p className="text-blue-200 mt-2">Professional email templates with FNE branding</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Template List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-[#00365b] mb-4">Email Templates ({templates.length})</h2>
              
              {/* Categories */}
              {categories.map(category => (
                <div key={category} className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {templates.filter(t => t.category === category).map((template, index) => {
                      const globalIndex = templates.findIndex(t => t === template);
                      return (
                        <button
                          key={globalIndex}
                          onClick={() => setSelectedTemplate(globalIndex)}
                          className={`w-full text-left p-3 rounded-lg transition-colors ${
                            selectedTemplate === globalIndex
                              ? 'bg-[#00365b] text-white'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="font-medium text-sm">{template.type}</div>
                          <div className="text-xs opacity-75 mt-1 truncate">
                            {template.subject}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview/Code View */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              {/* Controls */}
              <div className="border-b border-gray-200 p-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-[#00365b]">
                    {templates[selectedTemplate].type}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {templates[selectedTemplate].description}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      viewMode === 'preview'
                        ? 'bg-[#00365b] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setViewMode('code')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      viewMode === 'code'
                        ? 'bg-[#00365b] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    HTML Code
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {viewMode === 'preview' ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div 
                      dangerouslySetInnerHTML={{ 
                        __html: templates[selectedTemplate].html 
                      }} 
                      className="email-preview"
                    />
                  </div>
                ) : (
                  <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
                    <pre className="text-sm">
                      <code>{templates[selectedTemplate].html}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Template Info */}
            <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
              <h4 className="font-semibold text-[#00365b] mb-3">Template Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Subject:</span>
                  <p className="text-gray-800 mt-1">{templates[selectedTemplate].subject}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Category:</span>
                  <p className="text-gray-800 mt-1">{templates[selectedTemplate].category}</p>
                </div>
                <div className="md:col-span-2">
                  <span className="font-medium text-gray-600">Use Case:</span>
                  <p className="text-gray-800 mt-1">{templates[selectedTemplate].description}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-12 bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-[#00365b] mb-6">🚀 Email System Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-[#fdb933] rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-[#00365b] font-bold text-xl">📱</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Mobile Responsive</h3>
              <p className="text-gray-600 text-sm">All templates are optimized for mobile devices and email clients.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#fdb933] rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-[#00365b] font-bold text-xl">🎨</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">FNE Branded</h3>
              <p className="text-gray-600 text-sm">Professional design with Navy Blue (#00365b) and Golden Yellow (#fdb933).</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#fdb933] rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-[#00365b] font-bold text-xl">⚡</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Real-time</h3>
              <p className="text-gray-600 text-sm">Immediate notifications and daily/weekly digest emails.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#fdb933] rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-[#00365b] font-bold text-xl">🔔</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">User Controlled</h3>
              <p className="text-gray-600 text-sm">Granular notification preferences and quiet hours support.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#fdb933] rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-[#00365b] font-bold text-xl">🛡️</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Secure</h3>
              <p className="text-gray-600 text-sm">GDPR compliant with proper authentication and rate limiting.</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-[#fdb933] rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-[#00365b] font-bold text-xl">📊</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">Analytics Ready</h3>
              <p className="text-gray-600 text-sm">Email tracking and delivery monitoring with Resend.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      templates: emailTemplates
    }
  };
};

export default EmailShowcase;