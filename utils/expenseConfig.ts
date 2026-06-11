// Single source of truth for expense-module configuration shared by the web
// UI, email templates, and the Telegram bot.

// Designated approver for expense reports. Override per environment with
// NEXT_PUBLIC_EXPENSE_APPROVER_EMAIL (client-visible: it gates UI actions,
// not data access — RLS/admin checks still protect the data itself).
export const EXPENSE_APPROVER_EMAIL =
  process.env.NEXT_PUBLIC_EXPENSE_APPROVER_EMAIL || 'gnaranjo@nuevaeducacion.org';

// Supabase Storage bucket holding receipt files (boletas/facturas).
export const RECEIPTS_BUCKET = 'boletas';
