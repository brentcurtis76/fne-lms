-- =============================================================================
-- zoom_attendance.participant_uuid + interval integrity (plan §6/§11; Z7-2).
--
-- Additive: one nullable column, one partial unique index, one CHECK. Nothing is
-- dropped or rewritten, and every existing row reads NULL.
--
-- ## participant_uuid — the interval key (ruling [R3])
--
-- Zoom's `payload.object.participant.participant_uuid` is the per-participant handle
-- for an occurrence, and it is the only field on the committed captures that is
-- populated for BOTH a licensed host and a license-free guest
-- (`364B3A17-05C0-6B63-F4FA-2180DCC26971` and
-- `73823734-9301-A7E5-36F4-684DEEF79FE5`). Every other candidate key is empty string
-- on the guest's event: `email`, `participant_user_id`, `id` and `registrant_id` are
-- all `""`.
--
-- **Its stability across a joined→left pair is UNVERIFIED and the fixtures cannot
-- settle it**: the two committed captures are two DIFFERENT people (different
-- customer_key, different user_name), so they are not a pair and no pairing can be
-- inferred from them. The interval matcher therefore treats participant_uuid as the
-- PREFERRED key and falls back to the identity token, and both paths are tested. If a
-- real recorded session ever shows the uuid changing between join and leave, the
-- fallback is what keeps intervals closing.
--
-- ## The partial unique index
--
-- `(zoom_meeting_uuid, participant_uuid) WHERE participant_uuid IS NOT NULL` is the
-- uniqueness the Z7-1 review deferred to this chunk. It is what makes a redelivered
-- `participant_joined` a no-op at the DATABASE, not merely in the applier — Zoom
-- retries, and `webhook_sweep` deliberately replays events minutes later, so "the
-- applier checks first" is a race and not a guarantee.
--
-- PARTIAL rather than total, because a participant whose uuid Zoom omitted must still
-- produce a row: a total unique index would collapse every anonymous guest of one
-- occurrence into a single interval, which is exactly the double-count-in-reverse that
-- §11's presence metric cannot survive. For those rows the applier's identity+instant
-- check is the only dedupe there is, and it says so.
--
-- ## The interval-order CHECK (ruling [R7])
--
-- `left_at >= joined_at` is a data-integrity floor, not the applier's error handling.
-- An out-of-order `leave_time` must NOT raise out of the webhook route — Zoom would
-- retry a malformed event forever against an endpoint that can never accept it — so
-- the applier leaves such an interval OPEN and records ledger-only. The CHECK exists
-- so that a future writer which skips that reasoning is refused by Postgres instead of
-- silently storing a negative interval that §11's presence sum would subtract.
-- =============================================================================

ALTER TABLE public.zoom_attendance
  ADD COLUMN participant_uuid text;

COMMENT ON COLUMN public.zoom_attendance.participant_uuid IS
  'Zoom''s per-participant handle for this occurrence (payload.object.participant.participant_uuid). The preferred interval key: it is the only identity-ish field populated for BOTH a licensed host and a license-free guest. NULL when Zoom omitted it, in which case the applier falls back to the identity token. Stability across a joined→left pair is UNVERIFIED — the committed fixtures are two different people and cannot settle it.';

CREATE UNIQUE INDEX zoom_attendance_participant_occurrence_key
  ON public.zoom_attendance (zoom_meeting_uuid, participant_uuid)
  WHERE participant_uuid IS NOT NULL;

ALTER TABLE public.zoom_attendance
  ADD CONSTRAINT zoom_attendance_interval_order
  CHECK (left_at IS NULL OR left_at >= joined_at);

-- -----------------------------------------------------------------------------
-- identity_token — the ONE fallback key, persisted (Codex Z7-2 P1-1).
--
-- [R3] defines a single prioritised fallback token: `customer_key`, else e-mail, else
-- normalised display name. The first implementation computed that token but queried
-- with an OR over every identity column it happened to have, which is a DIFFERENT and
-- much weaker rule: two uuid-less participants with the SAME display name and DIFFERENT
-- customer keys both matched a leave query, and the latest-joined one was closed —
-- closing the wrong person's interval, which is precisely the highest-cost failure this
-- design exists to prevent.
--
-- Persisting the token turns the lookup into exact equality on one column. A weaker
-- field can no longer widen a match after a stronger one has already decided.
--
-- Nullable: a participant who presented no identity at all has no token, and no join and
-- no leave can ever be paired for them. That row is still a real observation and still
-- gets stored — it simply cannot be closed by anything.
--
-- PII note (Ley 21.719): the token can embed an e-mail or a display name, so it is no
-- more sensitive than the columns beside it and is covered by the same SELECT-only RLS.
-- -----------------------------------------------------------------------------

ALTER TABLE public.zoom_attendance
  ADD COLUMN identity_token text;

COMMENT ON COLUMN public.zoom_attendance.identity_token IS
  'The single prioritised fallback identity key ([R3]): ck:<customer_key> | em:<email> | nm:<normalised name>, first non-empty wins. Used to pair a participant_left with its join when Zoom omitted participant_uuid, by EXACT equality — never by OR-ing several identity columns, which would let a shared display name close a different person''s interval. NULL when the participant presented no identity at all.';

CREATE INDEX zoom_attendance_identity_token_idx
  ON public.zoom_attendance (zoom_meeting_uuid, identity_token)
  WHERE identity_token IS NOT NULL;

-- -----------------------------------------------------------------------------
-- source_event_key — delivery-level idempotency, enforced by the DATABASE (Codex P1-2).
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
-- PARTIAL because Z7-3's reconcile rows come from a report rather than a webhook and
-- have no dedupe key; they will carry NULL and are excluded, exactly as the
-- participant_uuid index excludes uuid-less rows.
-- -----------------------------------------------------------------------------

ALTER TABLE public.zoom_attendance
  ADD COLUMN source_event_key text;

COMMENT ON COLUMN public.zoom_attendance.source_event_key IS
  'The webhook ledger dedupe_key (sha256 of the raw delivered body) that produced this row. UNIQUE, so a redelivered or swept participant_joined is refused by Postgres rather than by a read-then-insert the applier could lose a race on. NULL for rows that did not come from a webhook delivery (Z7-3 report rows).';

CREATE UNIQUE INDEX zoom_attendance_source_event_key
  ON public.zoom_attendance (source_event_key)
  WHERE source_event_key IS NOT NULL;
