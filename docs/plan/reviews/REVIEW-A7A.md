# CODEX REVIEW — A7a round 1

VERDICT: PASS

A7a meets its frozen acceptance criteria at branch head `ebfe5f24` (code
`66774a58`). All thirteen marketing-site nav/footer entries and both INSPIRA
CTAs now reach `/pasantias`; the two retired INSPIRA Heyzine IDs, their state and
their modals are gone; both Directivos implementations remain; the retired date
is absent; the homepage anchor is preserved; and the two approved image repoints
are correct. The executable diff stays within the declared link/asset round. No
BLOCKING finding remains.

BLOCKING:

- None.

SHOULD-FIX:

- [S1] Pin each Directivos flipbook at its expected site, not merely somewhere in
  the scan — `__tests__/pages/pasantias-site-links.test.ts:224`. The current
  predicate passes as long as an ID occurs once anywhere in `SCOPE`; deleting the
  Directivos modal from `pages/programas.tsx:651` while leaving the homepage copy
  intact therefore keeps all eight guard tests green. No current behavior is
  missing—the two implementations are present and the source diff leaves them
  unchanged apart from the authorized homepage title—but the guard does not catch
  the most plausible partial-purge regression.
- [S2] Positively pin the PASANTÍAS destinations across the derived inventory —
  `__tests__/pages/pasantias-site-links.test.ts:190`. The anti-vacuity assertion
  requires `/pasantias` only in the homepage, `/programas`, and Footer, while the
  main assertion at line 200 rejects only destinations containing `#pasantias`.
  Repointing, for example, `pages/equipo.tsx:281` to `/programas` would violate the
  frozen “every PASANTÍAS link → `/pasantias`” criterion while all eight guard
  tests and all five new browser tests stayed green. The current source is correct
  at all fifteen sites, so this is guard reach rather than a shipping defect.

NITS:

- [N1] The literal-href parser intentionally cannot see computed destinations —
  `__tests__/pages/pasantias-site-links.test.ts:146`. A future
  `href={destination}` or `router.push('/#pasantias')` can bypass the source guard.
  The limitation is accurately documented, produces no false positive, and no
  such destination exists in the reviewed tree.

NOTES ON THE PLAN ITSELF:

- The two r1 corrections are valid. The old `grep -rn '#pasantias'` expectation
  could not have matched `id="pasantias"`; zero hash-link hits plus a separate
  positive anchor assertion is the correct contract. The pre-change inventory is
  thirteen nav/footer links, while fifteen is the post-change count after adding
  the two CTAs.
- The six plain-anchor-to-`Link` conversions do not introduce a behavior defect.
  Every affected file already imported `next/link`; `Link` renders an anchor, so
  the homepage's `mobileMenu.querySelectorAll('a')` close binding still applies.
  The independently rerun browser tests exercised actual client navigation from
  `/`, the Footer, and `/programas` and all landed on the SSR `/pasantias` page.
- The flipbook assertion is not vacuous when read with the source guard and its
  control. Both retired IDs are absent from `pages/` and the scoped component,
  the homepage has no flipbook iframe before navigation, and the preserved
  Directivos button still creates `iframe.fp-iframe`. The post-navigation zero is
  therefore supplementary rather than the sole proof of removal.
- Scope is surgical. `d07cba42..66774a58` changes the seven declared nav/footer
  files, the two declared test files, and nothing else executable. The homepage
  section content, `/pasantias`, lead form, API, shared-nav structure, legacy
  snapshot, quote component, and original image files are untouched. Both target
  images exist; the skyline repoint reduces the referenced asset from 9.4 MB to
  1.5 MB. `git diff --check` is clean.
- Independent evidence at final head: the source guard passed 8/8; the five new
  Playwright tests passed 5/5 under `CI=1`; the branch merges cleanly with the
  current local `main`. I also verified the full current inventory directly:
  fifteen literal `/pasantias` hrefs, zero `#pasantias` hrefs, the preserved
  homepage section ID, zero retired INSPIRA IDs, and exactly the expected three
  Directivos URL uses. The PM's already-rerun type-check, zero-warning lint, 6,207
  Vitest tests, production build, price-leak scan, and 26-test targeted Playwright
  run are consistent with the reviewed diff and were not needlessly repeated.
