# FASE B2 — Compatibility spike findings

**Phase:** B2 — Resend / svix / cron compatibility spike
**Branch:** `phase/b2-spike` (from `origin/main` `2613b46`; reconciled with `main` in r2)
**Date:** 2026-08-03 (r1), amended 2026-08-03 (r2 — Sol REVIEW-B2.md findings 1 and 2)
**Status of this document:** the locked reference for B3, B4a/B4b, B7, B8, B10a, B10b and B11b.
Anything a later phase assumes about Resend, svix or Vercel cron must be citable from here
or re-verified in that phase and appended below.

Executable half of these findings:
`__tests__/lib/resend-contract.test.ts` (13 tests) and `__tests__/lib/svix-contract.test.ts`
(29 tests). Neither suite mocks its library: both instantiate the real class and control only
the transport (`globalThis.fetch`) or the clock, so the libraries' own request building,
deserialisation, error mapping and HMAC code runs for real. §6 records the mutation runs that
prove the suites detect drift rather than restating their own fixtures — including the two
mutants that survived r1's svix suite and now do not (§6.2).

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

#### 1.4.1 How many recipients can actually receive a duplicate

The r1 version of this section priced the status quo as "≤1 batch duplicable per crash". That
number is right for one failure mode and 12× too small for the other. Recomputed against the
**amended** D-07 bounds (`PLAN.md` D-07 / B10a [A1], amended 2026-08-02): ≤2 campaigns × ≤3
claim-batches × ≤200 rows, ≤100 rows per `batch.send` ⇒ **≤12 provider calls and ≤1 200
recipients per tick**, every call ≥150 ms after the previous one.

| Mode | What happens | Recipients duplicable |
|---|---|---|
| **M1 — process death between a returned `batch.send` and its ledger write** | D-07 writes the ledger *per batch*, so at most one batch is ever un-ledgered. Its rows stay `sending`, are reclaimed after 15 min, and are re-sent. | **≤100 per crash** (one batch) — the plan's existing bound, correct for this mode |
| **M2 — ambiguous provider outcome (§1.3)** | `application_error` is returned both when the request never left *and* when a 200 came back with an unparseable body. The rows are recorded `failed`; `retry_failed_sends` returns them to `pending`; the next drain re-sends mail that may already have gone out. Transport ambiguity is **independent per call** — nothing couples one call's outcome to another's. | **≤1 200 per tick** (all 12 calls ambiguous), and **not one-shot**: each retry round can end ambiguously again, so across enough rounds a campaign of *N* recipients can duplicate up to *N* |
| **M3 — duplicate or overlapping cron delivery** | `claim_campaign_sends` uses `FOR UPDATE SKIP LOCKED`, so a concurrent tick claims a **disjoint** row set. | **0** — not an independent path. r1 listed it as a third route to ≤1-batch duplication; that was wrong. It matters only as the *trigger* that performs M1's stale reclaim. |

Two clarifications that keep the numbers honest:

- **Only unparseable failures are ambiguous.** A 429 or a 422 arrives as parseable JSON and is
  returned verbatim (§1.3, row 1), so rate-limit rejections are a *delay* problem, not a
  duplicate one. M2 covers non-JSON error bodies and `fetch` rejections only.
- **M1 and M2 are additive but not simultaneous**; the per-tick worst case is dominated by M2.

#### 1.4.2 The minimum SDK version that exposes `idempotencyKey` — VERIFIED

Established by unpacking the published tarballs and reading the shipped `dist/` of each
version, not by asserting that "current SDKs have it". Stable releases only:

| Version | `idempotencyKey` present? | Usable for `batch.send`? |
|---|---|---|
| 3.5.0 (installed; last stable 3.x — 3.6.0 never left canary) | no — zero occurrences | no |
| 4.0.0 · 4.0.1 · 4.1.1 · 4.1.2 · **4.2.0** | no — zero occurrences | no |
| **4.3.0** — first appearance | `IdempotentRequest.idempotencyKey` (`dist/index.d.ts:136-142`) on `CreateEmailRequestOptions` and `Resend.post()` | **no.** `CreateBatchRequestOptions extends PostOptions {}` — **empty**, so `batch.send(p, { idempotencyKey })` fails `tsc`. Worse at runtime: `post()` does `this.headers.set("Idempotency-Key", …)` on the **client-level** `Headers`, so the key **persists onto every later POST from that client**. A drain reusing one client would send batches 2…12 under batch 1's key. |
| 4.4.0 · 4.4.1 | same typing gap; 4.4.1 fixes the leak (`const headers = new Headers(this.headers)`) | no (types) |
| **4.5.0 — the real minimum** | `CreateBatchRequestOptions extends PostOptions, IdempotentRequest` **and** per-request header copy | **yes** |
| 4.5.2 … 6.18.1 (latest) | unchanged | yes |

So the minimum is **4.5.x — one major from 3.5.0**, not three. (Sol's review named 4.3.0; that
is where the symbol first appears, but the batch path is neither typed nor safe there.)

#### 1.4.3 What a 3.5.0 → 4.5.x upgrade actually costs this repo — VERIFIED

Read from the two tarballs side by side:

- **These contracts are byte-identical in 4.5.2 and therefore survive the upgrade unchanged:**
  `CreateBatchSuccessResponse` / `CreateBatchResponse` (the `data.data[i].id` double nesting,
  C2), `ErrorResponse`, and the whole of `fetchRequest`'s error mapping (C4, C5 — character for
  character). The batch body is still the bare array, per-element `headers` still pass through
  (`parseEmailToApiOptions` copies `headers` verbatim), and the caller-`headers` footgun still
  exists (`options` still spreads last over the request init).
- **One source line breaks, and `tsc` catches it:** `CreateEmailBaseOptions.reply_to` was
  renamed `replyTo` in 4.x. The repo's only occurrence is
  [`pages/api/contact.ts:170`](../../../pages/api/contact.ts). The other two Resend call sites
  (`lib/email/expenseNotifications.ts:235`, `pages/api/admin/tractor-signups/grant.ts:210`) pass
  no renamed field.
- **Test re-cuts:** the `resend-node:3.5.0` User-Agent pin and §1.4's three absence assertions
  in `__tests__/lib/resend-contract.test.ts`. Everything else in that suite is version-neutral.
- **Transitive bump:** `@react-email/render` 0.0.16 → 1.1.2, whose peers are
  `react ^18.0 || ^19.0` — this repo is on 18.3.1, so it is satisfied.
- **Not measured here:** the 4.x `parseEmailToApiOptions` key **allowlist** means any element
  property outside its twelve keys is silently dropped. Nothing we send today is affected, but
  B10a should re-assert its payload shape after any upgrade rather than assume.

A 3.5.0 → 6.18.1 upgrade is a different proposition and is **not** costed here: three majors,
a rewritten dist layout (`index.d.mts`/`index.cjs`, no `index.d.ts`), and generic-parameterised
response types (`CreateBatchResponse<Options>`) — every contract in this document would need
re-locking, which is exactly the work 4.5.x avoids.

#### 1.4.4 The four ways forward — for the PM, not an executor decision

Exposure figures are per §1.4.1. "0 duplicates" for the keyed options holds **within Resend's
24 h key window** and **only if the retried request is composed of the same rows**: the key must
be stamped on the send rows *before* the provider call and the reclaim must re-send exactly the
stamped set, or a re-batched reclaim produces a different request under a different key.

| Option | M1 exposure | M2 exposure | Cost |
|---|---|---|---|
| **(a) Stay on 3.5.0, ledger dedup only** (status quo) | ≤100 / crash | ≤1 200 / tick, repeatable per retry round | none |
| **(b1) Upgrade to `resend@4.5.x`** — one major | 0 | 0 | one line at `contact.ts:170`; two test re-cuts; deps bump; §1.4.3 |
| **(b2) Upgrade to `resend@6.18.1`** — three majors | 0 | 0 | b1's work **plus** re-locking C1–C7 against a rewritten type surface and re-testing all three existing send paths; also brings a first-party webhook verifier that would likely retire `svix` |
| **(c) Keep 3.5.0; raw `fetch` to `/emails/batch` in the drain only** | 0 | 0 | ~30 hand-rolled lines, contained to the drain; must reimplement §1.3's error mapping exactly, or the drain's failure taxonomy silently diverges from the rest of the repo |
| **(d) No idempotency: make the ambiguous outcome non-auto-retriable** — record `application_error` as an `unknown` outcome that `retry_failed_sends` refuses, and reconcile it by operator | ≤100 / crash (unchanged) | **0 duplicates** — converted into a manual reconciliation queue | a D-06/D-07 amendment (the frozen send-row machine is `pending→sending→sent\|failed\|skipped`, with no such outcome) plus an admin surface to work the queue |

**All of (b1), (b2), (c) and (d) need a column B3 does not currently define** — a persisted
per-batch idempotency key for (b)/(c), an `unknown` outcome for (d). D-10 permits additive
migrations, so the decision can still be taken at the B10a gate; **B3 is simply the cheap
moment**, since a nullable `idempotency_key text` plus a status CHECK that admits the
reconciliation outcome costs nothing now and a second migration later.

No recommendation is offered here: r1's "(a) for now" rested on the three-major figure, which
§1.4.2 has since shown to be wrong, and the choice is the PM's at the B10a dispatch gate.

### 1.5 Other verified limits

- **Batch size ≤100 emails per call** — matches D-07's `≤100/batch.send` bound exactly.
- **Rate limit: 10 requests/second, counted per team, with no separate burst allowance**, `429`
  on exceed (the SDK's error map already contains `rate_limit_exceeded: 429`). r1 said the tick
  issues ≤3 batch calls and therefore had ~3 orders of magnitude of headroom. **Both halves were
  wrong.** D-07's own bounds permit **12** provider calls per tick (§1.4.1), the ceiling is
  team-wide — every other FNE send path (`contact.ts`, expense notifications, tractor grants)
  draws on the same pool — and a maximally productive unpaced tick can therefore exceed the
  limit by itself. **D-07 was amended on 2026-08-02 to make pacing mandatory**: a shared sender
  enforcing **≥150 ms since the previous provider call** (≤6.7 req/s), proven by fake-clock
  spacing tests, is now part of the frozen decision and of B10a's [A1]. B10a must also carry a
  **429 test** — a rate-limit rejection arrives as parseable JSON, so it is a *definite* failure
  (delay, retry later) and must never be folded into §1.3's `application_error` unknown bucket.
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

### 2.2 Timestamp tolerance is exactly ±300 s, inclusive, both directions — LOCKED

`WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60`, checked symmetrically with **`>`**, so the boundary is
inclusive: `now - timestamp > 300` is "too old" and `timestamp > now + 300` is "too new".
Asserted with the clock pinned by fake timers at **−300, −299, +299, +300 accepted** and
**±301 rejected**.

The exact-boundary cases exist because ±299/±301 alone do not pin the tolerance: flipping both
comparisons to `>=` — a verifier that rejects exactly 300 s — leaves such a suite green. §6.2
records that mutant (SM2) turning the suite red, so B7 may inherit the inclusive ±300 s result
as a fact rather than an inference. **This satisfies D-08's "±5 min past AND future" with no
extra code in B7** — the future half is the one a past-only verifier would silently miss, so it
has its own test.

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

The signed string is `` `${msgId}.${unixSeconds}.${payload}` `` — the payload bytes exactly as
they arrived, with no normalisation of any kind.

r1 asserted this with a body that had been round-tripped through `JSON.parse`/`JSON.stringify`,
but the round-trip **extracted a subtree** (`JSON.parse(PAYLOAD).data`), so the case proved only
that a *different value* is rejected — a canonicalising verifier would have kept it green. The
suite now signs one spelling and rejects four **value-identical, byte-different** spellings of
the same object, each asserted `toEqual` the signed value first so the case cannot decay back
into a tampering test:

| Spelling | Differs by |
|---|---|
| pretty-printed (`JSON.stringify(v, null, 2)`) | whitespace and newlines |
| space-separated (`{"type": "email.sent", …}`) | whitespace only |
| key-order swapped (`{"data":…,"type":…}`) | member order |
| trailing newline | one trailing byte |

plus the reverse direction — sign the pretty-printed spelling, verify the compact one — which
is what kills a verifier canonicalising on *both* sides. §6.2 records three canonicalisation
mutants — verify-side (SM3), both-sides (SM4) and both-sides-with-sorted-keys (SM7) — each
turning the suite red; SM7 is the one the key-order case exists for.

**Consequence for B7:** the webhook route must set `export const config = { api: { bodyParser:
false } }` and verify the raw buffer — and must not re-encode the body in either direction.
Reading `req.body` from Next's parser will fail every signature. This also composes with D-08's
≤256 KB raw-body cap: read the stream with a byte ceiling, then verify, then call
`process_webhook_event` once.

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

**This project is on Pro — CONFIRMED first-hand by the owner.** r1 left this as open risk R1
because the executor could only cite a second-hand in-repo record. **R1 is now closed:**

- **Owner's own account page, 2026-08-02** ("Brent Curtis' projects — Pro"), recorded in the
  plan's Decision Log (`PLAN.md`, Decision Log 2026-08-02). This is first-hand evidence from the
  account holder, not an inference, and it supersedes the r1 residue entirely — no `vercel
  login` step remains outstanding before B10a's `vercel.json` entry ships.
- **Corroborating, in-repo:** `docs/planning/zoom-integration-plan.md:134` —
  "② ~~Vercel Pro confirmation~~ **RESOLVED 2026-07-29** (Pro confirmed; Z1b unblocked)". That
  workstream had listed "Vercel Pro plan confirmation (per-minute crons, 800s maxDuration)" as a
  *blocking decision owned by Brent* (line 447) and recorded it resolved before this spike.
- **Historical, and now superseded:** this repo hit Hobby cron limits twice — `94a66a8`
  (Nov 2025) downgraded `*/5 * * * *` → `0 0 * * *` "for Vercel Hobby plan compatibility", and
  `4616035` (Jul 2025) disabled crons wholesale "to bypass plan limit". Both predate the
  upgrade and explain why `vercel.json` currently carries **no `crons` array at all**.

**Verdict: no FINDINGS gate is triggered — B10a is not blocked, and D-07's invoker does not
need re-planning.** A per-minute drain (`* * * * *`) is within Pro's limits, and the phase's
"unavailable/coarse cron ⇒ FINDINGS" branch does not apply.

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

**What r1 got wrong here, corrected.** r1 suggested naming duplicate cron delivery as a second
path to ≤1-batch duplication. It is not a duplication path at all: `SKIP LOCKED` gives the
concurrent tick a disjoint claim (§1.4.1, M3), and duplicate delivery matters only as a trigger
that may perform the stale reclaim. The path r1 was reaching for is §1.3's `application_error`
ambiguity — and that one is **not** bounded at ≤1 batch: it is ≤1 200 recipients per tick and
repeatable per retry round (§1.4.1, M2). D-07's "≤1 batch" tradeoff sentence describes M1
correctly and must not be read as covering M2.

**Pacing is no longer optional.** The tick that this section calls "maximally productive" is
also the one that would breach Resend's 10 req/s team ceiling on its own (§1.5). D-07 and B10a
[A1] were amended on 2026-08-02 to require a shared sender spacing every provider call ≥150 ms
after the previous one, asserted with a fake clock. A per-minute cadence leaves ample room: a
full 12-call tick spends ≥1.65 s in pacing alone.

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
| C7 | No idempotency key on 3.5.0 (minimum usable version is **4.5.x**); never pass `headers` through request options | §1.4.2 |
| C8 | Verify with `new Webhook(secret).verify(rawBody, req.headers)` | §2.1 |
| C9 | Tolerance is **inclusive ±300 s** on both sides; satisfies D-08 with no extra code | §2.2 |
| C10 | 401 **only** for `WebhookVerificationError`; everything else 5xx | §2.3 |
| C11 | `bodyParser: false` — signatures are over raw bytes; never re-encode the body | §2.4 |
| C12 | Effect table keys on full dotted names (`email.sent`, …) | §2.5 |
| C13 | Cron = GET, production only, `Authorization: Bearer $CRON_SECRET` | §3.3 |
| C14 | Cron may double-fire, may be missed, is never retried, may overlap — but overlap is **not** a duplicate-send path (`SKIP LOCKED`) | §3.3, §3.4 |
| C15 | Per-minute cadence (`* * * * *`) is available on this project's plan (Pro, owner-confirmed) | §3.2 |
| C16 | Provider calls are **paced ≥150 ms apart** (amended D-07 / B10a [A1]); worst-case tick is **12 calls / 1 200 recipients**, against a **team-wide** 10 req/s ceiling with no burst allowance | §1.4.1, §1.5 |
| C17 | A 429 (or any parseable error body) is a **definite** failure — never folded into `application_error`'s unknown bucket; B10a carries a 429 test | §1.5, §1.3 |

---

## 5. Open risks

| # | Risk | Severity | Owner |
|---|---|---|---|
| R1 | ~~Plan tier is owner-recorded, not re-verified.~~ **CLOSED 2026-08-02** — the owner confirmed Pro first-hand from the account page (Decision Log). Per-minute cron stands. | — | closed |
| R2 | SDK 3.5.0 is behind 6.18.1. Contracts here are version-pinned — but §1.4.3 shows the batch response, error mapping and header pass-through are byte-identical through 4.5.x, so a **one-major** move re-locks almost nothing. The exposure is a 6.x move, not an upgrade as such. | Medium — deliberate, deferred | PM (§1.4.4) |
| R3 | Batch index alignment is an API guarantee we cannot test without a live send. A silent change writes wrong provider ids into `email_campaign_sends`. | Low, but silent | B10a — assert length, fail loud (§1.2) |
| R4 | Whether Resend's batch endpoint actually *honours* per-email `headers` end-to-end is a server-side behaviour. The wire format is locked; delivery is not. | Medium — D-08 compliance depends on it | B11b live-send gate: send one campaign to a seeded inbox and read the received headers |
| R5 | `application_error` ambiguity (§1.3) is a real duplicate-delivery path, independent of cron — and it is **not** bounded at one batch: ≤1 200 recipients per tick, repeatable per retry round (§1.4.1, M2). | **Medium, unbounded across retries** (was recorded "low, bounded" in r1 — wrong) | PM at the B10a gate (§1.4.4); B10a must record the error text on the send row so it is diagnosable |
| R6 | No `RESEND_API_KEY` locally, so nothing in Track B is exercised against the real API before A9/B11b. | Known, pre-existing | per PLAN.md working constraints |

## 6. Evidence that the tests detect drift

Green at head: `npx vitest run __tests__/lib/resend-contract.test.ts __tests__/lib/svix-contract.test.ts`
→ **42 passed** (13 + 29).

### 6.1 Resend suite (r1)

Three drift mutations were applied to the installed packages — to the shipped bundles the
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
anyone re-running this check will otherwise reach the wrong conclusion. (`standardwebhooks` has
no such twin: it ships CJS only, `"type": "commonjs"`, `main: ./dist/index.js`.)

### 6.2 svix suite (r2) — seven mutants, seven kills

The r1 svix suite had 22 tests and **survived two meaningful mutations**: canonicalising the
body before hashing, and narrowing the tolerance boundary from inclusive to exclusive. A
contract suite that passes a mutation is worse than no suite, because B7 and B10a inherit it as
fact. §2.2 and §2.4 are re-derived; the suite is now 29 tests and this is the run that proves
it. Verbatim output: [`docs/plan/evidence/b2/svix-mutation.md`](../evidence/b2/svix-mutation.md).

Every mutation targets `node_modules/standardwebhooks/dist/index.js` — `svix`'s `Webhook` is a
thin header-normalising wrapper, so that bundle is where verification actually happens. Each
mutant was applied alone from a byte-for-byte backup, the suite run, the file restored and the
restore asserted by SHA-256 before the next mutant.

| # | Mutation | Simulates | Result |
|---|---|---|---|
| SM1 | `WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60` → `10 * 60` | a verifier widening the replay window | **2 failed** — ±301 s rejections |
| SM2 | both `>` → `>=` in `verifyTimestamp` | a verifier making the boundary exclusive | **2 failed** — the exact ±300 s acceptances (r1 could not see this) |
| SM3 | `verify` hashes `JSON.stringify(JSON.parse(payload))` | canonicalisation on the verify side | **4 failed** — three spellings + the reverse-direction case |
| SM4 | `sign` canonicalises, so both sides hash canonical JSON | canonicalisation on both sides | **4 failed** — same four |
| SM5 | `if (version !== "v1") continue;` removed | a verifier accepting any signature version | **1 failed** — the non-`v1` rejection |
| SM6 | `timingSafeEqual(…)` → `!timingSafeEqual(…)` | an inverted signature comparison | **18 failed** |
| SM7 | `sign` canonicalises with **sorted keys** | a canonicaliser that also normalises member order | **6 failed** — the known-answer vector plus all five raw-byte cases, including the key-order spelling |

Restored byte-for-byte afterwards: **29/29 green**. SM2 and SM3 are the two mutants Sol found
surviving r1; SM4 and SM7 are their both-sides and member-order variants. SM7 is why the
key-order spelling is in the table at §2.4 — a plain `JSON.stringify(JSON.parse(x))` round-trip
preserves insertion order, so only a sorting canonicaliser makes that case fire.
