-- Post-review fixes for the expense bot and shared expense write paths.
-- Additive only.

-- 1. The opportunistic retention sweep deletes by processed_at; without an
--    index it table-scans as bot_processed_updates grows.
CREATE INDEX IF NOT EXISTS idx_bot_processed_updates_processed_at
  ON public.bot_processed_updates(processed_at);

-- 2. Shared server-side total recompute, callable by the web form so the
--    client-computed total can never drift from the database state.
--    SECURITY INVOKER (default): runs under the caller's RLS, so users can
--    only recompute reports they can already update.
CREATE OR REPLACE FUNCTION public.recompute_expense_report_total(p_report_id uuid)
RETURNS numeric
LANGUAGE sql
AS $$
  UPDATE expense_reports SET
    total_amount = (SELECT COALESCE(SUM(amount), 0) FROM expense_items WHERE report_id = p_report_id),
    updated_at = now()
  WHERE id = p_report_id
  RETURNING total_amount;
$$;

-- 3. Parameterize the auto-created report description (was hardcoded
--    'Creado desde Telegram'), so a future WhatsApp adapter labels its data
--    correctly. New optional trailing parameter requires drop + recreate.
DROP FUNCTION public.bot_save_expense_item(
  uuid, uuid, text, date, date, uuid, text, numeric, text, numeric,
  numeric, date, date, text, text, text, text, text
);

CREATE FUNCTION public.bot_save_expense_item(
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
  p_notes text,
  p_report_description text DEFAULT 'Creado desde Telegram'
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
      (p_report_name, p_report_description, p_start, p_end, 'draft', 0, p_user_id)
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
  numeric, date, date, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bot_save_expense_item(
  uuid, uuid, text, date, date, uuid, text, numeric, text, numeric,
  numeric, date, date, text, text, text, text, text, text
) TO service_role;
