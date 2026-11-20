-- =============================================================================
-- 20261119107000_expense_report_save.sql — GENERA fixes F21h (GES-3.26)
--
-- public.save_expense_report(p_report_id, p_report, p_items, p_removed): the
-- save of an edited expense report («Rendición de Gastos») as one statement.
-- Before, the form sent four statements from the browser (change the report,
-- remove EVERY item, add the form's items again, recompute the total): a
-- failure in between left the report without items, and items added meanwhile
-- by the Telegram assistant were lost.
--
-- Called by components/expenses/ExpenseReportForm.tsx with the person's OWN
-- session: SECURITY INVOKER, so the rules of 20261117166000_expenses_by_role
-- (who files, which state, the guard trigger) decide exactly as they do for a
-- direct statement. The call:
--   a. changes the report's editable fields (report_name, description,
--      start_date, end_date) where p_report has the key, and updated_at;
--      no row changed (not visible, not editable) -> refused (42501);
--   b. removes ONLY the items listed in p_removed, and only of this report;
--   c. changes each listed item (by id, of this report; another id is
--      refused) and adds each new one (no id) to THIS report; only the
--      columns the form writes: category_id, description, amount,
--      original_amount, currency, conversion_rate, conversion_date,
--      expense_date, vendor, expense_number, receipt_url, receipt_filename,
--      notes (plus updated_at of a changed item). An item's conversion_date
--      is kept when its amount, currency and rate did not change;
--   d. writes the report's total as the sum of its stored items;
--   e. returns the report with its items.
-- Any error undoes every write of the call. Additive: one new function and its
-- permissions; nothing stored is rewritten by this migration.
-- =============================================================================

CREATE FUNCTION public.save_expense_report(p_report_id uuid, p_report jsonb, p_items jsonb, p_removed uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_report_fields CONSTANT text[] := ARRAY['report_name', 'description', 'start_date', 'end_date'];
  c_item_fields   CONSTANT text[] := ARRAY[
    'category_id', 'description', 'amount', 'original_amount', 'currency',
    'conversion_rate', 'conversion_date', 'expense_date', 'vendor',
    'expense_number', 'receipt_url', 'receipt_filename', 'notes'];
  v_report  public.expense_reports%ROWTYPE;
  v_rnew    public.expense_reports%ROWTYPE;
  v_item    public.expense_items%ROWTYPE;
  v_inew    public.expense_items%ROWTYPE;
  v_elem    jsonb;
  v_values  jsonb;
  v_n       int;
BEGIN
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'expense_report_id_missing' USING ERRCODE = '22004';
  END IF;
  IF p_report IS NOT NULL AND jsonb_typeof(p_report) <> 'object' THEN
    RAISE EXCEPTION 'expense_report_fields_malformed' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'expense_items_malformed' USING ERRCODE = '22023';
  END IF;

  -- a. The report's own fields; this also locks the row for the rest of the call.
  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_values
    FROM jsonb_each(coalesce(p_report, '{}'::jsonb)) e
   WHERE e.key = ANY (c_report_fields);
  SELECT * INTO v_report FROM public.expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_report_not_editable' USING ERRCODE = '42501';
  END IF;
  v_rnew := jsonb_populate_record(v_report, v_values);
  UPDATE public.expense_reports
     SET report_name = v_rnew.report_name,
         description = v_rnew.description,
         start_date  = v_rnew.start_date,
         end_date    = v_rnew.end_date,
         updated_at  = now()
   WHERE id = p_report_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'expense_report_not_editable' USING ERRCODE = '42501';
  END IF;

  -- b. Only the items the form itself removed, and only of this report.
  IF p_removed IS NOT NULL AND cardinality(p_removed) > 0 THEN
    DELETE FROM public.expense_items
     WHERE report_id = p_report_id
       AND id = ANY (p_removed);
  END IF;

  -- c. The listed items by id, then the new ones.
  FOR v_elem IN SELECT value FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'expense_item_malformed' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_values
      FROM jsonb_each(v_elem) e
     WHERE e.key = ANY (c_item_fields);

    IF v_elem ? 'id' AND jsonb_typeof(v_elem -> 'id') <> 'null' THEN
      SELECT * INTO v_item
        FROM public.expense_items
       WHERE id = (v_elem ->> 'id')::uuid
         AND report_id = p_report_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'expense_item_not_in_report' USING ERRCODE = '42501';
      END IF;
      v_inew := jsonb_populate_record(v_item, v_values);
      -- (an empty currency is CLP and an empty rate is 1, as the form reads them)
      IF v_inew.amount IS NOT DISTINCT FROM v_item.amount
         AND coalesce(v_inew.currency, 'CLP') = coalesce(v_item.currency, 'CLP')
         AND coalesce(v_inew.conversion_rate, 1) = coalesce(v_item.conversion_rate, 1) THEN
        v_inew.conversion_date := v_item.conversion_date;
      END IF;
      UPDATE public.expense_items
         SET category_id      = v_inew.category_id,
             description      = v_inew.description,
             amount           = v_inew.amount,
             original_amount  = v_inew.original_amount,
             currency         = v_inew.currency,
             conversion_rate  = v_inew.conversion_rate,
             conversion_date  = v_inew.conversion_date,
             expense_date     = v_inew.expense_date,
             vendor           = v_inew.vendor,
             expense_number   = v_inew.expense_number,
             receipt_url      = v_inew.receipt_url,
             receipt_filename = v_inew.receipt_filename,
             notes            = v_inew.notes,
             updated_at       = now()
       WHERE id = v_item.id
         AND report_id = p_report_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        RAISE EXCEPTION 'expense_item_not_editable' USING ERRCODE = '42501';
      END IF;
    ELSE
      v_inew := jsonb_populate_record(NULL::public.expense_items, v_values);
      INSERT INTO public.expense_items (
        report_id, category_id, description, amount, original_amount, currency,
        conversion_rate, conversion_date, expense_date, vendor, expense_number,
        receipt_url, receipt_filename, notes)
      VALUES (
        p_report_id, v_inew.category_id, v_inew.description, v_inew.amount, v_inew.original_amount,
        coalesce(v_inew.currency, 'CLP'), v_inew.conversion_rate, coalesce(v_inew.conversion_date, current_date),
        v_inew.expense_date, v_inew.vendor, v_inew.expense_number,
        v_inew.receipt_url, v_inew.receipt_filename, v_inew.notes);
    END IF;
  END LOOP;

  -- d. The total from the items that are stored.
  UPDATE public.expense_reports
     SET total_amount = (SELECT coalesce(sum(i.amount), 0) FROM public.expense_items i WHERE i.report_id = p_report_id)
   WHERE id = p_report_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'expense_report_not_editable' USING ERRCODE = '42501';
  END IF;

  -- e. The report with its items.
  RETURN (SELECT to_jsonb(r) || jsonb_build_object(
                   'expense_items',
                   coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.expense_date, i.created_at, i.id)
                               FROM public.expense_items i WHERE i.report_id = p_report_id), '[]'::jsonb))
            FROM public.expense_reports r WHERE r.id = p_report_id);
END;
$$;

COMMENT ON FUNCTION public.save_expense_report(uuid, jsonb, jsonb, uuid[]) IS
  'F21h (GES-3.26): saves an edited expense report in one statement with the caller''s own rights (SECURITY INVOKER): its four editable fields, the listed items by id, the new items, the removal of only the items the form removed, and the total as the sum of the stored items; returns the report with its items. All or nothing.';

REVOKE ALL ON FUNCTION public.save_expense_report(uuid, jsonb, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_expense_report(uuid, jsonb, jsonb, uuid[]) TO authenticated;
