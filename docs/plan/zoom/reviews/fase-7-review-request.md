# Zoom phase Z7 — cumulative independent review request

## Control record

- Builder state: `REVIEW READY`; this document is evidence, not an acceptance verdict.
- Canonical branch: `feat/zoom-hours`.
- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`.
- Rejected round-twenty canonical head: `7eaa2feb6e5e756b3d43657611768ddb8dfd9d5c`
  (95 commits from the base; tree `e83ae73648dcf433aed323130dffd17fade2fa91`).
  It is a rejected review point, not acceptance evidence.
- Detached round-twenty starting point: `2f33d96c30f62b8afae7cddb2a1a6c83742dd874`
  (95 commits; the same tree `e83ae73648dcf433aed323130dffd17fade2fa91`).
- Detached round-twenty contract cherry-pick: `9ac040853460dbc83372a2c12f83a3fc51e19bd8`
  (96 commits; tree `7d1046360578f82190bb5009a6d5a51ec6e6dc94`; canonical source
  `4f3856e4676aa5344a9ca4d4c1b2d2f52f33633f`).
- Detached round-twenty heap/descriptor/completion implementation:
  `fd0624d903c305dbd45cad38a009af286199a645` (97 commits; tree
  `06da9084f639e07f56851226fa84ec22dcba068d`).
- This evidence document is the 98th cumulative detached commit. A commit cannot truthfully embed
  its own identity; its exact detached SHA is supplied in the builder handoff. The external review
  dispatch must pin the post-cherry-pick canonical HEAD after ordered integration; this artifact
  deliberately does not predict that changed identity.
- Review boundary: `4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD`.

There is no self-referential SHA claim in this artifact. A commit cannot contain its own SHA,
and cherry-picking changes detached commit identities. All embedded SHAs above are already stable
objects with counts verified by `git rev-list --count 43999499..<sha>`.

Ordered detached commits after `2f33d96c30f62b8afae7cddb2a1a6c83742dd874`:

1. `9ac040853460dbc83372a2c12f83a3fc51e19bd8` — round-twenty contract cherry-pick.
2. `fd0624d903c305dbd45cad38a009af286199a645` — receiver-aware heap, descriptor inspection/conversion, descriptor-aware mutators, and completion propagation.
3. This evidence commit — exact detached SHA in the builder handoff.

## Objective, delivered scope, and current status

PLAN §11 remains the governing objective: planned time is billed and paid unless an authenticated
admin explicitly writes an audited override; Zoom elapsed/presence is comparison evidence only;
the same effective minutes feed school consumption and consultant payment. PLAN §15.3 delivered
the attendance schema and lifecycle instants, participant ingestion, authoritative report
reconciliation, append-only override machinery, comparison/override UI, and facilitator
attendance suggestions.

Z7 is implemented on the feature branch but remains in independent remediation/re-review. It is
not accepted, merged, deployed, or production-verified. All fourteen Z7 migrations have been replayed
only against the local Supabase stack; production application and read-only verification remain a
human-controlled post-merge step.

Out of scope remains recording/transcription/minutas/consent, Z3b Client View, unrelated RLS
remediation, the Vitest upgrade, leadership aggregates, deployments, production data/schema, and
unrelated refactors.

## Finding disposition

### Round twenty

| Finding | Disposition and evidence |
|---|---|
| Z7-R20.1 | `Reflect.get` and `Reflect.set` now call the same receiver-aware abstract `[[Get]]`/`[[Set]]` operations as ordinary access and assignment. Prototype walks retain target-versus-receiver identity; inherited accessors run with the explicit receiver; receiver-owned data/accessor and integrity constraints govern creation; Reflect returns the correct boolean while ordinary strict writes retain abrupt completion. Static same/distinct receivers and multi-hop prototypes resolve exactly, while dynamic proxy/key/receiver authority fails closed once. |
| Z7-R20.2 | `Object.defineProperties` now enumerates only own enumerable entries and obtains/converts every descriptor in JavaScript field order before mutating the target. Invalid mixed data/accessor descriptors and throwing conversion getters leave the target byte-equivalent; after conversion succeeds, ordered `DefineOwnProperty` application retains earlier deterministic effects if a later invariant fails. Dynamic descriptor authority remains one explicit unsupported result rather than stale exact evidence. |
| Z7-R20.3 | `Object.create`'s descriptor argument, `Object.getOwnPropertyDescriptor(s)`, `Object.getPrototypeOf`, and all Reflect inspection equivalents now use the shared descriptor/prototype heap. Returned descriptor objects copy exact data/accessor fields and flags without aliasing internal records; null/fixed/multi-hop prototypes and own-versus-inherited lookup stay exact, while computed dynamic/proxy inspection rejects deterministically once. |
| Z7-R20.4 | All nine array mutators now execute against a descriptor-faithful indexed/`length` shadow and synchronize the ordered data/accessor/index/length effects back even when the native operation throws. Nonwritable/nonconfigurable indices, nonwritable length, holes, integrity state, caught failures, aliases and `sort` therefore retain the exact prefix of mutation and never flatten stale values. The checked-in runtime matrix covers every mutator and exact-zero failure outcome. |
| Z7-R20.5 | Switch evaluation now selects exact static cases, default/no-match, fallthrough, and consumes unlabeled breaks without visiting unreachable clauses; dynamic ledger-relevant branches produce one explicit unsupported result. Statically throwing ordinary calls and callback invocations propagate abrupt completion through functions and module evaluation, stopping later exports/calls across bounded CJS/ESM graphs while catch/finally behavior remains ordered. |

### Round nineteen

| Finding | Disposition and evidence |
|---|---|
| Z7-R19.1 | The evaluator now stores one JavaScript data/accessor descriptor per own property, including `value`/`get`/`set` and exact writable/enumerable/configurable defaults and flags, plus an explicit prototype link. Ordinary lookup, shadow/delete/redefine, receiver-aware inherited getters/setters, `Object.defineProperty`/`defineProperties`, `Reflect.defineProperty`/`set`/`deleteProperty`, `Object.setPrototypeOf`, and enumerable-own assign/spread all transfer through that shared heap. Static aliases and cycles terminate; dynamic keys/descriptors/prototypes/accessors remain one deterministic unsupported result. |
| Z7-R19.2 | Statement evaluation now carries explicit normal/throw/return/break/continue completions through strict and non-strict writes, blocks, calls, functions, branches, loops, modules, and ordered `try`/`catch`/`finally` replacement. Integrity-aware direct/computed writes, delete, length, descriptor/Reflect APIs, and all nine mutators—including `sort`—preserve deterministic partial effects and suppress post-throw unreachable calls. Runtime-oracle matrices cover caught and uncaught paths under freeze/seal/preventExtensions, comparator uncertainty, returns/loops/finally, aliases, branches, cycles, multiplicity, and nontermination. |
| Z7-R19.3 | Ordinary objects, locals, `exports`, `module.exports`, CJS/ESM consumers and re-exports now use the exact same descriptor/prototype heap and completion domain. Export flags, accessors and receiver identity survive direct/default/named/namespace/destructured/computed consumption; nonenumerable members do not leak through assign/spread; prototype inheritance, shadow/delete/redefine, retained aliases/replacement, abrupt module evaluation, mixed cycles and bounded convergence retain exact semantics or explicit unsupported authority. |

### Round eighteen

| Finding | Disposition and evidence |
|---|---|
| Z7-R18.1 | Every definite ordinary property operation now transfers over the existing sequence heap: direct/computed deletion, finite `length`, all logical assignments, compound/update expressions, `Reflect.set`, and static/aliased descriptors strongly replace or remove stale positions. Nullish/truthy primitives make logical writes branch-correct; genuinely unknown keys/receivers invalidate positional facts and preserve explicit executable uncertainty. `freeze`, `seal`, and `preventExtensions` retain the same sequence identity and distinct integrity state. The evaluator executes each of the eight finite native mutators against an integrity-equivalent sparse shadow array, so success, throw, and deterministic partial effects—including caught failures—refresh the shared heap exactly. Runtime controls cover 24 wrapper/mutator and 15 wrapper/direct-write combinations. |
| Z7-R18.2 | CommonJS analysis now uses a recursive shared object graph rather than a flat copied export map. Locals, retained/nested aliases, `exports`, `module.exports`, whole-module `require`, and ESM re-exports share child/prototype identity. Direct/computed writes, deletion, `Object.assign`, `defineProperty`, `defineProperties`, descriptor aliases/static getters, and `Object.create` own/inherited lookup update or remove the correct node. Flattening to the public module graph is cycle-bounded; replacement leaves old aliases detached, own shadow/delete behavior follows JavaScript lookup, static default/named/namespace/destructured/computed consumers resolve exactly, and dynamic authority remains explicit ambiguity. |

### Round seventeen

| Finding | Disposition and evidence |
|---|---|
| Z7-R17.1 | `Array.prototype` now exposes intrinsic mutable-sequence callable identities, so `push`, `pop`, `shift`, `unshift`, `splice`, `reverse`, `fill`, and `copyWithin` compose through `.call`, `.apply`, `.bind`, `Reflect.apply`, computed/destructured aliases, and nested Function adapters. The runtime receiver, bound receiver precedence, arguments, JavaScript return values, bounds, holes, and invalidation semantics flow through the existing bounded evaluator. Unknown intrinsic members/receivers/arguments preserve executable uncertainty and reject explicitly; inert generic mutations stay empty. |
| Z7-R17.2 | Mutable sequences now retain heap alias identity independently from variable bindings. Same-object aliases share strong definite numeric/property/destructuring writes and every mutation; a definite inert overwrite erases stale database provenance. Conditional aliases of different heaps carry a may-alias set: mutations and writes weakly retain or explicitly invalidate every possible executable position. Branch bindings merge after isolated branch evaluation, while ambiguous indices/targets invalidate positional facts instead of returning silent zero. |
| Z7-R17.3 | CommonJS locals, retained aliases, bare `exports`, and current `module.exports` now reference shared export-object maps rather than snapshots. Direct/computed writes, `Object.assign` (including assignment-return form), and static `Object.defineProperty` value/getter descriptors mutate the shared object. Bare rebinding detaches correctly; chained rebinding restores identity; replacing `module.exports` leaves old aliases inert. Explicit `__esModule` default/named/namespace consumers resolve through the existing cycle-safe module graph, while dynamic keys/descriptors remain explicit ambiguity. |

### Round sixteen

| Finding | Disposition and evidence |
|---|---|
| Z7-R16.1 | Every finite sequence mutation now transfers or invalidates positional state coherently. `push`, `pop`, `shift`, `unshift`, `splice`, `reverse`, `fill`, and `copyWithin` implement JavaScript return values, chaining, omitted/positive/negative/extreme bound normalization, insertion/deletion, overlapping copies, aliases, computed/destructured/bound methods, repeated mixtures, and same-object aliases. `sort` and unresolved bounds/orders erase all tuple/numeric/length facts and retain executable uncertainty, so stale properties cannot outrank fail-closed state. Per-call post-state caching prevents duplicate evaluation while allowing a changed or different sequence target to be evaluated again. |
| Z7-R16.2 | The cycle-bounded module graph now carries explicit CommonJS module-object state: `exports` begins aliased to `module.exports`, bare rebinding detaches it, chained rebinding restores identity, and property/object/spread/`Object.assign`/whole-`require` writes update the correct object. Constant computed keys, object shorthand and inert siblings, default/namespace/computed/destructured consumers, `export * as` namespaces, barrels, CommonJS/ESM interop, dynamic keys/getters, and circular graphs are classified without receiver-name exceptions. Static Supabase capability resolves exactly; dynamic export domains remain explicit unsupported. |

### Round fifteen

| Finding | Disposition and evidence |
|---|---|
| Z7-R15.1 | Finite sequences are now abstract values independent of array-literal syntax. `Array.of`, `new Array` item/length overloads, `Array.from`, literal spread, finite concat, rest, push/splice, and numeric reads/writes preserve coherent tuple, aggregate-element, numeric-property, and length facts. Direct/aliased/computed/destructured constructors and nested declaration/assignment/parameter/return/closure flows retain callable, receiver, target, and ambiguity provenance. Unsupported executable transforms produce stable explicit uncertainty rather than disappearing. |
| Z7-R15.2 | Module provenance is now a cycle-bounded graph across ESM imports/exports, named/default/namespace aliases, explicit and star re-exports, multi-hop barrels, relative file/index resolution, wrapper/hook returns, CommonJS require/destructuring/member/interop forms, and CommonJS exports. Proven Node built-ins stay inert, Supabase factories/hooks/wrappers remain database-capable, and unresolved external or circular names remain fail-closed. The real `frontend-auth-utils` re-export is discovered while CommonJS `Readable.from` is inert. |

### Round fourteen

| Finding | Disposition and evidence |
|---|---|
| Z7-R14.1 | Array and tuple abstract values retain ordered elements independently from object properties. Recursive declaration, assignment, parameter, and return binding propagates callable, receiver, argument-tuple, and database provenance through nested array/object patterns, holes, defaults, rests, spreads, and computed/numeric selection. Recoverable positional calls count once; uncertain database-capable positions emit stable unsupported evidence instead of disappearing. |
| Z7-R14.2 | Adapter recurrence is keyed by the complete semantic evaluation state—adapter kind, target, receiver, current/bound arguments, positional tuples, and phase/depth fingerprint—rather than raw `AbstractValue` identity. Finite repeated intrinsic reuse converges and counts once; the evaluator retains depth/work budgets and stable explicit unsupported results for true recursion. |
| Z7-R14.3 | Import bindings retain module provenance. Node built-ins are proven non-database and remain inert through named, namespace, default, destructured, computed, and aliased access; proven Supabase clients and local wrappers returned from Supabase factories remain discoverable; ambiguous external ledger receivers fail explicitly. The production census remains unchanged. |

### Round thirteen

| Finding | Disposition and evidence |
|---|---|
| Z7-R13.1 | `Function.prototype.call`, `.apply`, and `.bind` are now first-class composable callable values. Their target identity, bound receiver, positional tuple arguments, spread arguments, aliases, computed/destructured access, and nested adapter layout flow through one bounded evaluator rather than syntax-specific probe branches. The mutation matrix covers all four reviewer examples plus direct, aliased, computed, destructured, `bind.call`, `bind.apply`, bound intrinsic receivers, and two multi-level `call`/`apply` compositions; each recoverable form yields exactly one ledger call. External/dynamic compositions produce deterministic unsupported results, adapter conflicts remain fail closed, cyclic property graphs terminate stably, inert functions and ordinary non-Supabase `.from` values remain empty, and the exact production census is unchanged. |

### Round twelve

| Finding | Disposition and evidence |
|---|---|
| Z7-R12.1 | Additive migration `20260813121000_retire_exec_sql.sql` revokes `EXECUTE` on immutable `public.exec_sql(text)` from `PUBLIC`, `anon`, `authenticated`, and `service_role`, and removes exposed-role mutation authority over its audit table while preserving required reads. `pages/api/admin/apply-supervisor-migration.ts` retains method/auth/admin validation but is now a deterministic non-mutating 410 response with no service client, RPC, or SQL. The executable census proves zero production `exec_sql` callers. Real pgTAP temporarily restores the old function grant inside a rollback-only scope: anon, authenticated-admin, and service-role calls change one synthetic ledger row from 1 to 4 hours and its bucket while producing zero override/audit events; after revocation all three receive SQLSTATE `42501` with byte-stable financial/audit state. Fixed owner RPC and legitimate ledger writers remain green in the inherited suites. |
| Z7-R12.2 | TypeScript discovery resolves direct, aliased, computed, and destructured `Reflect.apply`; `Function.prototype.call.call`; concise-arrow identities and returned closures; bound callbacks through `forEach`; and object/class/external higher-order boundaries. Callable/argument unions, fingerprints, fixed-point traversal, and recursion guards are cycle-safe and deterministic. Every unresolved database-capable form fails explicitly, while executable mutations retain stale safe literals and redirect the live callable/value through each adapter. |
| Z7-R12.3 | SQL discovery preserves schema qualification across CTE scopes, so an unqualified CTE cannot shadow `public.contract_hours_ledger`. It accounts or rejects procedures, `RETURNS TABLE`/composite/plain-variable declarations, `CREATE OR REPLACE TRIGGER`, views/rules, numbered/custom dollar tags, and qualified/unqualified correlated scopes while keeping comments and inert literals inert. PL/pgSQL `EXECUTE` has no filename or substring allowance: statically recoverable SQL is recursively analyzed and every unresolved runtime domain contributes potential ledger authority plus an explicit unsupported result. The current exact census is **9 files/33 expressions**, **8 files/13 objects**, and **4 files/5 unresolved executable sites**. |

### Round eleven

| Finding | Disposition and evidence |
|---|---|
| Z7-R11.1 | Additive migration `20260813120900_ledger_update_privileges.sql` revokes table-level and every current column-level ledger UPDATE from `PUBLIC`, `anon`, `authenticated`, and `service_role`, then regrants authenticated/service only the mechanically derived seven-column lifecycle union: `status`, `cancellation_clause`, `cancellation_reason`, `admin_override`, `admin_override_reason`, `updated_at`, and `updated_by`. The executable source guard inventories exactly four production update shapes across two paths and fails on dynamic/spread keys or drift. pgTAP proves authenticated-admin and service-role denials for all twelve excluded columns, including `hours`, `effective_minutes`, allocation/session identity, dates, flags, recorder fields, notes, and planned snapshot; completion, cancellation, compensation, and manual-status writers execute through their real shapes. The owner override RPC remains the only effective-minute writer and its audit/concurrency chain is unchanged. |
| Z7-R11.2 | TypeScript discovery resolves direct and aliased `.call`/`.apply`, `Reflect.apply`, and `.bind`, carrying bound/spread arguments and callable values through parameters, returns, closures, forward calls, and recursive higher-order cycles. Unresolved/external adapters and targets are explicit unsupported results; ordinary non-database call/apply sites remain inert. Executable mutations redirect each adapter and higher-order form to ledger-backed calls while retaining stale safe literals, and deterministic fixed-point/cycle guards terminate. |
| Z7-R11.3 | SQL discovery distinguishes inert string/comment contents from PL/pgSQL `EXECUTE`, recursively analyzes statically recoverable quoted concatenation, dollar-quoted SQL, and literal `format(...)`, and fails closed on unresolved executable targets. At the Round 11 checkpoint the immutable baseline `exec_sql` was conservatively classified with six production callers; Round 12 retains the potential-authority object while retiring every caller and exposed-role grant. Composite parameters/returns, `%ROWTYPE`, casts, trigger functions/targets/transition tables, rules, ordinary/materialized views, quoted/dollar-quoted bodies, CTE shadowing, LATERAL, and correlated aliases remain represented or explicitly rejected. |

### Round ten

| Finding | Disposition and evidence |
|---|---|
| Z7-R10.1 | Additive migration `20260813120800_ledger_insert_override_sequence_privileges.sql` revokes table-level ledger INSERT from every exposed role and grants authenticated/service only the mechanically audited ten-column union used by reservation and manual-entry production writers. `effective_minutes`, cancellation/update fields, and audit columns are excluded; UUID/time defaults and `RETURNING` remain functional. The executable TS inventory independently proves exactly two production INSERT shapes. pgTAP proves authenticated admin and service injection fail with zero injected rows/events, both real writer shapes succeed, and no default, identity, generated column, or BEFORE trigger can populate the override. |
| Z7-R10.2 | The migration revokes every privilege on both Z7 identity sequences—the override ordering sequence and report-batch sequence—from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Catalog tests prove USAGE/SELECT/UPDATE are false; real `nextval`, sequence read, and `setval` probes fail before mutation. The 94-assertion owner RPC chain and real concurrency proof preserve monotonic apply/reverse/replay and deterministic conflict behavior. |
| Z7-R10.3 | The TypeScript analyzer now converges function-input values to a fixed point across direct/mutual recursion and calls before definition, with deterministic cycle bounds. It propagates spread/rest/default parameters and object spreads, models `Object.assign` and `splice`, and conservatively marks representative unmodeled object/array mutations external. Executable probes retain stale safe literals while requiring ledger discovery or explicit unsupported results; every prior TS/TSX/JS/JSX dataflow case remains green. |
| Z7-R10.4 | The SQL walker counts bare composite aliases, qualified composites, function consumers such as `row_to_json(alias)`, and `RETURNING alias`. Every ledger INSERT/UPDATE/DELETE without an hours token contributes a write touch; ledger MERGE remains explicit unsupported. The Round 10 checkpoint was **28** raw-SQL expressions, up from 27 because the audited override RPC's column-opaque ledger UPDATE became represented; Round 12 supersedes that census with 33. Nested/correlated/shadowed/CTE/view/function/transitive/star/comment/literal tests remain green. |

### Round nine

| Finding | Disposition and evidence |
|---|---|
| Z7-R9.1 | Additive migration `20260813120700_attendance_rpc_write_boundaries.sql` revokes direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` on attendance and observations from `PUBLIC`, `anon`, `authenticated`, and `service_role`, while preserving required reads and RLS. The owner-executed occurrence join/leave RPCs retain fixed empty `search_path` and are the only exposed-role writers. Catalog/role pgTAP proves every direct mutation is denied, the obsolete leave signature remains non-executable, and pre-start null claims, matching occurrences, surface/session/school matching, tenant isolation, and lifecycle writes remain green. Real two-connection evidence gives one winner for competing occurrence UUIDs; the loser returns `occurrence_mismatch`, inserts/closes no interval, and inserts no observation. |
| Z7-R9.2 | The same migration adds owner-executed `create_attendance_report_batch`, validates meeting/surface/school/occurrence identity, and always creates `pending`; it replaces rejection/promotion with owner-definer fixed-empty-search-path definitions before revoking every direct batch mutation. Promotion alone inserts the exact validated attendance rows and completes atomically. Production `attendance-report-store` now calls the creation RPC. pgTAP covers direct pending/complete forgery denial, exact creation, mismatch, empty promotion, rejection/replay, terminality, and all exposed roles. A real concurrent promotion produces one `promoted` and one `batch_not_pending`, with one exact authoritative result. |
| Z7-R9.3 | Source discovery now propagates callable and target abstract values through object properties/elements, callable parameters, conditional expressions, destructuring assignments, alias chains, reassignment/property mutation, arrays/`push`, and loop bindings under lexical scope. Unresolved external forms are explicit unsupported results. Mutation probes keep stale safe literals present while redirecting the live binding to a ledger table/backed RPC or external value; every TS/TSX/JS/JSX probe changes the exact map or fails closed rather than returning empty. |
| Z7-R9.4 | The SQL token/scope walker now propagates correlated outer ledger aliases, respects nested alias shadowing, counts `*`, `alias.*`, and DML `RETURNING *`, and discovers every INSERT/UPDATE/DELETE relation while failing closed for ledger-relevant `MERGE ... USING` ambiguity. Mutation coverage includes nested/derived/CTE/function/view/transitive forms, quoted identifiers, tuple writes, multiple statements, comments/literals, whole-row reads/returns, arbitrary aliases, correlated subqueries, and DML relations. At the Round 9 checkpoint the census was 14/22, 8/10, 7/27, and 8/11; Round 10 supersedes the SQL-expression component with 7/28 by accounting for column-opaque DML. |

### Round eight

| Finding | Disposition and evidence |
|---|---|
| Z7-R8.1 | Application fallback now accepts a meeting-number row only while its occurrence UUID is null or equal to the incoming UUID. Additive migration `20260813120600_participant_occurrence_authority.sql` makes both production writes owner-executed RPCs that atomically claim a null UUID or match the established UUID on exact surface/type/school before any interval, observation, or close. The obsolete leave signature is revoked. Real pgTAP forces a stale null lookup followed by another established UUID: mismatched join/leave return `occurrence_mismatch`, create no rows, close nothing, and leave the meeting byte-identical. Matching and pre-start null fallback remain green, as do fill-only lifecycle and tenant/RLS controls. |
| Z7-R8.2 | Source discovery now models callable values through lexical scopes. It resolves direct property/element extraction and constant/computed/quoted destructuring for `from` and `rpc`, including generic calls, nested blocks, and aliases. Shadowed or unresolved computed aliases cannot inherit an outer method and are explicitly unsupported when they remain method candidates. The same parser runs over mechanically discovered TS/TSX/JS/JSX production roots. |
| Z7-R8.3 | Dynamic classification is derived from the live call argument rather than a same-named declaration. Abstract values trace arrays, conditionals, object properties, element access, loop bindings, aliases, and conservative reassignment/parameter/external sources. Every resolved branch is checked against the exact finite allowance; ledger tables and ledger-backed RPCs are surfaced even when only one branch contains them. Mutations retain old unused literals while redirecting the live value to `process.argv`, reassignment, parameter, or shadowed bindings and make the guard red. |
| Z7-R8.4 | The raw-hours inventory introduced a PostgreSQL-aware token/scope walker: nested comments and string/dollar literals are removed, quoted identifiers preserved, parentheses/scopes paired, and direct/derived/nested/CTE relations propagated. It handles unqualified/qualified/quoted reads, arbitrary and derived aliases, quoted/tuple updates, multiple statements, and function/view transitive dependencies. Ledger-relevant `MERGE`/unsupported DML throws instead of silently counting zero, including when independently analyzing an extracted function body. Its Round 8 checkpoint was 27 expressions; the current superseding census is below. |

### Round seven

| Finding | Disposition and evidence |
|---|---|
| Z7-R7.1 | Additive migration `20260813120400_override_audit_write_privileges.sql` revokes `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` on `session_hour_overrides` from `PUBLIC`, `anon`, `authenticated`, and `service_role`, while preserving the required reads. The owner-executed `SECURITY DEFINER` apply/reverse RPCs remain the only writers. pgTAP uses real exposed roles to prove direct poisoning and every other mutation fail; the same request ID is then applied by an authenticated admin, mutates the ledger once, and creates exactly one actor-bound event. Apply/reverse, lifecycle writes, replay, conflict, and real concurrency remain green. |
| Z7-R7.2 | Additive identical-signature migration `20260813120500_reschedule_tracking_pair_guard.sql` replaces the R6 reschedule definition without rewriting history. `no_ledger_entry` is reachable only when both tracking columns are null; fully tracked sessions and either XOR shape raise before direct or wrapper commit when no ledger row exists. pgTAP and both API paths compare byte-identical session, ledger, and revision state. Both-null legacy, date-only, valid under-budget, and coherent over-budget paths remain green. |
| Z7-R7.3 | Round seven removed the receiver-name dependency and added exact finite lists, but independent review found callable-alias and live-binding gaps. Round eight supersedes that implementation/evidence claim with lexical callable values and runtime argument dataflow; only the current executable census below should be used. |
| Z7-R7.4 | Round seven added unqualified reads but remained regex-limited for derived aliases and quoted writes. Round eight supersedes it with the PostgreSQL-aware token/scope walker and recomputed exact census below. |

### Round six

| Finding | Disposition and evidence |
|---|---|
| Z7-R6.1 | `effective_minutes` is no longer directly updateable by either `authenticated` or `service_role`. The additive migration revokes table-wide update and dynamically grants only the other live columns; audited apply/reverse remain `SECURITY DEFINER`, atomic, and green. pgTAP and real-role probes prove direct updates fail while ordinary lifecycle writes and one-row audit insertion still work. |
| Z7-R6.2 | Attendance report batches reject every `DELETE`, including pending, complete, and rejected rows, with stable SQLSTATE `P0409`. The same trigger retains only `pending -> complete | rejected`, and an authoritative zero-participant complete report remains valid. pgTAP verifies all terminal branches and referential rows remain intact. |
| Z7-R6.3 | Availability requires exactly one coherent bucket: unique nonempty identity, finite values, range and two-decimal constraints, and exact `allocated - reserved - consumed = available` arithmetic in integer hundredths. Empty is a typed legitimate direct-lookup result; approval after a proven allocation treats missing as inconsistent. Every invalid shape returns generic 500 before ledger/session mutation in single and bulk paths. A coherent negative balance remains valid and over budget. |
| Z7-R6.4 | New additive migration `20260813120300_reschedule_availability_guard.sql` replaces `reschedule_session_hours(uuid, uuid)` with the identical signature. Duration-changing tracked reschedules raise before any session, ledger, or revision write on missing, duplicate, malformed, or incoherent buckets. Date-only changes and genuinely untracked legacy sessions retain their prior behavior. API regressions and pgTAP check both wrapper paths and the real active SQL fingerprint; the historical applied migration was not edited. |
| Z7-R6.5 | Bulk shared balances are integer hundredths end-to-end. A 0.60 balance accepts exactly three ordered 0.20 reservations and marks only the fourth over budget; a fail-on-old binary-float mutation marks the third incorrectly and makes the regression red. |
| Z7-R6.6 | The contract/type pair is now a single invariant: both null is the only legacy form, or both values must be valid. XOR and malformed values fail creation with 400 and fail single/bulk approval before any ledger, facilitator, Zoom, or session mutation. |
| Z7-R6.7 | Round six introduced AST/exact-map discovery, but its receiver dependence, scope resolution, JavaScript-root, and unqualified SQL gaps were later found by independent review. Round seven supersedes that implementation and its evidence claim with the conservative source and SQL guard, finite allowlists, mutation probes, and exact current census below. |
| Z7-R6.8 | This artifact derives its cumulative inventory mechanically from immutable base `4399949942bfcf49dfa8de40cbf7edbf40f0490e`, records only stable predecessor SHAs, and delegates the evidence commit and post-cherry-pick canonical identities to the handoff/dispatch. Current gate, path, migration, assertion, and consumer counts below supersede the older round-specific counts. `PROJECT_STATE.md` now identifies Round 6 as implemented and pending independent review, never accepted/deployed. |

### Round five

| Finding | Disposition and evidence |
|---|---|
| Z7-R5.1 | Availability now has a discriminated `available | missing` result and throws on RPC/shape/numeric dependency failures. A successful empty summary is legitimate for a direct lookup; approval first proves a matching allocation exists, so a missing summary bucket at that boundary is contradictory and fails closed. Single approval returns generic 500 before session mutation. Bulk approval preflights every session before the first ledger insert, so a later outage cannot partially reserve or approve earlier items; it then debits the shared preflight balance in source order so later same-allocation rows retain sequential over-budget semantics. Route regressions cover single/bulk outage, valid under/over-budget reservations, shared-balance ordering, and a legacy untracked session as the defined approval-without-ledger case. |
| Z7-R5.2 | Round five expanded the inventory to production roots, direct table touches, SQL functions/views, and indirect calls. Round six supersedes its incomplete SQL syntax census with the exact AST/SQL maps below, including newly introduced roots and conservative unsupported-dynamic handling. |
| Z7-R5.3 | `PROJECT_STATE.md` now routes reviewers to Round 5 and states `REVIEW READY` pending another cumulative independent verdict. It explicitly preserves not accepted, not merged, not deployed, local-only migrations, and not production-verified. |
| Z7-R5.4 | Reconcile comments now describe two global hourly jobs plus per-occurrence attendance candidates/dedupe. Webhook comments accurately describe meeting lifecycle/projection handling, provisional joined/left attendance, ledger-only events, and the no-job-enqueue boundary. Existing cron/webhook suites remain green. |

### Round four

| Finding | Disposition and evidence |
|---|---|
| Z7-R4.1 | Both the live adapter and pure reconciliation now require finite integers; `1 <= page_size <= 100`; nonnegative `page_count`/`total_records`; `page_count = 0` only for the valid zero-record envelope and otherwise `ceil(total_records/page_size)`; stable metadata across pages; exact fetched-page and participant counts; per-page cardinality; and a nonempty token until the declared terminal page followed by an empty token. Invalid numeric metadata maps to `invalid_pagination_metadata`; coherent-number contradictions map to `contradictory_pagination_metadata`, `page_count_mismatch`, or `participant_count_mismatch`. Job regressions prove exactly one rejection, zero promotion, and preservation of an earlier complete batch. Valid 230-row multipage and zero-participant envelopes remain green. |
| Z7-R4.2 | The JSON ledger endpoint resolves `session_facilitators` before constructing the ledger query. An errored scope lookup returns a generic 500 and never runs or returns the ledger; a successful zero-row lookup returns 200 empty; successful nonempty scope remains constrained by the facilitated session IDs. Three route tests exercise all branches. |
| Z7-R4.3 | Round four introduced the direct-use audit, but its first census was incomplete/overcounted. Rounds five and six replaced it with the exact direct-and-transitive executable census below; only that current census should be used for review. |
| Z7-R4.4 | The report-batch migration now documents the lifecycle as the two terminal branches `pending -> complete | rejected`; SQL constraints/RPCs and pgTAP continue to enforce that neither terminal state can transition or be rewritten. The mechanically regenerated cumulative inventory below supersedes the earlier round-four boundary inventory. |

### Earlier rounds retained cumulatively

- R1 active financial calculations all use the effective-minute derivation; deliberate raw-hours
  admin displays remain historical evidence. Lifecycle/report mutations are
  database-atomic, comparison dependencies fail closed, retryable report candidates resolve, and
  override request IDs serialize at PostgreSQL.
- R2 occurrence UUIDs fill only while missing; report batches resolve once; canonical override
  payload equality is database-derived; pagination tokens are bounded; financial lookups fail
  closed; comparison paths are mutation-sensitive and billing-isolated; override inputs validate
  UUID/integer bounds; and page-cap candidates reject once.
- The round-three participant guard closes the last reviewed path that could bypass terminal batch
  resolution after a syntactically valid but runtime-malformed Zoom response.
- Round four closes numeric/range/cross-field pagination integrity, the JSON ledger's facilitator
  lookup, and the misleading linear lifecycle comment. Round five closes availability failures
  before financial/approval mutation and expands the direct/transitive production-consumer
  inventory. Round six makes that inventory syntax/root conservative, enforces exact coherent
  availability and contract/type pairs, protects override/report state at the database boundary,
  and installs the additive reschedule replacement. Round seven makes the override event table
  RPC-writer-only even for `service_role`, closes tracked/XOR no-ledger reschedules in a new
  replacement, and supersedes the source/SQL guard. Round eight atomically binds every participant
  write to its exact surface occurrence and replaces the remaining callable/dataflow/SQL discovery
  gaps with the conservative executable census below. Round nine removes the remaining direct
  attendance/observation/batch interfaces, routes all legitimate report-batch state through
  owner-definer RPCs, and extends discovery across live object/parameter/mutation/loop flows plus
  whole-row, correlated, and DML SQL forms. Round ten excludes `effective_minutes` from exposed-role
  INSERT, makes both Z7 identity sequences owner-only, converges recursive/spread/rest/mutation
  source analysis, and accounts for composite rows plus every ledger DML relation. Round eleven
  closes alternate ledger UPDATE assignments and executable callable/dynamic-SQL boundaries.
  Round twelve retires the remaining exposed arbitrary-SQL function and its production endpoint,
  makes callable analysis cycle-safe across the remaining adapter/HOF forms, and preserves schema
  qualification while failing closed on every unresolved executable SQL domain. Round thirteen
  closes the neighboring nested `Function.prototype` family with one composable intrinsic
  evaluator and exact receiver/positional-argument propagation.

## Production `contract_hours_ledger.hours` direct-and-transitive inventory

The executable guard treats every production table touch as reviewable, including status-only and
write exceptions; this prevents a future raw-hours reader from hiding in a query that was assumed
irrelevant. Classifications below are in source order when a file touches the table more than once.

| Production TypeScript path | Touches | Classification and justification |
|---|---:|---|
| `components/workspace/WorkspaceSessionsTab.tsx` | 1 | `status-only`: reads ledger status to decorate session rows; no hours number enters a calculation. |
| `lib/services/hour-tracking.ts` | 6 | `write`, `status-only`, `write`, `status-only`, `write`, `write`: reservation/cancellation lifecycle persistence; no reporting calculation reads raw hours. |
| `lib/services/school-hours-report.ts` | 1 | `billable`: selects `hours` + `effective_minutes` and calls `billableHours` for the school drill-down. |
| `pages/admin/sessions/index.tsx` | 1 | `status-only`: presence/status decoration, no hours number. |
| `pages/api/admin/consultant-rates/[id].ts` | 2 | `status-only`, `status-only`: guards rate mutation/deletion against ledger existence/status. |
| `pages/api/admin/sessions/[id]/hours-comparison.ts` | 1 | `historical`: admin comparison exposes raw planned ledger hours beside effective minutes; it does not bill or pay. |
| `pages/api/consultant-earnings/[consultant_id].ts` | 1 | `billable`: earnings breakdown uses `billableHours`; Zoom observations never enter the input. |
| `pages/api/contracts/[id]/hours/allocate.ts` | 1 | `status-only`: allocation safety check only. |
| `pages/api/contracts/[id]/hours/ledger/[ledgerId].ts` | 2 | `status-only`, `write`: row lookup and administrative mutation. |
| `pages/api/contracts/[id]/hours/ledger/csv.ts` | 1 | `billable`: export uses `billableHours`. |
| `pages/api/contracts/[id]/hours/ledger/index.ts` | 2 | `historical`, `write`: raw administrative ledger listing and manual-entry creation; it is not an aggregate/payment calculation. Consultant scope now fails closed before the historical read. |
| `pages/api/sessions/[id]/approve.ts` | 1 | `write`: approval creates the reservation row. |
| `pages/api/sessions/reports/analytics.ts` | 1 | `aggregate`: hours KPI uses `billableHours(..., 'charged_total')`. |
| `pages/consultor/sessions/index.tsx` | 1 | `status-only`: ledger status only. |

The same AST walk separately inventories ledger INSERT object literals. Exactly two production
shapes exist: reservation in `lib/services/hour-tracking.ts` and manual entry in
`pages/api/contracts/[id]/hours/ledger/index.ts`. Their union is exactly `allocation_id`,
`session_id`, `hours`, `status`, `session_date`, `recorded_by`, `is_over_budget`, `is_manual`,
`planned_minutes_snapshot`, and `notes`. Migration `20260813120800` grants only that union to
authenticated/service roles. `effective_minutes`, cancellation/update/audit columns, dynamic
keys/spreads, and unexplained writers are absent; any new or unsupported INSERT shape makes the
guard red.

The same AST walk inventories UPDATE object literals. Exactly four production shapes exist across
`lib/services/hour-tracking.ts` (completion, cancellation, compensation) and
`pages/api/contracts/[id]/hours/ledger/[ledgerId].ts` (manual lifecycle status). Their union is
exactly `status`, `cancellation_clause`, `cancellation_reason`, `admin_override`,
`admin_override_reason`, `updated_at`, and `updated_by`. Migration `20260813120900` revokes table
and all current per-column UPDATE ACLs before granting only that union. `hours`,
`effective_minutes`, allocation/session identity, dates, manual/over-budget flags, recorder fields,
notes, and the planned snapshot remain excluded. Dynamic/spread keys or a new writer fail the
source-to-grant guard.

Indirect calls are discovered from the SQL dependency graph rather than a hand-written RPC-name
regex. `fail-closed` means an error cannot authorize a write or return an incomplete authoritative
financial result; `non-authoritative` means the value cannot authorize or settle a financial write.

| Production TypeScript path | Calls | Classification and authority |
|---|---:|---|
| `lib/services/hour-tracking.ts` | 2 | `get_bucket_summary`: write precondition, fail closed; `apply_session_reschedule`: write, fail closed. |
| `lib/services/school-hours-report.ts` | 1 | `get_bucket_summary`: aggregate, fail closed. |
| `pages/admin/sessions/create.tsx` | 1 | `get_bucket_summary`: financial preview, non-authoritative. |
| `pages/api/admin/sessions/[id]/hour-override.ts` | 1 | `apply_session_hour_override`: authenticated admin database write, fail closed. |
| `pages/api/consultant-earnings/[consultant_id].ts` | 1 | `get_consultant_earnings`: billable, fail closed. |
| `pages/api/consultant-earnings/[consultant_id]/pdf.ts` | 1 | `get_consultant_earnings`: billable, fail closed. |
| `pages/api/contracts/[id]/hours/index.ts` | 1 | `get_bucket_summary`: aggregate, fail closed. |
| `pages/api/contracts/[id]/hours/reallocate.ts` | 2 | First `get_bucket_summary`: write precondition, fail closed; second: post-write display, non-authoritative. |

The source scan reports unsupported dynamic callables and targets instead of silently skipping them.
It carries callable/target values through properties, elements, parameters, conditionals,
destructuring assignments, alias/reassignment chains, object/array mutation, and loop bindings;
its finite classifications come from each live call argument's resolved lexical branches rather
than from an unrelated or stale declaration with the same name.
Its complete current allowlist is: `lib/propuestas/scripts/seed-db.ts` (five proposal seed tables),
`lib/zoom/attendance-store.ts` (`meeting_attendees` or `session_attendees`),
`utils/meetingUtils.ts` (`meeting_commitments` or `meeting_tasks`), and `hooks/useUrlState.ts`
(`push` or `replace` on the Next router). None can resolve to a financial table or database
callable. Every exact finite value set has an executable ledger-value mutation; any new dynamic
callable/target or changed literal makes the guard red until classified.

| Production SQL migration path | Expressions | Classification and justification |
|---|---:|---|
| `supabase/migrations/00000000000000_baseline.sql` | 8 | `historical` x6 plus two conservative `write` authorities: immutable baseline billing definitions, retired `exec_sql`, and the runtime-column assignment migration helper. |
| `supabase/migrations/20260803170000_add_email_marketing_tables.sql` | 1 | `write`: conservatively counted unresolved dynamic policy-table authority; its runtime domain is explicitly unsupported until statically closed. |
| `supabase/migrations/20260805120000_reschedule_hours_rpc.sql` | 5 | `historical` x5: first reschedule definition, superseded by later identical-signature replacements. |
| `supabase/migrations/20260808120000_session_reschedule_atomic.sql` | 1 | `write`: unresolved runtime update shape is counted conservatively and explicitly unsupported; the active wrapper remains fail closed. |
| `supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql` | 2 | `historical` x2: intermediate bucket aggregate, superseded by the Z7 override-aware definition. |
| `supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql` | 3 | `historical`, `historical`, `write`: superseded duration/bucket reads and its ledger update; it is retained as immutable migration history. |
| `supabase/migrations/20260813120200_session_hour_overrides.sql` | 7 | `write`, `aggregate`, `aggregate`, `billable`, `billable`, `billable`, `write`: the audited owner RPC's ledger update is represented even when a branch does not spell `hours`; active school reserved/consumed aggregates and consultant-payment branches use `COALESCE(round(effective_minutes / 60, 2), hours)`. Comments are stripped before counting. |
| `supabase/migrations/20260813120300_reschedule_availability_guard.sql` | 3 | `historical`, `write`, `historical`: superseded R6 reschedule read/write/self-fallback retained as immutable migration history. |
| `supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql` | 3 | `historical`, `write`, `historical`: active reschedule reads planned ledger hours and writes its replacement with the prior value as the date-only fallback; none is post-session Zoom billing. |

The recursive SQL-object census is separately exact because a function or view can hide a ledger
dependency without spelling the table name at its TypeScript call site.

| Migration | Ledger-backed definitions | Classification and dependency |
|---|---:|---|
| `00000000000000_baseline.sql` | 4 | Retired potential-dynamic `exec_sql`, potential-dynamic `migrate_assignments_to_enrollments`, and historical direct definitions of `get_bucket_summary` and `get_consultant_earnings`. |
| `20260805120000_reschedule_hours_rpc.sql` | 1 | Historical direct `reschedule_session_hours`. |
| `20260808120000_session_reschedule_atomic.sql` | 1 | Write/fail-closed `apply_session_reschedule`, transitively ledger-backed. |
| `20260809120000_fix_bucket_summary_fanout.sql` | 1 | Historical direct `get_bucket_summary`. |
| `20260809120100_reschedule_rpc_uses_bucket_summary.sql` | 1 | Write/fail-closed direct `reschedule_session_hours`. |
| `20260813120200_session_hour_overrides.sql` | 3 | Direct `apply_session_hour_override` write/fail-closed, `get_bucket_summary` aggregate, and `get_consultant_earnings` billable definitions. |
| `20260813120300_reschedule_availability_guard.sql` | 1 | Superseded write/fail-closed direct `reschedule_session_hours` replacement. |
| `20260813120500_reschedule_tracking_pair_guard.sql` | 1 | Active write/fail-closed direct `reschedule_session_hours` replacement. |

The only active financial formulas are the shared TypeScript `billableHours` derivation and the SQL
coalesce twin above. Raw admin ledger/comparison reads are intentional historical evidence, writes
are lifecycle operations, and status-only queries do not calculate a monetary or consumption value.
The executable maps therefore cover 14 direct production source files/22 touches, 8 indirect
production source files/10 calls, 9 SQL files/33 direct ledger expressions/writes, and 8 migration
files/13 ledger-backed definitions, with zero unexplained uses. Whole-row reads/returns, correlated
outer aliases, alias shadowing, and every recognized DML relation either enter those exact maps or
fail explicitly. The retired baseline `exec_sql` remains represented as potential authority, but
Round 12 removes all production callers and revokes every exposed-role invocation. The four files
containing five unresolved executable sites are explicitly classified; the column-opaque override
UPDATE remains represented and no production consumer is silently omitted.

## Mechanically complete cumulative file inventory

The following inventory has exactly one entry for every path changed from the immutable base.
Risk grouping describes review priority, not ownership.

<!-- CUMULATIVE_INVENTORY_START -->

### Highest risk — schema, RLS, database state machines, and concurrency

- `scripts/ci/override-concurrency-proof.mjs`
- `scripts/ci/attendance-authority-concurrency-proof.mjs`
- `supabase/migrations/20260811130000_zoom_attendance.sql`
- `supabase/migrations/20260811130100_zoom_meeting_actual_instants.sql`
- `supabase/migrations/20260812120000_zoom_attendance_participant_uuid.sql`
- `supabase/migrations/20260813120000_zoom_attendance_observations.sql`
- `supabase/migrations/20260813120100_zoom_attendance_report_batches.sql`
- `supabase/migrations/20260813120200_session_hour_overrides.sql`
- `supabase/migrations/20260813120300_reschedule_availability_guard.sql`
- `supabase/migrations/20260813120400_override_audit_write_privileges.sql`
- `supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql`
- `supabase/migrations/20260813120600_participant_occurrence_authority.sql`
- `supabase/migrations/20260813120700_attendance_rpc_write_boundaries.sql`
- `supabase/migrations/20260813120800_ledger_insert_override_sequence_privileges.sql`
- `supabase/migrations/20260813120900_ledger_update_privileges.sql`
- `supabase/migrations/20260813121000_retire_exec_sql.sql`
- `supabase/tests/002-zoom-internal-isolation.sql`
- `supabase/tests/011-zoom-public-rls.sql`
- `supabase/tests/013-session-reschedule-atomic.sql`
- `supabase/tests/015-session-hour-overrides.sql`
- `supabase/tests/016-attendance-write-boundaries.sql`
- `supabase/tests/017-ledger-insert-sequence-boundaries.sql`
- `supabase/tests/018-ledger-update-boundaries.sql`
- `supabase/tests/019-exec-sql-retirement.sql`

### Highest risk — Zoom ingestion, report authority, and lifecycle runtime

- `lib/zoom/api.ts`
- `lib/zoom/attendance-effective.ts`
- `lib/zoom/attendance-identity.ts`
- `lib/zoom/attendance-intervals.ts`
- `lib/zoom/attendance-report-store.ts`
- `lib/zoom/attendance-report.ts`
- `lib/zoom/attendance-store.ts`
- `lib/zoom/fake.ts`
- `lib/zoom/jobs/attendance-reconcile.ts`
- `lib/zoom/jobs/registry.ts`
- `lib/zoom/jobs/webhook-sweep.ts`
- `lib/zoom/participant-lifecycle.ts`
- `lib/zoom/webhook-lifecycle.ts`
- `lib/zoom/webhook-store.ts`

### High risk — billing consumers, APIs, and product surfaces

- `components/sessions/AttendanceSuggestionsPanel.tsx`
- `components/sessions/HoursComparisonPanel.tsx`
- `lib/services/billable-hours.ts`
- `lib/services/hour-tracking.ts`
- `lib/services/school-hours-report.ts`
- `lib/types/consultor-sessions.types.ts`
- `lib/types/hour-tracking.types.ts`
- `pages/admin/sessions/[id].tsx`
- `pages/api/admin/apply-supervisor-migration.ts`
- `pages/api/admin/sessions/[id]/hour-override.ts`
- `pages/api/admin/sessions/[id]/hours-comparison.ts`
- `pages/api/consultant-earnings/[consultant_id].ts`
- `pages/api/contracts/[id]/hours/ledger/csv.ts`
- `pages/api/contracts/[id]/hours/ledger/index.ts`
- `pages/api/cron/zoom-reconcile.ts`
- `pages/api/sessions/[id]/approve.ts`
- `pages/api/sessions/[id]/attendance-suggestions.ts`
- `pages/api/sessions/[id]/attendees.ts`
- `pages/api/sessions/bulk-approve.ts`
- `pages/api/sessions/index.ts`
- `pages/api/sessions/reports/analytics.ts`
- `pages/api/zoom/webhook.ts`
- `pages/consultor/sessions/[id].tsx`

### Executable regression and integration coverage

- `__tests__/api/admin/apply-supervisor-migration.test.ts`
- `__tests__/api/admin/hour-override.test.ts`
- `__tests__/api/admin/hours-comparison.test.ts`
- `__tests__/api/cron/zoom-reconcile.test.ts`
- `__tests__/api/hour-tracking/earnings-pdf.test.ts`
- `__tests__/api/hour-tracking/earnings.test.ts`
- `__tests__/api/hour-tracking/ledger-csv.test.ts`
- `__tests__/api/hour-tracking/ledger-json.test.ts`
- `__tests__/api/hour-tracking/planned-minutes-snapshot.test.ts`
- `__tests__/api/hour-tracking/reservation.test.ts`
- `__tests__/api/sessions/reschedule-hours-sync.test.ts`
- `__tests__/api/sessions/session-approval-hours-fail-closed.test.ts`
- `__tests__/api/sessions/session-approve-zoom-provision.test.ts`
- `__tests__/api/sessions/session-bulk-approve-zoom-provision.test.ts`
- `__tests__/api/sessions/session-create-facilitators.test.ts`
- `__tests__/api/sessions/attendance-suggestions.test.ts`
- `__tests__/api/sessions/attendees.test.ts`
- `__tests__/api/sessions/session-reports-analytics.test.ts`
- `__tests__/api/zoom/webhook.test.ts`
- `__tests__/components/sessions/AttendanceSuggestionsPanel.test.tsx`
- `__tests__/components/sessions/HoursComparisonPanel.test.tsx`
- `__tests__/lib/services/billable-hours.test.ts`
- `__tests__/lib/services/comparison-billing-isolation.test.ts`
- `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- `__tests__/lib/services/school-hours-report.test.ts`
- `__tests__/lib/zoom/attendance-effective.test.ts`
- `__tests__/lib/zoom/attendance-identity.test.ts`
- `__tests__/lib/zoom/attendance-intervals.test.ts`
- `__tests__/lib/zoom/attendance-report-store.test.ts`
- `__tests__/lib/zoom/attendance-report.test.ts`
- `__tests__/lib/zoom/attendance-store.test.ts`
- `__tests__/lib/zoom/fake.test.ts`
- `__tests__/lib/zoom/jobs/attendance-reconcile.test.ts`
- `__tests__/lib/zoom/jobs/webhook-sweep.test.ts`
- `__tests__/lib/zoom/participant-lifecycle.test.ts`
- `__tests__/lib/zoom/webhook-lifecycle-instants.test.ts`
- `__tests__/lib/zoom/webhook-store.test.ts`

### Governance, contracts, prompts, state, and review evidence

- `PROJECT_STATE.md`
- `docs/plan/zoom/LEDGER.md`
- `docs/plan/zoom/PLAN.md`
- `docs/plan/zoom/prompts/Z7-r1.md`
- `docs/plan/zoom/prompts/Z7-r2.md`
- `docs/plan/zoom/prompts/Z7-r5.md`
- `docs/plan/zoom/remediation/Z7-review-1.md`
- `docs/plan/zoom/remediation/Z7-review-2.md`
- `docs/plan/zoom/remediation/Z7-review-3.md`
- `docs/plan/zoom/remediation/Z7-review-4.md`
- `docs/plan/zoom/remediation/Z7-review-5.md`
- `docs/plan/zoom/remediation/Z7-review-6.md`
- `docs/plan/zoom/remediation/Z7-review-7.md`
- `docs/plan/zoom/remediation/Z7-review-8.md`
- `docs/plan/zoom/remediation/Z7-review-9.md`
- `docs/plan/zoom/remediation/Z7-review-10.md`
- `docs/plan/zoom/remediation/Z7-review-11.md`
- `docs/plan/zoom/remediation/Z7-review-12.md`
- `docs/plan/zoom/remediation/Z7-review-13.md`
- `docs/plan/zoom/remediation/Z7-review-14.md`
- `docs/plan/zoom/remediation/Z7-review-15.md`
- `docs/plan/zoom/remediation/Z7-review-16.md`
- `docs/plan/zoom/remediation/Z7-review-17.md`
- `docs/plan/zoom/remediation/Z7-review-18.md`
- `docs/plan/zoom/remediation/Z7-review-19.md`
- `docs/plan/zoom/remediation/Z7-review-20.md`
- `docs/plan/zoom/reviews/fase-7-review-request.md`
- `docs/plan/zoom/reviews/fase-7-review-verdict.md`

### Build/test configuration

- `package.json`

<!-- CUMULATIVE_INVENTORY_END -->

Mechanical proof command, run after staging this document and again after committing it:

```bash
comm -3 \
  <(git diff --name-only 4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD | sort) \
  <(sed -n '/CUMULATIVE_INVENTORY_START/,/CUMULATIVE_INVENTORY_END/p' \
      docs/plan/zoom/reviews/fase-7-review-request.md \
    | sed -n 's/^- `\(.*\)`$/\1/p' | sort)
```

Result after the evidence commit: no output. Counts: cumulative diff **127**, inventory **127**,
duplicates **0**.

## Gate and fail-on-old evidence

All database/browser runs used the local Supabase stack and synthetic fixtures. No command was
piped through `tail`.

| Command | Result | Exit |
|---|---|---:|
| Focused Round 20 runtime-oracle/receiver/descriptor/mutator/completion matrix | 1 file, **8 green** | 0 |
| Cumulative executable inventory through Round 20 | 1 file, **38 green** | 0 |
| Cumulative Z7 high-risk Vitest over every test path changed since the immutable base: reservation, snapshot, JSON ledger, single/bulk approval, creation, reschedule, override, inventory, billing/isolation, cron/webhook, report/store/reconcile, participant lifecycle, attendance store, lifecycle instants, UI and retirement guards | 37 files, **595 green** | 0 |
| `npm run type-check` | no diagnostics | 0 |
| `npm run lint` | zero warnings | 0 |
| `bash scripts/ci/check-rls-migrations.sh` | no RLS disablement | 0 |
| `TZ=America/Santiago npm test` | 324 files, **7,402 green / 11 skipped** | 0 |
| `npm run build` | production build; **156/156 static pages** | 0 |
| `node scripts/check-price-leak.mjs` after build | scanned **265** compiled static files; no commercial data found | 0 |
| Fresh local `supabase db reset` | all migrations through additive `20260813121000` replayed; repeated after Chromium to remove synthetic fixtures | 0 |
| `npm run test:db` | 16 files, **1,031 assertions green** | 0 |
| `npm run test:attendance-authority-concurrency` | two different occurrence UUID claims: one `interval_opened`, one `occurrence_mismatch`, loser 0 observations/0 closes; concurrent batch promotion: one `promoted`, one `batch_not_pending`, exact empty authority | 0 |
| `npm run test:override-concurrency` | identical race apply+replay; forged/different payloads `P0409` sequentially and concurrently; no `23505` | 0 |
| Fresh local `supabase db reset`; local-CLI URL/keys supplied to `node scripts/ci/seed-e2e.mjs`; `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **117/117 passed**, one worker | 0 |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 11 mandatory specs ran with no skips | 0 |
| `TZ=UTC npm test` | 324 files, **7,402 green / 11 skipped** | 0 |
| `TZ=Europe/Madrid npm test` | **7,394 green / 8 failed / 11 skipped** in 324 files; all 8 are inherited `lib/__tests__/businessDays.test.ts` | 1 inherited |

Round-twenty fail-on-old evidence was local/in-memory and the committed analyzer was restored
before every green gate:

- The five literal Round 20 reviewer fixtures were first executed against the unchanged rejected
  Round 19 evaluator. All **5/5 test containers failed with 10 runtime/analyzer discrepancies**:
  the explicit Reflect setter and getter receivers were two silent zero/zero misses; conversion
  atomicity retained one stale call; `Object.create`, own-descriptor inspection, and prototype
  inspection produced three missing/unsupported live results; descriptor-aware `reverse` and
  nonwritable-length `push` retained two stale calls; and exact switch selection plus a call-driven
  module throw retained two unreachable calls. The runtime oracle supplied the expected
  multiplicity and abrupt behavior in every case.
- The final checked-in Round 20 matrix is **8/8**, and the cumulative executable inventory is
  **38/38**. It composes same/distinct Reflect receivers, multi-hop accessors, receiver constraints,
  two-phase descriptor conversion and application-time partial effects, detached descriptor
  objects, create/inspection/prototype APIs, every one of the nine descriptor-aware mutators,
  static/dynamic switch selection and fallthrough, callback and module abrupt completion, caught
  and uncaught flow, aliases, explicit ambiguity, duplicate suppression, cycles, and bounded
  termination. Live authority is exact, inert/unreachable authority is empty, and unresolved
  executable authority is exactly one unsupported result.
- Five rollback-only mutations then independently made the matching literal Round 20 test red
  **1/1**: ignoring the explicit Reflect receiver, applying each `defineProperties` entry during
  descriptor conversion, dropping the `Object.create` descriptor argument, treating a
  nonwritable array `length` as writable, and bypassing exact `switch` handling. Each mutation was
  immediately restored, and the analyzer file is byte-identical to the implementation commit. An
  initial candidate that only made the exact switch discriminant unknown remained green, so it was
  discarded as ineffective and is not counted as rollback evidence; it was also restored before
  the effective switch mutation and every subsequent gate.
- The mechanically re-walked production census remains exactly **14 files/22 direct touches**,
  **8 files/10 indirect calls**, **9 files/33 SQL expressions**, **8 files/13 SQL objects**, **4
  files/5 explicit unresolved executable sites**, and zero production `exec_sql` callers.

Round-nineteen fail-on-old evidence was local/in-memory and the committed analyzer was restored
before every green gate:

- The six checked-in Round 19 tests were first executed against the unchanged rejected evaluator.
  Three test containers failed with **20 runtime/analyzer assertion discrepancies** across the
  literal reviewer sources: missing descriptor defaults, stale `Reflect` results, absent
  `defineProperties`, receiver-aware setter and prototype calls, stale post-throw frozen/sealed
  calls, caught frozen `sort` losing its live call while duplicating unsupported evidence, and all
  five supplied CommonJS descriptor/prototype/enumerability/accessor cases. Runtime executions
  supplied the expected multiplicities and throws; the rejected analyzer supplied the red side.
- The final ordinary-object matrix covers descriptor defaults and explicit flags, data/accessor
  redefinition, inherited receiver-aware getter/setter behavior, own shadow/delete, boolean versus
  throw APIs, `defineProperties` partial validation, dynamic prototypes, enumerable-own
  assign/spread, aliases, branches and cycles. Known live calls resolve once, inert paths remain
  empty, and executable uncertainty is exactly one deterministic unsupported result.
- The completion/integrity matrix carries normal/throw/return/break/continue through strict and
  non-strict assignments/deletes, nested blocks/functions/loops/modules and
  `try`/`catch`/`finally`; it covers direct/computed/length/descriptor/Reflect operations plus
  `push`, `pop`, `shift`, `unshift`, `splice`, `reverse`, `fill`, `copyWithin`, and `sort` under all
  three integrity levels, including caught/uncaught failures and deterministic partial effects.
- The CommonJS/ESM matrix uses the shared heap for descriptor flags, enumerable spread/assign,
  receiver-aware accessors, prototype inheritance/shadow/delete, retained aliases/replacement,
  abrupt module evaluation and catching consumers, namespace/default/named/destructured/computed
  consumers, mixed cycles, duplicate suppression, and termination. The exact production census
  remains **14 files/22 direct touches**, **8 files/10 indirect calls**, **9 files/33 SQL
  expressions**, **8 files/13 SQL objects**, and **4 files/5 unresolved executable SQL sites**,
  with zero production `exec_sql` callers.

Round-eighteen fail-on-old and mutation evidence was local/in-memory and the committed analyzer
was restored before every green gate:

- Before implementation, the Round 18 container against the unchanged rejected evaluator produced
  **29 red assertions across 20 unique runtime/analyzer probes** (some probes assert both exact
  count and absence of unsupported authority). It reproduced stale exact calls for definite
  `defineProperty`, `Reflect.set`, guarded delete, length, logical/compound/update writes; silent or
  unsupported live logical/descriptor writes; lost frozen-sequence identity; exact misses for
  `defineProperties`, retained nested objects, descriptor aliases, getters, and fixed prototypes;
  and the stale deleted export. Runtime semantics, not the rejected analyzer, supplied the expected
  values. The final checked-in matrix removes duplicate preliminary assertions and broadens these
  controls across every required transfer.
- Three rollback-only mutations independently made the focused selector red: restoring stale
  union-on-definite-position semantics produced **25 assertion failures**; dropping integrity state
  produced **16**; replacing recursive export flattening with the former flat snapshot produced
  **5**. Each source mutation was restored exactly, `git diff --check` remained clean, and the final
  focused selector returned green.
- The integrity matrix derives expected counts by executing the same source with a synthetic local
  client for all eight mutators under `freeze`, `seal`, and `preventExtensions` (**24 controls**),
  plus direct assignment, `Reflect.set`, `defineProperty`, deletion, and length under all three
  wrappers (**15 controls**). Exact live cases count once, exact inert cases stay empty, and unknown
  keys reject explicitly.
- The recursive export matrix covers multiple descriptors, nested retained aliases, static
  descriptor getters, own shadowing, delete revealing a fixed prototype, deletion/replacement,
  whole-module forwarding, default/namespace/destructured/computed consumers, inert siblings, and
  inherited cycle/duplicate/nontermination controls. The production census is unchanged at
  **14 files/22 direct touches**, **8 files/10 indirect calls**, **9 files/33 SQL expressions**,
  **8 files/13 SQL objects**, and **4 files/5 unresolved executable SQL sites**.

Round-seventeen fail-on-old and mutation evidence was local/in-memory and the checked-in analyzer
was restored before every green gate:

- The checked-in Round 17 controls against the unchanged rejected evaluator produced one red test
  container with **6 independent assertion failures / 22 prior tests green**: both supplied generic
  `unshift` adapters returned zero discovery, the definite inert overwrite retained one stale
  ledger call, and all three supplied retained-export-object mutations returned zero discovery.
  The corrected conditional `slots | other` may-alias form was then added from the canonical
  follow-up contract and is now guaranteed to produce either the live exact call or deterministic
  explicit unsupported authority, never an empty result.
- Removing the modeled `Array.prototype` heap made the focused Round 17 selector red with the two
  supplied generic adapters plus an adjacent `shift.call` failure. Restoring old union-on-write
  semantics made the definite overwrite report one false ledger call and made repeated strong
  aliases uncertain. Removing may-alias heap links made the corrected `slots | other` probe return
  an empty result and fail. Replacing shared `module.exports` identity with a snapshot made seven
  static retained-alias/descriptor/interop assertions fail. Each rollback-only mutation was
  restored; the final focused suite is **23/23**.
- The intrinsic matrix covers all eight required exact mutators through `.call`, `.apply`, bound
  invocation, and `Reflect.apply`, plus computed/destructured intrinsic aliases, nested Function
  adapters, return values, repeated operations, inert values, and unresolved receiver/member
  authority. Exact cases recover one call; unknown executable cases reject explicitly.
- The heap matrix covers direct/computed/destructured strong writes, same-object aliases, corrected
  same/different branch aliases, parameters/returns, ambiguous indices/targets, cycles, mixed
  mutation, and inert overwrite controls. Shared heaps update every view; may-alias heaps retain or
  reject every executable possibility; definitely overwritten callables stay silent.
- The CommonJS matrix covers all three supplied alias forms, static direct/computed writes,
  `Object.assign` as statement and assigned export value, static value/getter descriptors,
  `__esModule` default/named/namespace/destructured consumers, chained versus bare rebinding,
  current-export replacement versus retained old aliases, dynamic ambiguity, existing mixed
  ESM/CommonJS cycles, inert siblings, duplicate suppression, and repeated-run termination.
- The mechanically re-walked production census remains exactly **14 files/22 direct touches**,
  **8 files/10 indirect calls**, **9 files/33 SQL expressions**, **8 files/13 SQL objects**, **4
  files/5 explicit unresolved executable sites**, and zero production `exec_sql` callers.

Round-sixteen fail-on-old and mutation evidence was local/in-memory and the checked-in analyzer was
restored before every green gate:

- The two Round 16 tests against the unchanged Round 15 evaluator produced **2 failed / 20
  passed**. `unshift(client.from, client, table)` left a stale empty tuple and returned zero
  discovery/unsupported evidence; `exports[constantKey] = makeDatabase` likewise failed to recover
  the static CommonJS export. This independently reproduces one supplied form from each reviewed
  family without a TypeScript double.
- Removing `unshift` from the mutation-callable family made the targeted sequence test red **1/1**
  (21 skipped). Removing constant-identifier resolution from computed export keys made the module
  test red **1/1**. Both rollback-only mutations were immediately restored; final focused evidence
  is 22/22.
- The transfer matrix covers all named mutations, actual scalar/sequence return values, omitted and
  negative `splice`, extreme/fractional bound normalization, overlapping `copyWithin`, exact
  `fill`, aliases/computed/destructured/bound methods, repeated/mixed operations, same-sequence
  aliases, nested functions/returns, inert arrays, dynamic bounds/order, stale-state invalidation,
  duplicate suppression, and bounded self-references. Known results recover exactly once; unknown
  executable positions always emit unsupported evidence.
- The export matrix covers constant computed and dotted exports, `module.exports` object shorthand,
  computed properties and known spreads, chained versus bare rebinding, `Object.assign`, whole-module
  forwarding, default/named/namespace/computed/destructured consumers, `export * as`, explicit/star
  barrels, multi-hop and circular interop, inert siblings, dynamic keys/getters, duplicate
  suppression, and deterministic termination.
- The mechanically re-walked production census remains exactly **14 files/22 direct touches**,
  **8 files/10 indirect calls**, **9 files/33 SQL expressions**, **8 files/13 SQL objects**, **4
  files/5 explicit unresolved executable sites**, and zero production `exec_sql` callers.

Round-fifteen fail-on-old and mutation evidence was in-memory/rollback-only and the checked-in
analyzer was restored before every green gate:

- The two Round 15 tests against the unchanged Round 14 evaluator produced **2 failed / 18
  passed**. `Array.of(client.from, ...)` yielded zero discovery/unsupported evidence, while
  CommonJS `require('node:stream').Readable.from(...)` was falsely counted. The failures therefore
  reproduce both reviewed trust-boundary gaps without relying on a synthetic TypeScript double.
- Replacing the finite `Array` constructor value with the old inert receiver made the targeted
  sequence test red **1/1** (19 skipped) on the first supplied `Array.of` form. Replacing the
  CommonJS `require` graph result with the old external value made the module test red **1/1** on
  the supplied `Readable.from` false positive. Both mutations were restored immediately; final
  focused evidence is 20/20.
- The sequence matrix covers all four supplied programs plus direct/aliased/computed/destructured
  constructors, `new Array` length/item overloads, identity and unknown `Array.from` mappers,
  finite spread/concat, literal/computed numeric reads and writes, nested assignment targets,
  defaults/holes/rest, parameters/returns/closures/conditionals, inert values, executable
  uncertainty, duplicate suppression, and bounded cycles.
- The module matrix covers named/default/namespace/aliased ESM and CommonJS forms, direct and
  multi-hop explicit/star barrels, default export, relative wrapper returns, the real
  `frontend-auth-utils` hook re-export, CommonJS Supabase factories, Node built-ins, ambiguous
  external modules, and circular barrels with byte-stable results.
- The mechanically re-walked production census remains exactly **14 files/22 direct touches**,
  **8 files/10 indirect calls**, **9 files/33 SQL expressions**, **8 files/13 SQL objects**, **4
  files/5 explicit unresolved executable sites**, and zero production `exec_sql` callers.

Round-fourteen fail-on-old and mutation evidence was in-memory/rollback-only and the checked-in
analyzer was restored before every green gate:

- The new Round 14 tests against the unchanged Round 13 evaluator produced **3 failed / 15 passed**:
  the supplied positional call was silently absent, the supplied finite repeated-`call` adapter
  was rejected as non-convergent, and imported `Readable.from` was falsely counted. This is the
  honest fail-on-old result; an earlier invocation before the dependency link existed never loaded
  Vitest and was discarded as an incomplete collection.
- Disabling positional `tupleElements` selection made the targeted positional mutation red
  **1/1** (17 skipped). Removing target/receiver/argument components from the adapter recurrence
  key made the finite-reuse mutation red **1/1**. Reclassifying proven Node built-ins as ambiguous
  made the import-provenance mutation red **1/1**. Each source mutation was restored immediately;
  the final focused suite is 18/18.
- The adjacent matrix covers ten executable positional forms, three unresolved positional forms,
  three inert forms, recursive declaration/assignment/parameter/return patterns, nested
  object/array combinations, holes/default/rest/spread, numeric/computed access, deeper and mixed
  call/apply/bind reuse, duplicate suppression, and stable true recursion. Imported controls cover
  named/aliased/namespace/default/destructured/computed Node receivers, proven package/relative
  Supabase wrappers, ambiguous external receivers, and ordinary local receivers.
- The same production walk remains exactly **14 files/22 direct touches**, **8 files/10 indirect
  calls**, **9 files/33 SQL expressions**, **8 files/13 SQL objects**, **4 files/5 explicit
  unresolved executable sites**, and zero production `exec_sql` callers.

Round-thirteen fail-on-old/mutation evidence was in-memory and the checked-in source was restored
before every green gate:

- Removing the first-class `Function.prototype.apply` and `.bind` identities recreated the old
  incomplete intrinsic family. The focused suite went red **1/15** on the first reviewer form:
  `Function.prototype.apply.call(client.from, client, ['contract_hours_ledger'])` produced zero
  ledger calls where the assertion requires exactly one. Restoring the generic family returned
  the suite to 15/15.
- Fourteen positive compositions cover the four reviewer examples plus direct, aliased, computed,
  destructured, `bind.call`, `bind.apply`, an intrinsic bound receiver, and two nested depths.
  Each produces exactly one ledger call, so duplicate traversal is also a regression.
- Three unresolved/dynamic variants produce an explicit unsupported result; three inert or
  ordinary non-Supabase variants produce neither a ledger call nor unsupported noise. A cyclic
  object/adapter graph is evaluated twice with byte-identical results and one exact ledger call.
- The same focused suite mechanically re-walks every production TS/TSX/JS/JSX root. Its exact
  production maps remain **14 files/22 direct touches** and **8 files/10 indirect calls**; the SQL
  maps remain **9/33** expressions and **8/13** objects with **4 files/5** explicit unresolved
  executable sites.

Round-twelve fail-on-old/mutation evidence was rollback-only or in-memory and the final schema was
freshly replayed afterward:

- Real local pgTAP temporarily restored `EXECUTE` on `public.exec_sql(text)` only inside a
  rollback-only transaction. Anon, authenticated-admin, and service-role calls each executed
  `UPDATE public.contract_hours_ledger SET hours = hours + 1 RETURNING id`, moving one synthetic
  row from 1.00 to 4.00 hours and changing `get_bucket_summary` while creating zero override and
  zero `exec_sql` audit events. After the checked-in revocation, all three calls return `42501`,
  and the row, bucket, override ledger, and audit log remain unchanged.
- Endpoint mutations prove the retired route imports no service client and makes no RPC/SQL call:
  unauthenticated and non-admin gates remain 401/403, method validation remains 405, and an
  authenticated admin receives the stable non-mutating 410 response.
- TypeScript mutations cover aliased/computed/destructured `Reflect.apply`,
  `Function.prototype.call.call`, concise-arrow identities, returned closures, bound callbacks,
  `forEach`, and object/class/external higher-order adapters. Live ledger redirects are discovered
  or explicitly unsupported even with stale safe literals; cyclic unions/fingerprints terminate.
- SQL mutations cover schema-qualified ledger names against unqualified CTE shadowing,
  procedures, `RETURNS TABLE` and composite/plain variables, `CREATE OR REPLACE TRIGGER`,
  views/rules, numbered/custom dollar tags, correlated scopes, and inert comments/literals.
  Removing qualification or restoring filename/literal `EXECUTE` allowances makes the guard red;
  all five unresolved executable sites remain explicitly counted rather than omitted.

Round-eleven fail-on-old/mutation evidence was rollback-only or in-memory and the final schema was
freshly replayed afterward:

- A real local PostgreSQL transaction temporarily restored service-role `UPDATE(hours)` on the
  ledger. The obsolete authority changed a synthetic row from 1.00 to 2.00 hours, changed the real
  `get_bucket_summary` result, and created zero override events; the transaction rolled back. With
  the additive migration applied, authenticated-admin and service-role attempts against each of
  the twelve excluded columns fail with zero authoritative change, while four real
  completion/cancellation/compensation/manual-status shapes remain usable.
- The source-to-grant assertion independently derives four production UPDATE shapes in two paths
  and the exact seven-column union. Adding a financial column or an unmodelled dynamic/spread
  update makes the executable inventory red before a migration grant can drift silently.
- TypeScript mutations exercise direct and aliased `.call`/`.apply`, `Reflect.apply`, `.bind`,
  bound/spread arguments, higher-order parameter and return aliases, forward calls, recursion, and
  unresolved/external adapters. Each database-capable mutation reaches the ledger graph or an
  explicit unsupported result; inert ordinary callable adapters do not create false positives.
- SQL mutations separate inert strings/comments from PL/pgSQL `EXECUTE`, recover quoted
  concatenation, dollar-quoted bodies, and static `format(...)`, and reject unresolved executable
  targets. Additional probes cover ledger composite arguments/returns, `%ROWTYPE`, casts, trigger
  targets/transition tables, rules, views/materialized views, CTE shadowing, LATERAL, correlated
  aliases, quoted identifiers, and dollar-quoted bodies. The Round 11 checkpoint made the baseline
  `exec_sql` boundary and its six then-live production calls explicit; Round 12 removes those calls.

Round-ten fail-on-old/mutation evidence was rollback-only or in-memory and the final schema was
freshly replayed afterward:

- A real local transaction temporarily restored service-role table INSERT on the ledger and all
  override-sequence privileges. It produced `old_injected_effective_rows=1`,
  `old_linked_audit_rows=0`, and `old_sequence_setval=4242`, then rolled back. The checked-in
  migration makes both authenticated-admin and service-role injections fail while reservation and
  manual-entry shapes still receive UUID/time defaults and returned rows.
- The 63-assertion catalog/behavior suite audits the exact two production INSERT objects and their
  ten-column union, excludes `effective_minutes`, verifies no default/identity/generated/trigger
  or alternate-function assignment, inventories exactly two Z7 identity sequences, and rejects USAGE/SELECT/UPDATE,
  `nextval`, reads, and `setval` for exposed roles.
- Executable TypeScript mutations cover direct/mutual recursion, calls before definition,
  spread/rest/default parameters, `Object.assign`, `splice`, and conservative unmodeled mutations.
  Every probe reaches the ledger or an explicit unsupported result, terminates deterministically,
  and retains all earlier property/parameter/conditional/loop/alias/root cases.
- SQL mutations cover bare/qualified composites, `row_to_json`, `RETURNING` composite, and every
  ledger DML relation with or without `hours`; MERGE stays explicit unsupported. The exact
  production map increases by one to 28 because the override ledger UPDATE is no longer invisible.

Round-nine fail-on-old/mutation evidence was rollback-only or in-memory and left the final local
schema freshly replayed with no synthetic fixtures:

- In one real local PostgreSQL transaction, temporarily restoring only `service_role` INSERT on
  attendance, observations, and report batches reproduced all three obsolete interfaces:
  `old_direct_attendance=1`, `old_direct_observation=1`, and
  `old_forged_complete_batch=1`. The transaction then rolled back. With the checked-in grants,
  `016-attendance-write-boundaries.sql` proves all five mutation classes fail for every exposed
  role while creation/rejection/promotion and occurrence join/leave remain available only through
  the intended fixed-search-path owner RPCs.
- Real concurrent occurrence claims use separate database connections and an actual row lock. One
  UUID establishes the meeting/interval; the different UUID returns `occurrence_mismatch`, creates
  no observation, and closes no interval. Separate concurrent promotions produce one exact
  authoritative completion and one stable terminal rejection. No mock or diverged TypeScript
  double supplies this evidence.
- Source mutations exercise property/element callable containers, callable parameters,
  conditional calls, destructuring assignment, property reassignment, array `push` and loop
  binding, alias/reassignment chains, shadowing, generics, and TS/TSX/JS/JSX roots. Each retains an
  unused safe literal while redirecting the live value to a ledger table/backed RPC or unresolved
  external source; every mutation changes the map or produces an explicit unsupported result.
- SQL mutations exercise `SELECT *`, `alias.*`, `RETURNING *`, outer-correlated ledger aliases,
  nested alias shadowing, INSERT/UPDATE/DELETE relations, and `MERGE ... USING`, alongside all prior
  quoted/tuple/CTE/function/view/transitive/multiple-statement/comment/literal probes. Genuine
  ledger access changes the exact census; ledger-relevant unsupported MERGE fails explicitly.

Round-eight fail-on-old/mutation evidence was rollback-only or in-memory and left the recorded
green tree/local schema restored:

- In a real local PostgreSQL transaction, temporarily restoring only the obsolete exposed leave
  privilege recreated the old boundary. `service_role` inserted one `foreign-occurrence` interval
  and the old 9-argument leave RPC returned `unpairable_leave` while inserting one foreign
  observation without consulting a meeting row. The transaction reported interval **1** and
  observation **1**, then rolled back. The new forced-stale pgTAP cases return
  `occurrence_mismatch` with **0/0** and preserve the established UUID.
- Removing the application UUID equality check makes both mismatched number-fallback lifecycle
  cases reach the write seam; the checked-in join/leave tests require no store call and no
  interval/observation/meeting mutation.
- Callable mutations cover property and element extraction, constant/computed/quoted
  destructuring, `from`/`rpc`, generics, nested scopes, and shadowing in the same parser used for
  TS/TSX/JS/JSX roots. The former implementation returns no call for the two reviewer probes.
- Live-dataflow mutations retain the old unused literal declaration while redirecting the actual
  loop/parameter/reassigned/shadowed value to `process.argv` or another external binding; these now
  produce explicit `dynamic target`. Any conditional/array branch containing
  `contract_hours_ledger` or `get_bucket_summary` is surfaced and invalidates the finite map.
- SQL mutations cover derived and nested-subquery aliases, quoted and tuple writes, direct,
  arbitrary alias, unqualified/qualified, CTE, view/function/transitive, multiple statements, and
  comments/literals. The old regex returns zero for the reviewer derived-read and quoted-write
  probes; the walker returns one for each. Ledger-relevant unsupported `MERGE` throws closed both
  as a direct statement and inside the independently extracted body of a SQL function.

Round-seven mutation/fail-on-old evidence was uncommitted, run only against the local worktree and
local PostgreSQL, and exactly restored before the recorded green gates:

- Reapplying the rejected R6 reschedule definition over the local R7 replacement made
  `013-session-reschedule-atomic.sql` fail **14/80**. Fully tracked and both XOR no-ledger direct
  and wrapper calls did not raise; session state moved from `10:30/90` to `11:00/120`. Reapplying
  `20260813120500` restored **80/80** with byte-identical failure state and the valid legacy paths.
- Granting `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` back to the exposed roles made
  `015-session-hour-overrides.sql` fail **23/94**. A direct `service_role` insert reserved the
  request ID, the later admin RPC could not apply, and mutation/privilege probes were red.
  Reapplying `20260813120400` restored **94/94**, including the later one-mutation/one-actor-event
  admin application after the failed poison attempt.
- Restoring the receiver-name heuristic made the 8-test source/SQL guard suite fail two tests:
  it missed the renamed `s.from(target)` form and the new production JS/JSX root. Restoring the
  symbol-independent discovery returned the suite to green.
- Disabling unqualified-hours counting made the mutation `SELECT hours FROM
  contract_hours_ledger` return zero instead of one and made its executable guard assertion red.
  Qualified, quoted, arbitrary-alias, CTE, function, view, and transitive probes remain alongside
  it. Every finite dynamic allowlist also replaces one live allowed literal with
  `contract_hours_ledger` in-memory and proves the exact-value assertion rejects the mutation.

Round-six mutation/fail-on-old evidence was uncommitted, run against the same local stack, and
exactly restored before the recorded green gates:

- Replacing integer-hundredths comparison with binary-float division made the 0.60/three-times-0.20
  regression return `[false, false, true, true]` instead of `[false, false, false, true]`.
- Removing bracket-call resolution from the AST guard found only 2 of the 4 supported direct-table
  mutation forms, so the mutation test failed. New-root, constants, generic, destructured,
  unsupported-dynamic, quoted/unaliased SQL, alternate-alias, view, and transitive-function probes
  remain executable in the green suite.
- Reapplying historical `20260809120100_reschedule_rpc_uses_bucket_summary.sql` over the local
  replacement made `013-session-reschedule-atomic.sql` fail **18/50**: missing, duplicate,
  malformed, and incoherent buckets all committed session `10:30 -> 11:00`, ledger
  `1.50/90 -> 2.00/120`, and revision `0 -> 1`. Reapplying `20260813120300` restored **50/50**.
- Temporarily making the report-batch trigger `UPDATE`-only made `011-zoom-public-rls.sql` fail
  **6/153**: batch rows were deleted and dependent operations reached FK `23503` instead of the
  stable `P0409`. Restoring `UPDATE OR DELETE` returned **153/153**.
- Temporarily granting `UPDATE(effective_minutes)` to both authenticated and service roles made
  `015-session-hour-overrides.sql` fail **5/65**; a direct write changed the value to 18 with no
  expected denial. Revoking those grants returned **65/65** while audited apply/reverse and allowed
  lifecycle-column updates stayed green.

Earlier proofs remain cumulative: Round 2's old UUID SQL, malformed-token coercion, and comparison
ledger mutation all made their new regressions red; Round 4 guard removal produced 27 pagination
failures; Round 5's old availability fallback inserted one single ledger row and two bulk rows when
the new assertions require zero. Those temporary sources were restored before every Round 6 gate.

Environment/tooling retries are recorded rather than presented as code results. The first reset
attempt selected a newer transient CLI and stalled in the desktop credential helper; the installed
Supabase CLI 2.110.0 then replayed the database successfully. An initial parallel UTC/Madrid run
exposed a test-only temporary-root collision; replacing the fixed probe directory with `mkdtempSync`
removed cross-process interference, after which all zones were run sequentially. Chromium first
collected no tests without the ignored local mock marker, then exposed missing public URL/feature
flags (110 green/7 failed). With the exact local synthetic CI flags, the final selector was 117/117;
the temporary ignored environment file was removed. In Round 7 the first fail-on-old SQL command
targeted an unavailable host `psql`, made no database change, and was retried against the exact
local Supabase container. The first Round 7 browser seed followed pgTAP and hit its leftover local
auth fixtures (`listUsers` error); a new local reset followed by the same synthetic seed succeeded,
and the final 117-test selector ran from that state. Round 8's first focused pgTAP invocation had a
plan declaration of 174 while all 175 subtests were green; correcting the test-only plan to 175
made the same file green. During Round 9 browser setup, `npx supabase db reset` selected the newer
transient CLI and waited in Docker's credential helper while pulling an unneeded service; it was
interrupted, then installed CLI 2.110.0 replayed the schema normally. The production build was
first invoked without local Supabase environment values: compilation succeeded, then page-data
collection failed closed because the public URL/anonymous key were absent. It was rerun after
supplying the exact local CI URL/keys and feature flags, so public values were inlined, and produced
156/156 static pages. No persistent test environment file remains, and a final local reset removed
the synthetic browser fixtures. In Round 10 an attempted two-positional-file `supabase test db`
focus was misparsed by the CLI/TAP harness and ran zero tests; setup and `017` were then invoked as
separate commands. After the later clean reset, invoking `017` alone correctly failed because the
test-helper schema is created by `000-setup.sql`; running setup first produced 63/63, followed by
the full 955-assertion suite. The first rollback probe schema-qualified built-in `setval` as
`public.setval`, so PostgreSQL aborted that transaction before sequence mutation; the corrected
built-in call reproduced `setval=4242` and rolled back. In Round 11 the first local reset stalled
while Docker's credential helper fetched a missing realtime image; the image was fetched with a
temporary empty Docker configuration, after which installed Supabase CLI 2.110.0 replayed the
schema normally. The first mandatory-browser invocation collected no tests because the ignored
local mock marker was absent; a temporary `.env.local` containing only `ZOOM_MODE=mock` enabled
the exact 117-test selector, then was deleted. The final reset replayed through `20260813120900`
and removed all synthetic browser state. A post-evidence inventory rerun was first invoked after
the worktree dependency symlink had already been cleaned and therefore could not resolve
`vitest/config`; restoring that same local dependency link for the command produced 14/14, and the
link was removed again. In Round 12 the price guard was first invoked before a build artifact
existed and correctly requested a build; after the 156-page build it scanned 265 files green. The
first browser invocation failed during collection because the mandatory mock spec reads
`.env.local` directly even when equivalent variables are inherited. A temporary ignored local
file was added, the exact selector passed 117/117, and the file was deleted. The first seed attempt
used a mistyped local anonymous key and wrote nothing; the exact CLI key then seeded synthetic
fixtures successfully. The final reset replayed through `20260813121000` and removed those
fixtures. None of these retries changed committed or persistent state.

Round 13 introduced no unexpected gate retry. The deliberate intrinsic-identity removal above was
the required fail-on-old mutation, not a green command. Chromium used a temporary ignored
`.env.local` because the mandatory mock spec reads that file directly; it was deleted immediately
after the 117-test run. The final local reset replayed through `20260813121000` and removed all
synthetic browser/concurrency state.

Round 14 began without `node_modules`; a temporary untracked link to the canonical worktree's
already-installed dependencies was used only to execute local gates and removed before handoff.
The first focused invocation before that link existed never loaded Vitest and was discarded. The
first browser seed followed pgTAP and encountered its leftover auth fixtures; the same incomplete
browser collection also showed that the temporary ignored `.env.local` lacked the synthetic
`CRON_SECRET`, so no tests ran. A fresh local reset and the exact synthetic CI environment then
seeded successfully and the mandatory selector passed 117/117. The temporary file was deleted and
a final reset replayed through `20260813121000`, leaving no synthetic browser/concurrency state.

Round 15 reused the same temporary untracked dependency link and removed it before handoff. The
only incomplete collections were intermediate focused implementation runs and one diagnostic
focused command whose output was filtered while isolating convergence; none is counted as gate
evidence. The final focused suite and every cumulative gate were rerun unfiltered. Chromium began
from a fresh post-pgTAP reset with the exact temporary synthetic CI environment, completed 117/117,
then the environment file was deleted and the local database was reset again through
`20260813121000`. Build retained the inherited Browserslist and webpack-cache advisories.

Round 16 reused that temporary dependency link and removed it before handoff. Two early full-suite
invocations outlived their short command sessions and overlapped; one emitted no JSON artifact and
the other two were stopped by their exact local test PIDs, so none is counted. A diagnostic focused
module-provenance run filtered its output while locating an ambiguity and is also excluded. The
three timezone suites were then rerun serially through persistent sessions and produced complete
JSON reports. The cumulative selector was intentionally widened from the earlier 22-file sample to
all 37 Z7 test paths changed since the immutable base. Chromium began after a fresh post-pgTAP reset,
used the exact temporary synthetic CI environment, ran 117/117, and passed the 11-spec manifest;
the environment file was deleted and a final reset replayed through `20260813121000`. Build retained
the inherited Browserslist and webpack-cache advisories. No incomplete collection is gate evidence.

Round 17 reused the temporary dependency link and removed it before handoff. The first build
compiled but was discarded when page collection correctly rejected the detached worktree's absent
local public Supabase URL/key; the valid build used only synthetic localhost values, and the final
Chromium build used the exact temporary CI environment. The first database reset reached the local
Docker image pull but the desktop credential helper stopped responding; it was interrupted without
collecting evidence, then rerun with an empty temporary Docker config, downloaded the public local
storage image, and replayed every migration successfully. The focused implementation runs and the
three deliberate rollback-only red mutations are not counted as green gates. Chromium started from
a fresh reset, seeded synthetic fixtures, passed 117/117 plus the manifest, and was followed by a
final replay through `20260813121000`. The ignored environment file, dependency link, build/browser
artifacts, and synthetic database fixtures were removed. Build retained the inherited Browserslist
and webpack-cache advisories.

Round 18 reused the same temporary dependency link and removes it before handoff. One mandatory
browser invocation stopped before collecting tests because `zoom-mock-mode.spec.ts` requires the
ignored `.env.local` path to exist even when all values are supplied in `process.env`; an empty,
credential-free placeholder was created, the exact selector then passed 117/117, and the placeholder
was deleted. Two diagnostic polling shells initially matched their own command text after the UTC
collection had already completed; only those exact local PIDs were stopped, and they ran no test or
state mutation. Intermediate focused implementation runs and the three deliberate rollback-only red
mutations are not counted as green gates. The final database reset removed browser/concurrency
fixtures; the temporary Supabase environment file, dependency link, `.next`, `test-results`, and
Playwright report were removed before handoff. Build retained the inherited Browserslist advisory.

Round 19 reused the same temporary untracked dependency link and removes it before handoff. One
browser seed invocation exited before mutation because direct Node execution does not load
`.env.local`; rerunning with the exact explicit local synthetic CLI URL/service key seeded the
fixtures and the supported collection passed 117/117 plus the 11-spec manifest. The full suites
were run serially in Santiago, UTC, and Madrid; only Madrid's inherited eight failures remained.
The valid build used synthetic localhost values and retained the inherited Browserslist and
webpack-cache advisories. A final reset replayed through `20260813121000`; the ignored synthetic
environment file, dependency link, build/browser/test artifacts, generated PDF, and synthetic
database fixtures were removed before handoff. No incomplete collection is gate evidence.

Round 20 reused that temporary untracked dependency link and removes it before handoff. All three
timezone collections ran serially and completed; Santiago and UTC were green, while Madrid
reproduced only its eight inherited `businessDays` failures. The build used synthetic localhost
values and retained the inherited Browserslist and webpack-cache advisories. Supabase CLI 2.110.0
performed a fresh pre-pgTAP replay, a fresh pre-browser replay, and a final replay through
`20260813121000`. Chromium used a temporary ignored `.env.local` containing only synthetic local
keys and flags; direct Node seeding also received the local URL/service key explicitly, then the
exact 117-test selector and 11-spec manifest passed. The ignored environment file, dependency
link, `.next`, browser/test/auth artifacts, generated PDF, TypeScript build metadata, Supabase temp
state, and all synthetic database fixtures were removed before handoff. No incomplete collection
or filtered diagnostic is counted as gate evidence.

## Explicit inherited deviations

- Advisory `npm run lint:testid` remains the round-two measured repository baseline of **44 errors
  / 2,625 warnings**. Round twenty adds no interactive UI.
- Madrid's eight `businessDays.test.ts` failures are the previously reproduced out-of-scope
  licitación defect. All Z7/hours tests are green in all three zones.
- The broad `npm run e2e` inherited round-one result remains **160 passed / 27 skipped / 1 did not
  run / 62 failed (250 total)**. Round twenty changes no `tests/e2e/` path; the supported mandatory
  selector was rerun fresh at 117/117.

None of these deviations is represented as a green gate.

## Independent reviewer focus and residual risks

1. Mutate explicit Reflect receivers, two-phase `defineProperties` conversion/application,
   detached descriptor inspection, `Object.create` descriptors, all nine indexed/length mutators,
   switch fallthrough/break, and call-driven abrupt module/callback evaluation through the shared
   ordinary/local/CJS/ESM heap. Recoverable calls must count once; inert/deleted/noncopied or
   unreachable authority must stay empty; dynamic authority must reject once and terminate stably.
2. Re-audit `public.exec_sql(text)` and related exposed authority at the catalog and real-role
   boundaries. Anon, authenticated-admin, and service-role calls must all receive `42501`; the
   retired endpoint must construct no service client and issue no RPC/SQL, while fixed owner RPCs
   and legitimate ledger writers remain functional.
3. Mutate executable SQL through qualified/unqualified CTE shadowing, static and unresolved
   `EXECUTE`, procedures, composite/`RETURNS TABLE`/plain variables, triggers, rules/views,
   correlated scopes, and numbered/custom dollar tags. Inert comments/literals must stay inert;
   unresolved executable authority must fail explicitly without filename or substring allowances.
4. Re-run both mechanical inventories against integrated HEAD: cumulative paths **127/127**;
   classifications **14/22** direct, **8/10** indirect, **9/33** SQL expressions/writes, and
   **8/13** SQL objects, plus **4 files/5 sites** of explicit unresolved executable SQL and zero
   production `exec_sql` callers.
5. Preserve earlier availability, pair, exact-hundredths, pagination, terminal authority, UUID,
   canonical override concurrency, JSON facilitator scoping, comparison-to-billing isolation, and
   school/payment/export regressions. Re-mutate normal/throw/return/break/continue propagation,
   strict versus non-strict integrity failures, ordered catch/finally overrides, partial effects,
   and all nine mutators including static/unknown `sort` comparators across module boundaries.

Residual risks: a wider database outage may delay the durable batch-status read but cannot demote
a complete batch; advisory-lock hash collision may serialize unrelated request IDs but cannot
merge their canonical payloads; provider-side pagination behavior beyond the documented zero and
nonzero envelopes remains unmeasured against the real tenant; real Zoom webhook/report divergence
remains unmeasured; external ledger activity can change a balance between read-only preflight and
insert; and the pre-existing multi-row ledger insert sequence is not a PostgreSQL transaction, so a
later ledger-write failure (distinct from the availability failures closed in R5) can leave earlier
rows. The inherited unmatched-attendance-suggestion semantics are intentionally unchanged in this
round. Local gates do not prove production migration state.

## Handoff constraints

No merge, push, deploy, Vercel call, production/remote DB access, real data, RLS disablement,
destructive migration, or test weakening occurred. Independent review must use the cumulative
boundary and issue its own verdict. Production migration application and read-only verification
remain explicitly outside this builder handoff.
