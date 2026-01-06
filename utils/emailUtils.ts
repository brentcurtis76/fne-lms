interface EmailData {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (emailData: EmailData): Promise<boolean> => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    return response.ok;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

export const generateExpenseReportSubmissionEmail = (
  reportName: string,
  submitterName: string,
  submitterEmail: string,
  totalAmount: number,
  startDate: string,
  endDate: string
): EmailData => {
  const formatCurrency = (amount: number) => `$${amount.toLocaleString('es-CL')}`;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('es-CL');

  return {
    to: 'gnaranjo@nuevaeducacion.org',
    subject: `📋 Nuevo Reporte de Gastos Pendiente de Aprobación - ${reportName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #0a0a0a; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .report-details { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .amount { font-size: 18px; font-weight: bold; color: #0a0a0a; }
          .footer { background-color: #fbbf24; padding: 15px; text-align: center; margin-top: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #0a0a0a; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏫 Genera - Nuevo Reporte de Gastos</h1>
        </div>
        
        <div class="content">
          <h2>¡Hola!</h2>
          <p>Se ha enviado un nuevo reporte de gastos que requiere tu aprobación.</p>
          
          <div class="report-details">
            <h3>📋 Detalles del Reporte:</h3>
            <p><strong>Nombre del Reporte:</strong> ${reportName}</p>
            <p><strong>Enviado por:</strong> ${submitterName} (${submitterEmail})</p>
            <p><strong>Período:</strong> ${formatDate(startDate)} - ${formatDate(endDate)}</p>
            <p><strong>Total:</strong> <span class="amount">${formatCurrency(totalAmount)}</span></p>
          </div>
          
          <p>Por favor, revisa y aprueba o rechaza este reporte en el sistema Genera.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://fne-lms.vercel.app/expense-reports" class="button">
              🔍 Revisar Reporte
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>📧 Este es un mensaje automático del sistema Genera</p>
          <p>Fundación Nueva Educación</p>
        </div>
      </body>
      </html>
    `
  };
};

export const generateExpenseReportApprovalEmail = (
  reportName: string,
  status: 'approved' | 'rejected',
  reviewerName: string,
  totalAmount: number,
  comments?: string
): EmailData => {
  const formatCurrency = (amount: number) => `$${amount.toLocaleString('es-CL')}`;
  const isApproved = status === 'approved';
  const statusIcon = isApproved ? '✅' : '❌';
  const statusText = isApproved ? 'Aprobado' : 'Rechazado';
  const statusColor = isApproved ? '#10B981' : '#EF4444';
  const statusBg = isApproved ? '#D1FAE5' : '#FEE2E2';

  return {
    to: '', // Will be set by the calling function
    subject: `${statusIcon} Reporte de Gastos ${statusText} - ${reportName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #0a0a0a; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .status-box { background-color: ${statusBg}; color: ${statusColor}; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0; }
          .report-details { background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .amount { font-size: 18px; font-weight: bold; color: #0a0a0a; }
          .comments { background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107; }
          .footer { background-color: #fbbf24; padding: 15px; text-align: center; margin-top: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #0a0a0a; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏫 Genera - Estado del Reporte de Gastos</h1>
        </div>
        
        <div class="content">
          <h2>¡Hola!</h2>
          <p>Tu reporte de gastos ha sido revisado.</p>
          
          <div class="status-box">
            <h2>${statusIcon} ${statusText}</h2>
            <p>Revisado por: ${reviewerName}</p>
          </div>
          
          <div class="report-details">
            <h3>📋 Detalles del Reporte:</h3>
            <p><strong>Nombre del Reporte:</strong> ${reportName}</p>
            <p><strong>Total:</strong> <span class="amount">${formatCurrency(totalAmount)}</span></p>
            <p><strong>Estado:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
          </div>
          
          ${comments ? `
            <div class="comments">
              <h4>💬 Comentarios del Revisor:</h4>
              <p>${comments}</p>
            </div>
          ` : ''}
          
          <p>Puedes ver más detalles en el sistema Genera.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://fne-lms.vercel.app/expense-reports" class="button">
              📋 Ver Mis Reportes
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>📧 Este es un mensaje automático del sistema Genera</p>
          <p>Fundación Nueva Educación</p>
        </div>
      </body>
      </html>
    `
  };
};