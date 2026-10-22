# Pasantías January 2027 — school section redesign (2026-10-22)

Status: **local runtime PASS on the final state (original still + "Observar y Preguntar"); pending the cumulative FINAL
review.**
- Human confirmation of the rendered page is pending, if the FINAL review requires it.
- No overall acceptance and no commit. See §6.
Unit: PASANT-SCHOOL-SECTION-01. Authored under order revision 2, whose amendments B1–B4 resolve FIRST's findings. Order
revision 3 added amendment B2-followup, which ratifies the C005 count change. This remediation runs under order revision 4. This is a follow-up to merged PR170. Base
`182c2cad0cd0e8773482937c99ab7693e334964c`, as the order states it; the author had no Git access and did not verify it.

This document sits beside the ratified contract (`docs/plan/pasantias-january-contract.md`) and the polish addendum
(`docs/plan/pasantias-polish-addendum-20261022.md`). It changes neither of them. It adds no fact. It records:
- the display copy the redesign introduces;
- the provenance of the one new photograph;
- the test changes the order authorizes.

## 1. Authority

- Brent, 2026-10-22, on the public page:
  - "the design from Dentro de la escuela ... is still poor";
  - "it also needs more oomph, put your ux/ui hat on";
  - "we could get some still shots from the video in the hero section".
- Brent, on the proposed stills: "the school yard is not good. the one where someone is placing a card on the glass wall
  is good".
- Brent, then: "great... go on".
- Scope: the `#un-dia` and `#escuelas` sections only. Local implementation, validation and one reviewed local commit. No push,
  PR, merge or deploy. No new publication approval is inferred.

## 2. What changed on the page

### 2.1 Cómo es un día (`#un-dia`)

- **The band.** A warm full-width band (`bg-amber-50/70`, hairline amber borders) with tighter vertical rhythm than before.
- **The spread.** The intro (eyebrow, title and one editorial line) sits beside the photograph: 5 + 7 columns from `lg`,
  stacked below it.
  - The photograph keeps its native 16:9 at every width. It is never cropped, and it carries `width`/`height`, lazy
    loading and async decoding.
  - It is not a link and has no caption, hover or animation.
  - From `lg`, a gold block is offset behind it as decoration.
- **The day's blocks.** They stay an `<ol>` in contract order. Each is a black disc with a gold, zero-padded position
  numeral (`01`–`03`, `brand_accent` on `brand_primary`, B4), a display heading, and the module sentence unchanged.
  - Each item draws a gold line to the next one, down the left below `lg` and across from `lg`. The last item draws none.
- **Fallback.** If the photograph is not on file (the `unDia` slot resolves to `null`), the intro takes the full width.
  The moments are unchanged.

### 2.2 Las escuelas (`#escuelas`)

- **Pasantía INSPIRA chapter** (black and gold, as its program card):
  - The program name, then the program's `overview` sentence verbatim (B1). No new count is printed.
  - Week 1, labelled by `weeks[0].label`: the two immersion schools as large cards, each with
    "<days> días por pasante" from its own `days`.
  - Week 2, labelled by `weeks[1].label`:
    - the visit-count sentence, exact;
    - the five candidates as identical name-only cards, none marked or numbered;
    - the selection caveat and the full-day sentence, verbatim, at 16 px.
  - No dates and no order per school.
- **Mirada Profunda chapter** (warm cream with a gold edge, as its program card):
  - The program name.
  - The days stated **once**: "<daysPerSchool> días completos por escuela", in amber 700 on cream (B4).
  - The five schools as a `<ul>` of names in module order. There are no other `<li>` in the chapter.
  - The order caveat, verbatim.
- **Headings:** h2 section → h3 program → h4 week → h5 school (first chapter); h2 → h3 program → h4 school (second).

Every existing section id and test id is kept. New test ids:
- `pasantias-dia-lead`, `pasantias-dia-photo`;
- `pasantias-day-block-N-numeral`, `pasantias-day-block-N-text`;
- `pasantias-escuelas-inspira-semana-1`, `pasantias-escuelas-inspira-semana-2` (composed from the module ids in the page);
- `pasantias-mirada-days`.

## 3. Display copy (not contract facts)

| Where | Copy | Basis |
|---|---|---|
| Day moment headings, by position onto the unchanged `COHORT_DAY_STRUCTURE` | Conocer · Observar y Preguntar · Profundizar | Order r2 S2 (Brent 22 Oct authority). The second heading was "Observar" until Brent asked, 22 Oct: "can we make n°2 Observar y Preguntar?" (management `authority-step2-wording.json`). The description and facts are unchanged. |
| Day intro, editorial line | "La escuela, contada por quienes la hacen." | Author's proposal under S2 ("concise editorial emphasis if helpful"); states no count, duration, order or school. Subject to PM/Brent UI acceptance. |
| Mirada Profunda days statement | "<daysPerSchool> días completos por escuela" | S4; the figure is the module's `daysPerSchool`. Deliberately not "…en cada una", which would restate part of the module's `overview`. |
| Photograph alt text | "Una mano coloca una tarjeta sobre un muro de vidrio." | S6 / FIRST #10: the visible action only, with no school, city or person. |

A day block beyond the third renders without a heading, never "undefined".

## 4. Photograph provenance — `public/images/pasantias/card-on-glass.webp`

| Field | Value |
|---|---|
| Source | `/home/brent/Downloads/Video fondo web IIIb.mov`, the public homepage background video (Supabase public storage `resources/Videos/`). Read-only. 1280×720. |
| Source sha256 | `46fc5ee6dd90a81f897625b1b9a1428f6038678bd30d96a5ed89ce13c424a830` |
| Frame | Seek 53.2 s: the first frame ≥ 53.2 s (input-side accurate seek). Exact pts **NOT_RECORDED**: the probe window did not reach 53.2 s. This is waived per the independent ASSET-P6-DISPOSITION. The independent image review confirmed it is the same frame, posture and framing as the earlier derivatives (V1). |
| Selection | Brent preferred this scene ("someone is placing a card on the glass wall") and rejected the schoolyard. |
| Not used | The AI-enhanced classroom preview, the schoolyard frame and the contact sheets. They stay in the management directory and never enter the worktree. |
| Authority for no masks | Brent, 2026-10-22: "i want them readable, they're just names" and "Use the original still without masks" (management `authority-original-still.json`). This supersedes the order's S5 redaction requirement and the final-candidate stop, for this restoration only. |
| Masks and retouching | **None.** No crop, mask, blur, sharpening, colour correction, upscale, AI or text reconstruction. The paper lists and their ordinary names appear as filmed. No name is transcribed in any record, prompt or commit. |
| Student-data note | The repo's privacy rule (CLAUDE.md, Ley 21.719) keeps student PII out of commits and AI prompts. The lists may hold pupils' names. They are already visible in the public homepage video, and Brent's explicit direction above is the documented basis for showing them. |
| Colour | Only the standard conversion WebP requires: auto-detected input → BT.601 limited-range 4:2:0, in one `scale` step. |
| Tool | `/usr/bin/ffmpeg` `n9.0.2`: one process, one thread, one frame, no network. Capped at 1 GiB, swap 0, 120 s. Actual: exit 0, peak 46.5 MiB, runtime 344 ms. Recipe `asset-extraction-original.json` (sha256 `adc3c613454e9c82ca6e6fc488b1c4023ff4c064b421338cec1a1ec6f8165885`) in the unit's management directory, independently cleared before the run. It wrote to a management path, never to the worktree. |
| Filter graph | `[0:v]scale=in_color_matrix=auto:in_range=auto:out_color_matrix=bt601:out_range=tv:flags=bicubic+accurate_rnd+full_chroma_int,format=yuv420p[out]` |
| Encoder | libwebp, lossy, preset `photo`, quality 82, compression level 6. Metadata stripped (`-map_metadata -1`, `-map_chapters -1`, bitexact). |
| Output | 1280×720 WebP, yuv420p, no tags (ffprobe). sha256 `4c3d654659ec1bc2d6f74931f3744a2ce46320a6d05bb6045f9d6ac4ef44345b`, 49 666 bytes. The PM copied it byte-for-byte into the product path after the independent image review (APPROVE_IMAGE_INSTALL), and verified it by sha256 and bytes. |
| Image review | V1 same frame: **PASS**. V2 unaltered (no masks, patches, seams, crop or colour shift): **PASS**. |
| Served and rendered (PM, management `evidence/pm-ui-original/`) | Served bytes, fetched by a fresh uncached client, equal the hash above and 49 666 bytes (`served-asset.json`). The still loads with `naturalWidth` 1280 at 1866, 768, 390 and 375 px (`responsive.json`). PM screenshots exist at desktop, tablet, 390 and 375. |
| Final checks | The manifest unit test against this asset: PASS, within the final focused run (§6). PM UI at 1866, 768, 390 and 375: the still loads at native 1280×720, 16:9, with no clipping (management `pm-ui-final.json`). ORIG-03 passed. Brent asked for the original twice; a separate approval of the final render is not inferred. |
| Identifiable faces of minors | **No.** One adult's torso and arm only. |
| Filming location | **UNVERIFIED.** No school name is visible. The alt text and the page make no claim about it. |

**History (all retained in management; none ships).** Every candidate came from the same source and seek.

| Candidate | Treatment | Output | Outcome |
|---|---|---|---|
| r1 | one 460×430 pixelate+blur block | sha256 `65dbbce98f71df3f137750d6189663bae1a8a96a86f75a489611c00f4260a39c`, 33 280 bytes | rejected, visual: it hid the fingers, card and heading (SCHOOL-IMAGE-01) |
| r2 | three 4-column pixelate+blur masks | sha256 `d2b9f23d1d92f48a93b83fab0072da322abd20a05c728f2ac1a4091b6e92f5a5`, 38 976 bytes | rejected, privacy and visual (SCHOOL-IMAGE-02) |
| r3 | four 1-column paper-tone masks | recorded in management evidence | rejected, privacy: two short text bands exposed (SCHOOL-IMAGE-03) |
| r4 | six 1-column paper-tone masks (recipe sha256 `99c65221f24758723336231d2d0a5cb3a2b1738a4792ab4b8d00d97e59b3632c`) | sha256 `5ceac75c4e1e19c27eb898ae0f9dd1469e04e85043f40a4caa91ab58aa187332`, 38 874 bytes | passed the independent image review (privacy PASS, visual PASS with reservations) and was installed. Brent then rejected the masks, and it was vacated from the product path to management (`card-on-glass-r4-vacated-from-product.webp`). |

r1, r2 and r4 sat at the product path at some point. All three were moved out, not deleted. r3 was written to management
staging only.

## 5. Tests

- **Like-for-like replacements, order r2 B3:**
  - The day-block whole-`li` text checks in `tests/e2e/pasantias-page.spec.ts` become:
    - the unchanged `li` count;
    - an exact check on each `pasantias-day-block-N-text`;
    - the heading and the numeral, paired by position.
  - The per-card "2 días completos" checks become:
    - five name-only `li`s in module order;
    - one exact `pasantias-mirada-days`, present once;
    - the unchanged verbatim caveat.
- **Guard reason text, order r2 B2** (`__tests__/pages/pasantias-hardcoded-cohort.test.ts`): the reasons for
  `días completos`, `programs..schools`, `programs..immersionSchools` and `dayStructure` now describe the shared days
  statement, the name-only list, the overview's second site and the position numerals. The header gains a dated paragraph
  and the five-sites test title is corrected. No mechanism, threshold, `EXPECTED_*` count or list membership changed.
- **Ratified, order r3 amendment B2-followup:** the C005 attribution test in the same file asserted `/2 días completos/g`
  five times in the second chapter. S4 makes it one statement, so the expected length moves 5 → 1. All five school-name
  assertions stay. The PM ratified this as a like-for-like S4 presentation change, not a weakened factual requirement. No
  guard mechanism or count declaration changed.
- **New focused checks** (`__tests__/pages/pasantias.test.tsx`): the spread, the moments, both chapters, the image
  attributes and the absence of seven-school or consecutive-day wording.
- **New asset check** (`__tests__/lib/pasantias-image-manifest.test.ts`): the shipped WebP is 1280×720 and carries no
  EXIF/XMP/ICC chunk.
- **E2E:** the four-width loop gains the photograph's 16:9, loaded natural width, and no clipping of the split's and the
  chapters' text.

## 6. Status

**Final local gates** (PM, management `final-evidence-index.json`). These run on the final state: the original still,
"Observar y Preguntar", and the ORIG-01 wording.

| Gate | Result |
|---|---|
| Type-check | PASS |
| Lint | PASS, zero warnings |
| Focused tests (9 files, incl. the page test, the hardcoded-cohort guard, the image manifest and price-leak regressions) | 5 989 passed |
| Build + price guard | PASS: peak 2 715 992 064 B (2.529 GiB) under a 4.5 GiB cap and 6.5 GiB admission; reserve minimum 5 676 288 KiB; no swap |
| Browser specs (`pasantias-page` + `pasantias-form`, one worker, zero retries) | 33 passed; 0 skipped; 0 flaky |
| PM UI at 1866, 768, 390 and 375 (`pm-ui-final.json`) | PASS. Actual screenshots. "Observar y Preguntar" is visible and intact at every width and fits at 375. The still is native 1280×720, 16:9. No overflow or clipping. The served still's hash matches the installed file. |

**Baselines carried forward, not repeated:**
- **Full unit suite:** 17 651 passed across 527 files, with 12 skips, all inherited. It ran before the image and heading
  changes. The step-02 source review accepted the scoped re-checks above as sufficient for those changes.
- **Static checks** (testid lint, browser-boundary guard): PASS. The run predates the heading literal.

**Source findings:** ORIG-01 and ORIG-02 are closed. ORIG-03 (replacement-asset checks) passed.

**Pending:**
- the cumulative independent FINAL review;
- human confirmation of the rendered page, if FINAL requires it (Brent asked for the original still twice; a separate
  approval of the final render is not inferred);
- one reviewed local commit. No push, PR, merge or deploy.

**Page and test source.** The FINAL source review inspected the source and requested no change to it, but its overall verdict was CHANGES_REQUIRED, and no tests were run. That is a finding from inspection, not an approval.

Nothing here is "done" until the cumulative independent review approves. Human confirmation follows if that review
requires it.

No commit has been made.
