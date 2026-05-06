# Codex QA Guide — Growth Communities Feature

> **Audience:** OpenAI Codex Computer Use (April 2026 release).
> **Purpose:** End-to-end QA of the growth-community management feature shipped on branch `feat/gc-mgmt-ed`.
> **Privacy mandate (Chile Law 21.719):** Use ONLY the `*.qa@fne.cl` accounts listed below. NEVER touch real customer data, real student records, or accounts whose email does not end in `.qa@fne.cl`.

---

## 1. What you're testing

A new feature set that lets Admins and Equipo Directivo users manage growth communities (`comunidades de crecimiento`):

- **Track A** — Equipo Directivo can now access growth-community management (school-scoped to their own school).
- **Track B** — Leader management: the role-assignment flow now offers a choice ("create new community" vs "assign to existing"), and a community detail page now exposes a leaders panel with promote / demote-with-mode flows.
- **Track C** — Standalone create / edit / delete UI for growth communities (decoupled from leader assignment), with a deletion safety gate that lists blockers.

Branch `feat/gc-mgmt-ed` adds 10 commits on top of `main`, no DB migrations.

---

## 2. Environment setup

You need the dev server running locally. The user typically runs this for you, but if you need to bootstrap it:

```bash
cd /Users/brentcurtis/Documents/fne-lms-working   # or wherever the repo lives
git fetch origin
git checkout feat/gc-mgmt-ed
git pull --ff-only
npm install
npm run dev
```

Open the browser at `http://localhost:3000`. All testing happens against this localhost instance.

**Do not run `vercel` or any deployment command.** Deployments are RED-tier and the user manages those manually.

---

## 3. Test accounts

All accounts use the same password: `TestQA2026!`

| Email | Role(s) | School | Notes |
|---|---|---|---|
| `admin.qa@fne.cl` | admin | (global, no school) | Full platform access. Use for happy-path admin scenarios. |
| `directivo.qa@fne.cl` | equipo_directivo | QA Test School | **Primary subject** for Track A scenarios. |
| `lider.qa@fne.cl` | lider_comunidad | QA Test School | Single-role leader. Currently a leader of "QA Test Community". |
| `docente-multirole.qa@fne.cl` | lider_comunidad + docente | QA Test School | Multi-role user. Currently the **second leader** of "QA Test Community" (real production-style data, validates two-leader UI). |
| `docente.qa@fne.cl` | docente | QA Test School | Regular member; use for promote-to-leader tests. |
| `docente.comunidad.qa@fne.cl` | docente | QA Test School | Another member; useful for bulk member tests. |
| `estudiante1.qa@fne.cl` | docente | QA Test School | Despite the name, role is `docente`. Available for member tests. |
| `estudiante2.qa@fne.cl` | docente | QA Test School | Same. |
| `estudiante3.qa@fne.cl` | docente | QA Test School | Same. |
| `docente-noschool.qa@fne.cl` | docente | (no school) | Edge case: docente with no school assignment. Should be ineligible for any community. |
| `lider.generacion.qa@fne.cl` | lider_generacion | QA Test School | School has no generations, so this user has no community scope. |
| `consultor.qa@fne.cl` | consultor | QA Test School | **Negative test:** must NOT see "Comunidades" in sidebar. |
| `consultor2.qa@fne.cl` | consultor | QA Test School | Negative test (alternate). |
| `community.manager.qa@fne.cl` | community_manager | QA Test School | Negative test. |
| `supervisor.qa@fne.cl` | supervisor_de_red | QA Test School | Negative test. |
| `encargado.licitacion.qa@fne.cl` | encargado_licitacion | QA Test School | Negative test. |
| `encargado2.licitacion.qa@fne.cl` | encargado_licitacion | QA Test School | Negative test. |
| `encargado3.licitacion.qa@fne.cl` | encargado_licitacion | QA School B — Liceo de Prueba | Cross-school context (different school from the rest). |

**How to log in via Computer Use:** open `http://localhost:3000/login` in the browser, click the email field, type the email above, click the password field, type `TestQA2026!`, click the submit button. Confirm you land on `/dashboard`. To switch users, use the logout button (typically in the sidebar footer or profile menu) before logging in as the next user.

**Do not** save credentials in the browser keychain. **Do not** type these credentials anywhere outside of `localhost:3000`.

---

## 4. Pre-test data state

The QA database has been seeded with a known starting state. Confirm it before running scenarios — if it looks different, ask the user to re-seed.

### Schools

| ID | Name | Has generations |
|---|---|---|
| 257 | QA Test School | No |
| 259 | QA School B — Liceo de Prueba | No |

### Growth communities

| Community | School | Generation | Capacity | Leaders | Members |
|---|---|---|---|---|---|
| QA Test Community (id `3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd`) | QA Test School | — | 16 | 2 (`lider.qa@fne.cl`, `docente-multirole.qa@fne.cl`) | 6 |

QA School B starts with **zero** communities — perfect for testing creation flows.

---

## 5. Testing protocol

For every scenario:

1. **Setup:** log in as the role indicated.
2. **Steps:** follow the numbered actions exactly.
3. **Expected:** verify the listed outcomes (UI text, URL, toast, list state).
4. **Record:** Pass / Fail / Notes. If Fail, take a screenshot.
5. **Reset:** undo any state change you made (delete created community, re-promote demoted leader, move member back). Each scenario should leave the system in the pre-test state described in §4 unless explicitly noted.

Tip: keep a notes scratch buffer. After each scenario, prefix entries with `[A1.2]`, `[B2.3]`, etc. so the final report is easy to read.

---

## 6. Track A — Equipo Directivo access (school-scoped)

### A1.1 — ED sees "Comunidades" in the sidebar (top-level)

- Login: `directivo.qa@fne.cl`
- Steps: open `/dashboard`. Look at the left sidebar.
- Expected: a top-level menu entry labeled **"Comunidades"** is visible (icon: people group). It is NOT nested under "Admin" or any other section.
- Reset: none needed.

### A1.2 — Other roles do NOT see "Comunidades"

- Repeat for each negative-test user: `consultor.qa@fne.cl`, `community.manager.qa@fne.cl`, `supervisor.qa@fne.cl`, `docente.qa@fne.cl`, `encargado.licitacion.qa@fne.cl`.
- Expected: "Comunidades" is NOT visible for any of these roles.

### A2.1 — ED sees only their own school's communities

- Login: `directivo.qa@fne.cl`.
- Steps: click "Comunidades" in the sidebar.
- Expected:
  - Page title contains "Comunidades de crecimiento".
  - The school-selector dropdown is **hidden** (ED auto-scoped to QA Test School).
  - The list shows exactly **one** community: "QA Test Community" with 6 members + 2 leaders (the 2 leaders may or may not be counted in the member count column depending on display logic — verify against admin view in A2.2).

### A2.2 — Admin sees all schools (regression)

- Logout, login as `admin.qa@fne.cl`.
- Steps: navigate to `/admin/growth-communities`.
- Expected: a school-selector dropdown is visible. Selecting "QA Test School" shows "QA Test Community". Selecting "QA School B — Liceo de Prueba" shows the empty state "Este colegio no tiene comunidades".

### A3.1 — ED cannot access another school's community by URL

- Login: `directivo.qa@fne.cl`.
- Steps: as admin, in another tab/session, copy the URL of any community in QA School B (if any exist; if none, ask the user to create one for this scenario). Then in the ED tab, paste that URL into the address bar and load it.
- If QA School B has no community at the start of the test, you may use the API instead: navigate ED to a fabricated UUID like `/admin/growth-communities/00000000-0000-0000-0000-000000000000/members` — this should also be denied.
- Expected: ED is redirected to `/dashboard`, OR sees an "access denied" page. Should NOT see another school's community details.

### A3.2 — ED API call to a different school's community is rejected

- Login: `directivo.qa@fne.cl`.
- Steps: open browser DevTools console. Send a GET request to `/api/admin/growth-communities/<some-uuid-of-a-non-QA-Test-School-community>/members` (if no such community exists, skip). You can use `fetch('...').then(r => r.status)`.
- Expected: status is `403` (or `404` if not found) — never `200`.

---

## 7. Track B — Leader management

### B1.1 — RoleAssignmentModal: "Crear nueva comunidad" still works (regression)

- Login: `admin.qa@fne.cl`.
- Steps:
  1. Navigate to `/admin/user-management` (or wherever the admin user list lives).
  2. Find `docente.qa@fne.cl` and click the role-edit / role-assignment button to open RoleAssignmentModal.
  3. Click "Asignar Nuevo Rol" or equivalent.
  4. Pick role: **Líder de Comunidad**.
  5. Pick school: **QA Test School**.
  6. Verify the radio group shows two options: "Crear nueva comunidad" and "Asignar como líder a una comunidad existente". Default selection: "Crear nueva comunidad".
  7. Submit.
- Expected:
  - Toast: "Rol asignado y comunidad creada correctamente."
  - A new community appears under QA Test School named `Comunidad Docente QA` (the leader's first+last name).
  - In the comunidades list: that new community has 1 leader, 0 other members.
- **Reset:** open the role-edit modal again for `docente.qa@fne.cl`, find the new lider_comunidad role, and remove it. Then go to `/admin/growth-communities`, find `Comunidad Docente QA`, click delete (trash icon), confirm twice. After this, the community count for QA Test School is back to 1.

### B1.2 — RoleAssignmentModal: "Asignar a comunidad existente" — does NOT create a duplicate

- Login: `admin.qa@fne.cl`.
- Steps:
  1. Open RoleAssignmentModal for `docente.qa@fne.cl`.
  2. Pick role: **Líder de Comunidad**, school: **QA Test School**.
  3. Choose the radio "Asignar como líder a una comunidad existente". A dropdown appears.
  4. Select "QA Test Community" from the dropdown.
  5. Submit.
- Expected:
  - Toast: "Rol de líder asignado a la comunidad existente."
  - **No new community is created.** "QA Test Community" still shows in the list (only one).
  - Open "QA Test Community" → "Líderes de la comunidad" section now shows **3 leaders** (the original two plus `docente.qa@fne.cl`).
- **Reset:** continue to scenario B2.1 which uses this state, OR demote `docente.qa@fne.cl` immediately by going to QA Test Community → Líderes → "Cambiar líder" → "Quitar de esta comunidad".

### B1.3 — Submit-button disabled when "existing" mode but no community selected

- Login: `admin.qa@fne.cl`.
- Steps: same modal as B1.2 but DO NOT pick a community from the dropdown.
- Expected: the "Asignar Rol" button is disabled (greyed out). Clicking it does not submit.

### B2.1 — Promote a member to leader from the leaders panel

- Pre-state: QA Test Community has 2 leaders.
- Login: `admin.qa@fne.cl`.
- Steps:
  1. Navigate to `/admin/growth-communities`, pick QA Test School, click "Gestionar miembros" on QA Test Community.
  2. The page now has a "Líderes de la comunidad (2)" panel above "Miembros actuales".
  3. Below, in "Miembros actuales", find a non-leader member (e.g., `docente.qa@fne.cl`). Click "Promotear a líder".
  4. Confirm in the modal.
- Expected:
  - Toast: "Docente QA ahora es líder de la comunidad." (or similar with the user's name).
  - The leaders panel now shows 3 leaders.
  - The member no longer appears in "Miembros actuales (no líderes)".
- **Reset:** demote that user back via "Cambiar líder" → "Quitar de esta comunidad" (NOT "Convertir en miembro" — we want to fully remove from community to restore pre-state).

### B2.2 — Demote leader: "Convertir en miembro de esta comunidad"

- Pre-state: QA Test Community has 2 leaders.
- Login: `admin.qa@fne.cl`.
- Steps:
  1. Open QA Test Community members page.
  2. In "Líderes de la comunidad", click "Cambiar líder" next to `docente-multirole.qa@fne.cl`.
  3. In the modal, leave the radio at default ("Convertir en miembro de esta comunidad").
  4. Click Confirmar.
- Expected:
  - Toast: "Líder convertido en miembro."
  - Leaders panel: now 1 leader (`lider.qa@fne.cl` only).
  - "Miembros actuales" now shows `docente-multirole.qa@fne.cl` as a regular member.
- **Reset:** in the same page, click "Promotear a líder" on `docente-multirole.qa@fne.cl` to restore them as a leader.

### B2.3 — Demote leader: "Quitar de esta comunidad"

- Pre-state: QA Test Community has 2 leaders.
- Login: `admin.qa@fne.cl`.
- Steps:
  1. Open QA Test Community members page.
  2. "Cambiar líder" on `docente-multirole.qa@fne.cl`.
  3. Switch radio to "Quitar de esta comunidad".
  4. Confirmar.
- Expected:
  - Toast: "Líder removido de la comunidad."
  - Leaders panel: 1 leader.
  - `docente-multirole.qa@fne.cl` is NOT in the members list.
- **Reset:** open RoleAssignmentModal for `docente-multirole.qa@fne.cl`, assign Líder de Comunidad → "Asignar a comunidad existente" → QA Test Community.

### B2.4 — Demote with no eligible fallback role: error path

- Setup: this requires a leader who has NO other role in the school. Most QA users don't fit. If `lider.qa@fne.cl` has only the `lider_comunidad` role at QA Test School, this scenario applies.
- Login: `admin.qa@fne.cl`.
- Steps:
  1. Verify `lider.qa@fne.cl` has only `lider_comunidad` (no `docente` etc.) at QA Test School.
  2. Open QA Test Community → Cambiar líder on `lider.qa@fne.cl` → keep "Convertir en miembro".
  3. Confirmar.
- Expected: 409 error. UI shows: "Este usuario no tiene otro rol en este colegio. Usa 'Quitar de esta comunidad' en su lugar." Leader stays active (verify: leaders count unchanged).
- If the user does have other roles (e.g., docente), this scenario does not apply for `lider.qa@fne.cl` — skip and note "N/A: lider.qa has additional roles".

### B2.5 — ED can promote / demote in their own school

- Login: `directivo.qa@fne.cl`.
- Steps: navigate to "Comunidades" → QA Test Community → leaders panel. Promote a docente, then demote them back.
- Expected: same behavior as admin. ED can perform both actions on QA Test School communities.

### B3.1 — ED cannot promote in another school

- Login: `directivo.qa@fne.cl`.
- Steps: open DevTools console. Send `fetch('/api/admin/growth-communities/<a-non-QA-Test-School-community-uuid>/leaders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: '<any uuid>' }) })`.
- Expected: status 403 with body `{ error: 'No tienes permiso para gestionar líderes de esta comunidad' }`.

---

## 8. Track C — Standalone CRUD UI

### C1.1 — Admin creates a new community in QA School B

- Login: `admin.qa@fne.cl`.
- Steps:
  1. Navigate to `/admin/growth-communities`.
  2. Pick "QA School B — Liceo de Prueba" in the school selector.
  3. Click "Crear comunidad".
  4. In the modal: name = "Comunidad de Prueba Codex", max_teachers = 8, description = "Created by Codex during QA run".
  5. Submit.
- Expected:
  - Toast: "Comunidad creada correctamente."
  - The new community appears in the list with 0 members, capacity 8.
- **Reset:** delete this community in C1.4, OR keep it for the rest of Track C and delete in the final cleanup.

### C1.2 — Admin creates a community: name validation

- Login: `admin.qa@fne.cl`.
- Steps: open the create modal, leave name blank, submit.
- Expected: a toast/inline error appears OR the submit button is disabled. No community is created.

### C1.3 — Admin creates a community: max_teachers out-of-range

- Login: `admin.qa@fne.cl`.
- Steps: open the create modal, name "Test Range", max_teachers = 1, submit.
- Expected: 400 error. Toast indicates max_teachers must be 2-16.
- Repeat with max_teachers = 17 — same expected outcome.

### C1.4 — Admin edits an existing community (name + max_teachers)

- Login: `admin.qa@fne.cl`.
- Steps:
  1. On the QA School B list, click the **pencil icon** next to "Comunidad de Prueba Codex" (created in C1.1).
  2. Change name to "Comunidad Codex Editada", max_teachers to 12.
  3. Submit.
- Expected:
  - Toast: "Comunidad actualizada."
  - Row updates immediately to the new name and capacity.

### C1.5 — Admin edits: rejects member-incompatible generation change

- This requires a school WITH generations and a community with members. QA Test School has `has_generations=false`, so this path can be probed only via API:
- Login: `admin.qa@fne.cl`.
- Steps: in DevTools console, send a PATCH to `/api/admin/growth-communities/3aadfecf-e37a-4fdd-9ff1-c85f0989b1fd` with body `{ "generation_id": "<random uuid>" }`.
- Expected: 400 with `error: 'generation_invalid'` OR `'members_have_other_generation'`. Either is acceptable since the school doesn't use generations.

### C2.1 — Admin deletes an empty community (happy path)

- Pre-state: "Comunidad Codex Editada" exists in QA School B with 0 members.
- Login: `admin.qa@fne.cl`.
- Steps:
  1. Click the **trash icon** on that row.
  2. The modal opens and immediately makes a preview DELETE call.
  3. The preview returns "no blockers" → the modal shows "Esta comunidad no tiene miembros ni dependencias. ¿Confirmas la eliminación?" with an Eliminar button.
  4. Click Eliminar.
- Expected:
  - Toast: "Comunidad eliminada."
  - Row disappears.
  - QA School B is back to 0 communities.

### C2.2 — Admin tries to delete QA Test Community (has members) → blocked

- Login: `admin.qa@fne.cl`.
- Steps:
  1. Navigate to `/admin/growth-communities`, pick QA Test School.
  2. Click trash icon on "QA Test Community".
  3. The preview DELETE returns blockers.
- Expected: modal lists at least:
  - "Miembros / líderes activos: 8" (or whatever count matches: 2 leaders + 6 non-leader members = 8 active rows in user_roles).
  - Possibly: "Espacios de trabajo de la comunidad", "Sesiones de consultoría", etc., depending on what other QA seed data references this community.
  - **No "Eliminar" button is shown** — only "Cerrar".
- Click Cerrar. The community remains.

### C2.3 — ED deletes a community in their own school (with confirmation)

- Pre-state: ensure QA Test School has a leaderless / empty test community (create one as admin first if needed for this scenario).
- Login: `directivo.qa@fne.cl`.
- Steps: navigate to Comunidades → click trash on the empty community → confirm delete.
- Expected: same flow as C2.1. ED can delete within their own school.

### C2.4 — ED cannot create / edit / delete in another school (UI hides controls)

- Login: `directivo.qa@fne.cl`.
- Expected: "Comunidades" only shows QA Test School's communities. There is no way via UI to target QA School B (no school selector). The "Crear comunidad" button creates only in their own school.

---

## 9. Negative tests (other roles must NOT access)

For each role below, log in and verify NONE of the following are accessible:

| Role | Test |
|---|---|
| `consultor.qa@fne.cl` | (a) sidebar has no "Comunidades" item; (b) navigating to `/admin/growth-communities` redirects to `/dashboard`. |
| `community.manager.qa@fne.cl` | Same as above. |
| `supervisor.qa@fne.cl` | Same as above. |
| `docente.qa@fne.cl` | Same as above. |
| `encargado.licitacion.qa@fne.cl` | Same as above. |
| `lider.generacion.qa@fne.cl` | Same as above (lider_generacion is not in the new allow-list). |

Additionally, verify API endpoints reject these roles:

```js
// Run in DevTools console while logged in as the role above
fetch('/api/admin/growth-communities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', school_id: 257 }) }).then(r => console.log(r.status))
// Expected: 403
```

---

## 10. Race / safety checks (advisory)

These verify edge cases the dev team flagged but couldn't fully test in unit tests.

### R1 — Two concurrent promotes of the same user

- Pre-state: a community with 1 leader, target user is a member with no leader role.
- Steps:
  1. Open two browser tabs.
  2. In each tab, log in as admin and navigate to the same community's leaders panel.
  3. Click "Promotear a líder" on the same target user in both tabs at the same instant.
- Expected: one tab returns 200 (`promoted: 1`). The other tab returns 409 `already_leader` OR (very rarely, due to FIXME-F4) both succeed and the user has 2 leader rows. If the latter happens, **report it** — it's a known race condition that still needs a DB unique partial index.

### R2 — Cross-community member + demote

- Setup: in QA Test Community, promote `estudiante1.qa@fne.cl` to leader. Then at the API level (admin, DevTools console), bind a non-leader role of `estudiante1.qa@fne.cl` to a DIFFERENT community in QA Test School (you may need to create a temporary 2nd community for this scenario).
- Steps: try to demote `estudiante1.qa@fne.cl` from QA Test Community using "Convertir en miembro de esta comunidad".
- Expected: 409 with error `chosen_row_in_other_community`. Toast says: "El otro rol del usuario ya pertenece a otra comunidad. Reasigna ese rol primero o usa 'Quitar de esta comunidad'."
- Reset: demote with "Quitar de esta comunidad" instead, then delete the temp 2nd community.

---

## 11. Reset checklist

After running all scenarios, verify the system is back to the pre-test state described in §4:

- [ ] QA Test School has exactly 1 community: "QA Test Community"
- [ ] QA Test Community has exactly 2 leaders: `lider.qa@fne.cl` + `docente-multirole.qa@fne.cl`
- [ ] QA Test Community has 6 non-leader members
- [ ] QA School B has 0 communities
- [ ] No `*Codex*` named communities remain anywhere
- [ ] No QA test user has unexpected new role assignments (compare against the table in §3)

If any deviation, fix it (delete extras, demote/promote as needed). If you can't restore, list the deviations in your final report so the user can clean up.

---

## 12. Reporting results

When you finish, write a summary in this exact format:

```
# Codex QA Run — Growth Communities — <date>

## Scenarios run: <N>
## Pass: <P>  | Fail: <F>  | Skipped: <S>

## Failures
- [B2.4] <description>: <observed vs expected>. Screenshot: <path>.
- ...

## Notes
- ...
```

Include screenshots for every Fail. Save them under `~/Downloads/codex-qa-<date>/`.

---

## 13. Hard rules (do not break)

1. **No deployments.** Never run `vercel`, `vercel --prod`, or any deploy command.
2. **No real customer data.** Stay strictly inside `*.qa@fne.cl` accounts and the QA Test School / QA School B environments.
3. **No secrets in URLs.** Don't put credentials, tokens, or PII in the address bar or any visible field outside the password input.
4. **Login only at `localhost:3000`.** Never type the QA credentials on any other host.
5. **Don't create accounts.** All test accounts already exist. If something is missing, stop and tell the user.
6. **Don't change account settings, schools, or RBAC outside this guide.** Stick to the scenarios.
7. **If something goes wrong** (unexpected error, data corruption, blocked flow), STOP and write a clear note. Don't try to fix it.

---

## 14. Glossary

- **Growth community / Comunidad de Crecimiento:** a 2-16 member pod of teachers within a school, usually under the guidance of a Líder de Comunidad.
- **Líder de Comunidad:** the role assigned to community leaders. Multiple leaders per community are allowed (verified — production has 2-leader communities today).
- **Equipo Directivo:** school leadership team. School-scoped role (sees only their own school's data).
- **Generation / Generación:** an optional cohort sub-grouping within a school. The QA test schools do not use generations (`has_generations: false`), so generation-related fields can be ignored in most scenarios.
- **Demote modes:**
  - `demote_to_member`: leader becomes a regular member of the same community.
  - `remove_from_community`: leader is removed from the community entirely (their non-leader role's `community_id` is set to null).
