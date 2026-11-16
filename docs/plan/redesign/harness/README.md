# GENERA platform redesign — the picture harness

The proof behind "nobody sees a change" (PLAN.md, phases 4 and 5). It signs in as each role on a **private local
copy** of the platform, takes a picture of every address of the inventory (`../inventory/data/_index.json`) at
desktop and phone width, and compares two runs: `IDENTICAL`, or the list of what differs.

Everything here runs on this machine only: its own Docker stack (the one `scripts/ci/e2e-local.sh` makes: API 56321,
database 56322), the production build on port 3300, made-up accounts, invented content. It never talks to
Production; requests that leave the machine are refused.

## The short version

```
H=scripts/redesign/harness
$H/stack.sh up                       # once: Docker stack, build, made-up accounts, app on :3300 (needs ~4.5 GB free)
$H/stack.sh snapshot seed            # the plain seeded database (what the browser tests expect)
node $H/seed.mjs                     # the invented sample content (and fills the roles cache)
$H/stack.sh snapshot content         # the database and the stored files the pictures are taken from

node $H/walk.mjs before --snapshot content      # a full run: ten visitors, both widths; about 33 minutes
#   … change the code …
$H/stack.sh build                    # build the checkout as it is now (stops and restarts the app; needs ~3.5 GB free)
node $H/walk.mjs after --snapshot content
node $H/compare.mjs before after --images       # IDENTICAL (exit 0) or the list of differences (exit 1)

$H/stack.sh down                     # when done: stops the app and removes the stack (only this one)
```

Pictures and records go to `~/Projects/genera-redesign/pictures/<run>/` (set `RD_PICTURES` to move them); a full
run is about 300 MB and stays out of the repository. The stack's keys, database snapshots, logs and the kept
answers of outside hosts live in `~/.cache/genera-rd-safety/` (`RD_STATE`).

**Always compare two runs made on the same stack from the same snapshot.** A new stack gives the made-up accounts
new ids and new creation dates, so its pictures differ from an older stack's in small ways. For a before/after
proof: build the old code, run; build the new code, run; compare. `compare.mjs` warns when two runs do not belong
together.

A part of the platform only: `--only '<regex on the address>'`, `--roles admin,docente`, `--widths desktop`.
Compare a part with the same part, and a full run with a full run: what the browser opened before an address can
move the soft edge of a round shape by a fraction of a pixel (seen once: the avatar circle of `/dashboard-old` on
the phone, 30 edge pixels, the same in every full run and the same in every run of the same part).
To repeat some addresses inside an existing run: the same options plus `--add` (the records of the addresses walked
replace the ones kept, the rest of the run stays, and `run.json` notes the addition).

**A snapshot is the database and the stored files together** (`snapshots/<name>.sql` and `<name>.files.tar`). The
database only names, per stored file, which version on the storage service's disk is the current one. Anything that
uploads a file again (the seed, the panel tests, which run two seed files) replaces that version; a database put
back without its files then points at versions that are gone, and those pictures and PDFs answer with an error.
So: always go back to a snapshot with `stack.sh restore` (or `walk.mjs --snapshot`) after running browser tests,
and take a new snapshot after running the seed again.

## Files

| File | What it is |
|---|---|
| `stack.sh` | The local copy: `up`, `serve [tests\|pictures]`, `build`, `seed`, `snapshot`, `restore`, `fingerprint`, `run`, `psql`, `status`, `down`. |
| `seed.mjs`, `seed/*.mjs` | Invented sample content (the seeded local copy holds accounts and almost nothing else). One file per group of areas; fixed ids, fixed dates; safe to run twice. Each file also offers the ids for addresses with a changing part (`params`) and further states worth a picture (`variants`: a contract's detail, a draft, an early step of a licitación). |
| `walk.mjs` | Takes the pictures. |
| `compare.mjs` | Compares two runs. |
| `looks.mjs` | Phase 5: compares what two LOOKS show, not pixels: the same landing, sidebar entries, headings and text for every visitor, width and address in a run walked in today's look and one walked in the new look. |
| `landings.mjs` | From a run: where each role really lands on each address, set against the inventory's role table. Writes `landings.md` into the private folder beside the redesign's ledger, not here: the repository is public and that page says which addresses open without signing in. |
| `rules.mjs` | The hand-kept rules, each with its reason: POST requests that are reads and may pass, outside hosts that are kept and replayed, query strings some roles need, values hidden because they change by nature. |
| `clock.mjs`, `server-clock.cjs` | The browser's clock and the app server's clock while pictures are taken. |
| `specs-baseline.mjs` | Runs the browser test files CI skips, each alone on the plain seeded database, and keeps what passes in `specs-baseline.json` here. `--compare` lists what got WORSE than the kept list. |
| `../tokens-check.mjs` | Not pictures: compares two compiled stylesheets once every named value is replaced by what it holds (`EQUIVALENT` or the list). The proof for what a picture cannot show: hover, focus, pop-ups. See `../tokens.md`. |
| `probe.mjs`, `_flicker.mjs`, `_open.mjs`, `_px.mjs` | A session's tools: evaluate an expression on one address as one account; find where a page keeps changing; click one visible text and list what appears; say which pixels differ between two pictures, from which colour to which, and save that part of both enlarged. |

## The new look (phase 5)

None of the made-up visitors is marked «Tester QA», so an ordinary run is the platform with the switch off, and
that is the proof "switch off = nothing changed" (before/after, as above).

For the switch ON, `stack.sh look nuevo|clasico` marks every made-up account «Tester QA» and chooses that look
for it. Two more snapshots, differing only in the look:

```
$H/stack.sh restore content none && $H/stack.sh look clasico && $H/stack.sh snapshot content-testers
$H/stack.sh restore content none && $H/stack.sh look nuevo   && $H/stack.sh snapshot content-nuevo
$H/stack.sh restore content pictures

node $H/walk.mjs testers --snapshot content-testers    # today's look, tester marks on
node $H/walk.mjs nuevo   --snapshot content-nuevo      # the new look
node $H/looks.mjs testers nuevo                        # NOTHING LOST (exit 0) or what differs (exit 1)
```

`looks.mjs` does not compare pixels (they differ on purpose). It checks that each visitor lands on the same
address, gets the same sidebar entries, the same headings and the same text in the page's own content, letter
case aside, in both looks; and it lists the signed-in pictures of the second run that were not taken in the new
look, which must be exactly the pages the look leaves alone. With `--frame` it compares the whole page's text,
frame included. Every record carries the look the page really had (`look`: the `data-look` attribute at that
moment) and the text of the page's own content (`mainText`).

A later release's new look is compared with this one's the ordinary way: `compare.mjs nuevo nuevo-next`, both
walked from `content-nuevo` on the same stack.

## What a run records

Per visitor, width and address (`<run>/<role>.<width>.json`): the address asked, **where the visitor landed**, the
picture and its checksum, the title, headings, menu entries and text seen, whether the picture stood still, what
was refused (requests that would write, outside hosts), failed requests and page errors. `run.json` holds the
commit built, the snapshot, and which database tables the walk changed (only the sign-in service's own).

The ten visitors are one made-up account per role (`ROLES` in `lib.mjs`) and a visitor who is not signed in.

A visitor who is sent to another address that is photographed anyway (the panel, the sign-in screen) gets no
picture of its own for the address asked; the record of where it landed is the proof, and a change of landing is
reported by `compare.mjs`. A full run is about 1,460 pictures for 3,500 visitor × width × address.

A page taller than the window is kept in parts: `<address>.png`, `<address>.2.png`, … (most screens of the
platform are one window plus a strip of 80 px).

## What is tamed so that two runs come out the same

- **Clocks.** The browser's clock starts at `HARNESS_NOW` (13 Nov 2026 12:00, Chile) on every page load and then
  runs at normal speed; the app server's clock stands still at the same moment (`stack.sh serve pictures`). The
  database's clock is real; the sample content is dated so that nothing flips as days pass (past things before
  `HARNESS_NOW`, upcoming things in 2030).
- **The world outside.** Fonts, avatars and video thumbnails are fetched once, kept and replayed (`OUTSIDE_KEPT`);
  everything else outside this machine is refused. The public home page asks Production's file storage for
  pictures: refused, so those pictures are blank.
- **Pages that write by being opened.** Once signed in, every request that is not a plain read is refused, except
  the reads made with POST listed in `ALLOW_POST`. So a walk leaves the database as it found it, visitors can be
  walked side by side, and `run.json` proves it table by table.
- **Late loading and motion.** The harness waits for the network to go quiet, for fonts and pictures, and for
  spinners and skeletons to go; it scrolls the page down and back; animations are brought to their end or
  stopped; a picture is kept only when two in a row are equal.
- **The picture itself.** A whole-page picture that reaches beyond the window resizes the window for an instant,
  and charts start drawing themselves again on every resize. So the window is made as tall as the page first and
  the rest is taken in parts by scrolling; nothing is resized at the moment of the picture.
- **The pointer.** It is taken off the page before a picture; left where the sign-in button was, it put whatever
  lay under it in its hovered state in one run and not in the next.
- **Values that are new every time by their nature** are hidden, their place kept (`MASKS`): a lesson's running
  clock, the measured figures of `/meet/diag` (the screen size among them: the harness changes its own window), the
  session keys the leftover page `/admin/test-session` prints.
- **Toasts.** A message a page shows on arrival goes away by itself after a few seconds; the picture waits until
  none is up.
- **A page that hangs.** Now and then a page that normally loads at once stays on its loading mark for good (one
  request never answers). A page still loading when the wait runs out is looked at once more; what repeats is
  believed (a few pages are like that every time).
- **Lost sessions.** Under the load of several browsers the local sign-in service fails for a second or two and
  the app then signs the visitor out for good. A landing on the sign-in screen, a 401 or a server error makes the
  harness sign in again and look once more (three times for sign-in trouble); only what repeats is believed.
  The learner's lesson page and two pages of Vías send such a visitor to `/auth/login`, and the route page to
  `/auth/signin`, addresses that do not exist: the harness reads that 404 as the same lost session. Keep `--jobs`
  at 6, **and keep the machine quiet while a run is on**: tests, builds or helpers running beside it bring these
  moments on (phase 4's first three full runs, made beside other work, differed in eight places of 3,500).
- **The session trap.** Some addresses (`/profile`, `/notifications`, `/assignments`, `/admin/events`) send a
  signed-in person to the panel when opened directly and work when reached by a click. For an address that lands
  on the panel the harness tries a click-style move from the panel too, and records both. Even then such a page
  can read the visitor's profile before the browser's session is attached and come up half empty (seen on
  `/assignments`); the harness looks again until the profile read answers.

## What the local copy is not

It is the application of the commit built, on an empty database plus the seeds. Compared with Production it lacks:
the permissions table (`role_permissions` is empty, so screens that wait for a permission behave as "not allowed":
`/admin/quotes` sends even the admin away, and menu entries that depend on a permission do not show for other
roles), the notification types, the feature flag for role management (`/admin/role-management` answers 404), a
YouTube key (the panel shows two placeholder videos). The roles cache (`user_roles_cache`) is created empty by the
migrations and the application can only refresh a cache that was filled once; `seed.mjs` fills it, as some browser
tests do for themselves. Without it the lider de generación account cannot load its own profile.

Only what an address shows when opened is photographed: nothing behind a click (pop-ups, tabs, opened rows),
except the `variants` named in the seed files. Two addresses cannot be filled (both of Vías de Transformación,
which is being deleted): `/community/transformation/results/[assessmentId]`, `/vias-transformacion/[id]`.

## The Tailwind `content` change (phase 3; waits for the first release of phase 4)

`tailwind.config.js` now reads `src/`, `lib/`, `types/`, `config/` and `utils/` besides `pages/` and `components/`,
so a class written there is always generated. On its own that change was **not** invisible:
`src/components/TipTapEditor.tsx` (the rich-text editor of lesson text blocks, news and meeting notes) carried
classes that were never generated and so never applied, and they would have switched on for everyone. Brent,
13 Nov 2026: keep the editor as it is. The same commit therefore takes these class names out of that file:

- toolbar buttons: `md:w-9 md:px-0 md:gap-0 focus-visible:ring-amber-400 focus-visible:ring-offset-1`
- button labels: `md:sr-only`
- between button groups: `ml-1.5 pl-1.5`
- the editor's box: `focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-400/40`
- the text: `sm:prose lg:prose-lg lg:prose-xl xl:prose-xl`

(This file is Markdown, which Tailwind does not read; in a `.ts` or `.tsx` file even a comment naming them would
generate them again.)

After that, the generated stylesheet differs from today's by five rules that no element uses (`flex-shrink`,
`shrink`, `ordinal`, `!inline`, `!transition`: ordinary words in code and comments that Tailwind takes for class
names), about 0.6 KB. To see it without a full build, write the stylesheet from each version and compare the
class names:

```
node_modules/.bin/tailwindcss -c tailwind.config.js -i styles/globals.css -o <scratch>/after.css
diff <(grep -o '^\s*\.[^ {,]*' <scratch>/before.css | sort -u) <(grep -o '^\s*\.[^ {,]*' <scratch>/after.css | sort -u)
```
