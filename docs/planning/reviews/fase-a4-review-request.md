# Fase A4 — review request

**Branch:** `phase/a4-pdfsrv`
**Base:** `origin/main` @ `fb61b69`
**Commits:** 1 — serving routes + shared handler + RFC 5987 tightening + tests
**Executor round:** r1

> Note on the base: `origin/main` advanced to `a1712f5` during this round with
> two docs-only commits from the **Zoom** workstream (`PROJECT_STATE.md`,
> `docs/planning/zoom-integration-plan.md`). Neither touches anything A4 reads or
> writes, so the branch was not rebased.

---

## Objective and scope (from prompt `docs/plan/prompts/a4-1.md`, criteria inlined by the PM)

> **Scope:** `pages/api/pasantias/brochure.ts`, `pages/api/pasantias/ficha.ts`,
> `__tests__/api/pasantias-pdf.test.ts`, plus two carry-forwards.
> **NOT in scope:** the generators themselves (A3, merged), the landing page
> (A6a), lead capture (A5).
>
> **Acceptance criteria:** [A1] GET-only, cache-or-generate against the
> `propuestas` bucket at `pasantias/<name>-<VERSION>.pdf` via
> `lib/propuestas/storage.ts`, upload failure degrades to generate-and-serve
> (logged, still 200); [A2] `Content-Type: application/pdf`,
> `Content-Disposition: inline` with an RFC 5987-encoded filename,
> `Cache-Control: public, max-age=3600`; [A3] a pre-existing file at the cache
> path is served as-is (D-05 manual override) — contract stated in the route's
> doc comment and tested; [A4] best-effort rate limit; [A5] tests for cache hit,
> generate-on-miss, degrade-on-upload-failure, headers incl. RFC 5987, 405;
> [A6] gates + `scripts/check-price-leak.mjs` green.
> **[C1]** register the brochure route in `ALLOWED_COMMERCIAL_IMPORTERS`; the
> ficha route must not be in it and the allowlist test should prove that.
> **[C2]** tighten the over-permissive RFC 5987 helper to the real grammar, add
> rejection tests, both filename constants stay valid.

Untouched, as required: both generators, both cohort modules,
`lib/propuestas/**` (imported, never edited), `scripts/check-price-leak.mjs`,
every page, `middleware.ts`.

## Design, in one paragraph

Both routes are the **same handler with different parameters**. A factory in
`lib/pasantias/pdf/serve.ts` takes `{document, version, filename, generate}` and
returns the rate-limited handler; each route file is a doc comment plus a call.
The order is cache-read → (miss) generate → (best-effort) upload → serve, so
D-05's manual override falls out of the design rather than being a special case:
the generator only ever runs when the bucket has nothing at the path. The
factory imports **no cohort module at all** — the commercial version and
filename arrive as plain values from the brochure route — which is what keeps
`cohort-commercial.ts` out of the ficha route's import graph.

## Files changed, grouped by risk

### Higher risk — the D-01 boundary and the public contract

| File | Δ | Note |
|---|---|---|
| `pages/api/pasantias/brochure.ts` | +33 | New. The only route permitted to import `cohort-commercial.ts` (for `BROCHURE_VERSION` and `BROCHURE_FILENAME`). Unauthenticated by owner decision (UI-gated, publicly shareable). |
| `pages/api/pasantias/ficha.ts` | +27 | New. Imports `cohort-public`-derived constants only; price-free by import graph, not by discipline. |
| `lib/pasantias/pdf/serve.ts` | +114 | New. The shared handler factory: method guard, cache-or-generate, degrade-on-upload-failure, headers, rate limit. Imports no cohort module. |

### Carry-forwards

| File | Δ | Note |
|---|---|---|
| `lib/pasantias/pdf/filenames.ts` | +45/−12 | **[C2]** `isRfc5987SafeFilename` is now the §3.2.1 `attr-char` grammar instead of printable-ASCII-minus-a-denylist. Adds `encodeRfc5987Filename` (per-UTF-8-byte percent encoding) and `buildContentDisposition` (the two-form header). |
| `lib/pasantias/__tests__/pdf.test.ts` | +24/−3 | **[C1]** brochure route added to `ALLOWED_COMMERCIAL_IMPORTERS` (plus the new A4 test file, which imports the commercial constants to pin the cache key), and one new test asserting the brochure route *does* import it and the ficha route *does not*. |

### Test surface

| File | Δ | Note |
|---|---|---|
| `__tests__/api/pasantias-pdf.test.ts` | +301 | New. 43 tests. Storage and both generators mocked; almost every case runs against both routes via `describe.each`. |

## Test evidence

```
npx vitest run __tests__/api/pasantias-pdf.test.ts
  ✓ __tests__/api/pasantias-pdf.test.ts  (43 tests) 14ms
  Test Files  1 passed (1) · Tests  43 passed (43)

npx vitest run lib/pasantias/__tests__/pdf.test.ts __tests__/lib/pasantias-cohort.test.ts \
              __tests__/scripts/check-price-leak.test.ts
  ✓ __tests__/lib/pasantias-cohort.test.ts        (38 tests)
  ✓ lib/pasantias/__tests__/pdf.test.ts           (30 tests)
  ✓ __tests__/scripts/check-price-leak.test.ts    (16 tests)
  Test Files  3 passed (3) · Tests  84 passed (84)

npm run type-check   → clean
npm run lint         → clean (--max-warnings=0)
npm test             → Test Files 254 passed (254) · Tests 4036 passed (4036)
npm run build        → success; .next/server/pages/api/pasantias/{brochure,ficha}.js
                       present and both routes in pages-manifest.json
node scripts/check-price-leak.mjs
  → OK — scanned 266 file(s) under .next/static, no commercial data found
```

`npm run test:db` not run: no migration, no policy, no table. `npm run e2e` not
run: no page and no UI — these two routes are consumed by A6a, whose mandatory
spec asserts the ficha link.

## The five things to scrutinise hardest

1. **A fourth file exists that the prompt's scope list does not name.**
   `lib/pasantias/pdf/serve.ts` holds the handler both routes share. The
   alternative was duplicating ~60 lines of cache-or-generate logic across two
   files that must behave identically forever — the exact shape where a later
   one-sided edit becomes a public-contract bug. The cost is a deviation from a
   scope list of three files; reject it and the routes get the logic inline
   twice. It imports no cohort module, which is the property that keeps D-01
   intact.

2. **The CTA URL is pinned to the configured origin, not the request.** Both
   generators accept `options.req`; this round calls them **without** it. Reason:
   the generated bytes are cached in a bucket every deployment shares, so the URL
   they print must not depend on which deployment happened to miss the cache
   first. `lib/utils/app-url.ts` already refuses the client-controlled `Host` in
   production, so passing `req` would only ever change preview/dev behaviour —
   and in the wrong direction. The PM asked to ratify this; see also the residue
   in "Known limitations", which pinning does *not* fix.

3. **The rate limit is `RATE_LIMITS.readonly` (60/min/IP), not `expensive`.**
   D-04 says the limiter is dampening only and the durable control is the cache;
   a cache hit is one bucket read. But a *cold* cache makes the first requests
   expensive, and 60/min is generous for a document download. Deliberate reading
   of "best-effort", not a considered tuning — worth a PM word if the intent was
   stricter.

4. **`export const config = { maxDuration: 60 }` on both routes.** No criterion
   asks for it. A ten-page render with embedded fonts takes ~1 s locally but runs
   cold on Vercel, and the platform default would be the thing that turns the
   first post-deploy request into a timeout rather than a slow success. Copied
   from `pages/api/licitaciones/[id]/generate-propuesta.ts`. It is scope I added.

5. **The new test file is now a `cohort-commercial.ts` importer.** It imports
   `BROCHURE_VERSION` / `BROCHURE_FILENAME` to pin the brochure's cache key and
   `Content-Disposition` against the real constants rather than a regex, so it
   had to join `ALLOWED_COMMERCIAL_IMPORTERS` — the list is now five entries, two
   of them production. The alternative (asserting the cache path with a pattern)
   would not catch a version-key mistake, which is the failure that silently
   serves a stale PDF. Test files never reach a bundle, and the leak script
   scans `.next/static`, so nothing about D-01's mechanical guarantee changes.

## Known limitations / deferred

- **Cross-environment cache poisoning is still reachable, and pinning the CTA
  origin does not close it.** The `propuestas` bucket is on the single shared
  Supabase instance, and `.env.local` sets `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
  A developer who hits `/api/pasantias/brochure` locally on a cold cache will
  generate a PDF printing `localhost:3000/pasantias` and upload it to the path
  production reads. Out of scope to fix here ([A1] specifies an unconditional
  upload on miss), and it is a PM/owner call: either gate the upload on
  `VERCEL_ENV === 'production'`, or accept it and treat "warm the cache from
  production first" as an operational step. **Recommend the PM decide before
  A6a ships the public link.**
- **No route-level e2e.** Playwright coverage arrives with A6a's page, which
  links the ficha route.
- **`downloadFile` cannot distinguish "missing object" from "bucket
  unreachable"** — both throw, and both are treated as a miss. That is the
  correct availability behaviour (generate and serve) but it means a persistent
  storage outage shows up as latency, not as an error.
- **`Content-Length` is set from the buffer.** Neither route streams; both hold
  the whole document in memory. The largest document is ~10 A4 pages.
- **The manual-override file is not validated.** Whatever is at the cache path
  is served as `application/pdf` with the constant filename — by design (D-05),
  and the D-02 price check on an uploaded designed brochure is the PM's
  pre-upload step, not this route's.
