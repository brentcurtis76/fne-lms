import type { SupabaseClient } from '@supabase/supabase-js';
import { convertToCLP } from '../currency-service';
import { hasAdminPrivileges } from '../../utils/roleUtils';
import { generateExpenseReportSubmissionEmail } from '../../utils/emailUtils';
import {
  BotActor,
  Currency,
  DraftReportSummary,
  ExpenseCategoryRow,
  Platform
} from './types';
import { RECEIPTS_BUCKET } from '../../utils/expenseConfig';

const BUCKET = RECEIPTS_BUCKET;

/**
 * Parses supabase-js embedded aggregates of the form `expense_items(count)`
 * (expected shape: [{ count: n }]). An unexpected shape logs loudly instead
 * of silently reading as 0 — a silent 0 here blocks legitimate submits.
 */
function parseEmbeddedCount(value: unknown, context: string): number {
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof (value[0] as { count?: unknown }).count === 'number'
  ) {
    return (value[0] as { count: number }).count;
  }
  console.error(`[Bot] unexpected embedded count shape (${context}):`, JSON.stringify(value)?.slice(0, 200));
  return 0;
}

export class BotExpenseError extends Error {
  constructor(public readonly code:
    | 'REPORT_NOT_EDITABLE'
    | 'UPLOAD_FAILED'
    | 'SAVE_FAILED'
    | 'SUBMIT_CONFLICT'
  ) {
    super(code);
  }
}

export interface SaveItemInput {
  userId: string;
  /** Channel that captured the expense — labels notes/report description. */
  platform: Platform;
  /** null ⇒ create a new draft report with the provided defaults. */
  reportId: string | null;
  categoryId: string;
  description: string;
  amount: number;
  currency: Currency;
  expenseDate: string; // ISO
  vendor: string | null;
  expenseNumber: string | null;
  notes: string;
  file: { buffer: Buffer; mime: string; fileName?: string };
}

export interface SaveItemResult {
  reportId: string;
  reportName: string;
  totalAmount: number;
  itemCount: number;
}

export interface ReportStatusGroups {
  drafts: DraftReportSummary[];
  submitted: DraftReportSummary[];
  decided: DraftReportSummary[]; // approved + rejected, newest first
}

/** Month-anchored defaults for a report created from chat. */
export function newReportDefaults(expenseDateIso: string | null): {
  name: string;
  startDate: string;
  endDate: string;
} {
  const anchor = expenseDateIso ? new Date(`${expenseDateIso}T00:00:00Z`) : new Date();
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' }).format(anchor);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const mm = String(month + 1).padStart(2, '0');
  return {
    name: `Gastos ${monthName} ${year}`,
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  };
}

export class ExpenseService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly appUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'https://fne-lms.vercel.app'
  ) {}

  /**
   * Resolves the acting LMS user behind a platform identity, including the
   * expense-module permission. The bot runs on the service role, so this is
   * the authorization gate that RLS would otherwise provide.
   */
  async resolveActor(platform: Platform, platformUserId: string): Promise<BotActor | null> {
    const { data: identity, error: identityError } = await this.supabase
      .from('bot_identities')
      .select('user_id')
      .eq('platform', platform)
      .eq('platform_user_id', platformUserId)
      .maybeSingle();
    if (identityError) throw identityError;
    if (!identity) return null;

    const userId = (identity as { user_id: string }).user_id;
    const { data: profile, error: profileError } = await this.supabase
      .from('profiles')
      .select('first_name, name, email')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: access, error: accessError } = await this.supabase
      .from('expense_report_access')
      .select('can_submit')
      .eq('user_id', userId)
      .maybeSingle();
    if (accessError) throw accessError;

    let canSubmit = !!(access as { can_submit: boolean } | null)?.can_submit;
    if (!canSubmit) {
      canSubmit = await hasAdminPrivileges(this.supabase, userId);
    }

    const fullName = (profile as { name?: string } | null)?.name || '';
    const firstName = (profile as { first_name?: string } | null)?.first_name || fullName.split(' ')[0] || 'Hola';
    return {
      userId,
      firstName,
      fullName: fullName || firstName,
      email: (profile as { email?: string } | null)?.email ?? null,
      canSubmit
    };
  }

  async getActiveCategories(): Promise<ExpenseCategoryRow[]> {
    const { data, error } = await this.supabase
      .from('expense_categories')
      .select('id, name, description')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []) as ExpenseCategoryRow[];
  }

  /** Only active categories resolve — an inactive id behaves as unknown. */
  async getCategory(categoryId: string): Promise<ExpenseCategoryRow | null> {
    const { data, error } = await this.supabase
      .from('expense_categories')
      .select('id, name, description')
      .eq('id', categoryId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    return (data as ExpenseCategoryRow) ?? null;
  }

  async listDraftReports(userId: string): Promise<DraftReportSummary[]> {
    return this.listReports(userId, ['draft']);
  }

  async listReportsByStatus(userId: string): Promise<ReportStatusGroups> {
    const all = await this.listReports(userId, ['draft', 'submitted', 'approved', 'rejected']);
    return {
      drafts: all.filter((r) => r.status === 'draft'),
      submitted: all.filter((r) => r.status === 'submitted'),
      decided: all.filter((r) => r.status === 'approved' || r.status === 'rejected').slice(0, 3)
    };
  }

  /** A single report owned by the user, with date range (for submit cards). */
  async getReport(
    userId: string,
    reportId: string
  ): Promise<(DraftReportSummary & { start_date: string; end_date: string }) | null> {
    const { data, error } = await this.supabase
      .from('expense_reports')
      .select('id, report_name, total_amount, status, updated_at, start_date, end_date, expense_items(count)')
      .eq('id', reportId)
      .eq('submitted_by', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      report_name: row.report_name as string,
      total_amount: Number(row.total_amount ?? 0),
      status: row.status as string,
      updated_at: (row.updated_at as string) ?? null,
      start_date: row.start_date as string,
      end_date: row.end_date as string,
      item_count: parseEmbeddedCount(row.expense_items, 'getReport')
    };
  }

  private async listReports(userId: string, statuses: string[]): Promise<DraftReportSummary[]> {
    const { data, error } = await this.supabase
      .from('expense_reports')
      .select('id, report_name, total_amount, status, updated_at, expense_items(count)')
      .eq('submitted_by', userId)
      .in('status', statuses)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      report_name: row.report_name as string,
      total_amount: Number(row.total_amount ?? 0),
      status: row.status as string,
      updated_at: (row.updated_at as string) ?? null,
      item_count: parseEmbeddedCount(row.expense_items, 'listReports')
    }));
  }

  /** Same vendor + date + amount already saved by this user, in any report. */
  async findDuplicate(
    userId: string,
    vendor: string | null,
    expenseDate: string | null,
    amount: number | null
  ): Promise<{ reportName: string } | null> {
    if (!vendor || !expenseDate || amount === null) return null;
    const { data, error } = await this.supabase
      .from('expense_items')
      .select('id, expense_reports!inner(report_name, submitted_by)')
      .eq('expense_reports.submitted_by', userId)
      .eq('vendor', vendor)
      .eq('expense_date', expenseDate)
      .eq('amount', amount)
      .limit(1);
    if (error) {
      console.error('[Bot] duplicate check failed:', error);
      return null; // never block a save on a failed heuristic
    }
    if (!data || data.length === 0) return null;
    const report = (data[0] as Record<string, unknown>).expense_reports as
      | { report_name: string }
      | Array<{ report_name: string }>;
    const reportName = Array.isArray(report) ? report[0]?.report_name : report?.report_name;
    return { reportName: reportName ?? '' };
  }

  /**
   * Uploads the receipt and saves the item through the transactional
   * `bot_save_expense_item` RPC. If the RPC fails after the upload, the
   * uploaded file is removed — no partial state in either direction.
   */
  async saveExpenseItem(input: SaveItemInput): Promise<SaveItemResult> {
    const conversion = await convertToCLP(input.amount, input.currency);

    const ext = input.file.mime === 'application/pdf' ? 'pdf'
      : input.file.mime === 'image/png' ? 'png'
      : input.file.mime === 'image/webp' ? 'webp'
      : 'jpg';
    const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    const { error: uploadError } = await this.supabase.storage
      .from(BUCKET)
      .upload(fileName, input.file.buffer, { contentType: input.file.mime });
    if (uploadError) {
      console.error('[Bot] receipt upload failed:', uploadError);
      throw new BotExpenseError('UPLOAD_FAILED');
    }

    const defaults = newReportDefaults(input.expenseDate);
    const channelLabel = input.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram';
    const { data, error } = await this.supabase.rpc('bot_save_expense_item', {
      p_report_description: `Creado desde ${channelLabel}`,
      p_user_id: input.userId,
      p_report_id: input.reportId,
      p_report_name: defaults.name,
      p_start: defaults.startDate,
      p_end: defaults.endDate,
      p_category_id: input.categoryId,
      p_description: input.description,
      p_amount: conversion.convertedAmount,
      p_currency: input.currency,
      p_original_amount: conversion.originalAmount,
      p_conversion_rate: conversion.conversionRate,
      p_conversion_date: conversion.conversionDate,
      p_expense_date: input.expenseDate,
      p_vendor: input.vendor,
      p_expense_number: input.expenseNumber,
      p_receipt_url: `${BUCKET}/${fileName}`,
      p_receipt_filename: input.file.fileName || `boleta_${input.expenseDate}.${ext}`,
      p_notes: input.notes
    });

    if (error) {
      console.error('[Bot] bot_save_expense_item RPC failed:', error);
      // Clean up the orphaned upload; best effort.
      const { error: removeError } = await this.supabase.storage.from(BUCKET).remove([fileName]);
      if (removeError) console.error('[Bot] orphaned receipt cleanup failed:', removeError);
      throw new BotExpenseError(
        error.message?.includes('REPORT_NOT_EDITABLE') ? 'REPORT_NOT_EDITABLE' : 'SAVE_FAILED'
      );
    }

    const reportId = data as string;
    const { data: report, error: reportError } = await this.supabase
      .from('expense_reports')
      .select('report_name, total_amount, expense_items(count)')
      .eq('id', reportId)
      .single();
    if (reportError) throw reportError;

    const reportRow = report as Record<string, unknown>;
    return {
      reportId,
      reportName: reportRow.report_name as string,
      totalAmount: Number(reportRow.total_amount ?? 0),
      itemCount: parseEmbeddedCount(reportRow.expense_items, 'saveExpenseItem')
    };
  }

  /**
   * Submits a draft report for approval. The UPDATE is conditioned on
   * ownership and draft status, making it idempotent under double-taps.
   */
  async submitReport(actor: BotActor, reportId: string): Promise<SaveItemResult> {
    const { data, error } = await this.supabase
      .from('expense_reports')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', reportId)
      .eq('submitted_by', actor.userId)
      .eq('status', 'draft')
      .select('id, report_name, total_amount, start_date, end_date, expense_items(count)');
    if (error) throw error;
    if (!data || data.length === 0) throw new BotExpenseError('SUBMIT_CONFLICT');

    const row = data[0] as Record<string, unknown>;
    const result: SaveItemResult = {
      reportId,
      reportName: row.report_name as string,
      totalAmount: Number(row.total_amount ?? 0),
      itemCount: parseEmbeddedCount(row.expense_items, 'submitReport')
    };

    // Approver notification — same template as the web flow. Awaited (with a
    // short timeout): a serverless runtime may freeze after the response, so
    // fire-and-forget could silently drop the email. Failure never rolls back
    // the submit — it is already committed; we only log.
    try {
      const emailData = generateExpenseReportSubmissionEmail(
        result.reportName,
        actor.fullName,
        actor.email ?? '',
        result.totalAmount,
        row.start_date as string,
        row.end_date as string
      );
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${this.appUrl}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(emailData),
          signal: controller.signal
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          console.error(
            `[Bot] submit notification email failed: HTTP ${response.status} ${body.slice(0, 300)}`
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (emailError) {
      console.error('[Bot] submit notification email failed:', emailError);
    }

    return result;
  }
}
