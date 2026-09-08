> **R5-01 inventory addendum (2026-09-07):** `lp_last_authorized_heartbeat(timestamptz,timestamptz,timestamptz DEFAULT '-infinity')` replaces the uncommitted two-argument helper; IMMUTABLE SQL INVOKER, pinned `public,pg_temp`, no EXECUTE for PUBLIC/anon/authenticated/service_role. Session readers pass the protected persisted `heartbeat_trust_ceiling`; absent provenance yields the start. New `learning_path_sessions_historical_close_guard()` is a pinned INVOKER trigger function with the same EXECUTE revocations, enforcing zero-credit closure of ineligible open historical sessions for old maintenance. Existing heartbeat guard sets the ceiling alongside the server mark. Neither is a new callable application API or policy predicate. The 22 decision-dependent predicates remain separate. Prior R4 historical-future claims below are superseded.

# D-RLS function-exposure inventory and dispositions — 2026-09-07 (branch `fix/rls-learn`)

**Status:** discovery complete at signature level (Parts A–C below, generated read-only from the task-isolated disposable database after the three uncommitted 2026-09-07 migrations); **corrections implemented in this task are limited to what §0 lists.** Everything else dispositioned `CONFIRMED_DEFECT` or `DECISION_DEPENDENT` is a **finding for a separately authorized unit** (the protocol's D-RLS-03 "discovery only; remediation undefined"), not something this task changed. No function was bulk-revoked; policy predicates keep the EXECUTE they need.

## 0. What this task corrected (and the evidence)

| Function | Finding | Correction (migration `20260907120200_drls_function_exposure.sql`) | Evidence |
|---|---|---|---|
| `submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)` | SECURITY DEFINER INSERT into `quiz_submissions` trusting caller-supplied `p_student_id`; browser callers (`lib/services/quizSubmissions.js` via `QuizTaker` / `LearningQuizTaker`) pass a client-controlled id — any authenticated user could submit as another student | Body recreated: when `auth.uid()` is set, `p_student_id` must equal it (ERRCODE 42501 before any write); when no end-user identity, only a backend principal (`auth_is_backend_caller()`: no JWT, or a `service_role` JWT) may name a student — this keeps `scripts/seed-qa-phase2*.js` (service-role key) working. Scoring/insert semantics unchanged. | pgTAP 072 (own submit succeeds and is scored; other student refused; NULL refused; refused calls write nothing; service_role seed path succeeds; anon cannot execute) |
| `has_global_workspace_access(uuid)` | Answers any user's admin/consultor status to any authenticated caller (information disclosure oracle). Policy consumers: three `community_meetings` policies, always `auth.uid()`. No code caller. | Body recreated: answers about the caller; about anyone for a literal admin (`auth_is_admin()`) or a backend principal; FALSE for any other id. | pgTAP 072 (self TRUE; other-user FALSE for a non-admin although that user is a consultor; admin TRUE; service_role TRUE; anon cannot execute) |
| `auth_is_backend_caller()` (new helper) | — | `auth.uid() IS NULL AND coalesce(jwt role, 'service_role') = 'service_role'`; EXECUTE to authenticated + service_role only | pgTAP 072 (authenticated FALSE, service_role TRUE, anon cannot execute, PUBLIC none) |
| `has_transformation_access`, `get_available_assignment_templates`, `cleanup_propuesta_rate_limits` (D-RLS-01) | mechanical exposure (PUBLIC/anon EXECUTE, mutable search_path) | as in the first implementation: PUBLIC/anon revoked, search_path pinned; `cleanup_propuesta_rate_limits` service_role only; bodies unchanged | pgTAP 072 §1–§2 |
| Proposal rate limiter (`lib/propuestas-web/access-rate-limit.ts`, callers `pages/api/propuestas/web/[slug]/verify.ts`, `lib/propuestas-web/download-access.ts`) | **fail-open**: a count-query error answered `allowed: true` (any limiter failure removed the throttle on the public access-code check); a failing insert of a failed attempt was discarded silently | fail-**closed** with a `degraded` flag → callers answer **503** (not 429, so the client is not told it exhausted attempts); `recordProposalFailedAttempt` logs and returns `false` on failure. `x-forwarded-for` trust is unchanged (platform-provided on Vercel; noted, not a defect of this unit). | `__tests__/lib/propuestas-web/access-rate-limit.test.ts` (7) |
| Transformation-access fallback (`lib/transformation/accessControl.ts:40–61`; SQL twin `has_transformation_access`) | inspected: an error on `growth_community_transformation_access` is logged and falls through to the legacy `growth_communities.transformation_enabled` flag; an error there returns `false`. This is a **staleness** risk (legacy flag may lag the access table), **not** a fail-open-on-error grant. The only null→grant path is the admin-only auto-assign in `pages/api/transformation/assessments.ts:60–83`; non-admins get 403. | **no change** — no security correction is warranted; recorded so the item is not omitted | Part C.12 |

## 0.1 Findings NOT corrected here (destination: a separately authorized D-RLS-03 remediation unit)

Part B dispositions (application functions): `CONFIRMED_DEFECT` **34** (of which 2 corrected above → 32 remain), `DECISION_DEPENDENT` **22**. The list is in Part B; the most consequential remaining ones are the dev-impersonation trio (`start_dev_impersonation` / `get_active_dev_impersonation` / `end_dev_impersonation` — SECURITY DEFINER, anon-executable, mint or reveal `session_token` for any dev id; mitigated only by `is_dev_user()` returning FALSE when the dev table is empty), `get_all_auth_users` (reads `auth.users` for every account), the two `get_reportable_users*` variants (trust `requesting_user_id`), and the per-user notification / badge / document writers that take a caller-supplied user id. **These are reported, not changed**: correcting them requires body redesign per function against real callers, which the task authorized only for the functions named above. They are listed under DECISIONS_REQUIRED / FINDINGS in the review request.

## 0.2 Recount (D-RLS-03, catalog after the three migrations)

| metric | all `public` (396) | application functions (177; 219 `btree_gist`/`pg_trgm` extension functions excluded) |
|---|---|---|
| SECURITY DEFINER | 116 | 116 |
| executable by anon (directly or via PUBLIC) | 357 | 138 |
| PUBLIC-executable | 353 | 134 |
| SECURITY DEFINER without pinned search_path | 61 | 61 |

The first review request reported "79 anon-executable" — that figure counted SECURITY DEFINER functions only; the signature-level figures above supersede it.

---

# D-RLS function-exposure inventory — schema `public`

Source of truth: disposable database `supabase_db_rlslearn-disposable` (worktree `/Users/brentcurtis/dev/wt/rls-learn`, branch `fix/rls-learn`, HEAD `92df72a6` + the three uncommitted 2026-09-07 migrations, **including `20260907120200_drls_function_exposure.sql`, which is already applied** — so the five D-RLS-01 functions appear here in their post-migration state). Read-only catalog queries only; no file in the worktree was modified.

## Part A — catalog of all functions in `public`

Effective EXECUTE grantees come from `aclexplode(coalesce(proacl, acldefault('f', proowner)))`. `anon` column = anon holds EXECUTE directly **or via PUBLIC**; same rule for `authenticated`/`service_role`. `ext` = the function belongs to an extension (`pg_depend.deptype='e'`): 188 `btree_gist` + 31 `pg_trgm` C functions installed in `public`.

### Totals

| metric | all `public` (396) | application functions only (177, extensions excluded) |
|---|---|---|
| SECURITY DEFINER | **116** | 116 |
| executable by anon (directly or via PUBLIC) | **357** | 138 |
| PUBLIC-executable | **353** | 134 |
| SECURITY DEFINER without pinned search_path | **61** | 61 |

All 219 extension functions are INVOKER, PUBLIC-executable (Postgres default) and carry no search_path; they are the whole difference between the two columns. Of the 177 application functions, 47 return `trigger` and cannot be invoked directly (`trigger functions can only be called as triggers`), and 61 SECURITY DEFINER functions still run with a mutable search_path.

### Raw catalog (sorted by signature)

| signature | security | search_path (proconfig) | owner | lang | volatility | ext | EXECUTE grantees | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `add_feedback_activity(p_feedback_id uuid, p_message text, p_user_id uuid, p_is_system boolean)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `apply_forced_password_change_guard(p_schema text, p_table text)` | INVOKER | (none) | postgres | plpgsql | v |  | postgres | 0 | 0 | 0 | 0 |
| `apply_session_hour_override(p_session_id uuid, p_new_minutes integer, p_reason text, p_reason_category text, p_request_id text, p_payload_hash text, p_reverses_override_id uuid)` | DEFINER | search_path="" | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `apply_session_reschedule(p_session_id uuid, p_actor_id uuid, p_updates jsonb, p_if_updated_at timestamp with time zone)` | DEFINER | search_path="" | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `archive_assessments_on_access_removal()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `audit_role_permission_change()` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_get_user_role()` | DEFINER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_has_school_access(p_school_id bigint)` | DEFINER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_has_school_access_uuid(p_school_id bigint)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_is_admin()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_is_assessment_admin()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_is_assigned_group_member(p_group_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | sql | s |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `auth_is_course_student(p_course_id uuid)` | DEFINER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_is_course_teacher(p_course_id uuid)` | DEFINER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_is_learning_path_assignee(p_path_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | sql | s |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `auth_is_learning_path_member(p_course_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | sql | s |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `auth_is_school_directivo(p_school_id integer)` | DEFINER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_is_superadmin(check_user_id uuid)` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_is_teacher()` | DEFINER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `auth_user_community_ids()` | DEFINER | search_path=public | postgres | sql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `award_course_completion_badge(p_user_id uuid, p_course_id uuid, p_course_name text)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `batch_assign_courses(p_course_id uuid, p_user_ids uuid[])` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `batch_assign_learning_path(p_path_id uuid, p_user_ids uuid[], p_group_ids uuid[], p_assigned_by uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `batch_unassign_courses(p_course_id uuid, p_user_ids uuid[])` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `bot_save_expense_item(p_user_id uuid, p_report_id uuid, p_report_name text, p_start date, p_end date, p_category_id uuid, p_description text, p_amount numeric, p_currency text, p_original_amount numeric, p_conversion_rate numeric, p_conversion_date date, p_expense_date date, p_vendor text, p_expense_number text, p_receipt_url text, p_receipt_filename text, p_notes text, p_report_description text)` | DEFINER | search_path=public | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `calculate_group_totals()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `calculate_quiz_score(submission_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `calculate_quote_totals()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `calculate_quote_totals_with_discount()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `calculate_quote_totals_with_groups()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `calculate_quote_totals_with_groups_and_discount()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `calculate_viaticos_totals()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `can_access_workspace(p_user_id uuid, p_workspace_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `can_edit_meeting(check_user_id uuid, check_meeting_id uuid)` | DEFINER | search_path=public | postgres | plpgsql | v |  | anon,authenticated,service_role,postgres | 0 | 1 | 1 | 1 |
| `cascade_lesson_submission_updates()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `cash_dist(money, money)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `check_community_organization()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `check_duplicate_notification(p_user_id uuid, p_title character varying, p_description text, p_time_window_seconds integer)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `claim_invitation_resend(p_target_user_id uuid, p_actor_user_id uuid, p_cooldown_seconds integer, p_metadata jsonb)` | DEFINER | search_path=public, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `claim_password_recovery_outbox(p_worker_token uuid, p_limit integer, p_lease_seconds integer, p_candidate_fingerprint text)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `claim_recovery_attempt_grant(p_grant_hash text, p_lease_token uuid, p_lease_seconds integer)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `cleanup_expired_dev_sessions()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `cleanup_expired_test_runs()` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `cleanup_orphaned_communities()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `cleanup_propuesta_rate_limits()` | INVOKER | search_path=public, pg_temp | postgres | sql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `contratos_set_representante_snapshot()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `create_activity(p_workspace_id uuid, p_activity_type activity_type, p_entity_type entity_type, p_user_id uuid, p_entity_id uuid, p_title text, p_description text, p_metadata jsonb, p_importance_score integer, p_tags text[], p_related_users uuid[])` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `create_assignment_template_from_block(p_lesson_id uuid, p_block_id uuid, p_block_data jsonb, p_created_by uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `create_document_version(document_uuid uuid, new_storage_path text, new_file_size bigint, new_mime_type character varying, user_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `create_full_learning_path(p_name text, p_description text, p_course_ids uuid[], p_created_by uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_entity_type character varying, p_entity_id uuid, p_metadata jsonb)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `create_notification_safe(p_user_id uuid, p_title character varying, p_description text, p_category character varying, p_related_url character varying, p_importance character varying, p_notification_type_id character varying, p_idempotency_key character varying)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `create_recovery_attempt_grant(p_grant_hash text, p_expires_at timestamp with time zone, p_max_attempts integer)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `create_sample_notifications_for_user(p_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `create_user_notification(p_user_id uuid, p_notification_type_id character varying, p_title character varying, p_description text, p_related_url character varying)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `current_password_change_state()` | DEFINER | search_path=public, pg_catalog | postgres | sql | s |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `date_dist(date, date)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `end_dev_impersonation(p_dev_user_id uuid, p_ip_address inet, p_user_agent text)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `end_learning_path_session(p_session_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `enforce_operator_ledger_guard()` | INVOKER | search_path="" | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `enforce_operator_session_tenant_guard()` | INVOKER | search_path="" | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `enforce_school_tenant_control_authority()` | INVOKER | search_path="" | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `enqueue_password_recovery(p_candidate_fingerprint text, p_ip_hash text, p_request_envelope text, p_cooldown_seconds integer, p_ip_limit integer, p_ip_window_seconds integer)` | DEFINER | search_path=public, auth_security, extensions, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `exec_sql(sql_query text)` | DEFINER | search_path=public | postgres | plpgsql | v |  | postgres | 0 | 0 | 0 | 0 |
| `extract_mentions(p_content text)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `feedback_status_change_trigger()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `finish_password_recovery_outbox(p_job_id uuid, p_worker_token uuid, p_state text, p_provider_message_id text, p_retry_delay_seconds integer)` | DEFINER | search_path=public, auth_security, extensions, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `finish_recovery_attempt_grant(p_grant_hash text, p_lease_token uuid, p_succeeded boolean)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `float4_dist(real, real)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `float8_dist(double precision, double precision)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `fn_is_events_manager(p_user_id uuid)` | DEFINER | search_path=public | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `gate_password_change()` | DEFINER | search_path=public, pg_catalog | postgres | plpgsql | v |  | anon,authenticated,service_role,postgres,authenticator | 0 | 1 | 1 | 1 |
| `gbt_bit_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bit_consistent(internal, bit, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bit_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bit_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bit_same(gbtreekey_var, gbtreekey_var, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bit_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bool_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bool_consistent(internal, boolean, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bool_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bool_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bool_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bool_same(gbtreekey2, gbtreekey2, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bool_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bpchar_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bpchar_consistent(internal, character, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bytea_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bytea_consistent(internal, bytea, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bytea_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bytea_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bytea_same(gbtreekey_var, gbtreekey_var, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_bytea_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_consistent(internal, money, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_distance(internal, money, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_cash_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_consistent(internal, date, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_distance(internal, date, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_same(gbtreekey8, gbtreekey8, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_date_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_decompress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_enum_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_enum_consistent(internal, anyenum, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_enum_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_enum_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_enum_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_enum_same(gbtreekey8, gbtreekey8, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_enum_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_consistent(internal, real, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_distance(internal, real, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_same(gbtreekey8, gbtreekey8, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float4_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_consistent(internal, double precision, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_distance(internal, double precision, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_float8_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_inet_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_inet_consistent(internal, inet, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_inet_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_inet_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_inet_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_inet_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_consistent(internal, smallint, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_distance(internal, smallint, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_same(gbtreekey4, gbtreekey4, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int2_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_consistent(internal, integer, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_distance(internal, integer, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_same(gbtreekey8, gbtreekey8, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int4_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_consistent(internal, bigint, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_distance(internal, bigint, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_int8_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_consistent(internal, interval, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_decompress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_distance(internal, interval, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_same(gbtreekey32, gbtreekey32, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_intv_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad8_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad8_consistent(internal, macaddr8, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad8_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad8_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad8_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad8_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad8_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad_consistent(internal, macaddr, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_macad_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_numeric_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_numeric_consistent(internal, numeric, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_numeric_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_numeric_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_numeric_same(gbtreekey_var, gbtreekey_var, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_numeric_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_consistent(internal, oid, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_distance(internal, oid, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_same(gbtreekey8, gbtreekey8, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_oid_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_text_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_text_consistent(internal, text, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_text_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_text_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_text_same(gbtreekey_var, gbtreekey_var, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_text_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_consistent(internal, time without time zone, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_distance(internal, time without time zone, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_time_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_timetz_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_timetz_consistent(internal, time with time zone, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_consistent(internal, timestamp without time zone, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_distance(internal, timestamp without time zone, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_same(gbtreekey16, gbtreekey16, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_ts_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_tstz_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_tstz_consistent(internal, timestamp with time zone, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_tstz_distance(internal, timestamp with time zone, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_uuid_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_uuid_consistent(internal, uuid, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_uuid_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_uuid_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_uuid_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_uuid_same(gbtreekey32, gbtreekey32, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_uuid_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_var_decompress(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbt_var_fetch(internal)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey16_in(cstring)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey16_out(gbtreekey16)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey2_in(cstring)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey2_out(gbtreekey2)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey32_in(cstring)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey32_out(gbtreekey32)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey4_in(cstring)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey4_out(gbtreekey4)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey8_in(cstring)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey8_out(gbtreekey8)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey_var_in(cstring)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gbtreekey_var_out(gbtreekey_var)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `generate_notification_idempotency_key(p_event_type character varying, p_event_id character varying, p_user_id uuid, p_timestamp timestamp without time zone)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_active_dev_impersonation(user_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_active_triggers(p_event_type text)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_activity_stats(p_workspace_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_all_auth_users()` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_available_assignment_templates(p_course_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `get_baseline_permissions(p_role_type text)` | DEFINER | search_path=public | postgres | sql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_bucket_summary(p_contrato_id uuid)` | INVOKER | search_path=public | postgres | sql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_consultant_earnings(p_consultant_id uuid, p_from date, p_to date)` | INVOKER | (none) | postgres | sql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_document_statistics(workspace_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_effective_permissions(p_role_type text, p_test_run_id uuid)` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_effective_user_role(user_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_emotion_recommendations(p_user_id uuid)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_folder_breadcrumb(folder_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_meeting_stats(p_workspace_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_or_create_community_for_leader(p_leader_id uuid, p_school_id uuid, p_generation_id uuid)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_or_create_community_workspace(p_community_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_overdue_items(p_workspace_id uuid, p_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_recent_document_activity(workspace_uuid uuid, limit_count integer)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_related_bugs(target_bug_id uuid, result_limit integer)` | INVOKER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_reportable_users(requesting_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_reportable_users_enhanced(requesting_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_school_user_counts()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_thread_statistics(p_thread_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_unread_notification_count(p_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_user_admin_status(user_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_user_badges(p_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_user_messaging_permissions(p_user_id uuid, p_workspace_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_user_workspace_role(p_user_id uuid, p_workspace_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_users_needing_metadata_sync()` | INVOKER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `get_workspace_messaging_stats(p_workspace_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gin_extract_value_trgm(text, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `grade_quiz_feedback(p_submission_id uuid, p_graded_by uuid, p_review_status text, p_general_feedback text, p_question_feedback jsonb)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `grade_quiz_open_responses(p_submission_id uuid, p_graded_by uuid, p_grading_data jsonb)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `gtrgm_compress(internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_consistent(internal, text, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_decompress(internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_distance(internal, text, smallint, oid, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_in(cstring)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_options(internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_out(gtrgm)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_penalty(internal, internal, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_picksplit(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_same(gtrgm, gtrgm, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `gtrgm_union(internal, internal)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `handle_new_user()` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `has_feedback_permission(check_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `has_global_workspace_access(check_user_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `has_transformation_access(community_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | s |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `increment_document_counter(document_uuid uuid, counter_type text, user_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `increment_path_assignment_time(p_user_id uuid, p_path_id uuid, p_minutes integer)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `increment_post_view_count(post_id uuid)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `int2_dist(smallint, smallint)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `int4_dist(integer, integer)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `int8_dist(bigint, bigint)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `interrupt_recovery_attempt_grant(p_grant_hash text, p_lease_token uuid)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `interval_dist(interval, interval)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `invalidate_recovery_attempt_grant(p_grant_hash text)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `is_admin()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `is_admin_or_consultor(p_uid uuid)` | DEFINER | search_path=public | postgres | sql | s |  | anon,authenticated,service_role,postgres | 0 | 1 | 1 | 1 |
| `is_assessment_collaborator(assessment_uuid uuid, uid uuid)` | DEFINER | (none) | postgres | sql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `is_community_member(check_user_id uuid, check_community_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `is_dev_user(user_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `is_global_admin(user_uuid uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `is_zoom_surface_facilitator(p_surface_type text, p_surface_id uuid)` | DEFINER | search_path="" | postgres | sql | s |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `log_document_access()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `log_initial_assignment()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `log_metadata_sync_needed()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `log_notification_event(p_event_type text, p_event_data jsonb, p_trigger_id uuid, p_notifications_count integer, p_status text)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `mark_all_notifications_read(p_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `mark_notification_read(notification_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `mark_notification_read(p_notification_id uuid, p_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `mark_recovery_attempt_grant_succeeded(p_grant_hash text)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `migrate_assignments_to_enrollments()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `oid_dist(oid, oid)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `password_change_gate_ok()` | DEFINER | search_path=public, pg_catalog | postgres | plpgsql | s |  | anon,authenticated,service_role,postgres,authenticator | 0 | 1 | 1 | 1 |
| `peek_recovery_attempt_grant(p_grant_hash text)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `prepare_password_recovery_outbox(p_job_id uuid, p_worker_token uuid, p_message_envelope text)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `prevent_rubric_deletion_with_results()` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `protect_must_change_password()` | INVOKER | search_path=public, pg_catalog | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `recompute_expense_report_total(p_report_id uuid)` | INVOKER | (none) | postgres | sql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `record_password_recovery_delivery(p_provider_message_id text, p_outcome text)` | DEFINER | search_path=public, auth_security, extensions, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `refresh_user_roles_cache()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `reschedule_session_hours(p_session_id uuid, p_actor_id uuid)` | DEFINER | search_path="" | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `resolve_password_recovery_outbox(p_job_id uuid, p_worker_token uuid, p_email text)` | DEFINER | search_path=public, auth_security, extensions, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `run_auth_security_retention(p_limit integer, p_audit_retention_days integer)` | DEFINER | search_path=public, auth_security, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `search_bugs_by_similarity(search_query text, similarity_threshold double precision, result_limit integer)` | INVOKER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `session_hour_overrides_immutable()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `set_enrollment_total_lessons()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `set_expense_report_access_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `set_limit(real)` | INVOKER | (none) | supabase_admin | c | v | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `set_password_change_required(p_user_id uuid, p_required boolean)` | DEFINER | search_path=public, pg_catalog | postgres | plpgsql | v |  | service_role,postgres | 0 | 0 | 0 | 1 |
| `set_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `show_limit()` | INVOKER | (none) | supabase_admin | c | s | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `show_trgm(text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `similarity(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `similarity_dist(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `similarity_op(text, text)` | INVOKER | (none) | supabase_admin | c | s | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `start_dev_impersonation(p_dev_user_id uuid, p_impersonated_role user_role_type, p_impersonated_user_id uuid, p_school_id integer, p_generation_id uuid, p_community_id uuid, p_ip_address inet, p_user_agent text)` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `start_learning_path_session(p_user_id uuid, p_path_id uuid, p_course_id uuid, p_activity_type character varying)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `strict_word_similarity(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `strict_word_similarity_commutator_op(text, text)` | INVOKER | (none) | supabase_admin | c | s | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `strict_word_similarity_dist_commutator_op(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `strict_word_similarity_dist_op(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `strict_word_similarity_op(text, text)` | INVOKER | (none) | supabase_admin | c | s | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `submit_quiz(p_lesson_id uuid, p_block_id text, p_student_id uuid, p_course_id uuid, p_answers jsonb, p_quiz_data jsonb, p_time_spent integer)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,service_role,postgres | 0 | 0 | 1 | 1 |
| `supervisor_can_access_user(supervisor_user_id uuid, target_user_id uuid)` | DEFINER | (none) | postgres | plpgsql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `sync_legacy_transformation_flag()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `sync_session_attendees_on_gc_change()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `time_dist(time without time zone, time without time zone)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `transition_school_to_no_generations(p_school_id uuid)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `trigger_refresh_user_roles_cache()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `trigger_update_meditation_streak()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `ts_dist(timestamp without time zone, timestamp without time zone)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `tstz_dist(timestamp with time zone, timestamp with time zone)` | INVOKER | (none) | supabase_admin | c | i | btree_gist | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `update_assessment_objectives_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_assignment_on_test_completion()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_church_updated_at_column()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_community_workspace_timestamp()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_course_enrollment_progress()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_course_proposals_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_document_timestamp()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_folder_timestamp()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_full_learning_path(p_path_id uuid, p_name text, p_description text, p_course_ids uuid[], p_updated_by uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `update_generations_updated_at()` | DEFINER | search_path=public | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_lesson_submission_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_meditation_streak(p_user_id uuid)` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_overdue_status()` | DEFINER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_pasantias_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_qa_scenarios_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_quote_on_group_change()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_school_has_generations()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_session_heartbeat(p_session_id uuid)` | DEFINER | search_path=public, pg_temp | postgres | plpgsql | v |  | authenticated,postgres | 0 | 0 | 1 | 0 |
| `update_thread_stats()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_upcoming_courses_updated_at()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `update_updated_at_column()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `user_church_organization_id()` | INVOKER | (none) | postgres | sql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `user_is_in_group(p_group_id uuid, p_user_id uuid)` | DEFINER | search_path=public, pg_catalog | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `user_school_ids(uid uuid)` | DEFINER | (none) | postgres | sql | s |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `validate_assignment_instance_course()` | INVOKER | (none) | postgres | plpgsql | v |  | PUBLIC,anon,authenticated,service_role,postgres | 1 | 1 | 1 | 1 |
| `word_similarity(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `word_similarity_commutator_op(text, text)` | INVOKER | (none) | supabase_admin | c | s | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `word_similarity_dist_commutator_op(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `word_similarity_dist_op(text, text)` | INVOKER | (none) | supabase_admin | c | i | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |
| `word_similarity_op(text, text)` | INVOKER | (none) | supabase_admin | c | s | pg_trgm | PUBLIC,anon,authenticated,service_role,postgres,supabase_admin | 1 | 1 | 1 | 1 |

## Part B — SECURITY DEFINER ∪ anon/PUBLIC-executable functions (application functions)

Set = every application function that is SECURITY DEFINER **or** executable by anon/PUBLIC (175 of 177; the two outside the union are `apply_forced_password_change_guard(text,text)` — INVOKER, postgres-only — and `cleanup_propuesta_rate_limits()` — INVOKER, service_role-only after the applied migration — the latter is appended as an extra row because it is a named D-RLS-01 function). The 219 extension functions are also anon/PUBLIC-executable; they are pure C operator-support functions (`gist_*`, `gbt_*`, `similarity`, `show_trgm`, …) with no table access and are classed JUSTIFIED_EXPOSURE as a block rather than listed per row.

Column notes: *callers* are repository `.rpc('<name>'` hits in pages/, lib/, components/, hooks/, utils/, scripts/, middleware.ts plus SQL-style `select <name>(` in scripts/; client type in brackets — **[browser]** = `useSupabaseClient`/`createPagesBrowserClient`/`lib/supabase-wrapper` (anon key + user session), **[session-api]** = `createPagesServerClient`/`createApiSupabaseClient` in an API route (user JWT), **[service]** = `SUPABASE_SERVICE_ROLE_KEY`, **[cron]**, **[seed]** = scripts/ with the service key, **[injected]** = library takes a `SupabaseClient` parameter (caller decides). *policy deps* = `pg_policies` whose `qual`/`with_check` contains the name. *fn refs* = other function bodies (`prosrc`) that call it, plus trigger bindings from `pg_trigger`.

| signature | definer | search_path pinned | anon | PUBLIC | authenticated | service_role | callers | policy deps | fn refs / triggers | actor handling | side effects | disposition | evidence / destination |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `add_feedback_activity(p_feedback_id uuid, p_message text, p_user_id uuid, p_is_system boolean)` | yes | NO | 1 | 1 | 1 | 1 | none | none | feedback_status_change_trigger | caller-supplied: p_user_id uuid | writes: insert into feedback_activity | **CONFIRMED_DEFECT** | DEFINER + PUBLIC/anon; INSERT feedback_activity.created_by = caller-supplied p_user_id, no auth.uid(); only in-DB use is trigger feedback_status_change_trigger -> anon can write feedback activity as any user |
| `apply_session_hour_override(p_session_id uuid, p_new_minutes integer, p_reason text, p_reason_category text, p_request_id text, p_payload_hash text, p_reverses_override_id uuid)` | yes | search_path="" | 0 | 0 | 1 | 0 | pages/api/admin/sessions/[id]/hour-override.ts:146 [session-api]; scripts/ci/override-concurrency-proof.mjs:164 [SQL, seed/CI (service key)] | none | none | auth.uid() | writes: insert into public.session_hour_overrides | **JUSTIFIED_EXPOSURE** | authenticated only; body derives actor from auth.uid() and requires active admin role; caller pages/api/admin/sessions/[id]/hour-override.ts:146 (session client) |
| `apply_session_reschedule(p_session_id uuid, p_actor_id uuid, p_updates jsonb, p_if_updated_at timestamp with time zone)` | yes | search_path="" | 0 | 0 | 0 | 1 | lib/services/hour-tracking.ts:752 [injected] | none | none | caller-supplied: p_actor_id uuid | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `archive_assessments_on_access_removal()` | yes | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: growth_community_transformation_access.trigger_archive_on_access_removal | trigger (NEW/OLD rows), auth.uid() | writes: insert into transformation_access_audit_log | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `audit_role_permission_change()` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | TRIGGER: role_permissions.audit_role_permission_changes | trigger (NEW/OLD rows), auth.uid() | writes: insert into permission_audit_log | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `auth_get_user_role()` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_has_school_access(p_school_id bigint)` | yes | NO | 1 | 1 | 1 | 1 | none | public.generations:generations_school_members_view | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_has_school_access_uuid(p_school_id bigint)` | yes | NO | 1 | 1 | 1 | 1 | none | 7 policies: public.generations:generations_insert_policy, public.generations:generations_select_policy, public.generations:generations_update_policy, … | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_admin()` | yes | NO | 1 | 1 | 1 | 1 | none | 63 policies: public.assessment_actions:admin_full_access_assessment_actions, public.assessment_areas:admin_full_access_assessment_areas, public.assessment_assignments:admin_manage_assignments, … | auth_has_school_access auth_has_school_access_uuid auth_is_course_teacher batch_assign_learning_path create_full_learning_path end_learning_path_session enforce_school_tenant_control_authority start_learning_path_session update_full_learning_path | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_assessment_admin()` | yes | NO | 1 | 1 | 1 | 1 | none | 31 policies: public.assessment_context_questions:assessment_context_questions_write, public.assessment_indicators:assessment_indicators_delete, public.assessment_indicators:assessment_indicators_insert, … | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_assigned_group_member(p_group_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 1 | none | public.growth_community_transformation_access:growth_community_transformation_access_staff_or_member_read, public.learning_path_assignments:learning_path_assignments_select_policy | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_course_student(p_course_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | 5 policies: public.assignment_instances:assignment_instances_student_view, public.blocks:blocks_student_view, public.lesson_assignments:lesson_assignments_student_view, … | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_course_teacher(p_course_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | 10 policies: public.assignment_feedback:assignment_feedback_teacher_course, public.assignment_instances:assignment_instances_teacher_manage, public.blocks:blocks_teacher_manage, … | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_learning_path_assignee(p_path_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 1 | pages/api/learning-paths/session/start.ts:45 [session-api] | 4 policies: public.learning_path_courses:learning_path_courses_assignee_read, public.learning_path_progress_sessions:Users can insert own progress sessions, public.learning_path_progress_sessions:Users can update own progress sessions, … | start_learning_path_session | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_learning_path_member(p_course_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 1 | none | public.courses:courses_learning_path_member_view, public.lessons:lessons_learning_path_member_view, public.modules:modules_learning_path_member_view | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_school_directivo(p_school_id integer)` | yes | NO | 1 | 1 | 1 | 1 | none | 10 policies: public.assessment_instances:assessment_instances_select, public.school_course_docente_assignments:school_course_docente_assignments_insert, public.school_course_docente_assignments:school_course_docente_assignments_select, … | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_is_superadmin(check_user_id uuid)` | yes | search_path=public | 1 | 1 | 1 | 1 | pages/api/admin/auth/is-superadmin.ts:40 [service]; pages/api/admin/roles/permissions.ts:112 [service]; pages/api/admin/roles/permissions/overlay-backup.ts:66 [service]; pages/api/admin/roles/permissions/update.ts:45 [service]; pages/api/admin/test-runs/cleanup.ts:58 [service] | none | none | caller-supplied: check_user_id uuid | read-only | **DECISION_DEPENDENT** | PUBLIC/anon; superadmin-membership oracle for any id; callers are service-role admin routes passing the session user id |
| `auth_is_teacher()` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `auth_user_community_ids()` | yes | search_path=public | 1 | 1 | 1 | 1 | none | public.user_roles:user_roles_community_member_view | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `award_course_completion_badge(p_user_id uuid, p_course_id uuid, p_course_name text)` | yes | NO | 1 | 1 | 1 | 1 | lib/services/badgeAndPost.ts:16 [service]; lib/services/badgeService.ts:50 [browser]; pages/api/badges/award-and-announce.ts:79 [service] | none | none | caller-supplied: p_user_id uuid | writes: insert into user_badges | **CONFIRMED_DEFECT** | DEFINER + PUBLIC/anon; INSERT user_badges for any p_user_id; callers service-role (pages/api/badges/award-and-announce.ts:79, lib/services/badgeAndPost.ts:16) and browser (lib/services/badgeService.ts:50) -> anon can award badges to any user |
| `batch_assign_courses(p_course_id uuid, p_user_ids uuid[])` | yes | search_path=public | 1 | 1 | 1 | 1 | pages/api/courses/batch-assign.ts:79 [session-api] | none | none | caller-supplied: p_user_ids uuid (+auth.uid()) | writes: insert into course_assignments; insert into course_enrollments | **JUSTIFIED_EXPOSURE** | body requires auth.uid() with an active admin/consultor role before any write (raises otherwise); p_user_ids are targets, not the actor; PUBLIC/anon grant is inert but should still be revoked for hygiene |
| `batch_assign_learning_path(p_path_id uuid, p_user_ids uuid[], p_group_ids uuid[], p_assigned_by uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 0 | lib/services/learningPathsService.ts:313 [session-api] | none | none | caller-supplied: p_user_ids uuid (+auth.uid()) | writes: insert into public.course_enrollments; insert into public.learning_path_assignments | **JUSTIFIED_EXPOSURE** | authenticated only; v_actor := auth.uid(), p_assigned_by must equal actor, auth_is_admin() required (42501 otherwise) |
| `batch_unassign_courses(p_course_id uuid, p_user_ids uuid[])` | yes | search_path=public | 1 | 1 | 1 | 1 | pages/api/courses/unassign.ts:83 [session-api] | none | none | caller-supplied: p_user_ids uuid (+auth.uid()) | writes: delete from course_assignments | **JUSTIFIED_EXPOSURE** | same guard as batch_assign_courses (auth.uid() admin/consultor or raise); anon/PUBLIC grant inert |
| `bot_save_expense_item(p_user_id uuid, p_report_id uuid, p_report_name text, p_start date, p_end date, p_category_id uuid, p_description text, p_amount numeric, p_currency text, p_original_amount numeric, p_conversion_rate numeric, p_conversion_date date, p_expense_date date, p_vendor text, p_expense_number text, p_receipt_url text, p_receipt_filename text, p_notes text, p_report_description text)` | yes | search_path=public | 0 | 0 | 0 | 1 | lib/bots/expense-service.ts:289 [injected (bot, service)] | none | none | caller-supplied: p_user_id uuid | writes: insert into expense_items; insert into expense_reports; update expense_reports set | **JUSTIFIED_EXPOSURE** | service_role only; caller lib/bots/expense-service.ts (bot context) |
| `calculate_group_totals()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: pasantias_quote_groups.calculate_group_totals_trigger | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `calculate_quiz_score(submission_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; scores of any submission id (low impact); no caller |
| `calculate_quote_totals()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `calculate_quote_totals_with_discount()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: pasantias_quotes.calculate_pasantias_quote_totals_with_discount | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `calculate_quote_totals_with_groups()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `calculate_quote_totals_with_groups_and_discount()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: pasantias_quotes.calculate_quote_totals_with_groups_and_discount_trigger | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `calculate_viaticos_totals()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: pasantias_quotes.calculate_viaticos_totals_trigger | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `can_access_workspace(p_user_id uuid, p_workspace_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | lib/services/feedService.ts:134 [browser]; utils/workspaceUtils.ts:421 [browser] | public.community_posts:Users can create posts in their communities, public.community_posts:Users can view posts from their communities | none | caller-supplied: p_user_id uuid | read-only | **DECISION_DEPENDENT** | PUBLIC/anon; community_posts policies pass auth.uid() (justified); browser callers pass user.id; answers for any id (membership oracle) |
| `can_edit_meeting(check_user_id uuid, check_meeting_id uuid)` | yes | search_path=public | 1 | 0 | 1 | 1 | none | 5 policies: public.community_meetings:Meeting editors can update meetings, public.meeting_agreements:Meeting editors can update agreements, public.meeting_attendees:Meeting editors can update attendees, … | none | caller-supplied: check_user_id uuid | read-only | **DECISION_DEPENDENT** | anon; 10 meeting policies pass auth.uid(); reveals editor status for any id |
| `cascade_lesson_submission_updates()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: lesson_assignment_submissions.trigger_cascade_lesson_submission_updates | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `check_community_organization()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: growth_communities.check_community_organization_trigger | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `check_duplicate_notification(p_user_id uuid, p_title character varying, p_description text, p_time_window_seconds integer)` | no | NO | 1 | 1 | 1 | 1 | none | none | create_notification_safe | caller-supplied: p_user_id uuid | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `claim_invitation_resend(p_target_user_id uuid, p_actor_user_id uuid, p_cooldown_seconds integer, p_metadata jsonb)` | yes | search_path=public, pg_catalog | 0 | 0 | 0 | 1 | none | none | none | caller-supplied: p_target_user_id uuid,p_actor_user_id uuid | writes: insert into public.security_audit_events | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `claim_password_recovery_outbox(p_worker_token uuid, p_limit integer, p_lease_seconds integer, p_candidate_fingerprint text)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-request-queue.ts:243 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `claim_recovery_attempt_grant(p_grant_hash text, p_lease_token uuid, p_lease_seconds integer)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-grant.ts:165 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `cleanup_expired_dev_sessions()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `cleanup_expired_test_runs()` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | none | neither | writes: delete from role_permissions | **CONFIRMED_DEFECT** | DEFINER + anon; DELETE role_permissions test rows + UPDATE test_mode_state; maintenance action with no caller |
| `cleanup_orphaned_communities()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | neither | writes: delete from growth_communities | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `contratos_set_representante_snapshot()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: contratos.contratos_set_representante_snapshot_trg | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `create_activity(p_workspace_id uuid, p_activity_type activity_type, p_entity_type entity_type, p_user_id uuid, p_entity_id uuid, p_title text, p_description text, p_metadata jsonb, p_importance_score integer, p_tags text[], p_related_users uuid[])` | yes | NO | 1 | 1 | 1 | 1 | utils/activityUtils.ts:216 [browser] | none | none | caller-supplied: p_user_id uuid,p_related_users uuid (+auth.uid()) | writes: insert into activity_feed | **CONFIRMED_DEFECT** | DEFINER + PUBLIC/anon; INSERT activity_feed with COALESCE(p_user_id, auth.uid()) -> spoofable actor; browser caller utils/activityUtils.ts:216 |
| `create_assignment_template_from_block(p_lesson_id uuid, p_block_id uuid, p_block_data jsonb, p_created_by uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | writes: insert into assignment_templates | **CONFIRMED_DEFECT** | DEFINER + anon; INSERT assignment_templates with caller-supplied created_by; no repo caller |
| `create_document_version(document_uuid uuid, new_storage_path text, new_file_size bigint, new_mime_type character varying, user_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: document_uuid uuid,user_uuid uuid | writes: insert into document_versions | **CONFIRMED_DEFECT** | DEFINER + anon; INSERT document_versions + UPDATE community_documents, uploaded_by caller-supplied; no repo caller |
| `create_full_learning_path(p_name text, p_description text, p_course_ids uuid[], p_created_by uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 0 | lib/services/learningPathsService.ts:69 [session-api] | none | none | auth.uid() | writes: insert into public.learning_path_courses; insert into public.learning_paths | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_entity_type character varying, p_entity_id uuid, p_metadata jsonb)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | writes: insert into notifications | **CONFIRMED_DEFECT** | DEFINER + anon; INSERT notifications for any p_user_id; no repo caller |
| `create_notification_safe(p_user_id uuid, p_title character varying, p_description text, p_category character varying, p_related_url character varying, p_importance character varying, p_notification_type_id character varying, p_idempotency_key character varying)` | no | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | writes: insert into public.user_notifications | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `create_recovery_attempt_grant(p_grant_hash text, p_expires_at timestamp with time zone, p_max_attempts integer)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-grant.ts:95 [injected (service-role auth routes)]; scripts/ci/recovery-concurrency-proof.mjs:194 [SQL, seed/CI (service key)] | none | none | neither | writes: insert into auth_security.recovery_attempt_grants | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `create_sample_notifications_for_user(p_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; inserts 8 fabricated notifications for any user id; no caller |
| `create_user_notification(p_user_id uuid, p_notification_type_id character varying, p_title character varying, p_description text, p_related_url character varying)` | yes | NO | 1 | 1 | 1 | 1 | none | none | create_sample_notifications_for_user | caller-supplied: p_user_id uuid | writes: insert into user_notifications | **CONFIRMED_DEFECT** | DEFINER + anon; INSERT user_notifications for any p_user_id; no rpc caller (only create_sample_notifications_for_user) |
| `current_password_change_state()` | yes | search_path=public, pg_catalog | 0 | 0 | 1 | 1 | none | none | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | auth.uid() only; reports the caller's own flag |
| `end_dev_impersonation(p_dev_user_id uuid, p_ip_address inet, p_user_agent text)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_dev_user_id uuid | writes: insert into dev_audit_log | **CONFIRMED_DEFECT** | DEFINER + anon; UPDATE dev_role_sessions + INSERT dev_audit_log for any p_dev_user_id; no caller |
| `end_learning_path_session(p_session_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 0 | pages/api/learning-paths/session/end.ts:49 [session-api] | none | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `enforce_operator_ledger_guard()` | no | search_path="" | 1 | 1 | 1 | 1 | none | none | TRIGGER: contract_hours_ledger.trg_enforce_operator_ledger_guard | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `enforce_operator_session_tenant_guard()` | no | search_path="" | 1 | 1 | 1 | 1 | none | none | TRIGGER: consultor_sessions.trg_enforce_operator_session_tenant_guard | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `enforce_school_tenant_control_authority()` | no | search_path="" | 1 | 1 | 1 | 1 | none | none | TRIGGER: schools.trg_enforce_school_tenant_control_authority | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `enqueue_password_recovery(p_candidate_fingerprint text, p_ip_hash text, p_request_envelope text, p_cooldown_seconds integer, p_ip_limit integer, p_ip_window_seconds integer)` | yes | search_path=public, auth_security, extensions, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-request-queue.ts:81 [injected (service-role auth routes)]; scripts/ci/recovery-concurrency-proof.mjs:56 [SQL, seed/CI (service key)] | none | none | neither | writes: insert into auth_security.password_recovery_ip_buckets; insert into auth_security.password_recovery_outbox | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `exec_sql(sql_query text)` | yes | search_path=public | 0 | 0 | 0 | 0 | none | none | none | request.jwt.claims | EXECUTE arbitrary SQL | **JUSTIFIED_EXPOSURE** | EXECUTE held by postgres only (no app role); dynamic SQL as DEFINER — zero exposure today, recommend DROP |
| `extract_mentions(p_content text)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | pure regexp helper, no table access |
| `feedback_status_change_trigger()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: platform_feedback.feedback_status_change | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `finish_password_recovery_outbox(p_job_id uuid, p_worker_token uuid, p_state text, p_provider_message_id text, p_retry_delay_seconds integer)` | yes | search_path=public, auth_security, extensions, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-request-queue.ts:135 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `finish_recovery_attempt_grant(p_grant_hash text, p_lease_token uuid, p_succeeded boolean)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-grant.ts:212 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `fn_is_events_manager(p_user_id uuid)` | yes | search_path=public | 1 | 1 | 1 | 1 | none | 4 policies: public.events:Managers can delete events, public.events:Managers can modify events, public.events:Managers can read all events, … | none | caller-supplied: p_user_id uuid | read-only | **DECISION_DEPENDENT** | PUBLIC/anon; 5 events policies pass auth.uid(); admin/community_manager/superadmin oracle for any id |
| `gate_password_change()` | yes | search_path=public, pg_catalog | 1 | 0 | 1 | 1 | none | none | password_change_gate_ok | request.jwt.claims | read-only | **JUSTIFIED_EXPOSURE** | request-layer hook reading request.jwt.claims; no parameters, returns void |
| `generate_notification_idempotency_key(p_event_type character varying, p_event_id character varying, p_user_id uuid, p_timestamp timestamp without time zone)` | no | NO | 1 | 1 | 1 | 1 | none | none | create_notification_safe | caller-supplied: p_user_id uuid | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_active_dev_impersonation(user_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | get_effective_user_role | caller-supplied: user_uuid uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; returns session_token/expiry of any user's active impersonation; no rpc caller (used by get_effective_user_role) |
| `get_active_triggers(p_event_type text)` | no | NO | 1 | 1 | 1 | 1 | lib/notificationService.ts:314 [service] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_activity_stats(p_workspace_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; activity_feed aggregates for any workspace (ALL workspaces when NULL), no membership check; no caller |
| `get_all_auth_users()` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; SELECT auth.users (email, last_sign_in_at, confirmation) + profiles for every account; no caller |
| `get_available_assignment_templates(p_course_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 1 | none | none | none | neither | read-only | **DECISION_DEPENDENT** | authenticated only; lists templates of any course with no enrollment check (course content, not PII); no caller; open item (order_index) in review request |
| `get_baseline_permissions(p_role_type text)` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **DECISION_DEPENDENT** | anon; role_permission_baseline config rows; no caller |
| `get_bucket_summary(p_contrato_id uuid)` | no | search_path=public | 1 | 1 | 1 | 1 | lib/services/hour-tracking.ts:244 [injected]; lib/services/school-hours-report.ts:183 [service]; pages/admin/sessions/create.tsx:337 [browser]; pages/api/contracts/[id]/hours/index.ts:102 [service]; pages/api/contracts/[id]/hours/reallocate.ts:132 [service] | none | reschedule_session_hours | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_consultant_earnings(p_consultant_id uuid, p_from date, p_to date)` | no | NO | 1 | 1 | 1 | 1 | pages/api/consultant-earnings/[consultant_id]/pdf.ts:116 [service] | none | none | caller-supplied: p_consultant_id uuid | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_document_statistics(workspace_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | utils/documentUtils.ts:161 [browser] | none | none | caller-supplied: workspace_uuid uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; per-workspace document stats incl. top uploaders, no membership check; browser caller utils/documentUtils.ts:161 |
| `get_effective_permissions(p_role_type text, p_test_run_id uuid)` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **DECISION_DEPENDENT** | anon; baseline + test-overlay permission config; no caller |
| `get_effective_user_role(user_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: user_uuid uuid | read-only | **DECISION_DEPENDENT** | anon; effective role for any id incl. dev-impersonation override; no caller |
| `get_emotion_recommendations(p_user_id uuid)` | no | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_folder_breadcrumb(folder_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | utils/documentUtils.ts:199 [browser] | none | none | caller-supplied: folder_uuid uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; folder names for any folder id (low impact); browser caller utils/documentUtils.ts:199 |
| `get_meeting_stats(p_workspace_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | utils/meetingUtils.ts:515 [browser] | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; meeting/task/commitment counts of any workspace, no membership check; browser caller utils/meetingUtils.ts:515 |
| `get_or_create_community_for_leader(p_leader_id uuid, p_school_id uuid, p_generation_id uuid)` | no | NO | 1 | 1 | 1 | 1 | utils/roleUtils.ts:725 [browser] | none | none | neither | writes: insert into growth_communities | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_or_create_community_workspace(p_community_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | writes: insert into community_workspaces | **CONFIRMED_DEFECT** | DEFINER + anon; INSERT community_workspaces for any community id; no caller |
| `get_overdue_items(p_workspace_id uuid, p_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | utils/meetingUtils.ts:491 [browser] | none | none | caller-supplied: p_user_id uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; overdue commitments/tasks (assigned_to, titles, meeting titles) for any workspace or any p_user_id; browser caller utils/meetingUtils.ts:491 |
| `get_recent_document_activity(workspace_uuid uuid, limit_count integer)` | yes | NO | 1 | 1 | 1 | 1 | utils/documentUtils.ts:181 [browser] | none | none | caller-supplied: workspace_uuid uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; document_access_log rows (user_id, document titles) for any workspace; browser caller utils/documentUtils.ts:181 |
| `get_related_bugs(target_bug_id uuid, result_limit integer)` | no | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_reportable_users(requesting_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: requesting_user_id uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; trusts requesting_user_id: pass any admin id and receive every user's email/name/school; no caller |
| `get_reportable_users_enhanced(requesting_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: requesting_user_id uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; same pattern (consultant_assignments + profiles PII keyed on caller-supplied requesting_user_id); no caller |
| `get_school_user_counts()` | yes | NO | 1 | 1 | 1 | 1 | pages/admin/schools.tsx:219 [browser] | none | none | neither | read-only | **DECISION_DEPENDENT** | anon; aggregate user count per school (non-PII); browser caller pages/admin/schools.tsx:219 (admin page) |
| `get_thread_statistics(p_thread_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; message count/participants of any thread; no caller |
| `get_unread_notification_count(p_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; per-user unread count for any id (low impact); no caller |
| `get_user_admin_status(user_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: user_uuid uuid | read-only | **DECISION_DEPENDENT** | anon; admin oracle for any id; no caller, no policy |
| `get_user_badges(p_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; any user's badge/course-completion history; no caller |
| `get_user_messaging_permissions(p_user_id uuid, p_workspace_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | read-only | **DECISION_DEPENDENT** | anon; role-derived permission JSON for any id; no caller |
| `get_user_workspace_role(p_user_id uuid, p_workspace_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | 12 policies: public.community_documents:Users can delete their own documents or leaders can delete any, public.community_documents:Users can update their own documents or leaders can update any, public.community_documents:Users can upload documents to accessible workspaces, … | none | caller-supplied: p_user_id uuid | read-only | **DECISION_DEPENDENT** | anon; role of any user in any workspace; no caller |
| `get_users_needing_metadata_sync()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `get_workspace_messaging_stats(p_workspace_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; thread/message aggregates of any workspace; no caller |
| `grade_quiz_feedback(p_submission_id uuid, p_graded_by uuid, p_review_status text, p_general_feedback text, p_question_feedback jsonb)` | no | NO | 1 | 1 | 1 | 1 | lib/services/quizSubmissions.js:279 [browser (via QuizTaker/LearningQuizTaker useSupabaseClient)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `grade_quiz_open_responses(p_submission_id uuid, p_graded_by uuid, p_grading_data jsonb)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; UPDATE quiz_submissions score/graded_by (caller-supplied) for any submission; no caller (app uses INVOKER grade_quiz_feedback) |
| `handle_new_user()` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | none | trigger (NEW/OLD rows) | writes: insert into public.profiles | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `has_feedback_permission(check_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | components/feedback/FeedbackButtonWithPermissions.tsx:32 [browser] | none | none | caller-supplied: check_user_id uuid | read-only | **DECISION_DEPENDENT** | PUBLIC/anon; browser caller passes user.id (components/feedback/FeedbackButtonWithPermissions.tsx:32); oracle for any id |
| `has_global_workspace_access(check_user_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 1 | none | public.community_meetings:Community members can create meetings, public.community_meetings:Community members can delete meetings, public.community_meetings:Community members can view meetings | none | caller-supplied: check_user_id uuid | read-only | **DECISION_DEPENDENT** | authenticated only; 3 community_meetings policies pass auth.uid(); admin/consultor oracle for any id — body redesign deferred (D-RLS-02) |
| `has_transformation_access(community_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 1 | none | 7 policies: public.transformation_assessments:members_insert_transformation_assessments, public.transformation_assessments:members_update_transformation_assessments, public.transformation_conversation_messages:members_delete_transformation_conversation_messages, … | none | neither | read-only | **JUSTIFIED_EXPOSURE** | authenticated only; policy predicate keyed on community_id (not a user id); no cross-user data |
| `increment_document_counter(document_uuid uuid, counter_type text, user_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | utils/documentUtils.ts:419 [browser] | none | none | caller-supplied: document_uuid uuid,user_uuid uuid | writes: insert into document_access_log | **CONFIRMED_DEFECT** | DEFINER + anon; UPDATE view/download counters + INSERT document_access_log with caller-supplied user_uuid; browser caller utils/documentUtils.ts:419 |
| `increment_path_assignment_time(p_user_id uuid, p_path_id uuid, p_minutes integer)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 0 | pages/api/learning-paths/session/end.ts:61 [session-api] | none | none | caller-supplied: p_user_id uuid (+auth.uid()) | read-only | **JUSTIFIED_EXPOSURE** | authenticated only; rejects p_user_id <> auth.uid() with 42501; UPDATE scoped to the actor's own row |
| `increment_post_view_count(post_id uuid)` | no | NO | 1 | 1 | 1 | 1 | lib/services/feedService.ts:486 [browser] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `interrupt_recovery_attempt_grant(p_grant_hash text, p_lease_token uuid)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-grant.ts:242 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `invalidate_recovery_attempt_grant(p_grant_hash text)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-grant.ts:328 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `is_admin()` | yes | NO | 1 | 1 | 1 | 1 | none | 67 policies: public.assessment_actions:admin_full_access_assessment_actions, public.assessment_areas:admin_full_access_assessment_areas, public.assessment_assignments:admin_manage_assignments, … | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `is_admin_or_consultor(p_uid uuid)` | yes | search_path=public | 1 | 0 | 1 | 1 | none | 12 policies: public.clientes:admin_or_consultor_can_read_clientes, public.contratos:admin_or_consultor_can_read_contratos, public.courses:enrolled_or_owner_can_read_courses, … | none | caller-supplied: p_uid uuid | read-only | **DECISION_DEPENDENT** | anon; 10 policies pass auth.uid(); staff-role oracle for any id |
| `is_assessment_collaborator(assessment_uuid uuid, uid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | 4 policies: public.transformation_assessment_collaborators:collaborators_insert, public.transformation_assessment_collaborators:collaborators_select, public.transformation_assessments:transformation_assessments_select, … | none | caller-supplied: assessment_uuid uuid,uid uuid | read-only | **DECISION_DEPENDENT** | anon; policy passes auth.uid(); collaborator oracle for any (assessment,user) |
| `is_community_member(check_user_id uuid, check_community_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: check_user_id uuid | read-only | **DECISION_DEPENDENT** | anon; no policy, no caller; membership oracle |
| `is_dev_user(user_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | public.dev_audit_log:Devs view own audit log, public.dev_role_sessions:Devs manage own sessions | get_effective_user_role start_dev_impersonation | caller-supplied: user_uuid uuid | read-only | **DECISION_DEPENDENT** | anon; dev policies pass auth.uid(); dev-flag oracle for any id |
| `is_global_admin(user_uuid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | 13 policies: public.consultant_assignments:Global admins manage consultant assignments, public.course_enrollments:Global admins manage all enrollments, public.dev_audit_log:Admins view all audit logs, … | none | caller-supplied: user_uuid uuid | read-only | **DECISION_DEPENDENT** | anon; 19 policies pass auth.uid(); admin oracle for any id |
| `is_zoom_surface_facilitator(p_surface_type text, p_surface_id uuid)` | yes | search_path="" | 0 | 0 | 1 | 1 | none | public.zoom_attendance:zoom_attendance_facilitator_select | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `log_document_access()` | yes | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: community_documents.log_community_documents_access | trigger (NEW/OLD rows), auth.uid() | writes: insert into document_access_log | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `log_initial_assignment()` | yes | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: growth_community_transformation_access.trigger_log_initial_assignment | trigger (NEW/OLD rows) | writes: insert into transformation_access_audit_log | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `log_metadata_sync_needed()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | trigger (NEW/OLD rows) | writes: insert into metadata_sync_log | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `log_notification_event(p_event_type text, p_event_data jsonb, p_trigger_id uuid, p_notifications_count integer, p_status text)` | no | NO | 1 | 1 | 1 | 1 | lib/notificationService.ts:1169 [service] | none | none | neither | writes: insert into notification_events | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `mark_all_notifications_read(p_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; UPDATE user_notifications for any p_user_id; no caller |
| `mark_notification_read(notification_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | UPDATE notifications WHERE user_id = auth.uid(); anon gets zero rows |
| `mark_notification_read(p_notification_id uuid, p_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_user_id uuid (+auth.uid()) | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; UPDATE user_notifications WHERE user_id = caller-supplied p_user_id; no caller (the 1-arg overload uses auth.uid()) |
| `mark_recovery_attempt_grant_succeeded(p_grant_hash text)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-grant.ts:153 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `migrate_assignments_to_enrollments()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | neither | writes: insert into course_enrollments | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `password_change_gate_ok()` | yes | search_path=public, pg_catalog | 1 | 0 | 1 | 1 | none | 254 policies: public.ab_grades:forced_password_change_guard, public.ab_migration_plan:forced_password_change_guard, public.activity_aggregations:forced_password_change_guard, … | apply_forced_password_change_guard | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | auth.uid() only; predicate of 254 forced_password_change_guard policies TO authenticated; anon/NULL uid returns true but no anon policy uses it |
| `peek_recovery_attempt_grant(p_grant_hash text)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-grant.ts:288 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `prepare_password_recovery_outbox(p_job_id uuid, p_worker_token uuid, p_message_envelope text)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-request-queue.ts:331 [injected (service-role auth routes)] | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `prevent_rubric_deletion_with_results()` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | TRIGGER: transformation_rubric.protect_transformation_rubric_deletion | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `protect_must_change_password()` | no | search_path=public, pg_catalog | 1 | 1 | 1 | 1 | none | none | TRIGGER: profiles.protect_must_change_password | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `recompute_expense_report_total(p_report_id uuid)` | no | NO | 1 | 1 | 1 | 1 | components/expenses/ExpenseReportForm.tsx:404 [browser]; components/expenses/ExpenseReportForm.tsx:458 [browser] | none | none | neither | writes: update expense_reports set | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `record_password_recovery_delivery(p_provider_message_id text, p_outcome text)` | yes | search_path=public, auth_security, extensions, pg_catalog | 0 | 0 | 0 | 1 | pages/api/webhooks/resend.ts:117 [service] | none | none | neither | writes: insert into auth_security.password_recovery_delivery_events | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `refresh_user_roles_cache()` | yes | NO | 1 | 1 | 1 | 1 | pages/api/admin/assign-role.ts:629 [service]; pages/api/admin/bulk-create-users.ts:432 [service]; pages/api/admin/delete-user.ts:116 [service]; pages/api/admin/growth-communities/[id]/leaders.ts:112 [service]; pages/api/admin/networks/supervisors.ts:216 [service]; pages/api/admin/networks/supervisors.ts:340 [service]; pages/api/admin/remove-role.ts:145 [service]; pages/api/admin/tractor-signups/grant.ts:174 [service] | none | none | neither | REFRESH MATERIALIZED VIEW user_roles_cache | **CONFIRMED_DEFECT** | DEFINER + anon; REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache — anon-triggerable load; all 8 callers are service-role admin routes -> grant service_role only |
| `reschedule_session_hours(p_session_id uuid, p_actor_id uuid)` | yes | search_path="" | 0 | 0 | 0 | 1 | none | none | apply_session_reschedule | caller-supplied: p_actor_id uuid | writes: insert into public.session_activity_log | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `resolve_password_recovery_outbox(p_job_id uuid, p_worker_token uuid, p_email text)` | yes | search_path=public, auth_security, extensions, pg_catalog | 0 | 0 | 0 | 1 | lib/auth/recovery-request-queue.ts:171 [injected (service-role auth routes)] | none | none | neither | writes: insert into public.security_audit_events | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `run_auth_security_retention(p_limit integer, p_audit_retention_days integer)` | yes | search_path=public, auth_security, pg_catalog | 0 | 0 | 0 | 1 | pages/api/cron/auth-retention.ts:34 [cron/service] | none | none | neither | writes: delete from auth_security.password_recovery_delivery_events; delete from auth_security.password_recovery_ip_buckets; delete from auth_security.password_recovery_outbox; delete from auth_security.recovery_attempt_grants; delete from public.security_audit_events | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `search_bugs_by_similarity(search_query text, similarity_threshold double precision, result_limit integer)` | no | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `session_hour_overrides_immutable()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: session_hour_overrides.session_hour_overrides_no_update_delete | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `set_enrollment_total_lessons()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: course_enrollments.trigger_set_enrollment_total_lessons | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `set_expense_report_access_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: expense_report_access.trg_expense_report_access_set_updated | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `set_password_change_required(p_user_id uuid, p_required boolean)` | yes | search_path=public, pg_catalog | 0 | 0 | 0 | 1 | none | none | protect_must_change_password | caller-supplied: p_user_id uuid | read-only | **JUSTIFIED_EXPOSURE** | service_role-only surface (no anon/PUBLIC/authenticated EXECUTE); caller is server-side code with the service key |
| `set_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: pasantias_leads.trg_pasantias_leads_updated_at, consultor_sessions.trg_consultor_sessions_updated_at, licitacion_ates.trg_licitacion_ates_updated_at, licitaciones.trg_licitaciones_updated_at, program_enrollments.trg_program_enrollments_updated_at, programa_bases_templates.trg_programa_bases_templates_updated_at, session_communications.trg_session_communications_updated_at, session_reports.trg_session_reports_updated_at, tractor_signups.trg_tractor_signups_updated_at, email_campaigns.trg_email_campaigns_updated_at, email_contacts.trg_email_contacts_updated_at, assessment_entity_year_weights.trigger_entity_year_weights_updated_at | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `start_dev_impersonation(p_dev_user_id uuid, p_impersonated_role user_role_type, p_impersonated_user_id uuid, p_school_id integer, p_generation_id uuid, p_community_id uuid, p_ip_address inet, p_user_agent text)` | yes | NO | 1 | 1 | 1 | 1 | none | none | none | caller-supplied: p_dev_user_id uuid,p_impersonated_user_id uuid | writes: insert into dev_audit_log; insert into dev_role_sessions | **CONFIRMED_DEFECT** | DEFINER + anon; validates is_dev_user(p_dev_user_id) but never the caller; INSERTs dev_role_sessions and RETURNS session_token -> anon can mint an impersonation session for any dev user; no repo caller |
| `start_learning_path_session(p_user_id uuid, p_path_id uuid, p_course_id uuid, p_activity_type character varying)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 0 | pages/api/learning-paths/session/start.ts:68 [session-api] | none | none | caller-supplied: p_user_id uuid (+auth.uid()) | writes: insert into public.learning_path_progress_sessions | **JUSTIFIED_EXPOSURE** | authenticated only; rejects p_user_id <> auth.uid() with 42501 and requires admin or assignee |
| `submit_quiz(p_lesson_id uuid, p_block_id text, p_student_id uuid, p_course_id uuid, p_answers jsonb, p_quiz_data jsonb, p_time_spent integer)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 1 | lib/services/quizSubmissions.js:75 [browser (via QuizTaker/LearningQuizTaker useSupabaseClient)]; scripts/seed-qa-phase2-retest.js:274 [seed/CI (service key)]; scripts/seed-qa-phase2.js:772 [seed/CI (service key)] | none | none | caller-supplied: p_student_id uuid | writes: insert into quiz_submissions | **CONFIRMED_DEFECT** | authenticated-only after 20260907120200, but INSERT quiz_submissions.student_id = caller-supplied p_student_id with no auth.uid() comparison; browser callers pass user.id -> any authenticated user can submit as another (D-RLS-02) |
| `supervisor_can_access_user(supervisor_user_id uuid, target_user_id uuid)` | yes | NO | 1 | 1 | 1 | 1 | pages/api/reports/user-details.ts:12 [service]; utils/roleUtils.ts:1298 [browser] | none | none | caller-supplied: supervisor_user_id uuid,target_user_id uuid | read-only | **DECISION_DEPENDENT** | PUBLIC/anon; service-role caller pages/api/reports/user-details.ts:12 (correct args); utils/roleUtils.ts:1298 passes `supervisor_id` (wrong param name -> PostgREST 404, dead path); network-scope oracle for any pair |
| `sync_legacy_transformation_flag()` | yes | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: growth_community_transformation_access.trigger_sync_legacy_flag_insert, growth_community_transformation_access.trigger_sync_legacy_flag_update | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `sync_session_attendees_on_gc_change()` | yes | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: user_roles.trg_sync_session_attendees_on_gc_change | trigger (NEW/OLD rows) | writes: insert into session_attendees; update session_notifications set | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `transition_school_to_no_generations(p_school_id uuid)` | no | NO | 1 | 1 | 1 | 1 | none | none | none | neither | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `trigger_refresh_user_roles_cache()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: profiles.profiles_changed_refresh_cache | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `trigger_update_meditation_streak()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: church_meditation_sessions.update_streak_on_meditation | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_assessment_objectives_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: assessment_objectives.trigger_assessment_objectives_updated_at | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_assignment_on_test_completion()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: qa_test_runs.trg_update_assignment_on_completion | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_church_updated_at_column()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: church_team_members.update_church_team_members_updated_at, church_sermons.update_church_sermons_updated_at, church_songs.update_church_songs_updated_at, church_transactions.update_church_transactions_updated_at, church_services.update_church_services_updated_at, church_about_sections.update_church_about_sections_updated_at, church_accounts.update_church_accounts_updated_at, church_contact_info.update_church_contact_info_updated_at, church_events.update_church_events_updated_at, church_hero_sections.update_church_hero_sections_updated_at, church_organizations.update_church_organizations_updated_at, church_presentation_templates.update_church_presentation_templates_updated_at, church_profiles.update_church_profiles_updated_at, church_schedules.update_church_schedules_updated_at, church_website_settings.update_church_website_settings_updated_at | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_community_workspace_timestamp()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: community_workspaces.update_community_workspace_timestamp | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_course_enrollment_progress()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: lesson_progress.trigger_update_enrollment_progress | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_course_proposals_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: course_proposals.update_course_proposals_timestamp | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_document_timestamp()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: community_documents.update_community_documents_timestamp | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_folder_timestamp()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: document_folders.update_document_folders_timestamp | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_full_learning_path(p_path_id uuid, p_name text, p_description text, p_course_ids uuid[], p_updated_by uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 0 | lib/services/learningPathsService.ts:256 [session-api] | none | none | auth.uid() | writes: delete from public.learning_path_courses; insert into public.learning_path_courses | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `update_generations_updated_at()` | yes | search_path=public | 1 | 1 | 1 | 1 | none | none | TRIGGER: generations.generations_updated_at_trigger | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_lesson_submission_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: lesson_assignment_submissions.trigger_update_lesson_submission_timestamp | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_meditation_streak(p_user_id uuid)` | no | NO | 1 | 1 | 1 | 1 | none | none | trigger_update_meditation_streak | caller-supplied: p_user_id uuid | writes: insert into church_meditation_streaks | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `update_overdue_status()` | yes | NO | 1 | 1 | 1 | 1 | utils/meetingUtils.ts:655 [browser] | none | none | neither | read-only | **CONFIRMED_DEFECT** | DEFINER + anon; global UPDATE of meeting_commitments/meeting_tasks status; browser caller utils/meetingUtils.ts:655 -> belongs to cron/service_role |
| `update_pasantias_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: pasantias_quotes.update_pasantias_quotes_updated_at, pasantias_programs.update_pasantias_programs_updated_at | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_qa_scenarios_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: qa_scenarios.qa_scenarios_updated_at | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_quote_on_group_change()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: pasantias_quote_groups.update_quote_on_group_change_trigger | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_school_has_generations()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: generations.update_school_generations_on_update, generations.update_school_generations_on_delete, generations.update_school_generations_on_insert | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_session_heartbeat(p_session_id uuid)` | yes | search_path=public, pg_temp | 0 | 0 | 1 | 0 | pages/api/learning-paths/session/heartbeat.ts:46 [session-api] | none | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | actor taken from auth.uid() only; anon (NULL uid) matches no row / raises; used as policy predicate or by session callers |
| `update_thread_stats()` | no | NO | 1 | 1 | 1 | 1 | none | none | none | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_upcoming_courses_updated_at()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: upcoming_courses.trigger_upcoming_courses_updated_at | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `update_updated_at_column()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: assessment_year_expectations.update_assessment_year_expectations_updated_at, community_posts.update_community_posts_updated_at, assessment_templates.update_assessment_templates_updated_at, assessment_submissions.update_assessment_submissions_updated_at, assessment_sub_questions.update_assessment_sub_questions_updated_at, events.update_events_updated_at, lesson_assignment_submissions.update_lesson_assignment_submissions_updated_at, lesson_assignments.update_lesson_assignments_updated_at, assessment_sections.update_assessment_sections_updated_at, assessment_responses.update_assessment_responses_updated_at, post_comments.update_post_comments_updated_at, assessment_questions.update_assessment_questions_updated_at, redes_de_colegios.update_redes_de_colegios_updated_at, learning_path_progress_sessions.learning_path_progress_sessions_updated_at, assessment_actions.update_assessment_actions_updated_at, assessment_modules.update_assessment_modules_updated_at, school_transversal_context.update_school_transversal_context_updated_at, assessment_instances.update_assessment_instances_updated_at, superadmins.update_superadmins_updated_at, test_mode_state.update_test_mode_state_updated_at, user_notification_preferences.update_user_notification_preferences_updated_at, assignment_submissions.update_assignment_submissions_updated_at, assignment_instances.update_assignment_instances_updated_at, assessment_indicators.update_assessment_indicators_updated_at, assessment_dimensions.update_assessment_dimensions_updated_at, assessment_context_questions.update_assessment_context_questions_updated_at, assessment_assignments.update_assessment_assignments_updated_at, assessment_areas.update_assessment_areas_updated_at, assignment_templates.update_assignment_templates_updated_at | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `user_church_organization_id()` | no | NO | 1 | 1 | 1 | 1 | none | 16 policies: public.church_about_sections:Church organization members can modify about sections, public.church_accounts:Users can only access their church organization's accounts, public.church_contact_info:Church organization members can modify contact info, … | none | auth.uid() | read-only | **JUSTIFIED_EXPOSURE** | SECURITY INVOKER — runs with the caller's own table privileges and RLS; anon holds no table privilege on the touched tables |
| `user_is_in_group(p_group_id uuid, p_user_id uuid)` | yes | search_path=public, pg_catalog | 1 | 1 | 1 | 1 | none | public.group_assignment_discussions:group_assignment_discussions_member_insert, public.group_assignment_members:Users can view group members | none | caller-supplied: p_user_id uuid | read-only | **DECISION_DEPENDENT** | PUBLIC/anon; 2 policies pass auth.uid(); group-membership oracle for any (group,user) |
| `user_school_ids(uid uuid)` | yes | NO | 1 | 1 | 1 | 1 | none | 4 policies: public.transformation_assessment_collaborators:collaborators_select, public.transformation_assessments:transformation_assessments_insert, public.transformation_assessments:transformation_assessments_select, … | none | caller-supplied: uid uuid | read-only | **DECISION_DEPENDENT** | anon; 4 transformation_assessments policies pass auth.uid(); school list of any user |
| `validate_assignment_instance_course()` | no | NO | 1 | 1 | 1 | 1 | none | none | TRIGGER: assignment_instances.validate_assignment_instance_course_trigger | trigger (NEW/OLD rows) | read-only | **JUSTIFIED_EXPOSURE** | returns trigger — direct RPC call fails (`trigger functions can only be called as triggers`); PUBLIC EXECUTE is inert hygiene |
| `cleanup_propuesta_rate_limits()` (extra, outside union) | no | search_path=public, pg_temp | 0 | 0 | 0 | 1 | none (no rpc/SQL caller in repo; table consumers are lib/propuestas-web/access-rate-limit.ts via pages/api/propuestas/web/[slug]/verify.ts and lib/propuestas-web/download-access.ts, both [service]) | none | none | neither | writes: delete from propuesta_rate_limits (rows older than 24h) | **JUSTIFIED_EXPOSURE** | INVOKER, service_role only after 20260907120200; no app caller (maintenance DELETE) |

### Part B disposition counts

- CONFIRMED_DEFECT: 34
- DECISION_DEPENDENT: 22
- JUSTIFIED_EXPOSURE: 120
- UNRESOLVED: 0

### CONFIRMED_DEFECT list

- `add_feedback_activity(p_feedback_id uuid, p_message text, p_user_id uuid, p_is_system boolean)` — DEFINER + PUBLIC/anon; INSERT feedback_activity.created_by = caller-supplied p_user_id, no auth.uid(); only in-DB use is trigger feedback_status_change_trigger -> anon can write feedback activity as any user
- `award_course_completion_badge(p_user_id uuid, p_course_id uuid, p_course_name text)` — DEFINER + PUBLIC/anon; INSERT user_badges for any p_user_id; callers service-role (pages/api/badges/award-and-announce.ts:79, lib/services/badgeAndPost.ts:16) and browser (lib/services/badgeService.ts:50) -> anon can award badges to any user
- `calculate_quiz_score(submission_id uuid)` — DEFINER + anon; scores of any submission id (low impact); no caller
- `cleanup_expired_test_runs()` — DEFINER + anon; DELETE role_permissions test rows + UPDATE test_mode_state; maintenance action with no caller
- `create_activity(p_workspace_id uuid, p_activity_type activity_type, p_entity_type entity_type, p_user_id uuid, p_entity_id uuid, p_title text, p_description text, p_metadata jsonb, p_importance_score integer, p_tags text[], p_related_users uuid[])` — DEFINER + PUBLIC/anon; INSERT activity_feed with COALESCE(p_user_id, auth.uid()) -> spoofable actor; browser caller utils/activityUtils.ts:216
- `create_assignment_template_from_block(p_lesson_id uuid, p_block_id uuid, p_block_data jsonb, p_created_by uuid)` — DEFINER + anon; INSERT assignment_templates with caller-supplied created_by; no repo caller
- `create_document_version(document_uuid uuid, new_storage_path text, new_file_size bigint, new_mime_type character varying, user_uuid uuid)` — DEFINER + anon; INSERT document_versions + UPDATE community_documents, uploaded_by caller-supplied; no repo caller
- `create_notification(p_user_id uuid, p_type character varying, p_title character varying, p_message text, p_entity_type character varying, p_entity_id uuid, p_metadata jsonb)` — DEFINER + anon; INSERT notifications for any p_user_id; no repo caller
- `create_sample_notifications_for_user(p_user_id uuid)` — DEFINER + anon; inserts 8 fabricated notifications for any user id; no caller
- `create_user_notification(p_user_id uuid, p_notification_type_id character varying, p_title character varying, p_description text, p_related_url character varying)` — DEFINER + anon; INSERT user_notifications for any p_user_id; no rpc caller (only create_sample_notifications_for_user)
- `end_dev_impersonation(p_dev_user_id uuid, p_ip_address inet, p_user_agent text)` — DEFINER + anon; UPDATE dev_role_sessions + INSERT dev_audit_log for any p_dev_user_id; no caller
- `get_active_dev_impersonation(user_uuid uuid)` — DEFINER + anon; returns session_token/expiry of any user's active impersonation; no rpc caller (used by get_effective_user_role)
- `get_activity_stats(p_workspace_id uuid)` — DEFINER + anon; activity_feed aggregates for any workspace (ALL workspaces when NULL), no membership check; no caller
- `get_all_auth_users()` — DEFINER + anon; SELECT auth.users (email, last_sign_in_at, confirmation) + profiles for every account; no caller
- `get_document_statistics(workspace_uuid uuid)` — DEFINER + anon; per-workspace document stats incl. top uploaders, no membership check; browser caller utils/documentUtils.ts:161
- `get_folder_breadcrumb(folder_uuid uuid)` — DEFINER + anon; folder names for any folder id (low impact); browser caller utils/documentUtils.ts:199
- `get_meeting_stats(p_workspace_id uuid)` — DEFINER + anon; meeting/task/commitment counts of any workspace, no membership check; browser caller utils/meetingUtils.ts:515
- `get_or_create_community_workspace(p_community_id uuid)` — DEFINER + anon; INSERT community_workspaces for any community id; no caller
- `get_overdue_items(p_workspace_id uuid, p_user_id uuid)` — DEFINER + anon; overdue commitments/tasks (assigned_to, titles, meeting titles) for any workspace or any p_user_id; browser caller utils/meetingUtils.ts:491
- `get_recent_document_activity(workspace_uuid uuid, limit_count integer)` — DEFINER + anon; document_access_log rows (user_id, document titles) for any workspace; browser caller utils/documentUtils.ts:181
- `get_reportable_users(requesting_user_id uuid)` — DEFINER + anon; trusts requesting_user_id: pass any admin id and receive every user's email/name/school; no caller
- `get_reportable_users_enhanced(requesting_user_id uuid)` — DEFINER + anon; same pattern (consultant_assignments + profiles PII keyed on caller-supplied requesting_user_id); no caller
- `get_thread_statistics(p_thread_id uuid)` — DEFINER + anon; message count/participants of any thread; no caller
- `get_unread_notification_count(p_user_id uuid)` — DEFINER + anon; per-user unread count for any id (low impact); no caller
- `get_user_badges(p_user_id uuid)` — DEFINER + anon; any user's badge/course-completion history; no caller
- `get_workspace_messaging_stats(p_workspace_id uuid)` — DEFINER + anon; thread/message aggregates of any workspace; no caller
- `grade_quiz_open_responses(p_submission_id uuid, p_graded_by uuid, p_grading_data jsonb)` — DEFINER + anon; UPDATE quiz_submissions score/graded_by (caller-supplied) for any submission; no caller (app uses INVOKER grade_quiz_feedback)
- `increment_document_counter(document_uuid uuid, counter_type text, user_uuid uuid)` — DEFINER + anon; UPDATE view/download counters + INSERT document_access_log with caller-supplied user_uuid; browser caller utils/documentUtils.ts:419
- `mark_all_notifications_read(p_user_id uuid)` — DEFINER + anon; UPDATE user_notifications for any p_user_id; no caller
- `mark_notification_read(p_notification_id uuid, p_user_id uuid)` — DEFINER + anon; UPDATE user_notifications WHERE user_id = caller-supplied p_user_id; no caller (the 1-arg overload uses auth.uid())
- `refresh_user_roles_cache()` — DEFINER + anon; REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache — anon-triggerable load; all 8 callers are service-role admin routes -> grant service_role only
- `start_dev_impersonation(p_dev_user_id uuid, p_impersonated_role user_role_type, p_impersonated_user_id uuid, p_school_id integer, p_generation_id uuid, p_community_id uuid, p_ip_address inet, p_user_agent text)` — DEFINER + anon; validates is_dev_user(p_dev_user_id) but never the caller; INSERTs dev_role_sessions and RETURNS session_token -> anon can mint an impersonation session for any dev user; no repo caller
- `submit_quiz(p_lesson_id uuid, p_block_id text, p_student_id uuid, p_course_id uuid, p_answers jsonb, p_quiz_data jsonb, p_time_spent integer)` — authenticated-only after 20260907120200, but INSERT quiz_submissions.student_id = caller-supplied p_student_id with no auth.uid() comparison; browser callers pass user.id -> any authenticated user can submit as another (D-RLS-02)
- `update_overdue_status()` — DEFINER + anon; global UPDATE of meeting_commitments/meeting_tasks status; browser caller utils/meetingUtils.ts:655 -> belongs to cron/service_role

### DECISION_DEPENDENT list

- `auth_is_superadmin(check_user_id uuid)` — PUBLIC/anon; superadmin-membership oracle for any id; callers are service-role admin routes passing the session user id
- `can_access_workspace(p_user_id uuid, p_workspace_id uuid)` — PUBLIC/anon; community_posts policies pass auth.uid() (justified); browser callers pass user.id; answers for any id (membership oracle)
- `can_edit_meeting(check_user_id uuid, check_meeting_id uuid)` — anon; 10 meeting policies pass auth.uid(); reveals editor status for any id
- `fn_is_events_manager(p_user_id uuid)` — PUBLIC/anon; 5 events policies pass auth.uid(); admin/community_manager/superadmin oracle for any id
- `get_available_assignment_templates(p_course_id uuid)` — authenticated only; lists templates of any course with no enrollment check (course content, not PII); no caller; open item (order_index) in review request
- `get_baseline_permissions(p_role_type text)` — anon; role_permission_baseline config rows; no caller
- `get_effective_permissions(p_role_type text, p_test_run_id uuid)` — anon; baseline + test-overlay permission config; no caller
- `get_effective_user_role(user_uuid uuid)` — anon; effective role for any id incl. dev-impersonation override; no caller
- `get_school_user_counts()` — anon; aggregate user count per school (non-PII); browser caller pages/admin/schools.tsx:219 (admin page)
- `get_user_admin_status(user_uuid uuid)` — anon; admin oracle for any id; no caller, no policy
- `get_user_messaging_permissions(p_user_id uuid, p_workspace_id uuid)` — anon; role-derived permission JSON for any id; no caller
- `get_user_workspace_role(p_user_id uuid, p_workspace_id uuid)` — anon; role of any user in any workspace; no caller
- `has_feedback_permission(check_user_id uuid)` — PUBLIC/anon; browser caller passes user.id (components/feedback/FeedbackButtonWithPermissions.tsx:32); oracle for any id
- `has_global_workspace_access(check_user_id uuid)` — authenticated only; 3 community_meetings policies pass auth.uid(); admin/consultor oracle for any id — body redesign deferred (D-RLS-02)
- `is_admin_or_consultor(p_uid uuid)` — anon; 10 policies pass auth.uid(); staff-role oracle for any id
- `is_assessment_collaborator(assessment_uuid uuid, uid uuid)` — anon; policy passes auth.uid(); collaborator oracle for any (assessment,user)
- `is_community_member(check_user_id uuid, check_community_id uuid)` — anon; no policy, no caller; membership oracle
- `is_dev_user(user_uuid uuid)` — anon; dev policies pass auth.uid(); dev-flag oracle for any id
- `is_global_admin(user_uuid uuid)` — anon; 19 policies pass auth.uid(); admin oracle for any id
- `supervisor_can_access_user(supervisor_user_id uuid, target_user_id uuid)` — PUBLIC/anon; service-role caller pages/api/reports/user-details.ts:12 (correct args); utils/roleUtils.ts:1298 passes `supervisor_id` (wrong param name -> PostgREST 404, dead path); network-scope oracle for any pair
- `user_is_in_group(p_group_id uuid, p_user_id uuid)` — PUBLIC/anon; 2 policies pass auth.uid(); group-membership oracle for any (group,user)
- `user_school_ids(uid uuid)` — anon; 4 transformation_assessments policies pass auth.uid(); school list of any user

## Part C — deep dives

All bodies below are quoted from `pg_get_functiondef()` on the disposable database (post-migration state). Grants quoted from Part A.

### C.1 `submit_quiz(p_lesson_id uuid, p_block_id text, p_student_id uuid, p_course_id uuid, p_answers jsonb, p_quiz_data jsonb, p_time_spent integer DEFAULT NULL)`

Only one overload exists in `public` (`pg_proc` has a single `submit_quiz`). SECURITY DEFINER, `search_path = public, pg_temp` (pinned by the applied migration), EXECUTE: `authenticated`, `service_role`, `postgres` (PUBLIC/anon revoked by the migration; pgTAP 072 line 86 proves anon gets 42501). No policy references it; no other function body calls it.

Body (lines 66–96 of the definition — the only write; the scoring loop above it reads only `p_quiz_data`/`p_answers`):

```sql
  -- Insert the submission
  INSERT INTO quiz_submissions (
    lesson_id, block_id, student_id, course_id,
    auto_graded_score, manual_graded_score, total_possible_points,
    auto_gradable_points, manual_gradable_points, grading_status,
    answers, open_responses, time_spent
  ) VALUES (
    p_lesson_id,
    p_block_id,
    p_student_id,          -- caller-supplied; never compared to auth.uid()
    p_course_id,
    v_auto_score, 0, v_total_points, v_auto_points, v_manual_points,
    CASE WHEN v_manual_points > 0 THEN 'pending_review' ELSE 'completed' END,
    p_answers,
    CASE WHEN v_manual_points > 0 THEN v_open_responses ELSE NULL END,
    p_time_spent
  )
  RETURNING id INTO v_submission_id;
```

There is no `auth.uid()` anywhere in the body, no enrollment check on `(p_student_id, p_course_id)`, and the correct answers arrive in `p_quiz_data` from the client (the function grades against whatever `isCorrect` flags the caller sends — a second, independent integrity problem: the client controls both the answers and the answer key).

Callers:

| caller | client | what it passes as `p_student_id` |
|---|---|---|
| `lib/services/quizSubmissions.js:75` (`submitQuiz(supabase, lessonId, blockId, studentId, …)`) | whatever the component hands in | `studentId` argument verbatim (line 78) |
| `components/quiz/QuizTaker.tsx:114` → `submitQuiz(supabase, …, studentId, …)` | **browser** — `useSupabaseClient()` (line 31), user JWT | `studentId` prop (line 118) |
| `components/quiz/LearningQuizTaker.tsx:152` | **browser** — `useSupabaseClient()` (line 33) | `studentId` prop (line 156) |
| `components/student/StudentBlockRenderer.tsx:585-590` renders `LearningQuizTaker studentId={studentId}` | prop pass-through | from the page |
| `pages/student/lesson/[lessonId].tsx:920` `studentId={user?.id}` | browser page | the signed-in user's id — but it is a client-side value; any authenticated user can call the RPC with another `p_student_id` |
| `scripts/seed-qa-phase2.js:772` (`supabase.rpc('submit_quiz', quizPayload)`, payload built at :732-735) | **seed/QA script**, `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` (line 24) | `p_student_id: DOCENTE_QA_USER_ID` (synthetic QA user) |
| `scripts/seed-qa-phase2-retest.js:274-277` | **seed/QA script**, service key (line 17) | `p_student_id: DOCENTE_QA_USER_ID` |
| `scripts/seed-qa-phase2-final.js:218,283` | only mentions the RPC in log text (records an auto-grading finding); no call | — |
| `supabase/tests/072-drls-function-exposure.sql:86` | pgTAP as anon | proves 42501 |

Disposition: **CONFIRMED_DEFECT** (caller-supplied actor trusted for a write). The migration comment (lines 31–35) and `PROJECT_STATE.md:272` already record this as D-RLS-02. Only the seed scripts legitimately need a foreign `p_student_id`, and they run with the service key — so a body that enforces `p_student_id = auth.uid()` unless `auth.uid() IS NULL` (service role), or that ignores the parameter and uses `auth.uid()`, would break no production caller.

### C.2 `has_global_workspace_access(check_user_id uuid)`

SECURITY DEFINER, `search_path = public, pg_temp` (pinned by the migration), EXECUTE: `authenticated`, `service_role`, `postgres`. Body in full:

```sql
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = check_user_id
      AND role_type IN ('admin', 'consultor')
      AND is_active = true
  );
END;
```

Callers and the argument each passes:

| kind | where | argument |
|---|---|---|
| policy | `public.community_meetings` — `Community members can view meetings` (SELECT, TO authenticated) | `has_global_workspace_access(auth.uid()) OR EXISTS (…member of workspace…)` |
| policy | `public.community_meetings` — `Community members can create meetings` (INSERT WITH CHECK, TO authenticated) | `has_global_workspace_access(auth.uid()) OR …` |
| policy | `public.community_meetings` — `Community members can delete meetings` (DELETE, TO authenticated) | `has_global_workspace_access(auth.uid()) OR …` |
| other function bodies | none (`prosrc` search) | — |
| repository code | none — no `.rpc('has_global_workspace_access'` and no SQL-style call anywhere in pages/, lib/, components/, hooks/, utils/, scripts/, middleware.ts | — |

Every live caller passes `auth.uid()`, so the parameter is only a convenience. Read-only; the only cross-user leak is "is user X an active admin/consultor?", callable by any authenticated user via `POST /rest/v1/rpc/has_global_workspace_access`. Disposition **DECISION_DEPENDENT**: replacing the parameter with `auth.uid()` (or adding `AND check_user_id = auth.uid()`) breaks nothing, but that redesign is what the protocol deferred as D-RLS-02.

### C.3 `has_transformation_access(community_id uuid)`

SECURITY DEFINER, STABLE, `search_path = public, pg_temp` (pinned), EXECUTE: `authenticated`, `service_role`, `postgres`. Body lines 8–29:

```sql
  IF EXISTS (SELECT 1 FROM growth_community_transformation_access gcta
             WHERE gcta.growth_community_id = community_id AND gcta.is_active = true) THEN
    RETURN true;
  END IF;
  -- Fallback TEMPORAL al flag viejo durante período de migración
  -- Este bloque se eliminará en migración 023 (cleanup)
  IF EXISTS (SELECT 1 FROM growth_communities gc
             WHERE gc.id = community_id AND gc.transformation_enabled = true) THEN
    RETURN true;
  END IF;
  RETURN false;
```

Policy dependencies — 7, all with role list `{public}`: `transformation_assessments.members_insert_transformation_assessments` (INSERT, TO public), `transformation_assessments.members_update_transformation_assessments` (UPDATE, TO public), `transformation_conversation_messages.members_delete_transformation_conversation_messages` (DELETE, TO public), `transformation_conversation_messages.members_insert_transformation_conversation_messages` (INSERT, TO public), `transformation_results.members_delete_transformation_results` (DELETE, TO public), `transformation_results.members_insert_transformation_results` (INSERT, TO public), `transformation_results.members_update_transformation_results` (UPDATE, TO public) — each ANDs it with a membership EXISTS or a collaborator/creator check. No function body or repository RPC calls it; the TypeScript twin `hasTransformationAccess()` in `lib/transformation/accessControl.ts:28` re-implements the same two-step lookup through PostgREST. Takes a community id, not a user id; read-only; the only information it reveals is whether a community is transformation-enabled. Disposition **JUSTIFIED_EXPOSURE**. Note the policies are `TO public` while the function is no longer executable by anon: an anon INSERT would be denied by the missing table privilege before the predicate runs, so this is consistent, but the `roles` column is worth normalising to `authenticated`.

### C.4 `get_available_assignment_templates(p_course_id uuid)`

SECURITY DEFINER, `search_path = public, pg_temp` (pinned), EXECUTE: `authenticated`, `service_role`, `postgres`. Body lines 8–21:

```sql
    RETURN QUERY
    SELECT at.id, l.id, l.title, m.title, at.title, at.assignment_type, at.created_at
    FROM assignment_templates at
    JOIN lessons l ON at.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    WHERE m.course_id = p_course_id
    ORDER BY m.order_index, l.order_index, at.created_at;
```

No policy, no function body, no repository caller (the migration header says the same: "the templates lookup has no caller"). Read-only; no user id; returns course-content metadata (template/lesson/module titles) for any course id to any authenticated user without an enrollment or teacher check — content, not PII. Disposition **DECISION_DEPENDENT** (drop it, or restrict to `auth_is_course_teacher(p_course_id) OR auth_is_admin()`; the review request also has an open `order_index` item on it).

### C.5 `cleanup_propuesta_rate_limits()`

SECURITY INVOKER, `LANGUAGE sql`, `search_path = public, pg_temp` (pinned by the migration), EXECUTE: `service_role`, `postgres` only. Whole body:

```sql
DELETE FROM propuesta_rate_limits WHERE attempted_at < NOW() - INTERVAL '24 hours';
```

No policy, no function body, no repository caller (nothing calls it — it is dead maintenance code; there is no cron either). Because it is INVOKER and `propuesta_rate_limits` has all privileges revoked from PUBLIC/anon/authenticated (`20260907120100_b10a_referenced_tables_rls.sql:163`), only service_role/postgres could ever delete through it. Disposition **JUSTIFIED_EXPOSURE**.

### C.6 `auth_is_admin()`

SECURITY DEFINER, VOLATILE, **no search_path**, EXECUTE: PUBLIC, anon, authenticated, service_role, postgres. Body:

```sql
    RETURN EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND role_type = 'admin'
        AND is_active = true
    );
```

63 policies reference it (41 `TO authenticated`, 22 `TO public`) across assessment_*, courses, etc.; called from `auth_has_school_access`, `auth_has_school_access_uuid`, `auth_is_course_teacher`, `batch_assign_learning_path`, `start_learning_path_session`, and the other learning-path functions. No repository RPC caller. Actor is `auth.uid()` only; anon evaluates to false. Disposition **JUSTIFIED_EXPOSURE** — but it is the most-referenced definer function in the schema and still has a mutable search_path (unqualified `user_roles`, `auth.uid()`), so it belongs at the top of the "pin search_path" list; it is also VOLATILE where STABLE would let the planner cache it per statement.

### C.7 `is_admin_or_consultor(p_uid uuid)`

SECURITY DEFINER, STABLE, `LANGUAGE sql`, `search_path = public`, EXECUTE: anon, authenticated, service_role, postgres (PUBLIC not present). Body:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p_uid
    AND COALESCE(ur.is_active, true)
    AND ur.role_type IN ('admin','consultor','equipo_directivo')
);
```

12 policies (11 `TO authenticated`, `courses.enrolled_or_owner_can_read_courses` is `TO public`), all passing `auth.uid()`: `clientes.admin_or_consultor_can_read_clientes` (SELECT), `contratos.admin_or_consultor_can_read_contratos` (SELECT), `courses.enrolled_or_owner_can_read_courses` (SELECT), `cuotas.admin_or_consultor_can_read_cuotas` (SELECT), `growth_community_transformation_access.growth_community_transformation_access_staff_or_member_read` (SELECT), `transformation_assessment_collaborators.collaborators_delete` (DELETE), `transformation_assessment_collaborators.collaborators_insert` (INSERT), `transformation_assessment_collaborators.collaborators_select` (SELECT), `transformation_assessments.transformation_assessments_delete` (DELETE), `transformation_assessments.transformation_assessments_insert` (INSERT), `transformation_assessments.transformation_assessments_select` (SELECT), `transformation_assessments.transformation_assessments_update` (UPDATE). No function body or repository caller. Note the name lies: it also returns true for `equipo_directivo`, and `COALESCE(is_active, true)` treats a NULL flag as active — both worth a product check. Read-only staff-role oracle for any id, executable by anon. Disposition **DECISION_DEPENDENT** (as a policy predicate it is justified; the anon EXECUTE and the free `p_uid` are not needed by any caller).

### C.8 `user_is_in_group(p_group_id uuid, p_user_id uuid)`

SECURITY DEFINER, VOLATILE, `search_path = public, pg_catalog`, EXECUTE: PUBLIC, anon, authenticated, service_role, postgres. Body:

```sql
  RETURN EXISTS (
    SELECT 1 FROM public.group_assignment_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
```

Policies: `group_assignment_discussions.group_assignment_discussions_member_insert` (INSERT WITH CHECK `user_is_in_group(group_id, auth.uid()) AND …`, TO authenticated) and `group_assignment_members."Users can view group members"` (SELECT `user_id = auth.uid() OR user_is_in_group(group_id, auth.uid())`, TO public). No function or repository caller. Membership oracle for any (group, user) pair, anon-executable. Disposition **DECISION_DEPENDENT**.

### C.9 `auth_is_course_student(p_course_id uuid)`

SECURITY DEFINER, STABLE, **no search_path**, EXECUTE: PUBLIC, anon, authenticated, service_role, postgres. Body:

```sql
    RETURN EXISTS (
        SELECT 1 FROM course_enrollments ce
        WHERE ce.course_id = p_course_id
        AND ce.user_id = auth.uid()  -- Fixed: was student_id, now user_id
    );
```

Policies — 5: `assignment_instances.assignment_instances_student_view` (SELECT, TO authenticated), `blocks.blocks_student_view` (SELECT, TO authenticated), `lesson_assignments.lesson_assignments_student_view` (SELECT, TO authenticated), `lessons.lessons_student_view` (SELECT, TO authenticated), `modules.modules_student_view` (SELECT, TO authenticated). No function or repository caller. Actor is `auth.uid()`; the parameter is the course, not a user. Disposition **JUSTIFIED_EXPOSURE**; pin the search_path.

### C.10 `password_change_gate_ok()`

SECURITY DEFINER, STABLE, `search_path = public, pg_catalog`, EXECUTE: authenticated, authenticator, service_role, postgres, anon (PUBLIC not present). Body lines 18–46:

```sql
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN others THEN
    RETURN false;          -- unparseable claims → DENY
  END;
  IF v_uid IS NULL THEN
    RETURN true;           -- anon / server role: nothing to hold, policy is TO authenticated anyway
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = v_uid AND p.must_change_password IS TRUE
  );
```

Referenced by 254 `forced_password_change_guard` policies (all `TO authenticated`, installed by `apply_forced_password_change_guard(schema, table)`); `gate_password_change()` is the request-layer twin (reads `request.jwt.claims`, RAISEs at the API layer). No repository RPC caller. Actor is `auth.uid()` only; the `anon` grant is deliberate so PostgREST can evaluate policies whose role list includes it, and the NULL-uid → true branch is documented in-body as intentional. Disposition **JUSTIFIED_EXPOSURE**.

### C.11 Proposal (propuesta) rate-limit code path

Table consumers: `lib/propuestas-web/access-rate-limit.ts` (only module touching `propuesta_rate_limits`), used by `pages/api/propuestas/web/[slug]/verify.ts` and `lib/propuestas-web/download-access.ts`. Both use `createServiceRoleClient()` (`verify.ts:3,38`; `download-access.ts` receives `serviceClient` from its route), so the b10a REVOKEs on the table do not affect them.

Lookup — **fail-open**. `lib/propuestas-web/access-rate-limit.ts:21-31`:

```ts
  const { count, error } = await client
    .from('propuesta_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('slug', slug)
    .gte('attempted_at', oneHourAgo);

  if (error) {
    console.error('[rate-limit] count error:', error);
    return { allowed: true, remaining: PROPOSAL_ACCESS_MAX_ATTEMPTS };
  }
```

If the count query errors (table unreadable, RLS/grant misconfiguration, network) the caller is told `allowed: true` with the full 5-attempt budget — the rate limit silently disappears and code-guessing is unthrottled. `verify.ts:39-46` and `download-access.ts:36-45` only branch on `allowed`, so neither route can distinguish "under limit" from "limiter broken". The unit test `lib/propuestas-web/__tests__/download-zip-api.test.ts` has a `rateLimitError` option (line 92/109) — worth checking whether it asserts fail-open as intended behaviour.

Increment — **fire-and-forget, also fail-open**. `access-rate-limit.ts:41-49`:

```ts
export async function recordProposalFailedAttempt(client, ip, slug): Promise<void> {
  await client
    .from('propuesta_rate_limits')
    .insert({ ip_address: ip, slug });
}
```

The insert result is discarded (no `error` check, nothing thrown), and callers `await` it without inspecting anything (`verify.ts:92`, `download-access.ts:53`). A failing insert therefore never records the attempt and never surfaces, so a broken table means unlimited attempts with a 401 each time. There is no fail-closed branch anywhere on this path; the only hard stops are 429 when `allowed` is false and 500 on a malformed bcrypt hash (`verify.ts:84-89`). Also note `getProposalRequestIp` trusts the first `x-forwarded-for` entry (`access-rate-limit.ts:8`) — client-spoofable unless Vercel overwrites the header.

### C.12 Transformation-access fallback

`lib/transformation/accessControl.ts:28-62` (`hasTransformationAccess`):

```ts
  const { data: access, error } = await supabase
    .from('growth_community_transformation_access')
    .select('is_active')
    .eq('growth_community_id', communityId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error('[accessControl] Error checking transformation access:', error);
  }                                   // ← no return: falls through to the legacy flag
  if (access) { return true; }
  const { data: community, error: communityError } = await supabase
    .from('growth_communities').select('transformation_enabled').eq('id', communityId).single();
  if (communityError) {
    console.error('[accessControl] Error checking fallback flag:', communityError);
    return false;
  }
  return community?.transformation_enabled === true;
```

Behaviour: an error on the new table is logged and ignored, and the decision falls to the legacy `growth_communities.transformation_enabled` flag; an error on the fallback query returns `false`. So there is **no fail-open grant on error** — the worst case is a *stale* grant (legacy flag still true after the new-table row was deactivated, or the new table unreadable under the caller's RLS so the legacy flag decides). The SQL twin `has_transformation_access(uuid)` (C.3) has the identical two-step OR, so the policies have the same stale-flag exposure; `sync_legacy_transformation_flag()` (trigger on `growth_community_transformation_access` insert/update) is what keeps the flag aligned, and `archive_assessments_on_access_removal()` runs on removal.

The only place a *null/false* check turns into a grant is `pages/api/transformation/assessments.ts:60-83`:

```ts
  const hasAccess = await hasTransformationAccess(supabase, communityId);
  if (!hasAccess) {
    const isAdmin = await isUserAdmin(supabase, session.user.id);
    if (isAdmin) {
      const assignResult = await assignTransformationAccess(supabase, communityId, session.user.id,
        'Auto-asignado al crear primer assessment');
      if (!assignResult.success) { return res.status(500).json({ error: '…' }); }
    } else {
      return res.status(403).json({ error: 'Esta comunidad no tiene acceso a Vías de Transformación…' });
    }
  }
```

This is an intentional admin-only auto-provision (session client via `createPagesServerClient`, `assessments.ts:15`; admin verified server-side), not an error fallback: a non-admin gets 403, and an error inside `hasTransformationAccess` yields `false` → 403 for non-admins. `pages/api/transformation/assessments/[id]/evaluate-objective.ts`, `assign-access.ts` and `revoke-access.ts` call `assign/revokeTransformationAccess` explicitly and do not consult the fallback. Net: the "transformation fallback" is a **staleness** risk (legacy flag), not a fail-open-on-error risk.

---

## §0.3 R2-01 remediation (Codex re-review round, 2026-09-07)

Migration `20260907120300_r2_remediation.sql`. The R2 re-review reproduced anonymous account enumeration through `get_all_auth_users()` and required the confirmed function exposures to be corrected, not deferred as "outside the historical unit". Every confirmed defect was re-audited against its actual callers (repository search at base `92df72a6`), dependent policies and effective grants; each was corrected where its intended authority is established, or is listed below with a specific blocker. pgTAP evidence: `supabase/tests/073-r2-remediation.sql` (§1 grants/search_path for all signatures; §5 live anon/authenticated/member/backend probes).

**Trusted-backend authority tightened.** `auth_is_backend_caller()` no longer answers TRUE for mere absence of identity: it requires a `service_role` JWT claim, or a direct database session (no request claims, no active application role, login role not `authenticator`). "No `auth.uid()`" alone is never backend authority.

### Corrected — backend-only boundary (service_role EXECUTE only; PUBLIC/anon/authenticated revoked; search_path pinned)

No application-role caller exists (callers, where any, are service-role admin routes). An authenticated or anonymous caller had no legitimate use.

| Signature | Original defect | Correction |
|---|---|---|
| `get_all_auth_users()` | DEFINER + anon; reads `auth.users` for every account; Codex reproduced anon enumeration | grants tightened to service_role; body now also requires literal admin or backend principal (defence in depth against a future grant change) |
| `refresh_user_roles_cache()` | DEFINER + anon; anon-triggerable `REFRESH MATERIALIZED VIEW CONCURRENTLY` | service_role only (all 8 callers are service-role admin routes) |
| `cleanup_expired_test_runs()` | DEFINER + anon; deletes test `role_permissions`, resets `test_mode_state` | service_role only (maintenance, no caller) |
| `create_assignment_template_from_block(uuid,uuid,jsonb,uuid)` | DEFINER + anon; caller-supplied `created_by` | service_role only (no repo caller) |
| `create_document_version(uuid,text,bigint,varchar,uuid)` | DEFINER + anon; caller-supplied `uploaded_by` | service_role only (no repo caller) |
| `create_notification(uuid,varchar,varchar,text,varchar,uuid,jsonb)` | DEFINER + anon; INSERT for any user | service_role only (no repo caller) |
| `create_sample_notifications_for_user(uuid)` | DEFINER + anon; fabricates notifications for any user | service_role only (no caller) |
| `create_user_notification(uuid,varchar,varchar,text,varchar)` | DEFINER + anon; INSERT for any user | service_role only (only in-DB use is `create_sample_notifications_for_user`, itself service_role) |
| `grade_quiz_open_responses(uuid,uuid,jsonb)` | DEFINER + anon; grades any submission with caller-supplied `graded_by` | service_role only (app uses INVOKER `grade_quiz_feedback`) |
| `get_or_create_community_workspace(uuid)` | DEFINER + anon; INSERT workspace for any community | service_role only (no caller) |
| `award_course_completion_badge(uuid,uuid,text)` | DEFINER + anon; awards a badge to any user | service_role only (callers are the two service-role badge routes; the browser `BadgeService.awardCourseCompletionBadge` wrapper has no caller) |
| `start_dev_impersonation(...)` / `end_dev_impersonation(...)` / `get_active_dev_impersonation(uuid)` | DEFINER + anon; mint/reveal impersonation `session_token` for any dev id | service_role only (no repo caller; `get_effective_user_role` remains DECISION_DEPENDENT, below) |
| `get_reportable_users(uuid)` / `get_reportable_users_enhanced(uuid)` | DEFINER + anon; trust `requesting_user_id` → every user's PII | service_role only (no caller). NOTE: `get_reportable_users` has a pre-existing body defect (`42702` ambiguous `user_id`) unchanged by this round |
| `get_activity_stats(uuid)` / `get_thread_statistics(uuid)` / `get_workspace_messaging_stats(uuid)` | DEFINER + anon; cross-workspace/thread aggregates, no membership check | service_role only (no caller) |
| `calculate_quiz_score(uuid)` | DEFINER + anon; any submission's score | service_role only (no caller) |
| `reserve_propuesta_access_attempt(...)` / `release_propuesta_access_attempt(bigint)` | new (R2-02) | service_role only |

### Corrected — actor / membership bound (authenticated kept, browser caller exists)

anon/PUBLIC revoked, search_path pinned, and the body binds caller-supplied ids to `auth.uid()` and the caller's workspace access (`assert_workspace_access` / `assert_actor_matches`; a backend principal may still name anyone for the seed/QA path).

| Signature | Browser caller | Binding added |
|---|---|---|
| `create_activity(...)` | `utils/activityUtils.ts:216` | workspace access + actor = `auth.uid()` (was `COALESCE(p_user_id, auth.uid())`, spoofable) |
| `increment_document_counter(uuid,text,uuid)` | `pages/community/workspace.tsx` | workspace access + actor bound; `counter_type` closed |
| `get_document_statistics(uuid)` / `get_recent_document_activity(uuid,integer)` / `get_meeting_stats(uuid)` | `utils/documentUtils.ts`, `utils/meetingUtils.ts` | workspace membership required |
| `get_overdue_items(uuid,uuid)` | `utils/meetingUtils.ts:491` | workspace filter → access; user filter → self (admins excepted); no filter → own items only |
| `get_folder_breadcrumb(uuid)` | `utils/documentUtils.ts:199` | workspace membership of the **starting** folder's workspace — **INCOMPLETE in R2 (Codex R3-03):** the recursive parent walk left the workspace, so a member who inserted an owned folder naming a foreign parent read the foreign folder's id/name. Corrected in R3 (§0.4): every recursive step is bound to the authorized workspace, cycle- and depth-bounded, and a `document_folders` guard trigger enforces parent/workspace consistency for new writes. |
| `get_unread_notification_count(uuid)` / `get_user_badges(uuid)` / `mark_all_notifications_read(uuid)` / `mark_notification_read(uuid,uuid)` | `components/badges/BadgesSection.tsx` (badges) | user id must be the caller (admins excepted) |
| `add_feedback_activity(uuid,text,uuid,boolean)` | trigger only | refused outside a trigger unless backend (the `feedback_status_change` trigger is SECURITY INVOKER and legitimately attributes a system message to the feedback author) |
| `update_overdue_status()` | `utils/meetingUtils.ts:655` | anon/PUBLIC revoked + search_path pinned; body takes no caller input and is idempotent, so authenticated EXECUTE is safe |

### Remaining — genuine blockers (not "outside the unit")

- **DECISION_DEPENDENT policy-predicate oracles** (`is_global_admin`, `is_admin_or_consultor`, `user_is_in_group`, `can_edit_meeting`, `fn_is_events_manager`, `auth_is_superadmin`, `can_access_workspace`, `get_user_workspace_role`, `is_assessment_collaborator`, `user_school_ids`, `is_community_member`, `get_effective_user_role`, `is_dev_user`, `get_user_admin_status`, `get_user_messaging_permissions`, `has_feedback_permission`, `supervisor_can_access_user`, `get_baseline_permissions`, `get_effective_permissions`, `get_school_user_counts`): these are membership/role oracles that answer for a caller-supplied id. **Blocker:** each is used as a `TO authenticated`/`TO public` policy predicate that passes `auth.uid()`, and/or a browser caller that passes `user.id`. Binding the parameter to `auth.uid()` is safe *only* where every policy that references the function passes `auth.uid()`; proving that per function is a policy-matrix audit (their own W-unit) that this round did not run. They leak "is user X an admin/member?" to any authenticated user, not PII of X, so they are lower-severity than the corrected set. `search_path` pinning for these is deferred with them (changing grants without the predicate audit risks a policy regression). Recorded for a dedicated policy-predicate hardening unit.
- **`has_global_workspace_access` / `submit_quiz`** — corrected in the prior round (`20260907120200`); actor bound, kept.
- **`get_available_assignment_templates`** — DECISION_DEPENDENT (content, not PII; open `order_index` product item). Grants already tightened in `20260907120200`.

### Disposition totals after this round

| | Before R2 (§0.2) | Corrected here | Remaining |
|---|---|---|---|
| CONFIRMED_DEFECT | 32 | 32 | 0 |
| DECISION_DEPENDENT (policy-predicate oracles + content) | 22 | 0 (grants/body unchanged; blocker recorded) | 22 |

Every previously CONFIRMED_DEFECT signature is now corrected. The 22 DECISION_DEPENDENT signatures each carry the specific blocker above (policy-predicate audit or product decision), not a scope deferral.

## §0.4 R3 corrections (Codex re-review `rls-rereview-r2-2026-09-07.md`, 2026-09-07)

Codex's R3 review reproduced a remaining scope bypass in a signature this inventory had marked corrected, and four learning-path session/progress defects. All five are corrected in the (uncommitted) migrations `20260907120000` / `20260907120300`; the inventory rows above are amended in place rather than re-generated.

| Signature | R3 finding | Correction | Evidence |
|---|---|---|---|
| `get_folder_breadcrumb(uuid)` | **R3-03** — authorization checked only the starting folder's workspace; the SECURITY DEFINER recursive walk followed `parent_folder_id` into other workspaces (no FK/policy bound the parent to the same workspace) | recursive step bound to `workspace_id = <authorized workspace>`; `visited` array (cycle guard) and `level < 64` (depth bound); new `document_folders_parent_guard` BEFORE INSERT / UPDATE OF `parent_folder_id, workspace_id` trigger (parent must exist in the same workspace under the invoker's RLS view, no self-parent, no cycle, ≤ 64 links); existing rows neither validated nor rewritten — a legacy foreign ancestor is simply never returned | pgTAP 074 §3: valid 3-level hierarchy, member and backend cross-workspace parent refused on INSERT and UPDATE, a legacy inconsistent row yields only itself (foreign id/name absent from the answer), a legacy cycle terminates, a new cycle is refused, foreign member refused, service_role works |
| `record_learning_path_activity(uuid, varchar, uuid)` | **R3-01** — session ownership was treated as authority; a revoked group member / unassigned direct assignee could still record activity, sequence and completion on an open session | CURRENT assignment authority (`auth_is_admin() OR auth_is_learning_path_assignee(path)`) re-checked before any write, `42501` otherwise (route → 403); same check added to `update_session_heartbeat`; `end_learning_path_session` still settles (earned credit is never discarded) but a revoked learner's open session closes at their last authorized heartbeat | pgTAP 074 §2; Vitest `session-activity` / `session-heartbeat`; e2e `R3-01` |
| `start_learning_path_session`, `end_learning_path_session`, `record_learning_path_activity`, `settle_learning_path_sessions`, `close_stale_learning_path_sessions` | **R3-02** — `end` locked the session row before the per-(user, path) advisory lock while `start` did the reverse (reproduced `40P01`); the maintenance close claimed rows before the pair lock | one global order for every session writer: advisory(user, path) → session rows → progress rows; new internal helper `lp_lock_session_pairs(uuid[])` pre-locks every pair of a batch in canonical `(user_id, path_id)` order; `end` and `activity` read the immutable session identity, lock the pair, then `FOR UPDATE`; the maintenance close selects a bounded candidate batch (500 sessions), pre-locks their pairs, then claims rows; overlapping maintenance runs serialise instead of interleaving (exactly-once unchanged) | `scripts/ci/lp-session-settlement-proof.mjs` steps 3, 6a/6b, 7a/7b (deterministic: the blocked backend is observed via `pg_stat_activity` wait_event `advisory` holding no row lock on the sessions table); pgTAP 074 §5 |
| `lp_record_progress(...)`, `batch_assign_learning_path` (via triggers on `learning_path_assignments`) | **R3-04** — the new own-progress row and the direct assignment row received parallel increments but were never reconciled when either first appeared | `learning_path_user_progress` is the ONE authoritative record: migration backfill from every existing direct row (copy), lazy seed from the direct row on first write, `learning_path_assignments_seed_from_progress` (BEFORE INSERT: a new direct row inherits the pair's progress) and `learning_path_assignments_ensure_progress` (AFTER INSERT: a direct row without a progress row gets one); values are copied, never summed; `enhanced-progress.ts` reads the record for direct and group assignees alike and now reports its minutes / current course / start / completion | pgTAP 074 §4 (group-only → +direct, direct+group → group-only, history before a progress row, settlement + retry, retention grants nothing); Vitest `enhanced-progress`; e2e `R3-04` |
| `learning_path_progress_sessions` grants | **R3-05** — `updated_at` left the authenticated UPDATE grant in `20260907120000` and returned in `20260907120300`; the deployed activity route writes it | the grant is in `20260907120000` from the start; `20260907120300` no longer re-grants; rehearsed with the previously deployed application at every prefix (rollout doc §2) | rollout doc §2 evidence; pgTAP 070 catalog assertion |

Disposition totals are unchanged by this round (no new signatures; the 22 DECISION_DEPENDENT oracles remain deferred with their recorded blocker). New internal helpers with **no** EXECUTE grant for any application role: `lp_lock_session_pairs(uuid[])`, `learning_path_assignments_seed_from_progress()`, `learning_path_assignments_ensure_progress()`, `document_folders_parent_guard()` (trigger functions; pgTAP 074 §1 pins the trigger installation and the helper's grants).

## §0.5 HISTORICAL R4 corrections (heartbeat reader superseded by R5-01) (Codex re-review `rls-rereview-r3-2026-09-07.md`, 2026-09-07)

| Signature | R4 finding | Correction | Evidence |
|---|---|---|---|
| `learning_path_progress_sessions.last_heartbeat` (authenticated UPDATE column grant), `end_learning_path_session(uuid)`, `close_stale_learning_path_sessions(timestamptz)` | **R4-01** — the grant (kept for the previously deployed activity route, R3-05) let an authenticated assignee store an arbitrary heartbeat; final settlement after revocation and the maintenance close trusted it, so a future value / `infinity` made `least(now(), greatest(hb, start))` choose the end-request time | new trigger function `learning_path_sessions_heartbeat_guard()` (BEFORE INSERT / UPDATE OF `last_heartbeat`; `20260907120000` §5a): an application principal's value is replaced by `now()`, any other writer is clamped to `now()`; new internal helper `lp_last_authorized_heartbeat(timestamptz, timestamptz)` (`greatest(hb, start)`, or `start` when `hb > clock_timestamp()` — a pre-guard client value establishes nothing) used by `end` (revoked branch) and by the maintenance candidate predicate and close time. Grants and authority checks unchanged | pgTAP 075 §1–2 (96; 28 fail with the R4 triggers disabled); `scripts/ci/lp-session-settlement-proof.mjs` §8 (real clock, 2 s and 62 s forms); E2E test 7 + `R4-01`; rehearsal at P4 |
| `lp_record_progress(...)` and the direct progress columns of `learning_path_assignments` (`current_course_sequence, completed_at, last_activity_at`) | **R4-02** — after `20260907120300` initialised the own-progress record, the previously deployed activity route kept writing those columns directly on the direct row; nothing carried the change into the record and settlement with a NULL sequence kept the stale value the new reader prefers | new trigger function `learning_path_assignments_sync_progress()` (AFTER UPDATE OF the three columns, direct rows only): sequence copied, completion first-value, last activity monotonic, missing record seeded by copy; `lp_record_progress` flags its own mirror write (`lp.mirror_write`, transaction-local) and locks the assignment row before the progress row (global order `advisory → session rows → assignment row → progress row`) | pgTAP 075 §3; proof §9 (both orders, no `40P01`); E2E `R4-02`; rehearsal at P4 with the actual old app and the new reader on :3003 |

Disposition totals are unchanged by this round (no new application-callable signatures). New internal functions with **no** EXECUTE grant for any application role: `lp_last_authorized_heartbeat(timestamptz, timestamptz)`, `learning_path_sessions_heartbeat_guard()`, `learning_path_assignments_sync_progress()` (pgTAP 075 §1 pins the trigger installation and the grants).

R5 validation: **IMPLEMENTED_AND_TESTED**, independent review pending. Full pgTAP 32 / 3,155; new 076 has 26 assertions (6 fail under the transactional moving-clock negative control), 18 settlement/concurrency proof checks, and 180 actual old-app/prefix rehearsal checks. Evidence: `/Users/brentcurtis/Documents/ChatGPT/RLS Review/r5-evidence/EXECUTION-REPORT.md`.

## §0.6 C1 closure — the 21 remaining dispositions (remaining-work audit 2026-09-07 §1; migration `20260907120400_c1_function_exposure.sql`)

**Status: IMPLEMENTED_AND_TESTED locally (candidate on `fix/rls-learn`; Codex's closure review of 2026-09-08 returned REQUEST CHANGES on four findings outside this section's functions except `get_school_user_counts`, corrected in round C-R1; independent re-review pending).** This section is the CURRENT disposition record for the DECISION_DEPENDENT set; §0.3's "Remaining — genuine blockers" list and its "22 remaining" total are **historical**. Arithmetic (corrected 2026-09-08): the historical set has **22 rows = 21 newly addressed by `20260907120400` + 1 previously fixed** (`has_global_workspace_access(uuid)`, `20260907120200`, §0). The policy-predicate audit the blocker asked for was run from the fresh disposable catalog and is pinned by `supabase/tests/077-c1-function-exposure.sql` §1: every policy that references an actor-bound predicate passes `auth.uid()` as its user argument (regex assertions over `pg_policies`), so binding the argument changes nothing for the calling user.

Binding rule (shared internal helper `auth_actor_bound(uuid)`, no EXECUTE for any application role): a caller-supplied user id is honoured only when it is the authenticated user, or the caller is a literal admin (`auth_is_admin()`), or there is no end-user identity and `auth_is_backend_caller()` is TRUE (the tightened R2 definition: a service_role JWT or a direct database session — never inferred from absence of identity, never from `current_user`). Otherwise the predicate returns its safe negative (FALSE / NULL / `{}`) and never raises inside a policy.

| Signature | Disposition | Grants after C1 | Nested / callers verified | Evidence |
|---|---|---|---|---|
| `can_access_workspace(uuid, uuid)` | actor-bound (user arg) | anon, authenticated, service_role (PUBLIC revoked) | 2 `community_posts` policies (auth.uid()); `assert_workspace_access` (auth.uid()); browser `feedService.ts`, `workspaceUtils.ts` (own id) | 077 §2, §5 community_posts |
| `can_edit_meeting(uuid, uuid)` | actor-bound; admin/consultor short-circuit **preserved** (recorded) | same | 5 meeting policies (auth.uid()) | 077 §2, §5 community_meetings |
| `fn_is_events_manager(uuid)` | actor-bound; admin / community_manager / superadmin roles preserved | same | 4 `events` policies | 077 §2, §5 events |
| `get_user_workspace_role(uuid, uuid)` | actor-bound (NULL for a foreign id) | same | 11 document / folder / version / access-log policies | 077 §5 community_documents |
| `has_feedback_permission(uuid)` | actor-bound | same | browser `FeedbackButtonWithPermissions.tsx` (own id) | 077 §2 |
| `is_admin_or_consultor(uuid)` | actor-bound; `equipo_directivo` and `COALESCE(is_active, true)` **preserved** (recorded) | same | 13 policies incl. public-targeted `courses` (anon evaluation → FALSE, no error) | 077 §2, §5 courses / transformation |
| `is_assessment_collaborator(uuid, uuid)` | actor-bound on the USER argument (assessment id stays free) | same | 4 transformation policies | 077 §5 |
| `is_dev_user(uuid)` | actor-bound; nested backend callers (`get_effective_user_role`, `start_dev_impersonation`) reach it with no end-user identity → backend path | same | 2 dev policies | 077 §3 nested, §5 dev_audit_log |
| `is_global_admin(uuid)` | actor-bound | same | 14 policies (enrolments, progress, dev, expenses, consultant assignments) | 077 §2, §5 |
| `supervisor_can_access_user(uuid, uuid)` | SUPERVISOR bound to the actor, target free, network check and LIMIT 1 resolution **preserved**; browser helper `utils/roleUtils.ts` fixed (`supervisor_id` → `supervisor_user_id`) | same | backend `reports/user-details.ts` (service role) | 077 §2/§3, E2E C1 |
| `user_is_in_group(uuid, uuid)` | actor-bound on the user argument | same | 2 policies incl. public-targeted `group_assignment_members` | 077 §5 |
| `user_school_ids(uuid)` | actor-bound (`{}` for a foreign id) | same | 4 transformation policies | 077 §5 |
| `get_available_assignment_templates(uuid)` | retired from application roles; `ORDER BY` fixed (`order_number`; `order_index` never existed); body requires backend or admin | service_role only | no caller | 077 §3 (executes for the backend, 0 rows), 072 row updated |
| `get_baseline_permissions(text)` | backend-only | service_role only | no caller | 077 §3 |
| `get_effective_permissions(text, uuid)` | backend-only | service_role only | no caller | 077 §3 |
| `get_effective_user_role(uuid)` | backend-only; actor-bound body; dev semantics preserved (dev without role → admin) | service_role only | no caller; nests `is_dev_user`, `get_active_dev_impersonation` | 077 §3 |
| `get_user_admin_status(uuid)` | backend-only; actor-bound | service_role only | no caller, no policy | 077 §3 |
| `get_user_messaging_permissions(uuid, uuid)` | backend-only; actor-bound; `p_workspace_id` still ignored (recorded, no messaging model invented) | service_role only | no caller | 077 §3 |
| `is_community_member(uuid, uuid)` | backend-only; actor-bound | service_role only | no caller, no policy (`auth_is_community_member` is a different function) | 077 §3 |
| `auth_is_superadmin(uuid)` | service-only; actor-bound body (defence in depth) | service_role only | five service-role admin routes pass the verified session user | 077 §3 |
| `get_school_user_counts()` | literal admin or backend, else `42501`; authenticated EXECUTE **kept** for `pages/admin/schools.tsx`; **C-R1-02 (2026-09-08): also applies `password_change_gate_ok()`** (a definer reader bypasses the restrictive table policy) | authenticated, service_role | browser (admin page) | 077 §4, 079 §8, E2E C1 |
| `has_global_workspace_access(uuid)` | already fixed in `20260907120200`, unchanged | authenticated, service_role | 3 meeting policies | 072 (regression kept), 077 §1 |

Totals: 12 actor-bound predicates + 7 backend-only endpoints + 1 service-only check + 1 admin-gated browser endpoint = **21 newly addressed**, plus 1 previously fixed = **22 historical rows; 0 DECISION_DEPENDENT signatures remain.** All 22 are SECURITY DEFINER with `search_path = public, pg_temp`, PUBLIC holds no EXECUTE on any of them, and no application-role grant needed by a policy was revoked (the 12 predicates keep anon + authenticated EXECUTE because eight of their policies target `public`).

Semantic ambiguities the audit asked to record rather than redesign: the meeting helper's global consultor editing, `is_admin_or_consultor`'s inclusion of `equipo_directivo` and NULL-active-as-active, the supervisor helper's LIMIT 1 school resolution, and the messaging helper's ignored workspace argument are all **preserved and tested as-is** (077 marks each). None of them is an exposure; changing them needs a product decision recorded outside this unit.

Full pgTAP after the three closure migrations: see the review request (C round and the C-R1 correction round). New internal function with no EXECUTE for any application role: `auth_actor_bound(uuid)`. Definer readers/writers created by the closure migrations that are executable by `authenticated` and now apply the forced-password gate themselves (C-R1-02): `get_school_user_counts`, `auth_accessible_course_ids`, `lp_enrollment_origin_report`, `batch_assign_learning_path`, `admin_grant_course_access` (new, C-R1-03), `batch_assign_courses` (baseline, recreated).
