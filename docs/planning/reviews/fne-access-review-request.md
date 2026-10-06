# FNE scoped access review request

Branch `fix/access-scope`; base `41a9a8a2bcd42de77debec418c64e2fbef126453`; one implementation commit in the reviewed release package. Production remains unchanged.

## Authorized objective and scope

User approved active global admin only for clientes legal/contact, contratos raw legal snapshots and cuotas/payment reads and all financial writes, without exceptions. Ordinary community messaging is restricted to active community members, assigned-school consultors and global admins. Assignment discussions are group private; global admin oversight and assigned consultors remain authorized. NULL-workspace groups use authoritative group membership. No unintended regressions. Prior PR152 fixes remain merged and in scope only for regression acceptance. Public storage, anonymous quote records, blocks and assessment_objectives changes are deferred. No production writes or publication without exact-package approval.

## Changes by risk

High: additive atomic SQL migration (finance restrictive cap, messaging/group predicates and immutable scope, invoker view, group membership enrollment boundaries, atomic group thread RPC, parent consistency). 393-assertion messaging/finance matrix plus157 contract assertions; cumulative expectations in063/071/074. Caller-bound active school-leadership helper preserves existing child SELECT access without new writes or raw legal access. Server notification/direct-send predicates now check actual thread; procurement document routes deny nonadmins before service client data retrieval, including password gate.

Medium: current/compatibility discussion services call atomic RPC; discussion page derives group workspace, supports school-only discussions and thread realtime; nullable composer and send helper support. Joining unmanaged groups no longer supplies nonexistent community_id member column.

Tests: group service, notifications/direct-send, procurement handler access, real API and discussion-page acceptance. Added finance-messaging browser spec to mandatory CI list.

## Evidence so far

Expanded local pgTAP PASS:70files/7207assertions, including393 original scoped +157 contract assertions. All6 original exposure counterexamples now deny. Focused expanded browser5/5PASS (admin raw finance, scoped legal-free JSON/CSV/PDF hour summaries, community/school/legacy group send/reload). Real-service focused unit4files136testsPASS, including4 nonzero JSON/PDF legal-sentinel privacy cases. Original full unit504files/12512testsPASS and full browser268PASS/21mandatoryspecs no skipsPASS. Exact expanded full unit504files/12516testsPASS (12existing skips), productionbuild/type/lint/allguardsPASS, fullbrowser269passed/21mandatoryspecs no skipsPASS. Two urgent report-data cases remain explicitly expected baseline failures, not successful report-data journeys.

## Independent scrutiny

1. Group privacy through legacy mappings, new classifier, owner view and service-backed recipients; a permissive policy must not escape restrictive caps.
2. NULL-workspace authoritative group membership, selfjoin entitlement and role revocation; ordinary community scope must not become a group fallback.
3. Structural and identity triggers across authenticated/service writes; avoid historical data mutation and prevent relabeling private threads.
4. Atomic RPC retry/concurrency and compatibility of current browser callers, notifications and realtime.
5. Finance admin rule through service routes and duplicate contract legal snapshots; distinguish bounded namedtable fixes from separately exposed copies.

## Release limitations

Live read-only preflight completed2026-10-06 in sxlogxqzmarhqsblxmtj:all13 aggregate counts zero; forced-RLS contratos seven-policy/grants/snapshot catalog matches candidate assumptions. Evidence task-6/FNE-LIVE-READONLY-PREFLIGHT.md. No historical repair indicated. Malformed message/mapping relationships fail closed and require concrete impact review before rollout. Existing group community/school mismatches still use the stored group.school_id for staff scope; their aggregate count must be zero or separately resolved before release. The new structural trigger prevents creating further mismatches. Existing public storage URLs remain public (separate backlog); attachment RLS protects metadata only. User approved full raw contratos admin-only, including representative name/RUT snapshots, preserving scoped limited hours summaries; this is implemented and independently reviewed. Paired application+database rollout is required: newapplication calls newRPCs, while enforcingSQL can block oldseparate first-timegroupcreation before applicationrollout. Parent must choose a controlled rollout window or separately reviewed staged activation; do not deploy either blindly. Release approval/deployment remains parent owned.
