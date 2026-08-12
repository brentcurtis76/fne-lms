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
-- identity_tokens — every fallback rank the participant presented (Codex P1-1, then
-- the re-review BLOCKER that refuted the first fix).
--
-- [R3] defines a prioritised fallback token: `customer_key`, else e-mail, else
-- normalised display name. Two designs have now failed against that rule:
--
--  1. **OR-ing the identity columns** at query time (first `FAIL`). Two uuid-less
--     participants sharing a display name both matched a leave, and the latest-joined
--     was closed.
--  2. **Storing only the single strongest token** (second `FAIL`). Zoom does not present
--     the same fields on every event for the same person, so a leave can arrive with
--     FEWER fields than its join did and the recomputed token DOWNGRADES to a weaker
--     rank that belongs to somebody else:
--
--        A joins with customer_key=A and name "Ana"  → stored ck:a
--        B joins with only the name "Ana"            → stored nm:ana
--        A leaves, Zoom omits customer_key           → recomputed nm:ana
--        → the exact lookup returns B, and B's interval is closed.
--
--     Reproduced against the applier before this change. It did not fail open; it failed
--     onto the wrong person, which is the outcome [R6] exists to prevent.
--
-- **The hypothesis this column encodes (lean overlay §5 change):** a join is findable by
-- ANY evidence it actually presented, and ambiguity is resolved by refusing to close
-- rather than by choosing. Storage widens; the QUERY does not. A leave still searches
-- with its own strongest token only — matching a strong-evidence leave by name would
-- throw away the very evidence that makes the pair trustworthy — but it now finds the
-- row that carried that token at ANY rank, so a downgraded leave finds its own join.
--
-- Array order IS the precedence, strongest first, so `identity_tokens[1]` remains the
-- primary key for anything that wants one (Z7-3).
--
-- PII note (Ley 21.719): the tokens embed an e-mail and a display name, so they are no
-- more sensitive than the columns beside them and are covered by the same SELECT-only RLS.
-- -----------------------------------------------------------------------------

ALTER TABLE public.zoom_attendance
  ADD COLUMN identity_tokens text[];

COMMENT ON COLUMN public.zoom_attendance.identity_tokens IS
  'Every fallback identity token this participant presented at join, strongest rank first: ck:<customer_key>, em:<email>, nm:<normalised name>. A uuid-less leave searches with ITS OWN strongest token and matches any row carrying that token at ANY rank — which is what keeps a leave that presented fewer fields than its join from matching a different person who happens to share the weaker one. When more than one open interval matches, the applier closes NOTHING (§11 leaves it to the Z7-3 reconcile).';

-- GIN, because the lookup is array containment (`identity_tokens @> ARRAY[token]`).
CREATE INDEX zoom_attendance_identity_tokens_idx
  ON public.zoom_attendance USING gin (identity_tokens)
  WHERE identity_tokens IS NOT NULL;

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
