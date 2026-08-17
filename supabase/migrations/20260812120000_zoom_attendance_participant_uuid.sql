-- =============================================================================
-- zoom_attendance.participant_uuid + interval integrity (plan §6/§11; Z7-2,
-- governed by §15.3.9 — the replanned pairing contract).
--
-- Additive: one nullable column, one partial unique index, one CHECK. Nothing is
-- dropped or rewritten, and every existing row reads NULL.
--
-- ## participant_uuid — the ONLY token that may authorise webhook-time closure
--
-- §15.3.9's eligibility rule: a token may close an open interval only if Zoom mints
-- it (the client cannot assert it), it is unique to one participant within the
-- occurrence, and it matches EXACTLY ONE open row in that occurrence. Zoom defines
-- `payload.object.participant.participant_uuid` as "the participant's UUID for this
-- specific meeting", assigned at join and valid only for that meeting — Zoom-minted
-- and occurrence-scoped, so it satisfies rules 1 and 2. Every other identity field
-- (`customer_key`, `email`, `display_name`) is RECONCILIATION EVIDENCE: persisted on
-- the row, used by Z7-3's authoritative report and by Z7-5's facilitator suggestion,
-- and never sufficient authority for a destructive close. `customer_key` is minted by
-- US and handed to the browser, so it is a claim, not an identity; `email` is `""`
-- for every signed-out guest; `display_name` is attacker/typo-controlled.
--
-- Whether a rejoin reuses the uuid or mints a new one is undocumented and unmeasured
-- — and it is now SAFE to be wrong about: an unstable token matches nothing, the
-- interval stays open, and Z7-3's report closes it. Instability degrades to
-- no-closure. The only way an eligible token closes the WRONG person's interval is a
-- value collision between two people in one occurrence, which Zoom's own uniqueness
-- forbids.
--
-- ## The partial unique index
--
-- `(zoom_meeting_uuid, participant_uuid, joined_at) WHERE participant_uuid IS NOT
-- NULL` makes a redelivered `participant_joined` a no-op at the DATABASE, not merely
-- in the applier — Zoom retries, and `webhook_sweep` deliberately replays events
-- minutes later, so "the applier checks first" is a race and not a guarantee.
--
-- `joined_at` is part of the key because Zoom's definition is meeting-scoped, NOT
-- connection-scoped: a rejoin may legitimately REUSE the uuid, and a two-column key
-- would refuse the second interval of a participant who dropped and rejoined —
-- collapsing real presence into one row. A redelivery of the SAME join carries the
-- same instant and still collides; a genuine rejoin carries a later instant and does
-- not.
--
-- PARTIAL rather than total, because a participant whose uuid Zoom omitted must
-- still produce a row: a total unique index would collapse every anonymous guest of
-- one occurrence into a single interval. For those rows `source_event_key` (below)
-- is the only database dedupe there is, and a byte-DIFFERENT duplicate of a uuid-less
-- join is accepted as a duplicate row — stated in §15.3.9's matrix (row 7) as a
-- limitation, resolved by the authoritative report, never by a matching heuristic.
--
-- ## The interval-order CHECK
--
-- `left_at >= joined_at` is a data-integrity floor, not the applier's error handling.
-- An out-of-order `leave_time` must NOT raise out of the webhook route — Zoom would
-- retry a malformed event forever against an endpoint that can never accept it — so
-- the applier closes nothing in that case and records the leave as an observation.
-- The CHECK exists so that a future writer which skips that reasoning is refused by
-- Postgres instead of silently storing a negative interval that §11's presence sum
-- would subtract.
-- =============================================================================

ALTER TABLE public.zoom_attendance
  ADD COLUMN participant_uuid text;

COMMENT ON COLUMN public.zoom_attendance.participant_uuid IS
  'Zoom''s per-participant handle for this occurrence (payload.object.participant.participant_uuid). Under §15.3.9 it is the ONLY token that may authorise webhook-time interval closure — Zoom-minted, occurrence-scoped, and required to match exactly one open row. NULL when Zoom omitted it, in which case the interval can only be closed by Z7-3''s authoritative report. Rejoin reuse of the value is undocumented; either behaviour degrades to no-closure, never to a wrong-person close.';

CREATE UNIQUE INDEX zoom_attendance_participant_occurrence_key
  ON public.zoom_attendance (zoom_meeting_uuid, participant_uuid, joined_at)
  WHERE participant_uuid IS NOT NULL;

ALTER TABLE public.zoom_attendance
  ADD CONSTRAINT zoom_attendance_interval_order
  CHECK (left_at IS NULL OR left_at >= joined_at);

-- -----------------------------------------------------------------------------
-- identity_tokens — every identity rank the participant presented, strongest first.
--
-- RECONCILIATION EVIDENCE ONLY (§15.3.9). Two closure designs failed against these
-- tokens before the contract was replanned — OR-ing the identity columns closed a
-- namesake's row, and single-strongest-token storage let a downgraded leave close a
-- stranger's — and the replan's answer is that NO client-assertable token ever
-- authorises a close. The column survives because the evidence itself is valuable:
-- Z7-3 and Z7-5's facilitator suggestion consume it to propose (never assert) who a
-- row belongs to, and `matched_by` records which rank answered.
--
-- Array order is the §15 confidence hierarchy, strongest first, so
-- `identity_tokens[1]` remains the primary evidence rank for anything that wants one.
--
-- PII note (Ley 21.719): the tokens embed an e-mail and a display name, so they are
-- no more sensitive than the columns beside them and are covered by the same
-- SELECT-only RLS.
-- -----------------------------------------------------------------------------

ALTER TABLE public.zoom_attendance
  ADD COLUMN identity_tokens text[];

COMMENT ON COLUMN public.zoom_attendance.identity_tokens IS
  'Every identity token this participant presented at join, strongest rank first: ck:<customer_key>, em:<email>, nm:<normalised name>. Reconciliation evidence only (§15.3.9) — consumed by Z7-3 and by the Z7-5 facilitator suggestion, never by interval closure, which requires a Zoom-minted participant_uuid matching exactly one open row.';

-- GIN, because evidence lookups are array containment (`identity_tokens @> ARRAY[t]`).
CREATE INDEX zoom_attendance_identity_tokens_idx
  ON public.zoom_attendance USING gin (identity_tokens)
  WHERE identity_tokens IS NOT NULL;

-- -----------------------------------------------------------------------------
-- source_event_key — delivery-level idempotency, enforced by the DATABASE.
--
-- The partial unique index above only covers rows that HAVE a participant_uuid, so a
-- uuid-less join had no database constraint at all and the applier defended it with a
-- read-then-insert. That is a race, not a guarantee: two concurrent deliveries of the
-- same body — reachable because duplicate ledger rows with `processed_at IS NULL` are
-- not atomically claimed before both requests invoke the applier — both read "no open
-- interval" and both insert. A barrier probe produced exactly that: two
-- `interval_opened` outcomes and two rows.
--
-- `source_event_key` is the webhook ledger's `dedupe_key`, which is `sha256(raw body)`.
-- Zoom's retry and `webhook_sweep`'s replay both carry the SAME bytes, so they carry the
-- same key, and the unique index refuses the second row inside Postgres where a race
-- cannot be lost. A genuine rejoin is a different body, a different key, and a new row —
-- which is correct, and is why this is keyed on the delivery rather than on the person.
--
-- PARTIAL because Z7-3's report rows come from the participant report rather than a
-- webhook and have no dedupe key; they carry NULL and are excluded, exactly as the
-- participant_uuid index excludes uuid-less rows.
-- -----------------------------------------------------------------------------

ALTER TABLE public.zoom_attendance
  ADD COLUMN source_event_key text;

COMMENT ON COLUMN public.zoom_attendance.source_event_key IS
  'The webhook ledger dedupe_key (sha256 of the raw delivered body) that produced this row. UNIQUE, so a redelivered or swept participant_joined is refused by Postgres rather than by a read-then-insert the applier could lose a race on. NULL for rows that did not come from a webhook delivery (Z7-3 report rows).';

CREATE UNIQUE INDEX zoom_attendance_source_event_key
  ON public.zoom_attendance (source_event_key)
  WHERE source_event_key IS NOT NULL;
