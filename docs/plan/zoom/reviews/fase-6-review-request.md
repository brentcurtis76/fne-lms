# Fase 6 (Zoom Z3) — review request

> Executor self-report for **Z3 — Embedded experience**, covering all four chunks
> (Z3-1 … Z3-4). Written at the close of Z3-4 per `CLAUDE.md` Executor Rule 6 and
> PLAN §15. This is a lead for the independent reviewer, never the boundary of the
> review: the diff is the artifact.

## Branch, base and commits

| | |
|---|---|
| Branch | `feat/zoom-embed` |
| Base (merge-base with `origin/main`) | `65c8114b5acf7b3242c5c78d8ec7466332045e26` |
| Commits | **4** |
| Worktree | `/Users/brentcurtis/dev/wt/zoom-embed` |

| # | SHA | Chunk | Subject |
|---|---|---|---|
| 1 | `5c3bbea1` | Z3-1 | `feat(zoom): mint an SDK join payload for participants behind FEATURE_ZOOM_EMBED` |
| 2 | `09d32643` | Z3-2 | `feat(zoom): issue a ZAK and role:1 to hosts under the §9 rule` |
| 3 | `db9fc6c7` | Z3-3 | `feat(zoom): render the embedded meeting, with a preflight and a link fallback` |
| 4 | *(this commit)* | Z3-4 | `feat(zoom): join through Client View where Component View cannot run` |

**One diff artifact to expect and discount.** `git diff --stat origin/main..HEAD` shows
`docs/plan/zoom/LEDGER.md` and `docs/plan/zoom/prompts/Z3-r{2,3,4}.md` as *deletions*.
Nothing on this branch deleted them: the PM committed them to `main` after this branch
was cut, so they exist ahead of the merge-base and not on it. Compare against the
merge-base (`git diff 65c8114b..HEAD`) rather than `origin/main..HEAD` when reading the
docs half of the diff.

## Objective and scope (PLAN §15, Z3 row — copied)

> **Z3 — Embedded experience** ~~(only if Z0B passes)~~ — **field gate WAIVED by owner
> decision 2026-08-08, see §16**; the per-route Permissions-Policy listed below
> **already shipped in Z0B** (`next.config.js:57-81`) · branch `feat/zoom-embed` ·
> `@zoom/meetingsdk` Component View (desktop) + Client View route (mobile);
> PreJoinCheck; per-route Permissions-Policy; es-ES i18n; SDK-failure auto-fallback to
> link · **DoD:** School user joins embedded w/o Zoom account; fallback flag flips
> cleanly · 5–8 d

### Scope IN, by chunk

- **Z3-1** — a second success shape on `POST /api/meet/session/[id]/join`: `mode: 'sdk'`
  carrying `signature`, `sdk_key`, `meeting_number`, `passcode`, `user_name`,
  `customer_key`, `role`, behind `FEATURE_ZOOM_EMBED`. Never a `join_url` (§5).
  Participants only — hosts stayed on link mode until Z3-2 existed.
- **Z3-2** — hosts additionally receive `zak` and a `role: 1` signature, but only where
  §9 allows it (facilitator on their own mapped host; admin on org-owned pool
  identities), fresh at start-click, with a `zak_issued` audit row in
  `zoom_internal.zoom_zak_issuances`.
- **Z3-3** — the desktop embed: the CDN loader for Component View, the browser-capability
  reads, `PreJoinCheck`, and `JoinMeetingButton`'s SDK branch with a link fallback via a
  second POST carrying `{ fallback: 'link' }`.
- **Z3-4** — Client View for every browser Component View cannot serve (mobile, tablets,
  **Firefox**), the two-view support matrix, and the popup-blocked retry that re-runs the
  fallback instead of the embed.

### Scope OUT — declared, and not touched

- `lib/utils/meeting-join-policy.ts` and `lib/utils/meeting-zak-policy.ts` — sealed after
  their own chunks; Z3-3 and Z3-4 changed neither.
- The join route's authorization gates — unchanged by Z3-3 and Z3-4. The §5 opening was
  widened exactly once, in Z3-1, and once more in Z3-2 for the ZAK.
- `tests/e2e/zoom-join-authz.spec.ts` and everything under `tests/e2e/` — CI Gate 4 is
  untouched by this phase. `git diff --stat origin/main..HEAD -- tests/e2e/` is empty.
- `pages/meet/diag.tsx` and `pages/api/meet/diag-signature.ts` — the consultores' field
  instrument for the hardware protocol, live and deliberately not refactored to share
  Z3-3's loader (see *Known limitations*).
- `next.config.js`, `package.json`. Z3-4 adds no migration; the phase's only migration is
  Z3-2's.

## Files, grouped by risk

### Highest risk — the credential opening and the ZAK rule

| File | Chunk | Purpose |
|---|---|---|
| `pages/api/meet/session/[id]/join.ts` (+461/−…) | Z3-1/2/3 | The single §5 opening. Now mints three outcomes (link, SDK-participant, SDK-host-with-ZAK) and honours the `{ fallback: 'link' }` intent. Every authorization gate ahead of outcome selection is Z2's, unchanged. |
| `lib/utils/meeting-zak-policy.ts` (+135) | Z3-2 | Pure §9 rule: who may receive a ZAK, for which host identity. No I/O, no session, no DB. |
| `supabase/migrations/20260810120000_zoom_zak_issuances.sql` (+66) | Z3-2 | `zoom_internal.zoom_zak_issuances` audit table. Additive, RLS on. |
| `lib/zoom/api.ts` (+34/−…), `lib/zoom/client.ts` (+33) | Z3-2 | `GET /users/{id}/token?type=zak`. |

### High risk — what runs in the browser holding a signature

| File | Chunk | Purpose |
|---|---|---|
| `components/sessions/JoinMeetingButton.tsx` (+370/−…, and again in Z3-4) | Z3-3/4 | The client half of the whole phase: the per-click POST, the credentials-in-a-ref discipline, the view branch, both roots, the fallback and the retry. |
| `lib/meet/embed-capabilities.ts` (+98, +Z3-4) | Z3-3/4 | The support matrix — `supportsComponentView`, `supportsClientView`, `selectEmbedView` — plus the non-intrusive permission reads. |
| `lib/meet/zoom-sdk-loader.ts` (+154, +Z3-4) | Z3-3/4 | Component View CDN loader, sequential vendor React before the bundle. Z3-4 exported `SDK_BASE` and `loadZoomCdnScript` from it. |
| `lib/meet/zoom-client-view-loader.ts` (new, Z3-4) | Z3-4 | Client View CDN loader (four vendor files), the `ZoomMtg` surface, and the callback→promise wrapper. |

### Lower risk

| File | Chunk | Purpose |
|---|---|---|
| `components/sessions/PreJoinCheck.tsx` (+214) | Z3-3 | Advisory preflight. Reads nothing that can block a join. |
| `lib/featureFlags.ts` (+9/−…) | Z3-1 | `FEATURE_ZOOM_EMBED`, server-side only. |
| `lib/zoom/fake.ts` (+70) | Z3-2 | Test double for the ZAK endpoint. |

### Tests

`__tests__/api/meet/session-join-sdk.test.ts` (768) · `session-join-zak.test.ts` (905) ·
`__tests__/lib/utils/meeting-zak-policy.test.ts` (233) · `__tests__/lib/zoom/fake.test.ts`
(114) · `__tests__/components/sessions/JoinMeetingButton.sdk.test.tsx` (495) ·
`JoinMeetingButton.clientview.test.tsx` (new, Z3-4) · `PreJoinCheck.test.tsx` (126) ·
`__tests__/lib/meet/embed-capabilities.test.ts` · `zoom-sdk-loader.test.ts` (143) ·
`zoom-client-view-loader.test.ts` (new, Z3-4) · `supabase/tests/002-zoom-internal-isolation.sql`
(+134).

## Test evidence at this head

| Gate | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | exit 0 |
| Lint | `npm run lint` (`--max-warnings=0`) | exit 0 |
| Unit/integration | `npm test` | **300 files / 6985 tests passed**, exit 0 |
| Build | `npm run build` | exit 0 |
| pgTAP / RLS | `npm run test:db` | `Files=11, Tests=484, Result: PASS`, exit 0 |
| testid (advisory) | `npm run lint:testid` | 2668 problems — the pre-existing baseline; **0 in this phase's files** |

Phase-relevant suites, by name and count:
`JoinMeetingButton.test.tsx` 19 · `JoinMeetingButton.sdk.test.tsx` 23 ·
`JoinMeetingButton.clientview.test.tsx` 21 · `PreJoinCheck.test.tsx` 7 ·
`embed-capabilities.test.ts` 30 · `zoom-sdk-loader.test.ts` 7 ·
`zoom-client-view-loader.test.ts` 10.

**Fail-on-old probes run in Z3-4** (each: break the invariant, confirm a non-zero exit,
revert, confirm byte-identity by `shasum -a 256`):

- Re-admitting Firefox to Component View (deleting one line from `supportsComponentView`)
  → **6 tests failed, exit 1**. Reverted; `embed-capabilities.ts` back to
  `8abd07ed…60d8eafc`.
- Mounting both roots together (both render guards changed to `embedActive`) →
  **3 tests failed, exit 1**. Reverted; `JoinMeetingButton.tsx` back to
  `23d8aef6…b4798cd4`.

## Where an independent reviewer should push hardest

1. **`supportsClientView()` is thin, and it is the only thing standing between a browser
   and a 3.7 MB download.** It refuses on SSR and on a missing WebAssembly and nothing
   else — so it says yes to any browser with a media engine, including ones Zoom's matrix
   has never been tested against (in-app webviews, Android 8 stock browsers, kiosk
   shells). I chose breadth deliberately: Zoom documents Client View as supported on all
   four desktop browsers and both mobile ones, and the failure mode is the link fallback,
   not a dead end. But the asymmetry with `supportsComponentView` — which refuses on four
   separate readings — is real, and if you think the honest answer is a positive support
   test rather than a negative one, say so. Entry point:
   `lib/meet/embed-capabilities.ts:78-111`.

2. **Component View is gated on WebAssembly and Client View is — deliberately
   inconsistently — not.** `selectEmbedView` tries Component View first and that function
   does *not* read `supportsWebAssembly()`, so a desktop Chrome with the engine missing
   still selects Component View and fails into the link, exactly as it did in Z3-3. I left
   it that way because `PreJoinCheck` documents "nothing it reads can BLOCK the join", and
   moving the engine test up would make its `Motor de video → No compatible` row
   unreachable. The cost is that the `'none'` branch is only reachable from the Client View
   side. This is my judgement call and the one I would most expect to be overruled.

3. **The credentials discipline on the Client View path is asserted, not structural.**
   `passWord`/`zak`/`signature` go into `sdk.join(...)` from a local `const` read out of a
   ref that was emptied in the same breath — the same shape Z3-3 shipped — but Client View
   then takes the whole page over with vendor code we do not control, and jsdom cannot
   prove what that code does with what it was handed. `[D7]` proves our markup and our
   console stay clean; it does not prove Zoom's do. `components/sessions/JoinMeetingButton.tsx`
   `joinWithClientView`.

4. **Two chunks widened the §5 opening, and only the second one is guarded by a policy
   module.** Z3-1's SDK payload is assembled inline in the route; Z3-2's ZAK goes through
   `meeting-zak-policy.ts`. Worth checking that the participant payload has no path that
   can reach a value the §9 rule would have refused — particularly `customer_key` and
   `user_name`, which come from `profiles` rather than from the policy layer.

5. **`[C11]` guards by reading source files off disk, and its file list is hand-maintained.**
   It now covers `components/sessions/*`, both loaders and `embed-capabilities.ts`, with a
   floor of 9 files. A new client module added outside those paths would not be checked —
   the guard is only as good as its list, and the list is the thing to distrust.

## Known limitations and deferred items

1. **No real-browser verification of either view.** Every assertion in this phase is
   jsdom or Node. Nobody has watched a meeting render — the PLAN §16 hardware/network
   verdict was **waived, not cleared** (amended 2026-08-08), so the field protocol may
   still be run. Z3-4 confirmed Zoom's *documented* browser matrix and confirmed all six
   CDN URLs return 200; it verified no runtime behaviour.
2. **`pages/meet/diag.tsx` duplicates the Component View loader on purpose.** It is the
   consultores' field instrument and the protocol is live. Recorded debt, not an oversight;
   Z3-4 was explicitly told not to collapse it, and it did not.
3. **Client View's own init options are minimally configured.** `leaveUrl`, `patchJsMedia`,
   `leaveOnPageUnload` and the es-ES i18n load, and nothing else. Zoom exposes ~30 further
   `init` options (chat, breakout, recording UI, `disableInvite`); none is set, so the
   surface a student sees is Zoom's default. That is a product decision nobody has made yet.
4. **`sdkKey` is passed to `ZoomMtg.join` although Zoom's reference marks it deprecated for
   `joinOptions` since v4.0.0** ("you can just use signature"). It is kept for symmetry with
   the Component View call and because Zoom's own current samples still pass it. Harmless,
   but it is a guess about a deprecated-not-removed parameter.
5. **The §9-facts-read-twice backlog item** (r2 SHOULD-FIX ①) is still open. It wants a
   sealed module's return type widened and was deliberately excluded from Z3-3 and Z3-4.
6. **`[C9]`'s two assertions were rewritten in Z3-4**, because the chunk reverses their
   destination: a refused browser now takes Client View, not the link. The claim they
   guard — that the Component View bundle is never fetched on a machine that cannot render
   it — is unchanged and is now asserted against the loader rather than the DOM. Before and
   after are quoted in the Z3-4 executor report.
7. **`FEATURE_ZOOM_EMBED` is still off.** Nothing in this phase reaches a user until the
   flag flips, and the flag is server-side only — the client never reads it (`[C11]`).

---

# Round 5 — remediation of Sol's five MAJOR findings (2026-08-08)

Branch `feat/zoom-embed`, base `18441936` (the head Sol reviewed, PR #47, six gates green).
No migration, no `package.json` change, `tests/e2e/` untouched.

**Read this section against the five findings, not against the chunk list above.** Two of
the five were the PM's errors, not the executor's, and the record says so: `M1`'s logic was
read line by line and approved at r3, and `M4` was built exactly as the r4 prompt specified
— against `PLAN.md` §15.

## M1 — the fallback reported every success as a blocked popup

`window.open()` returns `null` whenever `noopener` is set, per the HTML standard, so on the
fallback path the old ternary was reading a value that carries no information: every user
was told their popup had been refused, and offered a retry that could open a second Zoom tab.

**Detection is abandoned rather than repaired**, because it cannot be repaired without
giving up `noopener,noreferrer` — which is not a trade worth making for a signal. Of Sol's
two shapes this takes the first, the explicit user-facing link:

- the call is unchanged and its return value is now unread;
- the **primary** path (`allowEmbed === true`) still resolves to `idle`, byte-identical to Z2;
- the **fallback** path resolves to a new `{ kind: 'link', url }` that renders a neutral
  status line and an `<a target="_blank" rel="noopener noreferrer">`. Activating a link IS a
  user gesture, which is what popup blockers key on, so this escape hatch cannot itself be
  refused — unlike the old retry button, which re-POSTed and landed out-of-gesture again;
- `POPUP_BLOCKED_MESSAGE`, the `retry: 'fallback'` outcome and `meet-join-retry-link` are gone;
- **every stub of `window.open` in the SDK suites now returns `null`.** The old `{}` was a
  value no browser produces under `noopener`, and it is what let the defect ship.

Sol's second shape — a synchronously-opened placeholder navigated later — was rejected on
the prompt's own instruction: holding a handle to the new tab means not passing `noopener`,
and `tab.opener = null` approximates only half of what is being given up (`noreferrer` is
not recoverable that way at all).

**Where this leaves `[R2]`, and it is a disagreement worth naming:** a genuinely blocked
popup can no longer be *reported*, because under `noopener` nothing observable distinguishes
it from a successful one. It is *covered* instead — the link is on screen either way. Any
criterion that asks for detection here is asking for the `noopener` trade back.

## M2 — Client View initialised before Spanish had loaded

`i18n.load` is typed `Promise<unknown>` and awaited before `init`, inside the same deadline
as every other SDK call. The old `void` return type is why nothing could warn. A test holds
the load promise open and asserts `init` and `join` are both still uncalled, then releases it.

## M3 — a stalled load or a failed retry could hang forever

The link fallback starts from a `catch`, so anything that never settles never falls back.
Four unbounded transitions are now bounded, and one reuse bug is fixed:

| what | bound |
|---|---|
| each CDN script download | `SDK_DOWNLOAD_TIMEOUT_MS` = 30 s |
| `i18n.load`, Component View `init`/`join`, the Client View callback wait, the frame's own load | `SDK_CALL_TIMEOUT_MS` = 45 s |

`loadZoomCdnScript` now reuses **only** a tag marked `loaded`, and removes the node on both
failure edges. The old version adopted a script element that had already fired `error` — an
element that never fires again — so the retry made once the network came back was the one
guaranteed to hang.

New `__tests__/components/sessions/JoinMeetingButton.timeouts.test.tsx` drives the **real**
loaders under fake timers (no module mocks: a stalled download is jsdom's own behaviour, and
a silent SDK is a global assigned in advance). Six cases — stalled CDN, silent Component View
`init`, silent Component View `join`, silent Client View callbacks, a localization load that
never settles, a frame document that never arrives — each asserting the `{fallback:'link'}`
POST fires and the busy state clears.

## M4 — Client View now runs behind a real CSS boundary

**The PM's framing was right about the defect and, on this router, wrong about the remedy
being a route.** Next's Pages Router permits a global stylesheet to be imported from
`pages/_app.tsx` and nowhere else, and `_app` wraps every page — so **no Next page in this
app can be a CSS boundary**, and a new `/meet/client/[id]` would have satisfied §15's wording
while leaving the defect exactly where it was. The prompt's own alternative is what shipped:
the vendor-supported iframe.

Client View renders inside a same-origin frame whose document is
`public/meet/zoom-client-view.html` — a static file served without the app pipeline. It has
no stylesheet, no `<style>`, no `<script>`, no class attribute, and holds nothing but
`#zmmtg-root`. Zoom's own two stylesheets are appended into it at runtime from the pinned
6.2.0 CDN, so the only CSS in that document is the vendor's.

The loaders became document-aware (`loadZoomCdnScript(src, doc)`, `loadClientView(host)`) so
the bootstrap stays in typed, tested TypeScript instead of forking into a copy living in
`public/`. Credentials cross into the frame as **function arguments** — not a URL, not a
prop, not an attribute, not a `postMessage` payload — so §5's discipline is unchanged.

Two consequences worth reviewing:

- `leaveUrl` is now the frame's own document. Zoom navigating the frame there is how the page
  learns the meeting ended; the frame is then unmounted and the bootstrap discarded, so a
  later join mounts a fresh frame and re-bootstraps. Without this the user would be left
  staring at a blank full-screen box.
- The frame carries `allow="camera; microphone; display-capture; autoplay; fullscreen"`.
  `next.config.js` grants those to `/meet/:path*` only, which is why the shell lives there.
  `middleware.ts` also gates `/meet/:path*` on a session, so the shell is behind auth too.

**The boundary is measured, not asserted** — `__tests__/lib/meet/client-view-boundary.test.ts`
checks the bytes on disk (including a positive control that `_app.tsx` still carries
`globals.css`, and that no Next page shadows the shell), and it was confirmed in a real
browser at 375×812 mobile emulation:

| | app page `/login` | the isolated shell |
|---|---|---|
| `document.styleSheets.length` | 10 | **0** |
| Tailwind Preflight rule present | yes | **no** |
| `box-sizing` | `border-box` | `content-box` |
| body `font-family` | `Inter, ui-sans-serif…` | `Times` |
| body `background-color` | `rgb(255,255,255)` | `rgba(0,0,0,0)` |

## M5 — still nobody has watched this run: BLOCKED

No `ZOOM_SDK_CLIENT_ID`, no `ZOOM_SDK_CLIENT_SECRET`, no `ZOOM_DIAG_MEETING_IDS` in this
worktree's `.env.local` or the main checkout's, and no sandbox meeting. Every instrument Z0B
left is present and unusable without them. **No join was attempted and none is claimed.**
School hardware/network validation **remains waived and deferred** — not passed.

## Amendments to the sections above

- **Scrutiny item 5** — `[C11]`'s file list is no longer hand-maintained: `SURFACES` is now
  the two directories `components/sessions` and `lib/meet`, floor raised 9 → 11, so a module
  added to either is covered without anyone remembering to add it.
- **Known limitation 1** — still true of the SDK, now false of the layout boundary: the CSS
  isolation was verified in a real browser (table above). No meeting has been joined.
- **Known limitation 3** — `leaveUrl` changed meaning; the other init options are still
  Zoom's defaults and still an unmade product decision.

## What r5 did not touch

`meeting-join-policy.ts`, `meeting-zak-policy.ts`, the join route's gate order, the §9
issuance rule, the audit write and its ordering, the `zak_issued` migration,
`supabase/tests/`, `tests/e2e/`, `pages/meet/diag.tsx`, `pages/api/meet/diag-signature.ts`.

---

# Round 6 — Sol M5: the runtime proof (2026-08-10)

r5 reported M5 BLOCKED for want of credentials and was right to. Brent supplied them, and
this round did the one thing M5 asks for: **watched this code render a real meeting.**

**School hardware/network validation REMAINS WAIVED AND DEFERRED — not passed.** Nothing
below was run on school hardware, on a school network, or on any of the §17 device
profiles. What was established is the narrower thing Sol distinguished: that the code works
once, against the real SDK, in a supported browser.

## How it was run

- **Surface: the app's own**, `/meet/session/[id]` → `JoinMeetingButton`. **Not** `/meet/diag`
  — the diag probe has its own inline loader and only reaches Component View, so it cannot
  speak to r5's Client View frame at all.
- **Browser: real Google Chrome** (`channel: 'chrome'`, headed), driven by a scratchpad
  Playwright harness. Nothing was added to `tests/`.
- **Data: 100% synthetic.** Persona `gcLeader` from `scripts/ci/e2e-fixtures.json`, session
  `…000503` (the Z2-S8 managed fixture), against the **local** Supabase stack. One
  `zoom_internal.zoom_meetings` row was seeded locally pointing at the disposable spike
  meeting; the passcode came from `.env.local` and was never written to a file or a log.
  `.env.local` points at PRODUCTION Supabase, so every process was started with the local
  URL/keys exported in the shell — that file was never edited and production was never read.
- **The meeting had to be started.** §9 provisions `join_before_host: false`, so the first
  attempt came back `{"errorCode":3008,"reason":"Meeting has not started"}` — which already
  proves the signature and passcode were *accepted*. A scratchpad host-starter then joined
  role 1 with a ZAK for the licensed host (S2S → `/users/{id}/token?type=zak`), exactly the
  credential pair the join route mints for the host persona.
- **Nothing was transmitted into the meeting.** No camera or microphone permission was
  granted to any context, host or participant. The meeting was left, not deleted; its
  topic, `join_before_host` and `waiting_room` were re-read afterwards and are unchanged.

## What was observed

### Component View — a real join (S1)

`init` resolved with `language: "es-ES"`, then `join` resolved in **4.4 s**:

```
1269ms  component.init:call  {"language":"es-ES","patchJsMedia":true,"leaveOnPageUnload":true}
1269ms  component.init:resolved
1269ms  component.join:call  {"meetingNumber":"81229544181","userName":"Lider Comunidad Sintetico",
                              "hasSignature":true,"hasPasscode":true,"hasZak":false,"hasCustomerKey":true}
5631ms  component.join:resolved
```

The embed rendered **inside the interstitial**, showing the host's tile, a participant count
of **2**, and Zoom's chrome in Spanish. Evidence: `evidence/z3-r6/01-component-view-joined.png`
(the video tile is blacked out — with the camera off Zoom renders the licensed host's
profile photo, which is a real person and does not belong in this repo).

### Client View in the r5 iframe — it runs, and it does NOT complete (S2)

**The iframe question is answered: yes, Zoom's Client View runs in a framed, same-origin
document.** All three of r5's named unknowns came back positive:

- the WASM media engine and its workers initialise in the frame (`preLoadWasm` resolved;
  `js_media`, `tp.wasm`, `net.wasm`, `video.simd.wasm` all fetched 200 into the frame);
- `allow="camera; microphone; …"` is sufficient — Zoom reached the device layer and reported
  *"No se detecta la cámara"*, which is the answer for a browser with no permission, not for
  a blocked context;
- `SharedArrayBuffer`'s absence changed nothing observable.

`i18n.load('es-ES')` resolved **before** `init` was called, and `ZoomMtg.i18n.getCurrentLang()`
read back **`es-ES`** inside the frame. M2's fix is confirmed at runtime.

**But the join never completes on its own.** Zoom renders its OWN pre-join screen inside the
frame — «Silenciar / Parar el vídeo / Fondos / **Entrar**» — and holds there. Sampled at 5 s,
12 s, 25 s and 40 s the frame was byte-stable (`innerHTML.length` 18109, same six buttons).
`join`'s `success` callback never fires, so M3's 45 s `withTimeout` rejects and **every
Client View user is pushed to the link fallback after a 45-second wait**. Measured three
times: fallback at 46 s, 46 s, 47 s.

Pressing Zoom's own «Entrar» from inside the frame settles it immediately:

```
[harness] clicked Zoom's own "Entrar" inside the frame at 4s
[harness] app left 'joining' without falling back at 8s → joined
```

Evidence: `evidence/z3-r6/02-client-view-prejoin-in-frame.png` (the screen it sits on) and
`evidence/z3-r6/03-client-view-joined-in-frame.png` (in the meeting, Zoom Workplace chrome,
Spanish toolbar, inside the frame).

So the trade r5 made holds only halfway. The PM accepted M4 on the argument that it moves an
undetectable failure to a detectable one — and the fallback **does** fire, cleanly, which is
the half that is true. What it costs is that the Client View path, as shipped, never
succeeds: mobile, tablet and Firefox users wait 45 seconds and then get a link.

### es-ES before render (S3)

Component View: `init({language:'es-ES'})` resolved before `join` was called. Client View:
`i18n.load` resolved at 849 ms, `init` after it, `getCurrentLang() === 'es-ES'`, and every
string Zoom rendered in the frame was Spanish. Both views confirmed.

### SDK failure → link (S4)

`source.zoom.us` blocked at the network layer. The first vendor script failed
(`net::ERR_FAILED`), the catch fired, the client re-POSTed `{fallback:'link'}`, the server
answered `mode=link`, a tab opened on the real meeting and the M1 anchor rendered with a
working `href`. Evidence: `evidence/z3-r6/04-sdk-failure-link-fallback.png`.

### `FEATURE_ZOOM_EMBED` off → link (S5)

Server restarted with the flag unset. The join answered `mode=link` on the first request, no
preflight rendered, no SDK byte was fetched, a tab opened. Byte-for-byte the Z2 path.

## Two defects this exposed — reported, NOT fixed (M1–M4 are sealed)

1. **`CLIENT_VIEW_STYLE_HREFS` are dead links.** Both
   `https://source.zoom.us/6.2.0/css/bootstrap.css` and `…/css/react-select.css` answer
   **HTTP 403** (`content-type: text/plain`, `nosniff`), so Chrome refuses them
   (`net::ERR_BLOCKED_BY_ORB`). The isolated document therefore carries **no CSS at all** —
   not Zoom's either. The loader appends them without awaiting, deliberately, so this fails
   silently and always has. Client View still renders (its bundle injects its own styles),
   but the pre-join screen visibly overlaps its own text. This is r5/M4 territory and is
   left alone.
2. **The 45-second dead end above.** Also M4 territory. Whether the answer is Zoom's
   `init({ disablePreview })`-style option, treating the pre-join screen as the intended UX
   and dropping the promise-shaped `join`, or reverting to a Client View route, is a PM/Sol
   ruling with evidence now in hand — not something to invent under time pressure.

## Gates at this head

| gate | result |
|---|---|
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0 — **7004 passed / 302 files** |
| `npm run build` | exit 0 |
| `npm run test:db` | exit 0 — **484 tests, 11 files, PASS** |

**No test was added.** This round's output is evidence, not code; the only files it changes
are this document and four screenshots.

## What r6 did not touch

No source file, no migration, no `package.json`. `tests/e2e/` is untouched
(`git diff --stat origin/main..HEAD -- tests/e2e/` is empty). All of M1–M4 left as sealed.
The harness lives in the session scratchpad and is not committed.
