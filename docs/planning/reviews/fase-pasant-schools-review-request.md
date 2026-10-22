# Review request — PASANT-SCHOOL-SECTION-01 (`/pasantias` "Cómo es un día" and "Las escuelas")

**Status: local runtime PASS on the final state; pending the cumulative FINAL review.**
- **Passed (PM, final state):** type-check, zero-warning lint, focused tests, build plus the price guard, the browser
  specs and the PM UI at four widths.
- **Carried forward:** the full-unit and static baselines. See "Test evidence".
- **The photograph** `public/images/pasantias/card-on-glass.webp` is now the **unmasked original still**, installed
  locally by Brent's direction ("Use the original still without masks"):
  - the independent image review gave APPROVE_IMAGE_INSTALL (same frame: PASS; unaltered: PASS);
  - the PM verified that the served bytes equal the installed hash and that `naturalWidth` is 1280 at four widths, and
    captured screenshots;
  - r1–r4 are retained in management. r4 had been installed, and was vacated when Brent rejected the masks.
- **Step-02 heading:** "Observar" → "Observar y Preguntar", by Brent's request. Only the page string and the two exact
  test expectations changed; the description and facts are unchanged.
- **Pending:**
  - the cumulative FINAL review;
  - human confirmation of the rendered page, if FINAL requires it;
  - one reviewed local commit.
- **Source review (history):** the FINAL source review inspected the page and test source and requested no change to it. Its
  overall verdict was CHANGES_REQUIRED, and no tests were run, so this is not an approval. Its three findings are
  addressed by one remediation:
  - SCHOOL-IMAGE-01, the asset recipe;
  - SRC-REC-01, provenance;
  - SRC-REC-02, records and guard comments.
- **Branch:** `fix/pasant-schools` (worktree `/home/brent/Projects/pm-workflow/worktrees/genera-pasant-schools`).
- **Base:** `182c2cad0cd0e8773482937c99ab7693e334964c`, the verified PR170 merge as the order states it. The author had no
  Git access and has not verified it.
- **Commits:** none by the author. All changes are uncommitted. One reviewed local commit is allowed after FINAL and the
  gates. No push, PR, merge or deploy.
- **Author:** a separate Opus executor (`claude-opus-5-5`, effort high requested, no fallback), order revision 2. The
  remediation author is a separate Opus session under order revision 4.
  - The FIRST plan review (`review-first.md`) was CHANGES_REQUIRED. B1–B4 are resolved by the order's amendments.
  - Order revision 3 added B2-followup, which ratifies the C005 count change.
  - FIRST's acceptance items 1–15 bind this work.
- **Authority:** Brent, 2026-10-22. The middle section was "still poor" and needed "more oomph". He preferred the
  card-on-glass video still and rejected the schoolyard, then said "great... go on". Later the same day he directed
  "i want them readable, they're just names" and "Use the original still without masks" (management
  `authority-original-still.json`). That supersedes S5's redaction requirement for this asset. Record:
  `docs/plan/pasantias-school-section-20261022.md`.

## Objective and scope

**Objective:** make `#un-dia` and `#escuelas` visually compelling and immediately understandable, using Brent's selected
real video still and a clear program hierarchy.

**In scope (S1–S8):**
- S2: the un-dia editorial split, with the still beside the intro and connected 01/02/03 moments;
- S3: the INSPIRA black/gold chapter (overview verbatim per B1, week labels from the module, two immersion cards, five
  name-only visit cards, the count, the caveat and the full-day sentence verbatim);
- S4: the Mirada Profunda cream chapter (names only, days stated once, caveat verbatim);
- S5: the video still, through a recipe the PM executes. It is unmasked by Brent's later direction;
- S6: responsive and accessible;
- S7: tests;
- S8: records.

**Out of scope:**
- every other section;
- `cohort-public.ts`, the contract and the polish addendum;
- forms, CTAs, Sandra, the photo crops, PDFs, API, DB, auth, config, dependencies, animation and new interactions;
- school identity claims and roster data.

## Files, grouped by risk

**Guards (highest scrutiny):**
- `__tests__/pages/pasantias-hardcoded-cohort.test.ts` (B2):
  - Reason text was corrected for `días completos`, `programs..schools`, `programs..immersionSchools` and `dayStructure`.
  - A dated header paragraph was added, and one test title was corrected ("printed at five sites" → "stated once for a
    whole chapter").
  - **One factual assertion changed:** in the C005 test, `/2 días completos/g` goes from length 5 to length 1. This is
    ratified by order r3 amendment B2-followup. See "Where to look hardest" #1.
  - No mechanism, threshold, `EXPECTED_*` count or list membership changed.

**Page:**
- `pages/pasantias.tsx`:
  - a new `unDia` photo slot;
  - `CHAPTER_TITLE`, `DAY_MOMENT_HEADINGS` and `DAY_PHOTO_ALT`;
  - the `#un-dia` and `#escuelas` markup.

  No other section changed. After the first runtime gates:
  - two comments were reworded to describe the unmasked still (ORIG-01);
  - `DAY_MOMENT_HEADINGS[1]` changed from "Observar" to "Observar y Preguntar" (Brent's request, management
    `authority-step2-wording.json`).

  Both changes are covered by the final local gates.
- `lib/pasantias/image-manifest.ts`: one line, `card-on-glass.webp`, sorted after `bcn-skyline.jpg`. It was
  hand-edited to equal the generator's output once the file exists.

**Asset (installed locally; replacement checks PASS, ORIG-03):**
- `public/images/pasantias/card-on-glass.webp`:
  - sha256 `4c3d654659ec1bc2d6f74931f3744a2ce46320a6d05bb6045f9d6ac4ef44345b`, 49 666 bytes, 1280×720.
  - **No masks and no enhancement.** Seek 53.2 s; exact pts NOT_RECORDED.
  - Produced by the PM from `asset-extraction-original.json` (recipe sha256 `adc3c613…5885`) into management. Peak
    46.5 MiB, runtime 344 ms. Copied byte-for-byte after the independent image review.
  - **History:**
    - r1–r3 were rejected (SCHOOL-IMAGE-01/02/03).
    - r4 (six paper-tone masks, `5ceac75c…7332`) was installed, then vacated when Brent rejected the masks.
    - All are retained in management.
  - Full provenance is in plan doc §4. The names on the paper lists are visible by Brent's direction and are not
    transcribed anywhere.

**Tests and docs:**
- `__tests__/pages/pasantias.test.tsx`: a new describe block covering:
  - the spread;
  - the image attributes and alt (one test title reworded "redacted" → "unmasked video" after the gates; ORIG-01);
  - the moments 01–03 with their headings and exact sentences (step 02's expected heading is now "Observar y
    Preguntar");
  - B4 colour placement;
  - both chapters;
  - the heading nesting;
  - no seven/consecutive wording.
- `__tests__/lib/pasantias-image-manifest.test.ts`: the still is listed; it is 1280×720; it has no EXIF/XMP/ICC chunk
  (RIFF parsed with `node:fs`, no new tooling). Its header comment was reworded for the unmasked still (ORIG-01).
- `tests/e2e/pasantias-page.spec.ts`:
  - the B3 like-for-like replacements, for the day blocks and the Mirada days (`DAY_MOMENTS[1].heading` is now
    "Observar y Preguntar");
  - in the four-width loop, the still's 16:9 within 2 px, its loaded `naturalWidth` 1280, its viewport containment, and
    no clipped text in the spread or the chapters.
- `docs/plan/pasantias-school-section-20261022.md` (new), covering:
  - display copy;
  - full provenance of the unmasked still: the authority, source, tool, filter graph, output hash and bytes, run facts
    and image review;
  - the r1–r4 history;
  - the student-data note;
  - the test changes.

  Exact pts is NOT_RECORDED, per ASSET-P6-DISPOSITION.
- This file.
- `PROJECT_STATE.md`: a new top entry.

## Test evidence

**Final local gates, PM-run on the final state** (the original still, "Observar y Preguntar" and the ORIG-01 wording).
The authors ran nothing. Index: management `final-evidence-index.json`.

| Gate | Result |
|---|---|
| Type-check | PASS |
| Lint | PASS, zero warnings |
| Focused Vitest (9 files, incl. the page test, the hardcoded-cohort guard, the image manifest and price-leak regressions) | 5 989 passed |
| Build + `check-price-leak` | PASS: peak 2 715 992 064 B (2.529 GiB) under a 4.5 GiB cap and 6.5 GiB admission; reserve minimum 5 676 288 KiB; no swap |
| `pasantias-page.spec.ts` + `pasantias-form.spec.ts` | 33 passed; 0 skipped; 0 flaky; one worker, zero retries |
| PM UI at 1866, 768, 390 and 375 (`pm-ui-final.json`) | PASS. Actual screenshots. "Observar y Preguntar" is visible and intact at every width and fits at 375. The still is native 1280×720, 16:9. No overflow or clipping. The served hash matches the installed file. |

**Baselines carried forward, not repeated:**
- **Full unit suite:** 17 651 passed across 527 files, with 12 skips, all inherited. It ran before the image and
  literal changes. The step-02 source review accepted the scoped re-checks as sufficient.
- **Static checks** (testid lint, browser boundaries): PASS. The run predates the heading literal.

**Asset:** the original recipe ran once (exit 0, peak 46.5 MiB, 344 ms), and the independent image review passed it.
These are asset checks, not test results.

**Source findings:** ORIG-01 and ORIG-02 are closed. ORIG-03 passed.

**Pending:**
1. The cumulative independent FINAL review.
2. Human confirmation of the rendered page, if FINAL requires it. A separate approval of the final render by Brent is
   not inferred.
3. One reviewed local commit. No push, PR, merge or deploy.

## Where to look hardest

1. **The C005 count change in the guard file.**
   - Line ~2714 asserted "2 días completos" five times in the Mirada slice. S4 requires the days stated once, so it now
     asserts once.
   - This is a factual assertion, not reason text. B2 read literally allows only reason text and comments in that file.
   - The PM ratified it in order r3 amendment B2-followup as a like-for-like S4 presentation change. All five school-name
     assertions stay, and no guard mechanism or count declaration changed.
   - The FINAL source review verified that the diff is limited to this.
2. **Fragment and restatement rules against the new copy.** New visible literals:
   - "La escuela, contada por quienes la hacen."
   - "Conocer", "Observar y Preguntar", "Profundizar". No module string contains "observar" or "preguntar".
   - "días completos por escuela"
   - zero-padded numerals
   - the alt text

   Hand checks against every module string found:
   - no surviving run of 2 or more tokens and 12 or more characters other than the declared "días completos";
   - no bare digit;
   - no "dos", "tres", "ambos" or "ambas";
   - no new `COHORT_CITY` site, which must stay at exactly 3;
   - no new date site.

   `inspira.overview` and the INSPIRA week labels now print at a second site. Both sites are wired.
3. **The photograph (`asset-extraction-original.json`).**
   - It is the unmasked frame, with a single colour-conversion filter and nothing else.
   - Served bytes are verified against the installed hash.
   - The ORIG-01 diff must be comment and title wording only.
   - The step-02 diff must be exactly one page string and two test expectations.
4. **Connector lines** (`::after` per `li`). The line runs vertically below `lg` and horizontally from `lg`, and is
   hidden on the last item. Check at 375, 390 and 768 that it meets the next disc and never overshoots, and at 1866 that
   it sits between the discs.
5. **Contrast and spacing.**
   - Colour pairings:
     - the eyebrow `brand_gray_medium` on `amber-50/70`, estimated about 4.6:1;
     - gold only on black (numerals, week labels, immersion days);
     - amber 700 on cream for the Mirada days.
   - axe will judge the colours.
   - Whether the spread still leaves dead space at 1866 is a visual judgment for the PM.

## Known limitations and deferred items

- **Readable names in the photograph.** These are ordinary names on paper lists, possibly pupils'. They are shown by
  Brent's explicit direction and are already visible in the public homepage video. The repo's student-PII rule is noted
  in plan doc §4. The names are not transcribed in any record.
- **Faces of minors:** no. **Filming location:** UNVERIFIED. **Exact frame pts:** NOT_RECORDED (ASSET-P6-DISPOSITION).
- **The editorial line** "La escuela, contada por quienes la hacen." is the author's proposal under S2. It is subject to
  PM and Brent UI acceptance.
- **R17/A9 obligations** remain open and unaffected. Full remote CI remains the release gate.
