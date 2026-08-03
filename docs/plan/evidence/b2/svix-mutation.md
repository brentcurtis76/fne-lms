# FASE B2 — svix contract suite: mutation evidence (round r2)

Closes REVIEW-B2.md [B2]. The r1 suite stayed green under two mutations Sol applied by hand
(canonicalising the body before hashing; narrowing the `>` boundary to `>=`), so the raw-byte
and exact-tolerance claims in `fase-b2-findings.md` §2.2 / §2.4 were not actually locked. The
suite was re-derived and then run against seven mutants.

**Target:** `node_modules/standardwebhooks/dist/index.js`. `svix`'s `Webhook` is a thin
header-normalising wrapper around `standardwebhooks`, so that bundle is where verification
happens. It ships CJS only (`"type": "commonjs"`, `main: ./dist/index.js`), so the ESM/CJS
false-green trap recorded for `resend` in §6.1 does not apply here.

**Protocol:** one mutant at a time, applied from a byte-for-byte backup; each anchor asserted to
match exactly once before substitution; the suite run; the file restored and the restore
asserted by SHA-256 digest before the next mutant. Baseline and post-restore runs bracket the
set. The driver aborts on an ambiguous anchor or a failed restore.

**Result: 7 mutants, 7 killed.** Baseline 29/29 green, restored 29/29 green.

| # | Mutation | Tests killed | Closes |
|---|---|---|---|
| SM1 | tolerance constant `5 * 60` → `10 * 60` | 2 | prompt's "flip the tolerance constant" |
| SM2 | `>` → `>=` in both `verifyTimestamp` comparisons | 2 | **Sol's surviving boundary mutant** |
| SM3 | `verify` canonicalises the body before hashing | 4 | **Sol's surviving canonicalisation mutant** |
| SM4 | `sign` canonicalises, so both sides hash canonical JSON | 4 | the both-sides variant |
| SM5 | signature-version filter dropped | 1 | prompt's "drop the version filter" |
| SM6 | signature comparison inverted | 18 | prompt's "invert the signature comparison" |
| SM7 | `sign` canonicalises with sorted keys | 6 | the member-order variant |

SM7 is the mutant the "key-order swapped" spelling exists for: a plain
`JSON.stringify(JSON.parse(x))` round-trip preserves member order, so only a sorting
canonicaliser makes that case fire. It also kills the pinned known-answer vector.

## Verbatim run

Driver: `python3 svix-mutate.py` (source at the end of this file), run from the phase worktree.

```
===== BASELINE — unmutated bundle (exit 0) =====
 ✓ __tests__/lib/svix-contract.test.ts  (29 tests) 13ms
 Test Files  1 passed (1)
      Tests  29 passed (29)

===== SM1 — tolerance constant widened to 10 min (exit 1) =====
 ❯ __tests__/lib/svix-contract.test.ts  (29 tests | 2 failed) 14ms
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > rejects a timestamp 301 s in the past
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > rejects a timestamp 301 s in the future
 Test Files  1 failed (1)
      Tests  2 failed | 27 passed (29)
 ❯ __tests__/lib/svix-contract.test.ts:181:84
 ❯ __tests__/lib/svix-contract.test.ts:191:88

===== SM2 — boundary made exclusive (`>` -> `>=`, both directions) (exit 1) =====
 ❯ __tests__/lib/svix-contract.test.ts  (29 tests | 2 failed) 14ms
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > accepts an offset of -300 s
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > accepts an offset of 300 s
 Test Files  1 failed (1)
      Tests  2 failed | 27 passed (29)
 ❯ __tests__/lib/svix-contract.test.ts:172:32
 ❯ __tests__/lib/svix-contract.test.ts:172:32

===== SM3 — verify canonicalises the body before hashing (raw bytes abandoned on the verify side) (exit 1) =====
 ❯ __tests__/lib/svix-contract.test.ts  (29 tests | 4 failed) 14ms
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a pretty-printed spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a space-separated spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a trailing newline spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects the compact spelling when the pretty-printed one was signed
 Test Files  1 failed (1)
      Tests  4 failed | 25 passed (29)
 ❯ __tests__/lib/svix-contract.test.ts:206:88
 ❯ __tests__/lib/svix-contract.test.ts:220:32

===== SM4 — sign canonicalises the body, so both sides hash canonical JSON (exit 1) =====
 ❯ __tests__/lib/svix-contract.test.ts  (29 tests | 4 failed) 12ms
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a pretty-printed spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a space-separated spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a trailing newline spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects the compact spelling when the pretty-printed one was signed
 Test Files  1 failed (1)
      Tests  4 failed | 25 passed (29)
 ❯ __tests__/lib/svix-contract.test.ts:206:88
 ❯ __tests__/lib/svix-contract.test.ts:224:75

===== SM5 — signature-version filter dropped (any version accepted) (exit 1) =====
 ❯ __tests__/lib/svix-contract.test.ts  (29 tests | 1 failed) 13ms
   ❯ __tests__/lib/svix-contract.test.ts > verify — rejected requests > ignores signature entries whose version is not v1
 Test Files  1 failed (1)
      Tests  1 failed | 28 passed (29)
 ❯ __tests__/lib/svix-contract.test.ts:264:78

===== SM6 — signature comparison inverted (exit 1) =====
 ❯ __tests__/lib/svix-contract.test.ts  (29 tests | 18 failed) 12ms
   ❯ __tests__/lib/svix-contract.test.ts > verify — accepted requests > returns the parsed payload for a valid signature
   ❯ __tests__/lib/svix-contract.test.ts > verify — accepted requests > accepts the unbranded `webhook-*` header names
   ❯ __tests__/lib/svix-contract.test.ts > verify — accepted requests > lower-cases header names before reading them
   ❯ __tests__/lib/svix-contract.test.ts > verify — accepted requests > accepts a Buffer payload identically to the equivalent string
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > accepts an offset of -300 s
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > accepts an offset of -299 s
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > accepts an offset of 299 s
   ❯ __tests__/lib/svix-contract.test.ts > verify — timestamp tolerance is exactly ±300 s, inclusive (D-08) > accepts an offset of 300 s
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a pretty-printed spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a space-separated spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a key-order swapped spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a trailing newline spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects the compact spelling when the pretty-printed one was signed
   ❯ __tests__/lib/svix-contract.test.ts > verify — rejected requests > throws WebhookVerificationError when the body was tampered with
   ❯ __tests__/lib/svix-contract.test.ts > verify — rejected requests > rejects a body whose signed subtree was extracted
   ❯ __tests__/lib/svix-contract.test.ts > verify — rejected requests > rejects a signature made with a different secret
   ❯ __tests__/lib/svix-contract.test.ts > verify — rejected requests > rejects a signature bound to a different message id
   ❯ __tests__/lib/svix-contract.test.ts > verify — rejected requests > throws a SyntaxError, not a verification error, when a valid body is not JSON
 Test Files  1 failed (1)
      Tests  18 failed | 11 passed (29)
 ❯ __tests__/lib/svix-contract.test.ts:106:40
 ❯ __tests__/lib/svix-contract.test.ts:114:40
 ❯ __tests__/lib/svix-contract.test.ts:126:40
 ❯ __tests__/lib/svix-contract.test.ts:155:40
 ❯ __tests__/lib/svix-contract.test.ts:172:32
 ❯ __tests__/lib/svix-contract.test.ts:206:88
 ❯ __tests__/lib/svix-contract.test.ts:220:32
 ❯ __tests__/lib/svix-contract.test.ts:236:7
 ❯ __tests__/lib/svix-contract.test.ts:244:85
 ❯ __tests__/lib/svix-contract.test.ts:256:73
 ❯ __tests__/lib/svix-contract.test.ts:276:73
 ❯ __tests__/lib/svix-contract.test.ts:311:20

===== SM7 — sign canonicalises with sorted keys, so both sides hash sorted-canonical JSON (exit 1) =====
 ❯ __tests__/lib/svix-contract.test.ts  (29 tests | 6 failed) 15ms
   ❯ __tests__/lib/svix-contract.test.ts > signing scheme > matches the pinned known-answer vector
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a pretty-printed spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a space-separated spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a key-order swapped spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects a trailing newline spelling of the signed body
   ❯ __tests__/lib/svix-contract.test.ts > verify — the signature covers the raw bytes, not the JSON value > rejects the compact spelling when the pretty-printed one was signed
 Test Files  1 failed (1)
      Tests  6 failed | 23 passed (29)
 ❯ __tests__/lib/svix-contract.test.ts:76:23
 ❯ __tests__/lib/svix-contract.test.ts:206:88
 ❯ __tests__/lib/svix-contract.test.ts:224:75

===== RESTORED — byte-for-byte original (exit 0) =====
 ✓ __tests__/lib/svix-contract.test.ts  (29 tests) 12ms
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

## Driver

```python
#!/usr/bin/env python3
"""Mutation run over the svix contract suite (B2 r2, Sol finding 2).

Applies one mutation at a time to the bundle vitest actually resolves
(standardwebhooks/dist/index.js — CJS only, no ESM twin), runs the suite,
records the verbatim tail, restores from a byte-for-byte backup, and asserts
the restore before moving on.
"""
import hashlib
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path("/Users/brentcurtis/Documents/wt-b2r2")
TARGET = ROOT / "node_modules/standardwebhooks/dist/index.js"
BACKUP = TARGET.with_suffix(".js.b2backup")
SUITE = "__tests__/lib/svix-contract.test.ts"

MUTANTS = [
    (
        "SM1",
        "tolerance constant widened to 10 min",
        [("const WEBHOOK_TOLERANCE_IN_SECONDS = 5 * 60;",
          "const WEBHOOK_TOLERANCE_IN_SECONDS = 10 * 60;")],
    ),
    (
        "SM2",
        "boundary made exclusive (`>` -> `>=`, both directions)",
        [("if (now - timestamp > WEBHOOK_TOLERANCE_IN_SECONDS) {",
          "if (now - timestamp >= WEBHOOK_TOLERANCE_IN_SECONDS) {"),
         ("if (timestamp > now + WEBHOOK_TOLERANCE_IN_SECONDS) {",
          "if (timestamp >= now + WEBHOOK_TOLERANCE_IN_SECONDS) {")],
    ),
    (
        "SM3",
        "verify canonicalises the body before hashing (raw bytes abandoned on the verify side)",
        [("const computedSignature = this.sign(msgId, timestamp, payload);",
          "const computedSignature = this.sign(msgId, timestamp, "
          "JSON.stringify(JSON.parse(payload.toString())));")],
    ),
    (
        "SM4",
        "sign canonicalises the body, so both sides hash canonical JSON",
        [("        const encoder = new TextEncoder();\n"
          "        const timestampNumber",
          "        const encoder = new TextEncoder();\n"
          "        try { payload = JSON.stringify(JSON.parse(payload)); } catch (e) { }\n"
          "        const timestampNumber")],
    ),
    (
        "SM5",
        "signature-version filter dropped (any version accepted)",
        [('            if (version !== "v1") {\n                continue;\n            }\n', "")],
    ),
    (
        "SM6",
        "signature comparison inverted",
        [("if ((0, timing_safe_equal_1.timingSafeEqual)(encoder.encode(signature), "
          "encoder.encode(expectedSignature))) {",
          "if (!(0, timing_safe_equal_1.timingSafeEqual)(encoder.encode(signature), "
          "encoder.encode(expectedSignature))) {")],
    ),
    (
        "SM7",
        "sign canonicalises with sorted keys, so both sides hash sorted-canonical JSON",
        [("        const encoder = new TextEncoder();\n"
          "        const timestampNumber",
          "        const encoder = new TextEncoder();\n"
          "        try { payload = JSON.stringify(JSON.parse(payload), function (k, v) { "
          "return (v && typeof v === 'object' && !Array.isArray(v)) "
          "? Object.keys(v).sort().reduce(function (o, kk) { o[kk] = v[kk]; return o; }, {}) "
          ": v; }); } catch (e) { }\n"
          "        const timestampNumber")],
    ),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_suite():
    proc = subprocess.run(
        ["npx", "vitest", "run", SUITE],
        cwd=ROOT, capture_output=True, text=True,
    )
    return proc.returncode, (proc.stdout + proc.stderr)


def summary(output):
    keep = [
        line for line in output.splitlines()
        if line.strip().startswith(("Test Files", "Tests", "×", "✓ __tests__", "❯ __tests__"))
    ]
    return "\n".join(keep)


def main():
    shutil.copy2(TARGET, BACKUP)
    original = digest(TARGET)
    report = []

    code, out = run_suite()
    report.append(("BASELINE", "unmutated bundle", code, summary(out)))
    if code != 0:
        print("baseline is red — aborting")
        print(out)
        sys.exit(1)

    for mid, label, edits in MUTANTS:
        source = BACKUP.read_text()
        for needle, replacement in edits:
            if source.count(needle) != 1:
                print(f"{mid}: anchor matched {source.count(needle)} times — aborting")
                sys.exit(1)
            source = source.replace(needle, replacement)
        TARGET.write_text(source)
        assert digest(TARGET) != original, f"{mid} did not change the file"

        code, out = run_suite()
        report.append((mid, label, code, summary(out)))

        shutil.copy2(BACKUP, TARGET)
        assert digest(TARGET) == original, f"{mid} restore failed"

    code, out = run_suite()
    report.append(("RESTORED", "byte-for-byte original", code, summary(out)))
    BACKUP.unlink()

    for mid, label, code, summ in report:
        print(f"\n===== {mid} — {label} (exit {code}) =====")
        print(summ)


if __name__ == "__main__":
    main()
```
