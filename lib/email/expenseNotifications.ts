/**
 * Expense-report notification e-mails — SERVER ONLY.
 *
 * Before B1a these templates lived in `utils/emailUtils.ts`, were built in the
 * browser and were POSTed as `{to, subject, html}` to the unauthenticated
 * `/api/send-email` relay. Recipient, subject and body are now decided on the
 * server from the expense-report record; the browser never supplies any of them.
 *
 * Do not import this module from client code: it constructs a Resend client and
 * reads server-only configuration. The client-safe pieces it needs
 * (`EXPENSE_APPROVER_EMAIL`) live in `utils/expenseConfig.ts`.
 *
 * Sending is soft-fail by design — a notification is a side effect of an
 * already-committed state change, so a missing API key or a Resend outage is
 * logged and reported, never thrown.
 */
import { EXPENSE_APPROVER_EMAIL } from '../../utils/expenseConfig';
import { escapeHtml } from '../utils/html-escape';
import { deliverOutboundEmail } from './provider';
import type { OutboundEmailAuthorization } from './outbound-policy';

/** Deep link included in the notification bodies (unchanged from the pre-B1a templates). */
const EXPENSE_REPORTS_URL = 'https://fne-lms.vercel.app/expense-reports';

const DEFAULT_FROM = 'Genera <notificaciones@nuevaeducacion.org>';

export interface ExpenseEmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface ExpenseEmailResult {
  sent: boolean;
  /** No RESEND_API_KEY configured: the notification was logged, not an error. */
  skipped?: boolean;
  status?: 'provider_accepted' | 'provider_rejected' | 'transport_error' | 'not_configured' | 'suppressed_qa' | 'refused';
  error?: string;
}

export interface ExpenseSubmissionInput {
  reportName: string;
  submitterName: string;
  submitterEmail: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
}

export interface ExpenseDecisionInput {
  /** Report owner's address, read from the database by the caller. */
  recipientEmail: string;
  reportName: string;
  status: 'approved' | 'rejected';
  reviewerName: string;
  totalAmount: number;
  comments?: string;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-CL');
}

/**
 * Approver notification for a report that has just been submitted.
 * The recipient is the configured approver — never a caller-supplied address.
 */
export function buildExpenseSubmissionMessage(input: ExpenseSubmissionInput): ExpenseEmailMessage {
  const reportName = escapeHtml(input.reportName);
  const submitterName = escapeHtml(input.submitterName);
  const submitterEmail = escapeHtml(input.submitterEmail);

  return {
    to: EXPENSE_APPROVER_EMAIL,
    subject: `📋 Nuevo Reporte de Gastos Pendiente de Aprobación - ${input.reportName}`,
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
            <p><strong>Período:</strong> ${formatDate(input.startDate)} - ${formatDate(input.endDate)}</p>
            <p><strong>Total:</strong> <span class="amount">${formatCurrency(input.totalAmount)}</span></p>
          </div>

          <p>Por favor, revisa y aprueba o rechaza este reporte en el sistema Genera.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${EXPENSE_REPORTS_URL}" class="button">
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
}

/**
 * Owner notification for an approval or rejection. `recipientEmail` must come
 * from the report record, not from the request body.
 */
export function buildExpenseDecisionMessage(input: ExpenseDecisionInput): ExpenseEmailMessage {
  const isApproved = input.status === 'approved';
  const statusIcon = isApproved ? '✅' : '❌';
  const statusText = isApproved ? 'Aprobado' : 'Rechazado';
  const statusColor = isApproved ? '#10B981' : '#EF4444';
  const statusBg = isApproved ? '#D1FAE5' : '#FEE2E2';

  const reportName = escapeHtml(input.reportName);
  const reviewerName = escapeHtml(input.reviewerName);
  const comments = input.comments ? escapeHtml(input.comments) : '';

  return {
    to: input.recipientEmail,
    subject: `${statusIcon} Reporte de Gastos ${statusText} - ${input.reportName}`,
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
            <p><strong>Total:</strong> <span class="amount">${formatCurrency(input.totalAmount)}</span></p>
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
            <a href="${EXPENSE_REPORTS_URL}" class="button">
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
}

/**
 * Deliver one notification. The Resend client is created per call so a
 * deployment without `RESEND_API_KEY` never constructs one — matching
 * `pages/api/admin/tractor-signups/grant.ts`.
 *
 * Only the recipient's domain is logged; the local part is not, so a log line
 * never carries a full address.
 */
async function deliver(
  message: ExpenseEmailMessage,
  context: string,
  authorization: OutboundEmailAuthorization
): Promise<ExpenseEmailResult> {
  const toDomain = message.to.split('@')[1] ?? 'unknown';

  if (!message.to) {
    console.error(`[expense-notifications] ${context}: no recipient resolved; not sent`);
    return { sent: false, error: 'missing_recipient' };
  }

  const result = await deliverOutboundEmail({
    authorization,
    message: {
      from: process.env.EMAIL_FROM_ADDRESS || DEFAULT_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
    },
  });

  if (result.status === 'provider_accepted') return { sent: true };
  if (result.status === 'not_configured') {
    console.log(`[expense-notifications] ${context} skipped`, { toDomain, status: result.status });
    return { sent: false, skipped: true };
  }
  if (result.status === 'suppressed_qa') {
    console.log(`[expense-notifications] ${context} skipped`, { toDomain, status: result.status });
    return { sent: false, skipped: true, status: result.status };
  }
  const detail = 'detail' in result ? result.detail : undefined;
  console.error(`[expense-notifications] ${context} failed`, { status: result.status });
  return { sent: false, error: detail ?? result.status };
}

export async function sendExpenseSubmissionNotification(
  input: ExpenseSubmissionInput,
  authorization: OutboundEmailAuthorization
): Promise<ExpenseEmailResult> {
  return deliver(buildExpenseSubmissionMessage(input), 'submission notification', authorization);
}

export async function sendExpenseDecisionNotification(
  input: ExpenseDecisionInput,
  authorization: OutboundEmailAuthorization
): Promise<ExpenseEmailResult> {
  return deliver(buildExpenseDecisionMessage(input), `${input.status} notification`, authorization);
}
