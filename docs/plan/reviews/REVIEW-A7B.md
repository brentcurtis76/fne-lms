# CODEX REVIEW — A7b round 1

VERDICT: PASS

Phase A7b meets its frozen acceptance criteria. Commit `5e1940d` confines executable changes to the two declared files, replaces the contact route's Formspree transport with Resend, removes the route's monthly tracker gate, maps every current and legacy interest value, escapes every user-controlled HTML interpolation, normalizes every user-controlled subject interpolation against CR/LF injection, preserves the required soft-fail behavior, and adds meaningful handler-level coverage. No BLOCKING, SHOULD-FIX, or NIT finding remains.

BLOCKING:

- None.

SHOULD-FIX:

- None.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- Scope is exact: `3cb3327..5e1940d` changes only `pages/api/contact.ts` and `__tests__/api/contact.test.ts`; there is no dependency, schema, middleware, UI, or unrelated product change.
- Escaping is complete for the HTML boundary. `nombre`, `email`, `institucion`, optional `cargo`, the mapped-or-fallback `interes`, and `mensaje` all pass through `escapeHtml` before interpolation (`pages/api/contact.ts:70-76`); message newlines become the sole intentionally introduced `<br>` markup only after escaping. The tests exercise hostile tags, attribute payloads, ampersands, both quote types, and the unknown-interest fallback (`__tests__/api/contact.test.ts:214-244`).
- Subject handling is resistant to header injection. All three user-controlled subject components pass through `subjectSafe`, which converts CR/LF runs to spaces (`pages/api/contact.ts:147-151`), and the test verifies a forged `Bcc:` line cannot create another header (`__tests__/api/contact.test.ts:246-256`). HTML entity encoding would be the wrong transform for this plain-text field. Resend 3.5.0 sends the subject as a property in the JSON `/emails` request rather than concatenating a raw SMTP header, so CR/LF normalization closes the relevant application boundary.
- The Resend payload is correct: fixed `info@nuevaeducacion.org` recipient, configured sender with the house fallback, validated lead address as `reply_to`, normalized subject, and escaped HTML body (`pages/api/contact.ts:165-173`). Both provider error-as-value and thrown-error paths retain a 200 response with `emailSent: false`; a missing key avoids client construction and also returns 200 (`pages/api/contact.ts:153-199`). That is the explicitly required soft-fail contract, despite the acknowledged operational risk that a sender outage can lose a homepage lead until the planned persistence work lands.
- Alias mapping covers the five values the live form submits (`inspira`, `inicia`, `evoluciona`, `aula-generativa`, `otro`) and the three legacy keys (`pasantias`, `consultoria`, `formacion`) at `pages/api/contact.ts:21-33`. The parameterized tests verify all eight labels in both subject and body (`__tests__/api/contact.test.ts:138-167`). Keeping the legacy display labels preserves prior payload semantics and is acceptable.
- Removal is complete within the frozen scope. The contact route contains no `FORMSPREE_ENDPOINT`, Formspree call, `trackFormSubmission`, tracker import, 50/month gate, or dead confirmation template. A handler-level test also proves that configuring the legacy endpoint causes no `fetch` call (`__tests__/api/contact.test.ts:198-205`). `lib/formSubmissionTracker.ts` and the legacy admin usage surface remain elsewhere in the repository by explicit backlog decision; their deletion was out of A7b scope.
- The best-effort limiter is placed after the 405 guard and before validation/transport, enforces five requests per minute per IP, and short-circuits the sixth with 429 before another send (`pages/api/contact.ts:35-43`; `__tests__/api/contact.test.ts:82-106`).
- Independent test evidence on final branch head `cb00abd`: targeted Vitest **24/24 passed**; `npm run type-check` passed; `npm run lint` passed with zero warnings; full `npm test` passed **226 files / 3,394 tests**; `npm run build` passed and emitted `/api/contact`. DB and Playwright suites were not run because A7b changes neither DB nor UI behavior.
