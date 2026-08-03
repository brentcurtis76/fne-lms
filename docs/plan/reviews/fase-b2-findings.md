# FASE B2 — Compatibility spike findings

**Phase:** B2 — Resend / svix / cron compatibility spike
**Branch:** `phase/b2-spike` (from `origin/main` `2613b46`)
**Date:** 2026-08-03
**Status of this document:** the locked reference for B3, B4a/B4b, B7, B8, B10a, B10b and B11b.
Anything a later phase assumes about Resend, svix or Vercel cron must be citable from here
or re-verified in that phase and appended below.

Executable half of these findings:
`__tests__/lib/resend-contract.test.ts` (13 tests) and `__tests__/lib/svix-contract.test.ts`
(22 tests). Neither suite mocks its library: both instantiate the real class and control only
the transport (`globalThis.fetch`) or the clock, so the libraries' own request building,
deserialisation, error mapping and HMAC code runs for real. §6 records the mutation run that
proves the suites detect drift rather than restating their own fixtures.

Legend: **LOCKED** = asserted by a test in this repo. **VERIFIED** = read from the installed
package source or an authoritative doc, but not asserted by a test (usually because it is a
server-side behaviour we cannot reach without a live send). **OPEN** = unresolved risk.

---

## 1. Resend SDK — installed version 3.5.0

`package.json` declares `"resend": "^3.5.0"`; the installed tree is exactly `3.5.0`, and the
SDK stamps `User-Agent: resend-node:3.5.0` on every request — which is how the suite pins the
version (through the transport, not through `package.json`). Latest published is **6.18.1**;
this phase did **not** upgrade (see §3.4 and §5.1).

### 1.1 `batch.send` request shape — LOCKED

| Property | Value |
|---|---|
| Method / URL | `POST https://api.resend.com/emails/batch` |
| Body | the payload **array itself**, JSON-stringified — *not* `{ emails: [...] }` |
| Headers sent | exactly `authorization`, `content-type`, `user-agent` — nothing else |
| Base URL override | `process.env.RESEND_BASE_URL`, read **once at module load** |

`batch.send(payload, options)` is a straight alias for `batch.create(payload, options)`; the
same is true of `emails.send` → `emails.create` (`POST /emails`).

**Per-email `headers` are supported and survive serialisation — LOCKED.** `CreateBatchOptions`
is `CreateEmailOptions[]`, and `CreateEmailBaseOptions.headers?: Record<string, string>`, so
each element carries its own header bag. The suite asserts that two elements with *different*
`List-Unsubscribe` values both arrive intact in the request body. This is the mechanism D-08
depends on for a per-recipient unsubscribe URL plus `List-Unsubscribe-Post: One-Click`.
Resend's own batch docs confirm the server side: only `attachments` is unsupported for batch.

**No caller-payload mutation with an `html` body — LOCKED.** `batch.create` rewrites
`email.react` into `email.html` **in place** and `delete`s `react`. With an html-only payload
(what `renderCampaignHtml` produces) nothing is touched, so B10a may hold the same objects for
its ledger write after the call returns. A future switch to `react:` bodies would silently
start mutating them.

### 1.2 `batch.send` response shape — LOCKED

```ts
CreateBatchResponse = { data: { data: { id: string }[] } | null; error: ErrorResponse | null }
```

The **double nesting is real**: `result.data.data[i].id`. The plan's suspicion
(`{data:{data:[{id}]}}`, PLAN.md "Working constraints") is confirmed.

**Index alignment is an API guarantee, not an SDK behaviour.** The SDK passes the parsed array
straight through, so it cannot reorder; Resend's batch reference states that "each entry in
`data` corresponds to the email at the same index in the batch payload (0-based)". D-07's
"success ids index-aligned" is therefore sound, but it rests on the API contract — B10a should
still assert `data.data.length === payload.length` before zipping, and fail the batch loudly if
it does not, rather than writing misaligned provider ids into `email_campaign_sends`.

### 1.3 Errors are values, never exceptions — LOCKED

Every failure mode of `fetchRequest` resolves; none rejects. The one throwing path in the whole
SDK is the constructor.

| Situation | Result |
|---|---|
| HTTP 4xx/5xx, JSON body | `{ data: null, error: <the API's JSON, verbatim> }` |
| HTTP 4xx/5xx, non-JSON body | `{ data: null, error: { name: 'application_error', message: 'Internal server error. We are unable to process your request right now, please try again later.' } }` |
| `fetch` rejects (network/DNS/abort) | `{ data: null, error: { name: 'application_error', message: 'Unable to fetch data. The request could not be resolved.' } }` |
| HTTP 200, body is not valid JSON | **identical** to the network-rejection case |
| `new Resend(undefined)` with no `RESEND_API_KEY` | **throws** `Error('Missing API key. Pass it to the constructor …')` |

Three consequences for B10a:

1. `try/catch` alone will not catch a send failure — the resolved `{ error }` value must be
   checked on every call. D-07 already requires both ("resolved `{error}` value and thrown
   error both handled"); the thrown branch remains worth keeping for a future SDK that changes
   its mind, but on 3.5.0 it is unreachable except via the constructor.
2. **A `application_error` / "Unable to fetch data" result is an *unknown* outcome, not a
   confirmed failure.** It is returned both when the request never left and when a 200 came
   back with an unparseable body — i.e. the mail may well have been sent. Rows marked `failed`
   from that branch and later retried are the realistic duplicate-delivery path in this system.
3. `ErrorResponse` is declared as `{ name, message }` but the SDK returns **whatever JSON the
   API sent**. A real 422 arrives as `{ statusCode: 422, name: 'validation_error', message: … }`
   — an extra key the type does not admit. Never `JSON.stringify` an error object into a
   user-facing surface without projecting it first; store the `name`/`message` pair only.

The constructor throw means the Resend client must be built **lazily inside the handler**, not
at module scope: a missing `RESEND_API_KEY` (the local `.env.local` case) would otherwise take
down the whole route at import time instead of soft-failing. Existing call sites in the repo
already follow this shape.

### 1.4 Idempotency — absent in 3.5.0 — LOCKED (absence) / VERIFIED (API side)

**The Resend API supports `Idempotency-Key`** on both `POST /emails` and `POST /emails/batch`
(unique per request, 24 h expiry, ≤256 chars). **SDK 3.5.0 cannot express it.**

- The only request-option type is `PostOptions { query?: Record<string, unknown> }`. There is
  no header, no `idempotencyKey`, no escape hatch.
- Worse, `query` is inert on POSTs: `Resend.post` spreads the request options **into the fetch
  init**, where `fetch` ignores an unknown `query` key. The suite asserts the URL carries no
  query string and no `idempotency-key` header is sent.
- **Footgun, asserted so nobody rediscovers it the expensive way:** the same spread means a
  caller who passes `{ headers: { 'Idempotency-Key': … } }` (untyped, via a cast) *replaces the
  SDK's `Headers` object wholesale* — the request then goes out with **no `authorization`
  header at all**. The suite pins this. Do not hand-bolt idempotency onto 3.5.0.

**Implication for D-07 (unchanged, but now evidence-backed).** The plan anticipated this
outcome and D-07's ledger dedup is the substitute: duplication is bounded by
`claim_campaign_sends`' `FOR UPDATE SKIP LOCKED` plus the 15-minute stale-reclaim window, with
the documented tradeoff that a mid-tick crash can duplicate ≤1 batch. Idempotency keys would
have shrunk that to zero. Three ways forward, for the PM — **not** an executor decision:

| Option | Cost | Effect |
|---|---|---|
| (a) Keep 3.5.0, keep D-07's ledger dedup | none | status quo; ≤1 batch duplicable per crash |
| (b) Upgrade the SDK (current docs show `resend.batch.send([...], { idempotencyKey })`) | 3.5.0 → 6.x is three majors; every contract in this document must be re-locked, and B1a/B1b's send paths re-tested | eliminates the crash-duplication window; also brings a first-party webhook verifier, likely removing the `svix` dependency |
| (c) Keep 3.5.0 but call `POST /emails/batch` with raw `fetch` in the drain only | small, contained | idempotency without a global upgrade, at the cost of one hand-rolled transport |

Recommendation: **(a) for now** — D-07 is already designed around the absence and B10a is not
the moment to absorb a three-major upgrade. Revisit as a post-v1 item. If the PM prefers (b),
it belongs in its own phase *before* B10a, not inside it.

### 1.5 Other verified limits

- **Batch size ≤100 emails per call** — matches D-07's `≤100/batch.send` bound exactly.
- **Rate limit: 10 requests/second per team**, `429` on exceed (the SDK's error map already
  contains `rate_limit_exceeded: 429`). D-07's tick issues ≤3 batch calls, so the drain has
  ~3 orders of magnitude of headroom; no client-side pacing needed.
- `to` accepts `string | string[]`, max 50 recipients — irrelevant to us: campaign sends are
  one recipient per element so that each gets its own unsubscribe header.
- **3.5.0 has no webhook verification of any kind** — zero occurrences of "webhook" in its type
  declarations. This is why `svix` is a dependency (D-09/B-07) and is confirmed, not assumed.

---

## 2. svix — added this phase, version 1.99.1

Added to `dependencies` as `svix@^1.99.1`. It delegates verification to **`standardwebhooks`
1.0.0**; `svix`'s own `Webhook` class is a thin header-normalising wrapper. Resend's webhook
documentation confirms Svix is the signing scheme and that the transmitted headers are
`svix-id`, `svix-timestamp`, `svix-signature`.

### 2.1 API surface — LOCKED

```ts
import { Webhook, WebhookVerificationError } from 'svix';
new Webhook(secret: string | Uint8Array, options?: { format?: 'raw' })
  .verify(payload: string | Buffer, headers: Record<string,string>): unknown   // parsed JSON
  .sign(msgId: string, timestamp: Date, payload: string | Buffer): string      // "v1,<base64>"
```

- `verify` **returns the parsed payload** (`JSON.parse` of the body) and is typed `unknown` —
  B7 must validate/narrow it, never trust its shape.
- Header names are lower-cased before reading, and both the branded `svix-*` and unbranded
  `webhook-*` spellings are accepted. Node's `req.headers` bag can be passed straight through.
- Secret handling: a leading `whsec_` is stripped, then the remainder is base64-decoded. A
  `whsec_`-prefixed secret and its bare base64 form produce identical signatures.
- `sign()` is public, which is what makes real known-answer vectors possible in tests.

### 2.2 Timestamp tolerance is ±5 minutes, both directions — LOCKED

`WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60`, checked symmetrically. Boundaries asserted at ±299 s
(accepted) and ±301 s (rejected), with the clock pinned by fake timers. **This satisfies D-08's
"±5 min past AND future" requirement with no extra code in B7** — the future half is the one a
past-only verifier would silently miss, so it has its own test.

### 2.3 Multi-signature and rejection semantics — LOCKED

`svix-signature` is a **space-separated** list of `version,signature` entries. Entries whose
version is not `v1` are skipped; verification succeeds if **any** `v1` entry matches, in either
order — this is what makes an endpoint-secret rotation survivable. Comparison is timing-safe.

| Input | Outcome |
|---|---|
| valid signature | returns parsed payload |
| body tampered / signed with another secret / bound to another `svix-id` | `WebhookVerificationError('No matching signature found')` |
| only non-`v1` versions present | `WebhookVerificationError('No matching signature found')` |
| any of the three headers missing | `WebhookVerificationError('Missing required headers')` |
| non-numeric `svix-timestamp` | `WebhookVerificationError('Invalid Signature Headers')` |
| timestamp >300 s old / >300 s ahead | `WebhookVerificationError('Message timestamp too old' / 'too new')` |
| empty secret | plain `Error("Secret can't be empty.")` — **not** a `WebhookVerificationError` |
| signature valid, body not JSON | `SyntaxError` from `JSON.parse` — **not** a `WebhookVerificationError` |

The last two rows are the ones that matter for D-08's "401 on bad signature, **5xx on internal
failure**" split, and both are asserted:

- **A missing/empty `RESEND_WEBHOOK_SECRET` must not become a 401.** It is a configuration
  fault and must surface as 5xx, or a misconfigured deploy silently tells Resend "rejected,
  don't retry" for every event. B7 must branch on `error instanceof WebhookVerificationError`,
  **not** on "anything threw".
- Likewise a signed-but-unparseable body is a `SyntaxError`, not a signature failure.

### 2.4 The signature is over the raw bytes — LOCKED

The signed string is `` `${msgId}.${unixSeconds}.${payload}` ``. The suite asserts that a body
which has merely been round-tripped through `JSON.parse`/`JSON.stringify` fails verification.

**Consequence for B7:** the webhook route must set `export const config = { api: { bodyParser:
false } }` and verify the raw buffer. Reading `req.body` from Next's parser will fail every
signature. This also composes with D-08's ≤256 KB raw-body cap: read the stream with a byte
ceiling, then verify, then call `process_webhook_event` once.

### 2.5 Event names carry an `email.` prefix — VERIFIED

D-08's effect table names events in shorthand (`sent`, `delivered`, `bounced`, …). The wire
format is namespaced: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.failed`,
`email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.suppressed`, plus
`email.received` and `email.scheduled`, and the non-email families `domain.*`, `contact.*`,
`suppression.added` / `suppression.removed`.

B7's effect table must key on the **full dotted name**. Every event outside D-08's nine falls
into D-08's existing "unknown types → 200, ledger-only" bucket, so no plan change is needed —
but `email.received` and `email.scheduled` are easy to mistake for in-scope events and are not.
This is a shorthand-vs-wire mismatch in the plan's prose, not a design gap.

---

## 3. Vercel cron

### 3.1 What the plan needs

D-07 invokes `/api/cron/email-drain` on a cadence "per B2 findings", with each tick bounded to
≤2 campaigns × ≤3 claim-batches × ≤200 rows.

### 3.2 Plan capability — per-minute cron **is** available, on owner-recorded evidence

| Plan | Cron jobs / project | Minimum interval | Precision |
|---|---|---|---|
| Hobby | 100 | **once per day** (more frequent expressions *fail deployment*) | within the hour (±59 min) |
| Pro | 100 | **once per minute** | within the minute |
| Enterprise | 100 | once per minute | within the minute |

*(Vercel, "Usage & Pricing for Cron Jobs", doc last updated 2026-06-16.)*

**This project is on Pro.** The evidence, and its limits, stated plainly:

- **Owner-recorded, in-repo:** `docs/planning/zoom-integration-plan.md:134` —
  "② ~~Vercel Pro confirmation~~ **RESOLVED 2026-07-29** (Pro confirmed; Z1b unblocked)". That
  workstream had listed "Vercel Pro plan confirmation (per-minute crons, 800s maxDuration)" as a
  *blocking decision owned by Brent* (line 447) and recorded it resolved five days before this
  spike. The Zoom build depends on a per-minute ticker on the strength of that same confirmation.
- **Historical, and now superseded:** this repo hit Hobby cron limits twice — `94a66a8`
  (Nov 2025) downgraded `*/5 * * * *` → `0 0 * * *` "for Vercel Hobby plan compatibility", and
  `4616035` (Jul 2025) disabled crons wholesale "to bypass plan limit". Both predate the
  upgrade and explain why `vercel.json` currently carries **no `crons` array at all**.
- **Not independently re-verified here.** The Vercel CLI in this environment is
  unauthenticated (`vercel whoami` → "No existing credentials found"), no `VERCEL_TOKEN` is
  present, and the Vercel MCP server requires an OAuth flow this session cannot run. Deploying
  to observe the outcome is forbidden by CLAUDE.md. So the plan tier rests on the owner's
  recorded confirmation, not on a live query made by this executor.

**Verdict: no FINDINGS gate is triggered — B10a is not blocked, and D-07's invoker does not
need re-planning.** A per-minute drain (`* * * * *`) is within Pro's limits, and the phase's
"unavailable/coarse cron ⇒ FINDINGS" branch does not apply.

**One cheap confirmation for Brent before B10a's `vercel.json` entry ships** — a Hobby account
*fails the deployment* on a sub-daily expression, so a stale plan assumption would surface as a
broken deploy rather than a silent misbehaviour:

```bash
vercel login && vercel teams ls
```

or simply the Cron Jobs page under the project's Vercel settings.

### 3.3 Cron semantics B10a must design against — VERIFIED

From "Cron Jobs" and "Managing Cron Jobs" (docs last updated 2026-06-16 / 2026-06-02):

- **Method and target:** an HTTP **GET** to the **production** deployment URL at the configured
  `path`. `/api/cron/email-drain` must therefore answer GET — D-07's "Procesar ahora" admin
  route is a separate, adminGuard-ed entry point sharing the handler core, which stays correct.
- **Auth:** a project env var named exactly `CRON_SECRET` is **automatically sent as
  `Authorization: Bearer <value>`**. D-07's stated posture is exactly right, and five existing
  routes in this repo already implement the comparison.
- **Identification:** requests carry `User-Agent: vercel-cron/1.0` and an
  `x-vercel-cron-schedule` header holding the triggering expression.
- **Delivery is best effort — both missed AND duplicate runs are documented possibilities.**
  Vercel's own words: cron delivery "can also occasionally invoke the same scheduled run more
  than once", and failed invocations are **never retried**.
- **Overlap is not prevented.** If a tick outruns its interval, Vercel may start a second
  instance while the first is still running.
- Expressions are UTC-only; no `MON`/`JAN` aliases; day-of-month and day-of-week cannot both be
  set; redirects are not followed; a 404 path still executes; Instant Rollback does **not**
  update active crons; `vercel dev`/`next dev` do not run crons locally (invoke the route by
  hand).

### 3.4 How that lands on D-07 — no plan change required

D-07's design already survives the two hazards, and it is worth saying exactly why so B10a does
not weaken it:

- **Duplicate/overlapping ticks:** `claim_campaign_sends` uses `FOR UPDATE SKIP LOCKED`, so a
  second concurrent tick claims a *disjoint* row set rather than re-sending the first tick's.
  `complete_campaign_if_done`'s predicate (no `pending` **and** no `sending` rows) means a
  worker still holding claims keeps the campaign non-terminal by construction.
- **Missed ticks:** the drain is reconciliation-based — it picks up whatever is still `pending`
  on the next tick. Nothing is lost, only delayed.
- **No retries:** an unhandled 500 in a tick is simply skipped until the next one. The handler
  must therefore never leave rows stuck in `sending` outside the 15-minute stale window.

One wording refinement for the PM to consider (documentation only, no design change): D-07's
accepted tradeoff is currently phrased as "a mid-tick crash can duplicate ≤1 batch after stale
reclaim". Two further paths reach the same ≤1-batch duplication and are worth naming in the
same sentence — (i) Vercel's documented duplicate cron delivery, and (ii) §1.3's
`application_error` ambiguity, where a send whose outcome is unknown is recorded `failed` and
may be retried. The bound does not change; the list of causes does.

---

## 4. Consolidated contract card for B3 / B4 / B7 / B8 / B10

| # | Contract | Where |
|---|---|---|
| C1 | `POST /emails/batch`, body = bare array, ≤100 elements | §1.1, §1.5 |
| C2 | Success ids at `result.data.data[i].id`, index-aligned with the request | §1.2 |
| C3 | Per-element `headers` carry `List-Unsubscribe` + `List-Unsubscribe-Post` | §1.1 |
| C4 | Errors are resolved values; `try/catch` alone is insufficient | §1.3 |
| C5 | `application_error` = **unknown** outcome, not a confirmed failure | §1.3 |
| C6 | Build the `Resend` client lazily inside the handler | §1.3 |
| C7 | No idempotency key on 3.5.0; never pass `headers` through request options | §1.4 |
| C8 | Verify with `new Webhook(secret).verify(rawBody, req.headers)` | §2.1 |
| C9 | Tolerance ±300 s satisfies D-08 with no extra code | §2.2 |
| C10 | 401 **only** for `WebhookVerificationError`; everything else 5xx | §2.3 |
| C11 | `bodyParser: false` — signatures are over raw bytes | §2.4 |
| C12 | Effect table keys on full dotted names (`email.sent`, …) | §2.5 |
| C13 | Cron = GET, production only, `Authorization: Bearer $CRON_SECRET` | §3.3 |
| C14 | Cron may double-fire, may be missed, is never retried, may overlap | §3.3, §3.4 |
| C15 | Per-minute cadence (`* * * * *`) is available on this project's plan | §3.2 |

---

## 5. Open risks

| # | Risk | Severity | Owner |
|---|---|---|---|
| R1 | Plan tier is owner-recorded (2026-07-29), not re-verified by this executor; the CLI here is unauthenticated. A stale assumption fails the *deployment* of B10a's `vercel.json`. | Low — one command to confirm (§3.2) | Brent, before B10a merges |
| R2 | SDK 3.5.0 is three majors behind 6.18.1 and unmaintained in practice. Every contract here is version-pinned; an upgrade invalidates the lot. | Medium — deliberate, deferred | PM (§1.4 option b) |
| R3 | Batch index alignment is an API guarantee we cannot test without a live send. A silent change writes wrong provider ids into `email_campaign_sends`. | Low, but silent | B10a — assert length, fail loud (§1.2) |
| R4 | Whether Resend's batch endpoint actually *honours* per-email `headers` end-to-end is a server-side behaviour. The wire format is locked; delivery is not. | Medium — D-08 compliance depends on it | B11b live-send gate: send one campaign to a seeded inbox and read the received headers |
| R5 | `application_error` ambiguity (§1.3) is a real duplicate-delivery path, independent of cron. | Low, bounded | B10a — record error text on the send row so it is diagnosable |
| R6 | No `RESEND_API_KEY` locally, so nothing in Track B is exercised against the real API before A9/B11b. | Known, pre-existing | per PLAN.md working constraints |

## 6. Evidence that the tests detect drift

Green at head: `npx vitest run __tests__/lib/resend-contract.test.ts __tests__/lib/svix-contract.test.ts`
→ **35 passed** (13 + 22).

Three drift mutations were then applied to the installed packages — to the shipped bundles the
test runner actually resolves (`resend/dist/index.mjs`, not the CJS twin) — and the suites
re-run:

| Mutation | Simulates | Result |
|---|---|---|
| `return { data, error: null }` → `return { data: data.data, … }` | an SDK that un-nests the batch response | ✗ *double-nests the ids under data.data, in request order* |
| `return { data: null, error: JSON.parse(rawError) }` → `throw new Error(rawError)` | an SDK that switches to thrown errors | ✗ *resolves an API error body verbatim (does not throw) on 4xx*; ✗ *maps a non-JSON error body to application_error* |
| `WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60` → `10 * 60` | a verifier that widens the replay window | ✗ *rejects a timestamp 301 s in the past*; ✗ *rejects a timestamp 301 s in the future* |

**5 failed / 30 passed** under mutation; the five failures are exactly the five contracts the
mutations broke. All three files were restored from byte-for-byte backups taken before the
first mutation, the mutated strings verified absent and the originals verified present, and the
suites re-run to **35 passed**.

A first attempt mutated `resend/dist/index.js` (CJS) and produced a **false green** — vitest
resolves the `import` condition, so the ESM bundle is the one under test. Recorded here because
anyone re-running this check will otherwise reach the wrong conclusion.
