# Spanish NER recall layer — Z0B feasibility spike

Optional recall layer for the transcript sanitizer (plan §12). The **required**
layer is `lib/zoom/sanitizer.ts` — dependency-free, always runs. This directory
holds the measurement scripts and a deploy-ready Vercel Python function for the
layer that would sit behind it.

**Nothing here is deployed.** The function lives under `scripts/spikes/` on
purpose: `main` auto-deploys, and a `.py` file under a root `api/` directory
would become a live endpoint the moment this phase merged. Shipping it is a
deliberate move to `api/ner.py` in the phase that wires it (Z5).

## Files

| File | Purpose |
|---|---|
| `index.py` | Deploy-ready function. Shared-secret bearer auth, fail-closed contract. |
| `requirements.txt` | Pinned deps for that function. Not installed by this repo. |
| `measure-node.ts` | Emits the Node layer's per-mention verdicts as JSON. |
| `measure_ner.py` | Footprint / load time / latency / recall, scored on the same fixtures. |
| `setup-venv.sh` | Reproduces the local measurement environment. |

## Reproducing the measurements

```bash
./scripts/spikes/ner/setup-venv.sh /tmp/ner-venv
npx tsx scripts/spikes/ner/measure-node.ts > /tmp/node-results.json
/tmp/ner-venv/bin/python scripts/spikes/ner/measure_ner.py /tmp/node-results.json
```

Both sides read the same fixtures from `__tests__/lib/zoom/fixtures/`, so
Node-only, NER-only and combined recall are directly comparable. Results are
recorded in `docs/planning/zoom-spike-results.md` §4.

## Design decisions the measurements forced

**The function returns entities, not sanitized text.** Redaction and
`[persona N]` numbering stay in the Node layer, which is the single source of
truth for token stability across a transcript. A service that also redacted
would give two components an opinion on the same output, and they would drift.

**It returns entities of every label, not just `PER`.** The spike measured that
Spanish NER routinely detects an ambiguous given name and then mislabels it —
`Florencia` → `LOC`, `Rosa` → `MISC`, `Balentina` → `ORG`. Filtering to `PER`
inside the service throws away most of the recall the layer exists to add:
PER-only scored *worse* than the Node layer alone. The caller applies its own
non-person lexicon (`NON_PERSON_TERMS`) and shape filter (`MAX_NAME_TOKENS`,
plus the `hasVerb` flag the response carries) instead.

**Failure is never silent degradation.** Any non-200, timeout, or malformed
response obliges the caller to set `sanitization_status = 'flagged'`, which
blocks minuta generation until a human reviews it (§6 state machine). The error
body states `"sanitizationStatus": "flagged"` explicitly so the rule is visible
at the boundary rather than living only in the caller. Availability is never
traded against recall.

**Raw transcript text crosses this boundary.** That is acceptable only because
this is FNE-controlled infrastructure rather than a third-party model — the
repo rule bans student PII in *AI prompts*, and the whole point of this layer is
to remove it before one exists. The function must never log request bodies, and
does not.

## Configuration when it ships

| Variable | Purpose |
|---|---|
| `NER_SHARED_SECRET` | Bearer token. Server-only, never `NEXT_PUBLIC_`. Compared in constant time. |

`GET` is an unauthenticated health probe that reports model readiness only —
useful for the health panel (§18) and exposes nothing.

## Known gap

Cold-start time on Vercel is **not measured** — see
`docs/planning/zoom-spike-results.md` §4 for why and for the local load-time
figure that bounds it from below.
