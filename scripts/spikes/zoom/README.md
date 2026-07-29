# Z0B-2 live-Zoom spike scripts

Throwaway measurement rigs for chunk **Z0B-2**. They exist to produce the evidence
in `docs/planning/zoom-spike-results.md` §6, §8 and §9 and to be re-runnable by a
reviewer. **None of this is production code** — the production Zoom client library
is Z1b's `lib/zoom/*` (parallel branch `feat/zoom-core`) and the production webhook
route is Z1b's too.

## Credentials

Everything reads `.env.spike.local` in the worktree root — **gitignored**
(`.gitignore` `.env*.local`, verified with `git check-ignore` before first use).
Required keys:

```
ZOOM_S2S_ACCOUNT_ID           ZOOM_SDK_CLIENT_ID
ZOOM_S2S_CLIENT_ID            ZOOM_SDK_CLIENT_SECRET
ZOOM_S2S_CLIENT_SECRET        ZOOM_LICENSED_HOST_EMAIL
ZOOM_WEBHOOK_SECRET_TOKEN     NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID  (same value as the SDK client id)
```

`lib.mjs` exports `makeRedactor(env)`, which every script pipes output through: it
collapses all seven credentials plus any JWT-shaped string (ZAKs, `start_url`
tokens, download tokens) before printing. That is why `start_url` shows as
`«jwt-redacted»` in captured output.

## Safety interlock

`lib.mjs` → `assertSpikeMeeting(env, id)` re-reads the meeting from Zoom and throws
unless its topic starts with `PRUEBA SPIKE`. Every destructive call
(`action=trash`, `action=delete`, `recording.stop`) is preceded by a fresh call to
it — not once per script, but immediately before each destructive request. Every
meeting these scripts create is named `PRUEBA SPIKE — no unirse`, so the naming
convention is load-bearing rather than cosmetic.

Scratch output goes to `scripts/spikes/zoom/out/` (**gitignored** — it holds real
account ids, host email and meeting UUIDs).

## Files

| File | Purpose |
|---|---|
| `lib.mjs` | S2S token (cached), `zoomApi()` (never throws on non-2xx, so a `4711` is a result), SDK JWT signer, redactor, safety interlock |
| `create-meeting.mjs` | Creates one spike meeting. Always `auto_recording:'none'` (§8), Chile wall-clock + `timezone` (§10) |
| `probe-scopes.mjs` | Probes every endpoint the Zoom phases need and prints the exact missing granular scopes, de-duplicated and paste-ready |
| `customer-key-poc.mjs` | Item 2 — two Playwright SDK guests with distinct customerKeys, then the participants report |
| `followup-report.mjs` | Re-reads a finished meeting after Zoom's reports settle |
| `recording-control.mjs` | Item 4(a) — enablement PATCH + read-back; `--stop <id>` for the Live Meeting Controls probe |
| `record-meeting.mjs` | Drives a real recorded meeting (host `role:1`+ZAK, guest `role:0`), clicks the disclaimers and captures their text |
| `stop-confirm.mjs` | Item 4(b) — server-side recording stop against a live meeting + the read-back probes |
| `transfer-recording.mjs` | Item 3 — claim → stream → S3 multipart → HEAD verify → trash → delete |
| `s3.mjs` | Hand-rolled SigV4 S3 multipart client, zero dependencies (see below) |
| `g2-consent-probe.mjs` | Item 5 — every plausible consent-evidence endpoint, with a marker search over raw response bodies |
| `sdk-harness/index.html` | Component View harness driven by Playwright. **Script load order is load-bearing** — see below |

## Two deliberate no-dependency decisions

**No `@zoom/meetingsdk` in `package.json`.** It declares `peer react@"18.2.0"`
*exactly* and this repo runs 18.3.1, so npm refuses the install without
`--legacy-peer-deps` — a flag that would change install resolution for every CI
job to serve one spike probe. The SDK is loaded from Zoom's CDN instead, and the
React pin is handed to Z3 as a finding.

Consequence, discovered empirically: the Component View bundle treats React and
ReactDOM as **externals**. Without `window.React` present it throws
`ReferenceError: React is not defined` while evaluating and never assigns
`window.ZoomMtgEmbedded`. Load order must be:

```
https://source.zoom.us/6.2.0/lib/vendor/react.min.js       (react 18.2.0)
https://source.zoom.us/6.2.0/lib/vendor/react-dom.min.js
https://source.zoom.us/6.2.0/zoom-meeting-embedded-6.2.0.min.js
```

Also empirical: `client.on(...)` must be registered **after** `client.init()`.
Before init the client's internal event map is undefined and `.on()` throws
`Cannot read properties of undefined (reading 'includes')`.

**No `@aws-sdk/client-s3`.** `s3.mjs` implements SigV4 by hand so the spike does
not dictate Z4's dependency choice, and so the exact protocol requirements are
documented rather than hidden behind a client. Self-tested against the local
endpoint before use (5 MiB + 1 KiB two-part upload, HEAD-verified byte-exact).

## Local Supabase

The transfer targets a **local** stack only. `supabase/config.toml` on this branch
gains `[storage]` + `[storage.s3_protocol]`.

⚠️ On this machine `supabase start` from the repo root is a no-op: the DB container
is named per `project_id`, and the parallel `feat/zoom-core` worktree shares that
id and already had a stack running with its `zoom_internal` migrations applied.
Restarting it would have destroyed that session's state. The transfer therefore ran
against a **separate throwaway stack** with its own `project_id` (`z0b2spike`) and
non-colliding ports (55321/55322/…), created outside the repo. Set
`SPIKE_STACK_ENV` to that stack's `supabase status -o env` output to point
`transfer-recording.mjs` at it. Declared as a deviation in the review-request file.

## Typical sequence

```bash
node scripts/spikes/zoom/probe-scopes.mjs <meetingId>          # what is actually granted
node scripts/spikes/zoom/create-meeting.mjs --jbh --minutes 60 --label customerkey
node scripts/spikes/zoom/customer-key-poc.mjs --hold-seconds 70

node scripts/spikes/zoom/create-meeting.mjs --minutes 30 --label recording
node scripts/spikes/zoom/record-meeting.mjs --minutes 6        # prints the occurrence uuid
node scripts/spikes/zoom/transfer-recording.mjs <uuid>         # verify + trash + delete

node scripts/spikes/zoom/create-meeting.mjs --minutes 30 --label stopctl
node scripts/spikes/zoom/stop-confirm.mjs
node scripts/spikes/zoom/g2-consent-probe.mjs <meetingId> <uuid>
```

Webhook side (needs a human to validate the URL in the Marketplace first):

```bash
node scripts/spikes/webhook/receiver.mjs                       # or FAIL_EVENTS=... to watch retries
cloudflared tunnel --url http://localhost:4000
node scripts/spikes/webhook/make-fixtures.mjs                  # captures → redacted fixtures
```

## Rate limits

§20: 100 create/update per host per UTC day, Create Meeting is LIGHT (Pro 30/s
account-wide). This chunk created **5** meetings total. Nowhere near the cap, but
worth knowing before looping any of these scripts.
