# Acceso (sign-in, sign-up, passwords)

Area `01-acceso`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `c7e27398c` (2026-11-22).

7 screen files, 13 API files, 7 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/403` | `pages/403.tsx` | 39 | — |  |
| `/change-password` | `pages/change-password.tsx` | 385 | — |  |
| `/login` | `pages/login.tsx` | 627 | — |  |
| `/pending-approval` | `pages/pending-approval.tsx` | 172 | — |  |
| `/registro-tractor` | `pages/registro-tractor.tsx` | 534 | — | Looks like a leftover but is in use |
| `/registro` | `pages/registro.tsx` | 627 | — | Looks like a leftover but is in use |
| `/reset-password` | `pages/reset-password.tsx` | 735 | — |  |

## /403

File `pages/403.tsx` · 39 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.8 `403 · Acceso restringido`
  - l.12 `403 · Acceso restringido`
- Linked from: `pages/admin/transformation/metrics.tsx:70`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/assessment-frequency-validation.spec.ts`, `tests/e2e/notification-unsubscribe.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No tienes permisos para acceder a esta sección.» | h1 |  | ForbiddenPage · l.13 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Volver al inicio» | `/` |  |  | ForbiddenPage · l.21 |
| «Contactar soporte» | `mailto:soporte@nuevaeducacion.org?subject=Acceso%20V%C3%ADas%20de%20Transformaci%C3%B3n` |  |  | ForbiddenPage · l.27 |

**Other texts on screen** (3)

- «403 · Acceso restringido» — ForbiddenPage · l.8
- «403 · Acceso restringido» — ForbiddenPage · l.12
- «Si necesitabas revisar las métricas de Vías de Transformación u otra vista administrativa, solicita a un administrador que habilite tu rol (admin o consultor).» — ForbiddenPage · l.17

## /change-password

File `pages/change-password.tsx` · 385 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.63 `router.push → /login  (when !session?.user)`
  - l.74 `router.push → /login  (when response.status === 401)`
  - l.103 `router.push → /dashboard  (when !state.mustChangePassword)`
  - l.120 `router.push → /login`
  - l.192 `router.push → /login`
  - l.236 `router.replace → /dashboard  (when verificationUnavailable)`
- Linked from: `components/DynamicFavicon.tsx:16`, `hooks/usePanel.ts:253`, `lib/auth/forced-password-change.ts:34`, `lib/look.ts:96`, `pages/login.tsx:127`
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/components/ChangePasswordPage.forcedCompletion.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No pudimos verificar tu cuenta» | h2 | `verificationUnavailable` | ChangePasswordPage · l.226 |
| «Cambio de Contraseña Requerido» | h2 |  | ChangePasswordPage · l.281 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{() => router.replace('/dashboard')}` | `verificationUnavailable` |  | `testid=forced-change-retry` | ChangePasswordPage · l.234 |
| «Cerrar sesión» | `{handleLogout}` | `verificationUnavailable` |  | `testid=forced-change-logout` | ChangePasswordPage · l.242 |
| «Cerrar Sesión» | `{handleLogout}` |  |  |  | ChangePasswordPage · l.266 |
| «Actualizando... / Cambiar Contraseña» (submits the form) |  |  | `{updating \|\| !newPassword \|\| !confirmPassword}` |  | ChangePasswordPage · l.371 |

**Fields** (3)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nueva Contraseña» | {showPasswords ? "text" : "password"} | `new-password` · required |  |  | `id=new-password (id used by code)` | ChangePasswordPage · l.305 |
| «Confirmar Nueva Contraseña» | {showPasswords ? "text" : "password"} | `confirm-password` · required |  |  | `id=confirm-password (id used by code)` | ChangePasswordPage · l.323 |
| «Mostrar contraseñas» | checkbox | `show-password` |  |  | `id=show-password (id used by code)` | ChangePasswordPage · l.337 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handlePasswordChange}` |  | ChangePasswordPage · l.299 |

**Toasts** (6)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Las contraseñas no coinciden» | `newPassword !== confirmPassword` | handlePasswordChange · l.129 |
| error | «{validationError}» | `validationError` | handlePasswordChange · l.135 |
| error | «Tu contraseña se actualizó, pero no pudimos completar el proceso.» | `!response.ok && result?.passwordChanged` | handlePasswordChange · l.166 |
| error | «Error al actualizar la contraseña. Por favor intenta nuevamente.» | `!response.ok && !(result?.passwordChanged)` | handlePasswordChange · l.168 |
| success | «Contraseña actualizada exitosamente. Inicia sesión con tu nueva contraseña.» |  | handlePasswordChange · l.187 |
| error | «Error al actualizar la contraseña. Por favor intenta nuevamente.» |  | handlePasswordChange · l.199 |

**Moves to another page from code** (6)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkAuth · l.63 |
| `/login` | `router.push` | `response.status === 401` | checkAuth · l.74 |
| `/dashboard` | `router.push` | `!state.mustChangePassword` | checkAuth · l.103 |
| `/login` | `router.push` |  | handleLogout · l.120 |
| `/login` | `router.push` |  | handlePasswordChange · l.192 |
| `/dashboard` | `router.replace` | `verificationUnavailable` | ChangePasswordPage · l.236 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 1000)` | handlePasswordChange · l.191 |

**Values shown from data** (1)

- `✓ / •` — ChangePasswordPage · l.362, when `each PASSWORD_RULES`

**Other texts on screen** (8)

- «Cambiar Contraseña - Genera» — ChangePasswordPage · l.217, when `verificationUnavailable`
- «No pudimos comprobar si necesitas cambiar tu contraseña. Es un problema temporal de conexión, no de tu cuenta.» — ChangePasswordPage · l.230, when `verificationUnavailable`
- «Cambiar Contraseña - Genera» — ChangePasswordPage · l.260
- «El administrador ha restablecido tu contraseña. Por seguridad, debes crear una nueva. / Por seguridad, debes cambiar tu contraseña en el primer inicio de sesión» — ChangePasswordPage · l.287
- «Nueva Contraseña» (label) — ChangePasswordPage · l.301
- «Confirmar Nueva Contraseña» (label) — ChangePasswordPage · l.319
- «Mostrar contraseñas» (label) — ChangePasswordPage · l.345
- «Requisitos de la contraseña:» — ChangePasswordPage · l.352

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/auth/password-policy.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/force-password-change` | POST | `pages/change-password.tsx:152` |
| `/api/auth/password-change-state` | GET | `pages/change-password.tsx:69` |

## /login

File `pages/login.tsx` · 627 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/DynamicFavicon.tsx:13`, `components/Footer.tsx:122`, `components/auth/AuthWrapper.tsx:133`, `components/auth/AuthWrapper.tsx:19`, `components/auth/ProtectedRoute.tsx:31`, `components/layout/Header.tsx:96`, `components/layout/MainLayout.tsx:298`, `components/qa/QAFloatingWidget.tsx:137`, `components/qa/QAFloatingWidget.tsx:832`, `components/sessions/JoinMeetingButton.tsx:377`, `components/site/SiteLayout.tsx:129`, `components/site/SiteLayout.tsx:134` and 258 more
- Tests: browser tests that CI runs: `tests/e2e/auth-cookie-identity.spec.ts`, `tests/e2e/auth-lifecycle.spec.ts`, `tests/e2e/login-resilience.spec.ts`, `tests/e2e/look-frame.spec.ts`, `tests/e2e/look-kit.spec.ts`, `tests/e2e/look-panel.spec.ts`, `tests/e2e/look-sessions.spec.ts`, `tests/e2e/look-switch.spec.ts`, `tests/e2e/notification-preferences-api.spec.ts`, `tests/e2e/notification-settings.spec.ts`, `tests/e2e/pasantias-leads-admin.spec.ts`, `tests/e2e/smoke.spec.ts`; browser tests CI skips: `tests/e2e/assessment-frequency-validation.spec.ts`, `tests/e2e/context-questions/admin-ui.spec.ts`, `tests/e2e/due-reminders.spec.ts`, `tests/e2e/feedback-notify-admins.spec.ts`, `tests/e2e/flows/proposal-admin-visibility.spec.ts`, `tests/e2e/flows/proposal-buckets.spec.ts`, `tests/e2e/flows/proposal-config.spec.ts`, `tests/e2e/flows/proposal-consultant-crud.spec.ts`, `tests/e2e/flows/proposal-document-library.spec.ts`, `tests/e2e/flows/proposal-versioning.spec.ts`, `tests/e2e/meeting-agreements-tasks.spec.ts`, `tests/e2e/meeting-finalize-email-outcome.spec.ts`, `tests/e2e/messaging-notifications.spec.ts`, `tests/e2e/notification-bounce.spec.ts`, `tests/e2e/notification-catalog-links.spec.ts`, `tests/e2e/notification-dispatch.spec.ts`, `tests/e2e/notification-insert-boundary.spec.ts`, `tests/e2e/notification-mail-mirror.spec.ts`, `tests/e2e/notification-occurrence-idempotency.spec.ts`, `tests/e2e/notification-preference-compat.spec.ts`, `tests/e2e/proc-pilot-journey.spec.ts`, `tests/e2e/reservation.spec.ts`, `tests/e2e/sentry-replay-disabled.spec.ts`, `tests/e2e/session-reminders.spec.ts`, `tests/qa/auth-redirects.spec.ts`, `tests/qa/mobile-sidebar.spec.ts`, `tests/qa/qa-system.spec.ts`; unit tests of the page: `__tests__/components/LoginPage.passwordRecovery.test.tsx`, `__tests__/components/LoginPage.sessionProvider.test.tsx`, `__tests__/components/LoginPage.signIn.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### Approved changes (decided by Brent with the mock-ups; not losses)

- Layout: on desktop a black half with the G mark, «Genera» / «Hub de Transformación» and the line isotype, and a white half with the form; on a phone a short black band with the logo (in flow, no overlap), then the form. Today's gradient, pulsing circles, bouncing dots and hover-grow are gone. New texts on the black half: eyebrow «Fundación Nueva Educación» and «La plataforma de aprendizaje y transformación de tu comunidad educativa.» (login.md 'Changed on purpose', Layout and 'New texts'; approved by Brent 13 Nov 2026 10:40)
- Each message has a set kind instead of a colour guessed from its words: «Correo o contraseña incorrectos» is a red notice, the reset answer a success notice, the others (empty fields, session expired, confirm e-mail, empty e-mail in forgot mode) neutral notices. (login.md 'Changed on purpose', Message colours; approved by Brent 13 Nov 2026 10:40)
- Buttons: «Iniciar Sesión» and «Enviar enlace» yellow with black text, «Volver» outline, the forgot link black underlined. (login.md 'Changed on purpose', Buttons; approved by Brent 13 Nov 2026 10:40)
- «¡Bienvenido de vuelta!» becomes the page's H1 (today an H2 and the page has no H1). (login.md 'Changed on purpose', Heading; approved by Brent 13 Nov 2026 10:40)
- Help line wording: «¿Necesitas ayuda?Contacta soporte» becomes «¿Necesitas ayuda? Contacta soporte» (missing space fixed). (login.md 'Changed on purpose', Small things; approved by Brent 13 Nov 2026 10:40)
- Messages sit inside an aria-live area. (login.md 'Changed on purpose', Small things; approved by Brent 13 Nov 2026 10:40)
- The loading screen has role=status. (login.md 'Changed on purpose', Small things; approved by Brent 13 Nov 2026 10:40)
- The password field gets aria-invalid while the red error shows. (login.md 'Changed on purpose', Small things; approved by Brent 13 Nov 2026 10:40)
- The phone logo's accessible name changes from «Genera» to «Genera - Hub de Transformación». (login.md 'Changed on purpose', Small things; approved by Brent 13 Nov 2026 10:40)
- The foundation's logo at the foot of the form is centred under a thin rule (it sat at the left); Brent asked for this change before approving. (LEDGER Brent's decisions, 13 Nov 2026 10:40)

### Notes

- There is no «Recordarme», no show-password and no sign-up link; adding them would be new features («Recordarme» has no backing logic today). (login.md §9 item 9)
- Kept exactly: every id, data-testid, autocomplete value, label, placeholder (tu@email.com) and «Iniciar Sesión»; both tab titles. (login.md 'Changed on purpose', Kept exactly)
- The sample-state strip sits at the foot of the mock-up, not at the top; a mock-up tool, not design. (login.md 'Changed on purpose', 'By the phase 1 session')
- No place in the mock-up, must survive: «Por favor confirma tu correo electrónico antes de iniciar sesión» (needs an unconfirmed account), where each user is sent after signing in, the 15-second limit, and the check for an already signed-in session. (login.md 'No place in the mock-up')

### What the page file itself draws

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «No pudimos iniciar sesión» | h1 | `requiresReload` | LoginPage · l.313 |
| «Recuperar contraseña / ¡Bienvenido de vuelta!» | h2 |  | LoginPage · l.402 |

**Buttons** (5)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Reintentar» | `{() => window.location.reload()}` | `requiresReload` |  | `testid=login-retry` | LoginPage · l.315 |
| «¿Olvidaste tu contraseña?» | `{() => setIsResetMode(true)}` | `!isResetMode` | `{isSigningIn}` | `testid=login-forgot-password` | LoginPage · l.481 |
| «Volver» | `{() => setIsResetMode(false)}` | `isResetMode` | `{isSendingReset}` | `testid=login-reset-back` | LoginPage · l.500 |
| «Enviando... / Enviar enlace» | `{handlePasswordReset}` | `isResetMode` | `{isSendingReset}` | `testid=login-reset-submit` | LoginPage · l.512 |
| «Iniciando sesión... / Iniciar Sesión» (submits the form) |  | `!(isResetMode)` | `{isSigningIn}` | `testid=login-submit` | LoginPage · l.543 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[img: Genera - Hub de Transformación]» | `/` | screen size: `hidden lg:flex` |  | LoginPage · l.371 |
| «[img: Genera]» | `/` | screen size: `lg:hidden` |  | LoginPage · l.390 |
| «Contacta soporte» | `mailto:soporte@nuevaeducacion.org` |  |  | LoginPage · l.605 |
| «[img: Fundación Nueva Educación]» | `/` |  |  | LoginPage · l.612 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Correo electrónico» | email | «tu@email.com» |  |  | `testid=login-email id=login-email (id used by code)` | LoginPage · l.428 |
| «Contraseña» | password | «••••••••» |  | `!isResetMode` | `testid=login-password id=login-password (id used by code)` | LoginPage · l.451 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Genera - Hub de Transformación · /genera/logo-full-transparent.svg | screen size: `hidden lg:flex` |  | LoginPage · l.372 |
| img · alt Genera · /genera/logo-horizontal-on-light.svg | screen size: `lg:hidden` |  | LoginPage · l.391 |
| img · alt Fundación Nueva Educación · /Logo BW.png?v=3 |  |  | LoginPage · l.613 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => { e.preventDefault(); if (!isResetMode) { handleSignIn(); } else { handl…}` |  | LoginPage · l.410 |

**Messages set on the page** (9)

| Text | Set by | When | Where |
|---|---|---|---|
| «Inactive login attempt» | `throw (shown by whoever catches it)` | `activeAttempt.current !== attempt` | assertCurrent · l.65 |
| «Sign-in unavailable» | `throw (shown by whoever catches it)` | `credentials && error` | complete · l.85 |
| «Missing authenticated user» | `throw (shown by whoever catches it)` | `credentials && !data.user` | complete · l.87 |
| «Session verification unavailable» | `throw (shown by whoever catches it)` | `!(credentials) && (error \|\| !data.user) && !expiredSession` | complete · l.100 |
| «Session cleanup unavailable» | `throw (shown by whoever catches it)` | `!(credentials) && (error \|\| !data.user) && signOutError` | complete · l.107 |
| «Password state unavailable» | `throw (shown by whoever catches it)` | `flagError \|\| typeof mustChangePassword !== 'boolean'` | complete · l.124 |
| «Login navigation incomplete» | `throw (shown by whoever catches it)` | `!('message' in result) && (!navigated \|\| window.location.pathname.replace(/\/$/, '') === '/login')` | LoginPage · l.166 |
| «Por favor ingresa tu correo y contraseña» | `setMessage` | `!email.trim() \|\| !password` | handleSignIn · l.226 |
| «Por favor ingresa tu correo electrónico» | `setMessage` | `!normalizedEmail` | handlePasswordReset · l.265 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{result.destination}` | `router.push` | `!('message' in result)` | LoginPage · l.162 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `activeAttempt.current \|\| reloadRequired.current` | LoginPage · l.53 |
| `activeAttempt.current !== attempt` | LoginPage · l.170 |
| `reloadRequired.current \|\| activeAttempt.current` | LoginPage · l.197 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `LOGIN_RETRY_MESSAGE` | «No pudimos completar el inicio de sesión. Revisa tu conexión y vuelve a intentarlo.» | l.18 |
| `stage` | «authentication / session-verification» | LoginPage · l.60 |

**Other texts written in the code (safety net: not tied to an element by the script)** (5)

| Text | Where |
|---|---|
| «Correo o contraseña incorrectos» | LoginPage · l.77 |
| «Por favor confirma tu correo electrónico antes de iniciar sesión» | LoginPage · l.82 |
| «Tu sesión venció. Inicia sesión con tu nueva contraseña.» | LoginPage · l.109 |
| «Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.» | LoginPage · l.256 |
| «Revisa tu bandeja de entrada y la carpeta de spam.» | LoginPage · l.257 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, LOGIN_TIMEOUT_MS)` | LoginPage · l.145 |
| timer | `setTimeout(…, Math.max(0, LOGIN_TIMEOUT_MS …)` | LoginPage · l.207 |
| role | `role=alert` | LoginPage · l.314 |
| mark | `testid=login-message` | LoginPage · l.575 |
| address value | `?next` | l.1 |

**Values shown from data** (2)

- `{message}` — LoginPage · l.314, when `requiresReload`
- `{message}` — LoginPage · l.591, when `message`

**Other texts on screen** (9)

- «Iniciar sesión \| Genera» — LoginPage · l.310, when `requiresReload`
- «Inicia sesión en tu cuenta \| Genera» — LoginPage · l.334, when `isLoading`
- «Tu sesión está lista. Estamos cargando la página... / Verificando sesión...» — LoginPage · l.339, when `isLoading`
- «Inicia sesión en tu cuenta \| Genera» — LoginPage · l.349
- «Te ayudaremos a recuperar el acceso / Ingresa a tu cuenta para continuar» — LoginPage · l.405
- «Correo electrónico» (label) — LoginPage · l.421
- «Contraseña» (label) — LoginPage · l.444, when `!isResetMode`
- «Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.» — LoginPage · l.472, when `isResetMode`
- «¿Necesitas ayuda?» — LoginPage · l.604

**Reads and writes the database directly:** `rpc:current_password_change_state`

### Pieces it uses (each is listed once, under "Pieces" below)

- `utils/profileCompletionCheck.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/recovery-request` | POST | `pages/login.tsx:285` |

## /pending-approval

File `pages/pending-approval.tsx` · 172 lines · frame: old Header

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.20 `router.push → /login  (when !session?.user)`
  - l.37 `router.push → /dashboard  (when profileData?.approval_status === 'approved')`
  - l.54 `router.push → /login`
- Linked from: `components/auth/ProtectedRoute.tsx:37`, `lib/frontend-auth-utils.ts:143`, `lib/frontend-auth-utils.ts:149`, `lib/look.ts:97`, `pages/profile.tsx:463`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Acceso Denegado» | h1 | `isRejected` | PendingApprovalPage · l.89 |
| «Cuenta en Revisión» | h1 | `!(isRejected)` | PendingApprovalPage · l.130 |
| «Información de tu perfil:» | h3 | `!(isRejected)` | PendingApprovalPage · l.144 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar Sesión» | `{handleSignOut}` | `isRejected` |  |  | PendingApprovalPage · l.105 |
| «Cerrar Sesión» | `{handleSignOut}` | `!(isRejected)` |  |  | PendingApprovalPage · l.158 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Contactar FNE» | `https://nuevaeducacion.org/contacto` (new tab) | `isRejected` |  | PendingApprovalPage · l.111 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!session?.user` | checkUser · l.20 |
| `/dashboard` | `router.push` | `profileData?.approval_status === 'approved'` | checkUser · l.37 |
| `/login` | `router.push` |  | handleSignOut · l.54 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Header` |  |  |  | PendingApprovalPage · l.75 |

**Other texts on screen** (10)

- «Cargando...» — PendingApprovalPage · l.62, when `loading`
- «Estado de Cuenta \| Genera» — PendingApprovalPage · l.73
- «Tu solicitud de acceso a la plataforma ha sido revisada y no ha sido aprobada. Esto puede deberse a que tu institución educativa no forma parte de nuestros programas de capacitación actuales.» — PendingApprovalPage · l.94, when `isRejected`
- «Si crees que esto es un error o tienes preguntas sobre nuestros programas, puedes contactarnos a través de nuestro sitio web.» — PendingApprovalPage · l.100, when `isRejected`
- «¡Gracias por registrarte en la plataforma de Fundación Nueva Educación!» — PendingApprovalPage · l.135, when `!(isRejected)`
- «Tu cuenta está siendo revisada por nuestro equipo administrativo para verificar que tu institución educativa forma parte de nuestros programas de capacitación.» — PendingApprovalPage · l.139, when `!(isRejected)`
- «Nombre:» — PendingApprovalPage · l.146, when `!(isRejected)`
- «Email:» — PendingApprovalPage · l.147, when `!(isRejected)`
- «Institución:» — PendingApprovalPage · l.148, when `!(isRejected)`
- «Te notificaremos por correo electrónico una vez que tu cuenta sea aprobada. Este proceso generalmente toma 1-2 días hábiles.» — PendingApprovalPage · l.153, when `!(isRejected)`

**Reads and writes the database directly:** `table:profiles` (select)

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/layout/Header.tsx`
- `components/notifications/NotificationBell.tsx`
- `components/notifications/NotificationDropdown.tsx`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/notifications` | GET | `components/notifications/NotificationBell.tsx:41` |
| `/api/notifications/[id]/read` | POST | `components/notifications/NotificationBell.tsx:85` |
| `/api/notifications/mark-all-read` | POST | `components/notifications/NotificationBell.tsx:113` |

## /registro-tractor

File `pages/registro-tractor.tsx` · 534 lines · frame: none · getServerSideProps

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `lib/look.ts:100`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Líderes de la Generación Tractor» | h1 |  | RegistroTractorPage · l.198 |
| «Registro enviado» | h2 | `submitted` | RegistroTractorPage · l.223 |
| «Completa tu registro» | h2 | `!(submitted)` | RegistroTractorPage · l.238 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Enviando… / Enviar registro» (submits the form) |  | `!(submitted)` | `{isSubmitting \|\| !schoolsAvailable}` |  | RegistroTractorPage · l.424 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ley 21.719» | `/privacidad` (new tab) | `!(submitted)` |  | RegistroTractorPage · l.400 |

**Fields** (9)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Sitio web» | text |  |  | `!(submitted)` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `id=website (id used by code)` | RegistroTractorPage · l.254 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | text | `firstName` · «Tu nombre» · required · `maxLength={80}` |  | `!(submitted)` | `id=firstName` | RegistroTractorPage · l.266 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | text | `lastName` · «Tu apellido» · required · `maxLength={80}` |  | `!(submitted)` | `id=lastName` | RegistroTractorPage · l.281 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | select | `schoolId` · required · disabled: `{!schoolsAvailable}` | «Selecciona tu colegio», «(lista) {school.name}» | `!(submitted)` | `id=schoolId` | RegistroTractorPage · l.296 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | email | `email` · «nombre@colegio.cl» · required |  | `!(submitted)` | `id=email` | RegistroTractorPage · l.315 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | date | `birthDate` · required · `min=1900-01-01 max={today}` |  | `!(submitted)` | `id=birthDate` | RegistroTractorPage · l.334 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | text | `profession` · «Ej. Profesora de Historia» · required · `maxLength={140}` |  | `!(submitted)` | `id=profession` | RegistroTractorPage · l.353 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | select | `role` · required | «Selecciona tu rol», «(lista) {TRACTOR_ROLE_LABELS[role]}» | `!(submitted)` | `id=role` | RegistroTractorPage · l.367 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | checkbox | required |  | `!(submitted)` | `id=acepto` | RegistroTractorPage · l.390 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Genera · Hub de Transformación · /genera/logo-horizontal-on-dark.svg |  |  | RegistroTractorPage · l.188 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` | `!(submitted)` | RegistroTractorPage · l.234 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No pudimos enviar tu registro. Intenta nuevamente.» |  | handleSubmit · l.160 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No pudimos enviar tu registro. Intenta nuevamente.» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmit · l.155 |

**Pieces placed here, with the texts and settings handed to them** (11)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Check` | aria-hidden: true | `submitted` |  | RegistroTractorPage · l.221 |
| `Field` | label: Nombre | `!(submitted)` | `id=firstName` | RegistroTractorPage · l.265 |
| `Field` | label: Apellido | `!(submitted)` | `id=lastName` | RegistroTractorPage · l.280 |
| `Field` | label: Colegio | `!(submitted)` | `id=schoolId` | RegistroTractorPage · l.295 |
| `Field` | label: Correo electrónico | `!(submitted)` | `id=email` | RegistroTractorPage · l.314 |
| `Field` | label: Fecha de nacimiento | `!(submitted)` | `id=birthDate` | RegistroTractorPage · l.328 |
| `Field` | label: Profesión | `!(submitted)` | `id=profession` | RegistroTractorPage · l.347 |
| `Field` | label: Rol | `!(submitted)` | `id=role` | RegistroTractorPage · l.366 |
| `ShieldCheck` | aria-hidden: true | `!(submitted)` |  | RegistroTractorPage · l.414 |
| `Loader2` | aria-hidden: true | `!(submitted) && isSubmitting` |  | RegistroTractorPage · l.431 |
| `ArrowRight` | aria-hidden: true | `!(submitted) && !(isSubmitting)` |  | RegistroTractorPage · l.438 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `ERROR_MESSAGES` | «Ingresa tu nombre.», «Ingresa tu apellido.», «Selecciona tu colegio.», «Ingresa un correo válido.», «Ingresa tu fecha de nacimiento.», «Ingresa tu profesión.» | l.57 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Registro para participantes del retiro docente Líderes de la Generación Tractor.» | RegistroTractorPage · l.177 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| focus | `document.getElementById(firstInvalid).focus()` | handleSubmit · l.140 |
| role | `role=status aria-live=polite` | RegistroTractorPage · l.219 |

**Values shown from data** (3)

- `{successName}` — RegistroTractorPage · l.227, when `submitted`
- `{successEmail}` — RegistroTractorPage · l.229, when `submitted`
- `{error}` — Field · l.530, when `error`

**Other texts on screen** (15)

- «Líderes de la Generación Tractor · Registro \| Genera» — RegistroTractorPage · l.174
- «Red Santa Marta · Retiro docente» — RegistroTractorPage · l.196
- «Tu registro abre el acceso a la comunidad de líderes que está transformando la educación.» — RegistroTractorPage · l.206
- «© 2026 Fundación Nueva Educación · Santiago, Chile» — RegistroTractorPage · l.211, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Gracias,» — RegistroTractorPage · l.227, when `submitted`
- «. Tu registro quedó en revisión. Te escribiremos a» — RegistroTractorPage · l.227, when `submitted`
- «en cuanto tu acceso a Genera esté habilitado.» — RegistroTractorPage · l.229, when `submitted`
- «Registro privado» — RegistroTractorPage · l.236, when `!(submitted)`
- «Estos datos permiten al equipo administrativo revisar y habilitar tu acceso.» — RegistroTractorPage · l.242, when `!(submitted)`
- «No se pudo cargar la lista de colegios. Intenta nuevamente más tarde.» — RegistroTractorPage · l.247, when `!(submitted) && !schoolsAvailable`
- «Sitio web» (label) — RegistroTractorPage · l.253, when `!(submitted)`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» (label) — RegistroTractorPage · l.385, when `!(submitted)`
- «Revisamos cada registro y te avisamos por correo al activar tu acceso.» — RegistroTractorPage · l.421, when `!(submitted)`
- «/* The single approved Genera decorative background: a tiled G-hub mark. */ .rt-pattern { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'><circle cx='17' cy=…» — RegistroTractorPage · l.450
- «{label} [*]» (label) — Field · l.525

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/api-auth.ts`
- `lib/signups.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/tractor-signup` | POST | `pages/registro-tractor.tsx:147` |

## /registro

File `pages/registro.tsx` · 627 lines · frame: none · getServerSideProps

**Looks like a leftover but is in use**

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `lib/look.ts:99`
- Tests: no browser test that CI runs; browser tests CI skips: `tests/e2e/registro.spec.ts`; unit tests of the page: `__tests__/components/RegistroPage.generation.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Súmate a Genera» | h1 |  | RegistroPage · l.251 |
| «Registro enviado» | h2 | `submitted` | RegistroPage · l.274 |
| «Completa tu registro» | h2 | `!(submitted)` | RegistroPage · l.289 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Enviando… / Enviar registro» (submits the form) |  | `!(submitted)` | `{isSubmitting \|\| !schoolsAvailable}` | `testid=registro-submit` | RegistroPage · l.509 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Ley 21.719» | `/privacidad` (new tab) | `!(submitted)` |  | RegistroPage · l.485 |

**Fields** (10)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Sitio web» | text |  |  | `!(submitted)` · hidden by its class (`hidden`); another control opens it or it is for screen readers | `testid=registro-website id=website (id used by code)` | RegistroPage · l.305 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | text | `firstName` · «Tu nombre» · required · `maxLength={80}` |  | `!(submitted)` | `testid=registro-first-name id=firstName` | RegistroPage · l.318 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | text | `lastName` · «Tu apellido» · required · `maxLength={80}` |  | `!(submitted)` | `testid=registro-last-name id=lastName` | RegistroPage · l.334 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | select | `schoolId` · required · disabled: `{!schoolsAvailable}` | «Selecciona tu colegio», «(lista) {school.name}» | `!(submitted)` | `testid=registro-school id=schoolId` | RegistroPage · l.350 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | select | `generationId` | «Aún no lo sé», «(lista) {generation.name}» | `!(submitted) && selectedGenerations.length > 0` | `testid=registro-generation id=generationId` | RegistroPage · l.376 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | email | `email` · «nombre@colegio.cl» · required |  | `!(submitted)` | `testid=registro-email id=email` | RegistroPage · l.395 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | date | `birthDate` · required · `min=1900-01-01 max={today}` |  | `!(submitted)` | `testid=registro-birth-date id=birthDate` | RegistroPage · l.415 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | text | `profession` · «Ej. Profesora de Historia» · required · `maxLength={140}` |  | `!(submitted)` | `testid=registro-profession id=profession` | RegistroPage · l.435 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | select | `role` · required | «Selecciona tu rol», «(lista) {TRACTOR_ROLE_LABELS[role]}» | `!(submitted)` | `testid=registro-role id=role` | RegistroPage · l.450 |
| «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» | checkbox | required |  | `!(submitted)` | `testid=registro-consent id=acepto` | RegistroPage · l.474 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Genera · Hub de Transformación · /genera/logo-horizontal-on-dark.svg |  |  | RegistroPage · l.241 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` | `!(submitted)` | RegistroPage · l.285 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «No pudimos enviar tu registro. Intenta nuevamente.» |  | handleSubmit · l.213 |

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No pudimos enviar tu registro. Intenta nuevamente.» | `throw (shown by whoever catches it)` | `!response.ok` | handleSubmit · l.208 |

**Pieces placed here, with the texts and settings handed to them** (12)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Check` | aria-hidden: true | `submitted` |  | RegistroPage · l.272 |
| `Field` | label: Nombre | `!(submitted)` | `id=firstName` | RegistroPage · l.317 |
| `Field` | label: Apellido | `!(submitted)` | `id=lastName` | RegistroPage · l.333 |
| `Field` | label: Colegio | `!(submitted)` | `id=schoolId` | RegistroPage · l.349 |
| `Field` | label: Generación · hint: Opcional — si no conoces tu generación, puedes dejarlo en blanco. | `!(submitted) && selectedGenerations.length > 0` | `id=generationId` | RegistroPage · l.370 |
| `Field` | label: Correo electrónico | `!(submitted)` | `id=email` | RegistroPage · l.394 |
| `Field` | label: Fecha de nacimiento | `!(submitted)` | `id=birthDate` | RegistroPage · l.409 |
| `Field` | label: Profesión | `!(submitted)` | `id=profession` | RegistroPage · l.429 |
| `Field` | label: Rol | `!(submitted)` | `id=role` | RegistroPage · l.449 |
| `ShieldCheck` | aria-hidden: true | `!(submitted)` |  | RegistroPage · l.499 |
| `Loader2` | aria-hidden: true | `!(submitted) && isSubmitting` |  | RegistroPage · l.517 |
| `ArrowRight` | aria-hidden: true | `!(submitted) && !(isSubmitting)` |  | RegistroPage · l.524 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `ERROR_MESSAGES` | «Ingresa tu nombre.», «Ingresa tu apellido.», «Selecciona tu colegio.», «Ingresa un correo válido.», «Ingresa tu fecha de nacimiento.», «Ingresa tu profesión.» | l.62 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Registro para acceder a Genera, la plataforma de la Fundación Nueva Educación.» | RegistroPage · l.230 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| focus | `document.getElementById(firstInvalid).focus()` | handleSubmit · l.193 |
| role | `role=status aria-live=polite` | RegistroPage · l.270 |
| role | `role=alert` | Field · l.619 |
| mark | `testid=error-{id}` | Field · l.619 |

**Values shown from data** (4)

- `{successName}` — RegistroPage · l.278, when `submitted`
- `{successEmail}` — RegistroPage · l.280, when `submitted`
- `{error}` — Field · l.619, when `error`
- `{hint}` — Field · l.623, when `!error && hint`

**Other texts on screen** (15)

- «Registro · Genera» — RegistroPage · l.227
- «Fundación Nueva Educación» — RegistroPage · l.249
- «Tu registro abre el acceso a la comunidad que está transformando la educación.» — RegistroPage · l.257
- «© 2026 Fundación Nueva Educación · Santiago, Chile» — RegistroPage · l.262, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Gracias,» — RegistroPage · l.278, when `submitted`
- «. Tu registro quedó en revisión. Te escribiremos a» — RegistroPage · l.278, when `submitted`
- «en cuanto tu acceso a Genera esté habilitado.» — RegistroPage · l.280, when `submitted`
- «Registro» — RegistroPage · l.287, when `!(submitted)`
- «Estos datos permiten al equipo administrativo revisar y habilitar tu acceso.» — RegistroPage · l.293, when `!(submitted)`
- «No se pudo cargar la lista de colegios. Intenta nuevamente más tarde.» — RegistroPage · l.298, when `!(submitted) && !schoolsAvailable`
- «Sitio web» (label) — RegistroPage · l.304, when `!(submitted)`, hidden by its class (`hidden`); another control opens it or it is for screen readers
- «Acepto el tratamiento de mis datos personales conforme a la Ley 21.719 .» (label) — RegistroPage · l.469, when `!(submitted)`
- «Revisamos cada registro y te avisamos por correo al activar tu acceso.» — RegistroPage · l.506, when `!(submitted)`
- «/* The single approved Genera decorative background: a tiled G-hub mark. */ .rt-pattern { background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'><circle cx='17' cy=…» — RegistroPage · l.536
- «{label} [*]» (label) — Field · l.613

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/api-auth.ts`
- `lib/signups.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/registro-signup` | POST | `pages/registro.tsx:200` |

## /reset-password

File `pages/reset-password.tsx` · 735 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page:
  - l.391 `router.push → /login`
  - l.463 `router.push → /login  (when phase === 'invalid')`
  - l.680 `router.push → /login`
- Linked from: `components/DynamicFavicon.tsx:15`, `lib/look.ts:95`, `pages/login.tsx:134`
- Tests: browser tests that CI runs: `tests/e2e/auth-lifecycle.spec.ts`; unit tests of the page: `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx`, `__tests__/security/auth-endpoint-localization.test.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Enlace no válido» | h1 | `phase === 'invalid'` | ResetPasswordPage · l.454 |
| «Plataforma de Crecimiento» | h1 | screen size: `hidden lg:flex` | ResetPasswordPage · l.519 |
| «Restablecer Contraseña» | h2 |  | ResetPasswordPage · l.556 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Ir a iniciar sesión» | `{() => router.push('/login')}` | `phase === 'invalid'` |  | `testid=reset-invalid-back-to-login` | ResetPasswordPage · l.461 |
| «Actualizando... / Actualizar Contraseña» (submits the form) |  |  | `{loading \|\| phase === 'updated'}` | `testid=reset-submit` | ResetPasswordPage · l.637 |
| «Volver al inicio de sesión» | `{async () => { if (phase === 'ready') { try { await fetch('/api/auth/recovery/in…}` |  |  |  | ResetPasswordPage · l.670 |

**Links** (5)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[img: Fundación Nueva Educación]» | `/` | `phase === 'invalid'` |  | ResetPasswordPage · l.440 |
| «Contacta soporte» | `mailto:soporte@nuevaeducacion.org` | `phase === 'invalid'` |  | ResetPasswordPage · l.472 |
| «[img: Fundación Nueva Educación]» | `/` | screen size: `hidden lg:flex` |  | ResetPasswordPage · l.509 |
| «[img: Fundación Nueva Educación]» | `/` | screen size: `lg:hidden` |  | ResetPasswordPage · l.544 |
| «Contacta soporte» | `mailto:soporte@nuevaeducacion.org` |  |  | ResetPasswordPage · l.724 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nueva Contraseña» | password | «••••••••» |  |  | `testid=reset-new-password` | ResetPasswordPage · l.580 |
| «Confirmar Contraseña» | password | «••••••••» |  |  | `testid=reset-confirm-password` | ResetPasswordPage · l.601 |

**Embedded media** (3)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Fundación Nueva Educación · /images/logo.png | `phase === 'invalid'` |  | ResetPasswordPage · l.441 |
| img · alt Fundación Nueva Educación · /images/logo.png | screen size: `hidden lg:flex` |  | ResetPasswordPage · l.510 |
| img · alt Fundación Nueva Educación · /images/logo.png | screen size: `lg:hidden` |  | ResetPasswordPage · l.545 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{(e) => { e.preventDefault(); handlePasswordUpdate(); }}` |  | ResetPasswordPage · l.564 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` |  | handlePasswordUpdate · l.391 |
| `/login` | `router.push` | `phase === 'invalid'` | ResetPasswordPage · l.463 |
| `/login` | `router.push` |  | ResetPasswordPage · l.680 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `typeof window === 'undefined'` | ResetPasswordPage · l.232 |
| `judgedRef.current` | ResetPasswordPage · l.242 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `RECOVERY_MESSAGES` | «El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo desde la página de inicio de sesión.», «Este enlace no es válido. Para cambiar tu contraseña, solicita un enlace de recuperación desde la página de inicio de sesión.», «El enlace no contiene la información necesaria. Solicita un enlace de recuperación nuevo desde la página de inicio de sesión.», «Este enlace no sirve para cambiar la contraseña. Solicita un enlace de recuperación desde la página de inicio de sesión.», «Este enlace usa un formato que ya no aceptamos por seguridad. Solicita un enlace de recuperación nuevo desde la página de inicio de sesión.», «No pudimos cerrar la sesión anterior de forma segura, así que no abrimos el formulario. Cierra sesión e intenta con el enlace nuevamente.», «Las contraseñas no coinciden», «La nueva contraseña debe ser diferente a la anterior», «La contraseña no cumple con los requisitos de seguridad del sistema», «No se pudo actualizar la contraseña. Inténtalo nuevamente.», «No pudimos preparar la recuperación. Inténtalo nuevamente en unos momentos.», «Contraseña actualizada exitosamente» | l.98 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | handlePasswordUpdate · l.390 |
| mark | `testid=reset-validating` | ResetPasswordPage · l.419 |
| mark | `testid=reset-invalid-link` | ResetPasswordPage · l.439 |
| mark | `testid=reset-message` | ResetPasswordPage · l.693 |

**Values shown from data** (3)

- `{message} / {RECOVERY_MESSAGES.missing}` — ResetPasswordPage · l.457, when `phase === 'invalid'`
- `✓ / •` — ResetPasswordPage · l.627, when `each PASSWORD_RULES`
- `{message}` — ResetPasswordPage · l.709, when `message`

**Other texts on screen** (12)

- «Restablecer Contraseña \| Genera» — ResetPasswordPage · l.416, when `isValidatingToken`
- «Validando enlace de recuperación...» — ResetPasswordPage · l.421, when `isValidatingToken`
- «Restablecer Contraseña \| Genera» — ResetPasswordPage · l.436, when `phase === 'invalid'`
- «¿Necesitas ayuda?» — ResetPasswordPage · l.471, when `phase === 'invalid'`
- «Restablecer Contraseña \| Genera» — ResetPasswordPage · l.488
- «Fundación Nueva Educación» — ResetPasswordPage · l.525, screen size: `hidden lg:flex`
- «Transformando la educación a través de herramientas innovadoras y colaborativas» — ResetPasswordPage · l.530, screen size: `hidden lg:flex`
- «Ingresa tu nueva contraseña para continuar» — ResetPasswordPage · l.560
- «Nueva Contraseña» (label) — ResetPasswordPage · l.573
- «Confirmar Contraseña» (label) — ResetPasswordPage · l.594
- «Requisitos de la contraseña:» — ResetPasswordPage · l.617
- «¿Necesitas ayuda?» — ResetPasswordPage · l.723

### Pieces it uses (each is listed once, under "Pieces" below)

- `lib/auth/password-policy.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/auth/recovery/complete` | POST | `pages/reset-password.tsx:356` |
| `/api/auth/recovery/context` | GET | `pages/reset-password.tsx:257` |
| `/api/auth/recovery/exchange` | POST | `pages/reset-password.tsx:298` |
| `/api/auth/recovery/invalidate` | POST | `pages/reset-password.tsx:675` |

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/layout/Header.tsx

Used by: `/pending-approval`

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Hub de Transformación» | `/` |  |  | Header · l.62 |
| «Hub de Transformación» |  |  |  | Header · l.63 |
| «Iniciar Sesión» | `/login` | `!(isLoggedIn)` |  | Header · l.96 |
| «Iniciar Sesión» |  | `!(isLoggedIn)` |  | Header · l.97 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `NotificationBell` |  | `isLoggedIn` |  | Header · l.85 |

**Other texts on screen** (3)

- «Sin colegio» (title) — Header · l.71, screen size: `hidden sm:flex`
- «{schoolName} / Sin colegio» — Header · l.71, screen size: `hidden sm:flex`
- «{localUser?.email?.substring(0, 2).t…} / US» — Header · l.89, when `isLoggedIn`

**Reads and writes the database directly:** `table:profiles` (select)

### components/notifications/NotificationBell.tsx

Used by: `/pending-approval`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[99+ / {unreadCount}]» · aria «{`Notificaciones${unreadCount > 0 ? ` (${unreadCount} ${unreadCount === 1 ? 'no …}» | `{handleBellClick}` |  |  |  | NotificationBell · l.180 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `NotificationDropdown` |  | `isOpen` |  | NotificationBell · l.223 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LOAD_ERROR` | «No se pudieron cargar las notificaciones» | l.9 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Bearer {session.access_token}» | NotificationBell · l.43 |
| «{LOAD_ERROR} (código {response.status}).» | NotificationBell · l.50 |
| «no leída» | NotificationBell · l.192 |
| «no leídas» | NotificationBell · l.192 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2000)` | fetchNotifications · l.62 |
| listener | `document.addEventListener('mousedown')` | NotificationBell · l.149 |
| timer | `setInterval(…, REFRESH_INTERVAL)` | NotificationBell · l.161 |

### components/notifications/NotificationDropdown.tsx

Used by: `/pending-approval`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Notificaciones» | h3 |  | NotificationDropdown · l.182 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon RefreshIcon]» · tooltip «Actualizar» | `{onRefresh}` |  | `{loading}` |  | NotificationDropdown · l.199 |
| «Marcar todas como leídas» | `{onMarkAllAsRead}` | `unreadCount > 0` |  |  | NotificationDropdown · l.210 |
| «Intentar de nuevo» | `{onRefresh}` | `error` |  |  | NotificationDropdown · l.244 |
| «Ver todas las notificaciones» | `{handleViewAll}` | `notifications.length > 0` |  |  | NotificationDropdown · l.357 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon CogIcon]» · aria «Configuración de notificaciones» | `/configuracion/notificaciones` |  | `testid=notification-dropdown-settings` | NotificationDropdown · l.187 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{notification.title} [{notification.description}] {getRelativeTime(notification.create…} [[Admin] [Tareas] [Cursos] [Me…» | `{() => handleNotificationClick(notification)}` | `!loading && !error && notifications.length > 0 && each notifications` | NotificationDropdown · l.268 |

**Toasts** (1)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «Sesión no válida» | `notification.related_url && !session?.user` | handleNotificationClick · l.106 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `{notification.related_url!}` | `router.push` | `notification.related_url` | handleNotificationClick · l.116 |
| `{notification.related_url}` | `router.push` | `notification.related_url && notification.related_url` | handleNotificationClick · l.126 |
| `{fallbackUrl}` | `router.push` | `!(notification.related_url)` | handleNotificationClick · l.166 |
| `/notifications` | `router.push` |  | handleViewAll · l.174 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CogIcon` | aria-hidden: true |  |  | NotificationDropdown · l.195 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `getRelativeTime()` | «ahora mismo», «hace {minutes} min», «hace {hours}h», «hace {days}d» | getRelativeTime · l.82 |

**Values shown from data** (4)

- `{error}` — NotificationDropdown · l.243, when `error`
- `{notification.title}` — NotificationDropdown · l.295, when `!loading && !error && notifications.length > 0 && each notifications`
- `{notification.description}` — NotificationDropdown · l.303, when `!loading && !error && notifications.length > 0 && each notifications && notification.description`
- `{getRelativeTime(notification.create…}` — NotificationDropdown · l.312, when `!loading && !error && notifications.length > 0 && each notifications`

**Other texts on screen** (4)

- «{unreadCount} notificación es sin leer» — NotificationDropdown · l.223, when `unreadCount > 0`
- «Cargando notificaciones...» — NotificationDropdown · l.235, when `loading && notifications.length === 0`
- «No tienes notificaciones» — NotificationDropdown · l.257, when `!loading && !error && notifications.length === 0`
- «[Admin] [Tareas] [Cursos] [Mensajes] [Social] [Feedback] [Sistema] [Workspace]» — NotificationDropdown · l.318, when `!loading && !error && notifications.length > 0 && each notifications && notification.notification_type`

### lib/api-auth.ts

Used by: `/registro-tractor`, `/registro`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Server configuration error» | `throw (shown by whoever catches it)` | `!supabaseUrl \|\| !serviceRoleKey` | createServiceRoleClient · l.113 |
| «Failed to initialize admin connection» | `throw (shown by whoever catches it)` |  | createServiceRoleClient · l.125 |

### lib/auth/password-policy.ts

Used by: `/change-password`, `/reset-password`

**Messages set on the page** (5)

| Text | Set by | When | Where |
|---|---|---|---|
| «La contraseña debe tener al menos {PASSWORD_POLICY.minLength} caracteres» | `errors.push` | `password.length < PASSWORD_POLICY.minLength` | validatePasswordPolicy · l.104 |
| «La contraseña no puede superar los {PASSWORD_POLICY.maxLength} caracteres» | `errors.push` | `password.length > PASSWORD_POLICY.maxLength` | validatePasswordPolicy · l.108 |
| «La contraseña debe contener al menos una letra mayúscula» | `errors.push` | `PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)` | validatePasswordPolicy · l.112 |
| «La contraseña debe contener al menos una letra minúscula» | `errors.push` | `PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)` | validatePasswordPolicy · l.116 |
| «La contraseña debe contener al menos un número» | `errors.push` | `PASSWORD_POLICY.requireNumber && !/[0-9]/.test(password)` | validatePasswordPolicy · l.120 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Al menos una letra mayúscula» | PASSWORD_RULES · l.68 |
| «Al menos una letra minúscula» | PASSWORD_RULES · l.73 |
| «Al menos un número» | PASSWORD_RULES · l.78 |
| «La contraseña es obligatoria» | validatePasswordPolicy · l.100 |

### lib/signups.ts

Used by: `/registro-tractor`, `/registro`

**Texts kept in lists and helpers in the code (labels, options, status names)** (7)

| Name | Texts | Where |
|---|---|---|
| `SANTA_MARTA_NETWORK_NAME` | «Santa Marta» | l.6 |
| `SIGNUP_SOURCE_LABELS` | «Líderes Tractor», «Registro general» | l.11 |
| `SIGNUP_SOURCE_INVITE_BODY` | «Ya puedes activar tu cuenta para ingresar a la plataforma Genera como parte de Líderes de la Generación Tractor.», «Ya puedes activar tu cuenta para ingresar a la plataforma Genera.» | l.18 |
| `TRACTOR_ROLE_LABELS` | «Docente», «Equipo Directivo» | l.36 |
| `TRACTOR_STATUS_LABELS` | «Pendiente», «Acceso otorgado», «Descartado» | l.41 |
| `GENERATION_WARNINGS` | «La generación del registro ya no corresponde al colegio; se otorgó sin generación.», «La generación no se aplicó porque el perfil pertenece a otro colegio.», «El perfil ya tiene otra generación asignada; no se modificó.» | l.226 |
| `ROLE_LABEL_BY_TYPE` | «Admin», «Consultor», «Equipo Directivo», «Líder Generación», «Líder Comunidad», «Community Manager», «Docente», «Supervisor de Red», «Encargado Licitación» | l.313 |

**Reads and writes the database directly:** `table:generations` (select), `table:red_escuelas` (select), `table:redes_de_colegios` (select), `table:schools` (select)

### utils/profileCompletionCheck.ts

Used by: `/login`

**Reads and writes the database directly:** `table:profiles` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/auth/change-password` | `pages/api/auth/change-password.ts` | POST | `/profile` | `__tests__/middleware.forced-password-change.test.ts`, `components/profile/PasswordChangeSection.tsx`, `lib/auth/forced-password-change.ts` |
| `/api/auth/force-password-change` | `pages/api/auth/force-password-change.ts` | POST | `/change-password` | `__tests__/api/auth/force-password-change.test.ts`, `__tests__/components/ChangePasswordPage.forcedCompletion.test.tsx`, `__tests__/middleware.forced-password-change.test.ts`, `__tests__/security/__boundary_fixtures__/clean-browser-module.tsx`, `__tests__/security/no-browser-password-mutation.test.ts` +4 |
| `/api/auth/logout` | `pages/api/auth/logout.ts` | POST | **no screen** | `__tests__/middleware.forced-password-change.test.ts`, `lib/auth/forced-password-change.ts` |
| `/api/auth/my-roles` | `pages/api/auth/my-roles.ts` | GET | `/admin/licitaciones/consultores`, `/admin/licitaciones/criterios`, `/admin/licitaciones/documentos-propuesta`, `/admin/licitaciones/feriados`, `/admin/licitaciones/templates`, `/licitaciones`, `/licitaciones/[id]`, `/licitaciones/[id]/evaluacion`, `/licitaciones/importar`, `/licitaciones/nueva` | `__tests__/api/forged-session-sweep.test.ts`, `__tests__/api/group-quiz-notifications.test.ts`, `__tests__/pages/licitaciones/evaluacion-page.test.tsx`, `__tests__/pages/licitaciones/licitacion-detail-step2.test.tsx`, `__tests__/pages/licitaciones/licitacion-detail-step6-carta.test.tsx` +16 |
| `/api/auth/password-change-state` | `pages/api/auth/password-change-state.ts` | GET | `/change-password` | `__tests__/api/auth/password-change-state.availability.test.ts`, `__tests__/components/ChangePasswordPage.forcedCompletion.test.tsx`, `__tests__/middleware.forced-password-change.test.ts`, `lib/auth/forced-password-change.ts`, `pages/change-password.tsx` +1 |
| `/api/auth/recovery-request` | `pages/api/auth/recovery-request.ts` | POST | `/login` | `__tests__/api/auth/recovery-request.test.ts`, `__tests__/components/LoginPage.passwordRecovery.test.tsx`, `pages/login.tsx`, `tests/e2e/auth-lifecycle.spec.ts` |
| `/api/auth/recovery/complete` | `pages/api/auth/recovery/complete.ts` | POST | `/reset-password` | `__tests__/api/auth/recovery/complete.test.ts`, `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx`, `__tests__/middleware.forced-password-change.test.ts`, `__tests__/security/no-browser-password-mutation.test.ts`, `lib/auth/forced-password-change.ts` +1 |
| `/api/auth/recovery/context` | `pages/api/auth/recovery/context.ts` | GET | `/reset-password` | `__tests__/api/auth/recovery/context.test.ts`, `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx`, `__tests__/middleware.forced-password-change.test.ts`, `lib/auth/forced-password-change.ts`, `pages/reset-password.tsx` |
| `/api/auth/recovery/exchange` | `pages/api/auth/recovery/exchange.ts` | POST | `/reset-password` | `__tests__/api/auth/recovery/exchange.test.ts`, `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx`, `__tests__/middleware.forced-password-change.test.ts`, `lib/auth/forced-password-change.ts`, `pages/reset-password.tsx` |
| `/api/auth/recovery/invalidate` | `pages/api/auth/recovery/invalidate.ts` | POST | `/reset-password` | `__tests__/api/auth/recovery/invalidate.test.ts`, `__tests__/components/ResetPasswordPage.recoveryProof.test.tsx`, `__tests__/middleware.forced-password-change.test.ts`, `lib/auth/forced-password-change.ts`, `pages/reset-password.tsx` |
| `/api/auth/session` | `pages/api/auth/session.ts` | GET | `/admin/news`, `/admin/upcoming-courses` | `__tests__/api/forged-session-sweep.test.ts`, `__tests__/middleware.forced-password-change.test.ts`, `lib/auth/forced-password-change.ts`, `scripts/redesign/harness/seed/60-personas-pasantias-qa.mjs`, `tests/e2e/messaging-notifications.spec.ts` +1 |
| `/api/registro-signup` | `pages/api/registro-signup.ts` |  | `/registro` | `__tests__/api/registro-signup.test.ts`, `__tests__/middleware.forced-password-change.test.ts`, `pages/registro.tsx`, `tests/e2e/auth-lifecycle.spec.ts`, `tests/e2e/registro.spec.ts` |
| `/api/tractor-signup` | `pages/api/tractor-signup.ts` |  | `/registro-tractor` | `pages/registro-tractor.tsx` |

