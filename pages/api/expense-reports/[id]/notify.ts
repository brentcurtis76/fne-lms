/**
 * POST /api/expense-reports/{id}/notify
 *
 * Sends the notification that belongs to an expense report's *current,
 * persisted* state. The browser supplies nothing but the report id: which
 * notification goes out, to whom, with what subject and body is decided here
 * from the report record. This replaces the pre-B1a flow, where the page built
 * `{to, subject, html}` in the browser and POSTed it to the unauthenticated
 * `/api/send-email` relay.
 *
 * Authorization is per notification moment:
 *   submitted            → only the report's own submitter
 *   approved | rejected  → only the designated approver or a global admin
 * Any other status (e.g. `draft`) has no notification and returns 409.
 *
 * Reads use the service role because the route must see the owner's profile
 * e-mail regardless of the caller's RLS visibility; the authorization checks
 * above, not RLS, are what gate this endpoint.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createServiceRoleClient,
  getApiUser,
  handleMethodNotAllowed,
  sendApiError,
  sendApiResponse,
  sendAuthError
} from '../../../../lib/api-auth';
import { HttpStatus } from '../../../../lib/types/api-auth.types';
import { RATE_LIMITS, rateLimit } from '../../../../lib/rateLimit';
import { hasAdminPrivileges } from '../../../../utils/roleUtils';
import { EXPENSE_APPROVER_EMAIL } from '../../../../utils/expenseConfig';
import {
  ExpenseEmailResult,
  sendExpenseDecisionNotification,
  sendExpenseSubmissionNotification
} from '../../../../lib/email/expenseNotifications';
import { authorizeUserEmail } from '../../../../lib/email/outbound-policy';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The endpoint is replayable by design (it reads state rather than changing
// it), so a legitimate actor could otherwise re-trigger mail in a loop.
// Best-effort dampening only — same posture as the rest of the repo.
const checkRateLimit = rateLimit(RATE_LIMITS.expensive, 'expense-report-notify');

interface OwnerProfile {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

interface ExpenseReportRow {
  id: string;
  report_name: string;
  status: string;
  total_amount: number | string | null;
  start_date: string;
  end_date: string;
  submitted_by: string | null;
  reviewed_by: string | null;
  review_comments: string | null;
  profiles?: OwnerProfile | OwnerProfile[] | null;
}

/**
 * The caller only needs to know whether the notification went out. A provider
 * error message stays in the server log rather than being handed back to the
 * browser.
 */
function notificationResponse(notification: string, result: ExpenseEmailResult) {
  return {
    notification,
    sent: result.sent,
    ...(result.skipped ? { skipped: true } : {}),
    ...(result.status ? { status: result.status } : {}),
  };
}

/** PostgREST returns a to-one embed as an object, but older shapes give an array. */
function firstProfile(embed: OwnerProfile | OwnerProfile[] | null | undefined): OwnerProfile | null {
  if (!embed) return null;
  return Array.isArray(embed) ? embed[0] ?? null : embed;
}

function fullName(profile: OwnerProfile | null): string {
  if (!profile) return '';
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
}

async function resolveReviewerName(
  supabase: ReturnType<typeof createServiceRoleClient>,
  reviewerId: string | null
): Promise<string> {
  if (!reviewerId) return 'Administrador';

  const { data, error } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', reviewerId)
    .maybeSingle();

  if (error) {
    console.error('[expense-report notify] reviewer lookup failed:', error.message);
    return 'Administrador';
  }

  return fullName(data as OwnerProfile | null) || 'Administrador';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return handleMethodNotAllowed(res, ['POST']);
  }

  if (!(await checkRateLimit(req, res))) {
    return;
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Debes iniciar sesión.', HttpStatus.UNAUTHORIZED);
  }

  const rawId = req.query.id;
  const reportId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!reportId || !UUID_PATTERN.test(reportId)) {
    return sendApiError(res, 'Identificador de reporte inválido.', HttpStatus.BAD_REQUEST);
  }

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (clientError) {
    console.error('[expense-report notify] service client unavailable:', clientError);
    return sendApiError(res, 'Error de configuración del servidor.', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  const { data, error: reportError } = await supabase
    .from('expense_reports')
    .select(
      'id, report_name, status, total_amount, start_date, end_date, submitted_by, reviewed_by, review_comments, profiles!expense_reports_submitted_by_fkey(first_name, last_name, email)'
    )
    .eq('id', reportId)
    .maybeSingle();

  if (reportError) {
    console.error('[expense-report notify] report lookup failed:', reportError.message);
    return sendApiError(res, 'Error al leer el reporte.', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  const report = data as ExpenseReportRow | null;
  if (!report) {
    return sendApiError(res, 'Reporte no encontrado.', HttpStatus.NOT_FOUND);
  }

  const owner = firstProfile(report.profiles);
  const totalAmount = Number(report.total_amount ?? 0);

  if (report.status === 'submitted') {
    if (!report.submitted_by || report.submitted_by !== user.id) {
      return sendAuthError(
        res,
        'No puedes notificar el envío de un reporte que no enviaste.',
        HttpStatus.FORBIDDEN
      );
    }

    const result = await sendExpenseSubmissionNotification({
      reportName: report.report_name,
      submitterName: fullName(owner) || 'Usuario',
      submitterEmail: owner?.email || '',
      totalAmount,
      startDate: report.start_date,
      endDate: report.end_date
    }, await authorizeUserEmail(supabase, report.submitted_by));

    return sendApiResponse(res, notificationResponse('submitted', result));
  }

  if (report.status === 'approved' || report.status === 'rejected') {
    const callerEmail = (user.email || '').trim().toLowerCase();
    const isDesignatedApprover =
      callerEmail.length > 0 && callerEmail === EXPENSE_APPROVER_EMAIL.trim().toLowerCase();
    const isAuthorized = isDesignatedApprover || (await hasAdminPrivileges(supabase, user.id));

    if (!isAuthorized) {
      return sendAuthError(
        res,
        'Solo el aprobador designado puede notificar esta decisión.',
        HttpStatus.FORBIDDEN
      );
    }

    if (!report.submitted_by || !owner?.email) {
      // A missing submitter cannot be tenant-authorized and cannot have a
      // trustworthy joined recipient. Treat it as missing rather than passing
      // an empty user id into the tenant policy.
      console.warn('[expense-report notify] report has no tenant-authorizable owner; nothing sent');
      return sendApiResponse(res, {
        notification: report.status,
        sent: false,
        reason: 'recipient_missing'
      });
    }

    const result = await sendExpenseDecisionNotification({
      recipientEmail: owner.email,
      reportName: report.report_name,
      status: report.status,
      reviewerName: await resolveReviewerName(supabase, report.reviewed_by),
      totalAmount,
      comments: report.review_comments || undefined
    }, await authorizeUserEmail(supabase, report.submitted_by));

    return sendApiResponse(res, notificationResponse(report.status, result));
  }

  return sendApiError(
    res,
    `El reporte está en estado "${report.status}"; no corresponde enviar una notificación.`,
    HttpStatus.CONFLICT
  );
}
