-- Telegram/WhatsApp expense bot: identity linking, conversation state,
-- inbound-update idempotency, and a transactional expense-save RPC.
-- Additive only — no changes to existing tables.

-- Hard idempotency for inbound webhook updates: claimed BEFORE any side effect.
-- INSERT ... ON CONFLICT DO NOTHING — zero rows returned means a duplicate
-- delivery (e.g. Telegram retry during a slow extraction) and the webhook
-- returns 200 immediately.
CREATE TABLE public.bot_processed_updates (
  platform text NOT NULL,
  update_id bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,  -- null = claimed but not finished; stale claims
                             -- (>90s, uncompleted) are taken over on retry so
                             -- a function timeout cannot permanently drop an update
  PRIMARY KEY (platform, update_id)
);

CREATE TABLE public.bot_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('telegram', 'whatsapp')),
  platform_user_id text NOT NULL,
  chat_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  link_method text NOT NULL DEFAULT 'code',
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_user_id)
);
CREATE INDEX idx_bot_identities_user_id ON public.bot_identities(user_id);

CREATE TABLE public.bot_link_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  used_at timestamptz
);
CREATE INDEX idx_bot_link_codes_user_id ON public.bot_link_codes(user_id);

CREATE TABLE public.bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  chat_id text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'idle',
  active_item_id uuid,
  edit_field text,
  submit_report_id uuid,
  failed_link_attempts int NOT NULL DEFAULT 0,
  link_locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, chat_id)
);

CREATE TABLE public.bot_pending_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_ref text NOT NULL,
  file_mime text,
  file_name text,
  caption text,
  extraction jsonb,
  category_id uuid REFERENCES public.expense_categories(id),
  target_report_id uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'active', 'saving', 'saved', 'discarded', 'expired')),
  card_message_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours'
);
CREATE INDEX idx_bot_pending_session ON public.bot_pending_items(session_id, status);

-- Service-role-only tables: RLS enabled with intentionally zero policies.
ALTER TABLE public.bot_processed_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_pending_items ENABLE ROW LEVEL SECURITY;

-- Transactional expense write, called by the bot via service role AFTER the
-- receipt file is uploaded to storage. Inserts the item, recomputes the
-- report total, and widens the report date range atomically. Ownership and
-- draft-status guards are re-checked inside (the bot bypasses RLS).
CREATE OR REPLACE FUNCTION public.bot_save_expense_item(
  p_user_id uuid,
  p_report_id uuid,            -- NULL => create a new draft report
  p_report_name text,
  p_start date,
  p_end date,
  p_category_id uuid,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_original_amount numeric,
  p_conversion_rate numeric,
  p_conversion_date date,
  p_expense_date date,
  p_vendor text,
  p_expense_number text,
  p_receipt_url text,
  p_receipt_filename text,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  IF p_report_id IS NULL THEN
    INSERT INTO expense_reports
      (report_name, description, start_date, end_date, status, total_amount, submitted_by)
    VALUES
      (p_report_name, 'Creado desde Telegram', p_start, p_end, 'draft', 0, p_user_id)
    RETURNING id INTO v_report_id;
  ELSE
    SELECT id INTO v_report_id
    FROM expense_reports
    WHERE id = p_report_id AND submitted_by = p_user_id AND status = 'draft'
    FOR UPDATE;
    IF v_report_id IS NULL THEN
      RAISE EXCEPTION 'REPORT_NOT_EDITABLE';
    END IF;
  END IF;

  INSERT INTO expense_items
    (report_id, category_id, description, amount, expense_date, vendor,
     expense_number, receipt_url, receipt_filename, notes, currency,
     original_amount, conversion_rate, conversion_date)
  VALUES
    (v_report_id, p_category_id, p_description, p_amount, p_expense_date, p_vendor,
     p_expense_number, p_receipt_url, p_receipt_filename, p_notes, p_currency,
     p_original_amount, p_conversion_rate, p_conversion_date);

  UPDATE expense_reports SET
    total_amount = (SELECT COALESCE(SUM(amount), 0) FROM expense_items WHERE report_id = v_report_id),
    start_date = LEAST(start_date, p_expense_date),
    end_date = GREATEST(end_date, p_expense_date),
    updated_at = now()
  WHERE id = v_report_id;

  RETURN v_report_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bot_save_expense_item(
  uuid, uuid, text, date, date, uuid, text, numeric, text, numeric,
  numeric, date, date, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

-- Revoking PUBLIC also strips service_role's inherited privilege; the bot's
-- service-role client must be granted execute explicitly.
GRANT EXECUTE ON FUNCTION public.bot_save_expense_item(
  uuid, uuid, text, date, date, uuid, text, numeric, text, numeric,
  numeric, date, date, text, text, text, text, text
) TO service_role;
