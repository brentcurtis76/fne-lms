-- =============================================================================
-- 20261118104000_quote_groups_save.sql — GENERA fixes F15c, send-back 1 (GES-2.12)
--
-- public.save_quote_with_groups(p_quote_id, p_fields, p_groups): the whole
-- save of a quote in group mode (its travel groups and its own fields) as one
-- statement. The quote's row is locked first, so two saves of the same quote
-- run one after the other; any error undoes every write of the call.
--
-- Called only by the server (pages/api/quotes/[id].ts, service role) after the
-- route's own checks (caller, owner or admin, status rule, field allow-list,
-- date cleaning). The function repeats both column lists so it can never
-- write any other column:
--   * groups: the thirteen columns of lib/quotes/group-fields.ts;
--   * quote:  EDITABLE_QUOTE_FIELDS of pages/api/quotes/[id].ts, plus
--             updated_by and updated_at.
-- The tables' own triggers recompute the totals, as for any other write.
-- Additive: one new function and its permissions; nothing else changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_quote_with_groups(p_quote_id uuid, p_fields jsonb, p_groups jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_group_fields CONSTANT text[] := ARRAY[
    'group_name', 'num_participants', 'arrival_date', 'departure_date',
    'flight_price', 'room_type', 'room_price_per_night', 'accommodation_total',
    'flight_total', 'viaticos_type', 'viaticos_amount', 'viaticos_total',
    'viaticos_display_amount'];
  c_quote_fields CONSTANT text[] := ARRAY[
    'client_name', 'client_email', 'client_phone', 'client_institution',
    'arrival_date', 'departure_date', 'flight_price', 'flight_notes',
    'room_type', 'single_room_price', 'double_room_price', 'num_pasantes',
    'selected_programs', 'apply_early_bird_discount', 'early_bird_payment_date',
    'viaticos_type', 'viaticos_amount', 'viaticos_total', 'viaticos_display_amount',
    'notes', 'internal_notes', 'status', 'valid_until', 'use_groups',
    'grand_total', 'total_per_person',
    'updated_by', 'updated_at'];
  v_quote   public.pasantias_quotes%ROWTYPE;
  v_qnew    public.pasantias_quotes%ROWTYPE;
  v_group   public.pasantias_quote_groups%ROWTYPE;
  v_gnew    public.pasantias_quote_groups%ROWTYPE;
  v_elem    jsonb;
  v_values  jsonb;
  v_fields  jsonb;
  v_id      text;
  v_stored  text[];
  v_seen    text[] := ARRAY[]::text[];
  v_kept    uuid[] := ARRAY[]::uuid[];
BEGIN
  -- a. Lock the quote: a second save of the same quote waits here.
  SELECT * INTO v_quote
    FROM public.pasantias_quotes
   WHERE id = p_quote_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- b. A non-empty list of objects.
  IF p_groups IS NULL OR jsonb_typeof(p_groups) <> 'array' OR jsonb_array_length(p_groups) = 0 THEN
    RAISE EXCEPTION 'groups_empty' USING ERRCODE = '22023';
  END IF;
  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'group_malformed' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- c. Every listed id is a group of this quote, listed once.
  SELECT coalesce(array_agg(g.id::text), ARRAY[]::text[]) INTO v_stored
    FROM public.pasantias_quote_groups g
   WHERE g.quote_id = p_quote_id;
  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    IF v_elem ? 'id' AND jsonb_typeof(v_elem -> 'id') <> 'null' THEN
      v_id := CASE WHEN jsonb_typeof(v_elem -> 'id') = 'string'
                   THEN v_elem ->> 'id' ELSE (v_elem -> 'id')::text END;
      IF NOT (v_id = ANY (v_stored)) THEN
        RAISE EXCEPTION 'group_foreign' USING ERRCODE = '22023';
      END IF;
      IF v_id = ANY (v_seen) THEN
        RAISE EXCEPTION 'group_duplicate' USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_id;
    END IF;
  END LOOP;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_groups) LOOP
    -- Only the thirteen editable keys of the element are ever read.
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_values
      FROM jsonb_each(v_elem) e
     WHERE e.key = ANY (c_group_fields);

    IF v_elem ? 'id' AND jsonb_typeof(v_elem -> 'id') <> 'null' THEN
      -- d. A listed group: its columns from the element where it has the key.
      SELECT * INTO v_group
        FROM public.pasantias_quote_groups
       WHERE id = (v_elem ->> 'id')::uuid
         AND quote_id = p_quote_id;
    ELSE
      -- e. A new group: insert the three required columns (every other column
      --    takes the table's default), then apply the same update as step d.
      v_gnew := jsonb_populate_record(NULL::public.pasantias_quote_groups, v_values);
      INSERT INTO public.pasantias_quote_groups (quote_id, arrival_date, departure_date, room_type)
      VALUES (p_quote_id, v_gnew.arrival_date, v_gnew.departure_date, v_gnew.room_type)
      RETURNING * INTO v_group;
    END IF;

    v_gnew := jsonb_populate_record(v_group, v_values);
    UPDATE public.pasantias_quote_groups
       SET group_name              = v_gnew.group_name,
           num_participants        = v_gnew.num_participants,
           arrival_date            = v_gnew.arrival_date,
           departure_date          = v_gnew.departure_date,
           flight_price            = v_gnew.flight_price,
           room_type               = v_gnew.room_type,
           room_price_per_night    = v_gnew.room_price_per_night,
           accommodation_total     = v_gnew.accommodation_total,
           flight_total            = v_gnew.flight_total,
           viaticos_type           = v_gnew.viaticos_type,
           viaticos_amount         = v_gnew.viaticos_amount,
           viaticos_total          = v_gnew.viaticos_total,
           viaticos_display_amount = v_gnew.viaticos_display_amount
     WHERE id = v_group.id
       AND quote_id = p_quote_id;
    v_kept := v_kept || v_group.id;
  END LOOP;

  -- f. Groups of this quote that were neither listed nor just added.
  DELETE FROM public.pasantias_quote_groups
   WHERE quote_id = p_quote_id
     AND id <> ALL (v_kept);

  -- g. Last guard: a quote in group mode keeps at least one group.
  IF NOT EXISTS (SELECT 1 FROM public.pasantias_quote_groups WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'groups_empty' USING ERRCODE = '22023';
  END IF;

  -- h. The quote's own columns: only the allow-list, from p_fields where it has the key.
  IF p_fields IS NOT NULL AND jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'fields_malformed' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_fields
    FROM jsonb_each(coalesce(p_fields, '{}'::jsonb)) e
   WHERE e.key = ANY (c_quote_fields);
  -- Re-read the (still locked) row: the group triggers have just moved its totals.
  SELECT * INTO v_quote FROM public.pasantias_quotes WHERE id = p_quote_id;
  v_qnew := jsonb_populate_record(v_quote, v_fields);
  UPDATE public.pasantias_quotes
     SET client_name               = v_qnew.client_name,
         client_email              = v_qnew.client_email,
         client_phone              = v_qnew.client_phone,
         client_institution        = v_qnew.client_institution,
         arrival_date              = v_qnew.arrival_date,
         departure_date            = v_qnew.departure_date,
         flight_price              = v_qnew.flight_price,
         flight_notes              = v_qnew.flight_notes,
         room_type                 = v_qnew.room_type,
         single_room_price         = v_qnew.single_room_price,
         double_room_price         = v_qnew.double_room_price,
         num_pasantes              = v_qnew.num_pasantes,
         selected_programs         = v_qnew.selected_programs,
         apply_early_bird_discount = v_qnew.apply_early_bird_discount,
         early_bird_payment_date   = v_qnew.early_bird_payment_date,
         viaticos_type             = v_qnew.viaticos_type,
         viaticos_amount           = v_qnew.viaticos_amount,
         viaticos_total            = v_qnew.viaticos_total,
         viaticos_display_amount   = v_qnew.viaticos_display_amount,
         notes                     = v_qnew.notes,
         internal_notes            = v_qnew.internal_notes,
         status                    = v_qnew.status,
         valid_until               = v_qnew.valid_until,
         use_groups                = v_qnew.use_groups,
         grand_total               = v_qnew.grand_total,
         total_per_person          = v_qnew.total_per_person,
         updated_by                = v_qnew.updated_by,
         updated_at                = v_qnew.updated_at
   WHERE id = p_quote_id;
END;
$$;

COMMENT ON FUNCTION public.save_quote_with_groups(uuid, jsonb, jsonb) IS
  'F15c (GES-2.12): saves a group-mode quote''s travel groups (update listed, add new, remove unlisted) and its own editable fields in one statement, with the quote row locked; server only (service role).';

REVOKE ALL ON FUNCTION public.save_quote_with_groups(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_quote_with_groups(uuid, jsonb, jsonb) TO service_role;
