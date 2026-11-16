# GENERA platform redesign — the named values

Since phase 4a the colours the platform uses most (the brand palette and six stock families), the font families and
the corner radii that Tailwind writes are **named values**: CSS variables declared once in `styles/fne-tokens.css`
and read by `tailwind.config.js`. The values are exactly the
ones the platform had before, so nothing changed on screen. A second look only has to give the same names other
values.

## Where they live

`styles/fne-tokens.css`, second `:root` block. `styles/globals.css` imports that file, and `pages/_app.tsx` loads
`globals.css` on every page, so the names exist everywhere the classes do.

| Names | How many | Read by | Today's value |
|---|---|---|---|
| `--color-brand-primary`, `-accent`, `-accent-hover`, `-accent-light`, `-accent-text`, `-light`, `-gray-dark`, `-gray-medium` | 8 | `brand_primary`, `brand_accent`, … (and the older names `brand_blue`, `brand_yellow`, `brand_beige`, which read primary, accent and light) | the brand palette: `#0a0a0a`, `#fbbf24`, `#f59e0b`, `#fcd34d`, `#b45309`, `#ffffff`, `#1f1f1f`, `#6b7280` |
| `--color-gray-50` … `--color-gray-950`, and the same for `yellow`, `amber`, `red`, `green`, `blue` (4a) and `slate`, `orange`, `sky`, `emerald`, `rose`, `purple`, `teal`, `indigo`, `pink`, `cyan` (5a) | 176 | the stock classes `bg-gray-100`, `text-red-600`, … | Tailwind's default palette |
| `--font-sans`, `--font-serif`, `--font-mono`, `--font-mont`, `--font-eames` | 5 | `font-sans` (also the page's default face), `font-serif`, `font-mono`, `font-mont`, `font-eames` | Inter and its fallbacks; Tailwind's serif and mono lists; Mont; Eames |
| `--rounded-sm`, `--rounded`, `--rounded-md`, `--rounded-lg`, `--rounded-xl`, `--rounded-2xl`, `--rounded-3xl` | 7 | `rounded-sm`, `rounded`, `rounded-md`, … | Tailwind's defaults (0.125 to 1.5 rem) |

Colours are RGB triplets without `rgb()` (`--color-gray-200: 229 231 235`). The config wraps each as
`rgb(var(--color-gray-200) / <alpha-value>)` and Tailwind fills in the opacity; that is what keeps the opacity
modifiers (`bg-brand_primary/40`) working. Outside a class: `rgb(var(--color-gray-200))` or
`rgb(var(--color-gray-200) / 0.5)`.

## What does not read a name (yet, or on purpose)

- **The stock families the platform does not use** (`zinc`, `neutral`, `stone`, `lime`, `violet`, `fuchsia`) and
  Tailwind's `black` and `white` keep Tailwind's literal values. Adding a family is one line in the config
  (`slate: family('slate')`), eleven lines in the token file and one word in the test.
- **The shadows** (`shadow-sm` … `shadow-2xl`): Tailwind's literal values. Tailwind builds the coloured form of a
  shadow (what `shadow-red-500/20` uses) by reading the shadow's value; a name cannot be read that way, so naming
  them changed every `shadow-*` rule. They stay literal with today's look; the new look gives them its own
  values by rules of its own (see below).
- **`rounded-none` and `rounded-full`:** not values of a look.
- **Tailwind's typography plugin (`prose`)** takes its greys from Tailwind's palette directly, not from the theme. A
  look that changes the greys must also set the plugin's `--tw-prose-*` variables.
- **The brand kit's own colours typed by hand** (`bg-[#0a0a0a]`, `style={{ color: '#fbbf24' }}`): they stay literal
  on purpose (the new look keeps the kit's black and yellow). Since phase 4b every OTHER hand-typed colour that a
  platform screen draws reads a name: see "The stray colours" below.
- **Hand-typed colours left on purpose** (pinned one by one, with the reason, in
  `__tests__/styles/stray-colours.test.ts`): colours that are saved to the database or compared as text (the
  roadmap's colour picker and its data, the message categories), colours no screen draws, the course screens
  being rebuilt elsewhere, the public site, documents and e-mails, and the area being deleted. A look does not
  reach them.
- **The older hex tokens** of the first `:root` block (`--fne-black`, `--fne-yellow`, `--fne-gray-200`, …): whole
  colours. The config reads the three gold ones (`bg-gold-gradient`, used on `/pasantias`); the others are read only
  by the semantic aliases of that block (`--surface-page`, `--text-title`, …), which no screen uses yet. Each brand one is pinned to its triplet by the test. A
  look that changes a brand colour must override both names.
- **The other stylesheets** `pages/_app.tsx` loads (`sitio.css`, `propuesta-web.css`) and `tiptap.css`: plain CSS
  with their own colours. (`notifications.css` and `tour.css` read names since 4b.)

## The stray colours (phase 4b)

A stray is a hand-typed colour that is not one of the brand kit's seven values (`#0a0a0a`, `#fbbf24`, `#ffffff`,
`#f59e0b`, `#fcd34d`, `#1f1f1f`, `#6b7280`). On the platform's screens each now reads a named value that holds
exactly what was typed:

- a stray that equals a value 4a had named reads that name (`#ef4444` is `--color-red-500`);
- any other has a name of its own that says its value: `--color-legacy-<six hex digits>`, declared once in
  `styles/fne-tokens.css` (30 of them) and offered to Tailwind from one list in `tailwind.config.js` as
  `legacy.<hex>` (class `hover:bg-legacy-002844`). No stray was pointed at "the nearest" brand colour: that would
  have been a guess. A new look decides what each becomes.

How they are written in code: a class (`text-red-500`, `bg-legacy-002844/50`), or, where a colour is a string the
browser draws (an inline style, a chart's `fill`, a toast), `'rgb(var(--color-…))'`. Where code used to glue two
hex characters onto a colour to make it see-through (`${color}20`), it now calls `withAlpha(color, '20')` from
`lib/colorAlpha.ts`, which writes `rgb(var(--name) / 0.1255)` for a named colour and leaves a hex colour exactly
as the gluing did.

Two tests keep it true: `__tests__/styles/brand-tokens.test.ts` (every legacy name is declared once, holds the
triplet of its own hex, is offered by the config, and is used) and `__tests__/styles/stray-colours.test.ts` (no
stray in the platform's files outside an explicit list of exceptions; the changed colour lists pinned value by
value). **Typing a new hex colour in a platform file fails the second test:** use a name, or add the exception
with its reason.

## The new look's values (phase 5a)

`styles/look-nuevo.css`, imported by `globals.css` right after `fne-tokens.css`. It holds one block,
`[data-look="nuevo"] { … }`, that gives existing names the approved values (DESIGN.md), and a few rules; every
rule of the file starts with `[data-look="nuevo"]` (also inside the one kind of at-rule it may hold, a
`@media (min-width: …)` breakpoint), so a page without the attribute is exactly today's page.

- **Colours: five scales.** GRIS for `gray` and `slate`; NEUTRO for `blue`, `sky`, `indigo`, `purple`, `pink`, `cyan`,
  `teal` (the palette has no blue and no colour per category); ÉXITO for `green` and `emerald`; ERROR for `red` and
  `rose`; ÁMBAR for `amber`, `yellow` and `orange`. The brand's accent text becomes ámbar texto `#92400e` under both
  of its names (`--color-brand-accent-text`, `--fne-amber-text`); the other brand names keep their values. Each of
  the 30 legacy names gets the value its use asks for (old navy hovers → gris oscuro, old gold hovers → amarillo
  intenso, the chart colours → the kit's tones).
- **Radii:** 3, 4 and 6 px. **Fonts:** unchanged (Besley is not loaded by the platform's own stylesheets).
- **The typography plugin** (`prose`) is told its greys in GRIS, on `.prose` itself (it declares them there).
- **Focus:** the approved ring, two rings on `:focus-visible`: 2 px white inside (`box-shadow: 0 0 0 2px`), then
  2 px black outside (the outline, 2 px out), so it shows on light and on dark surfaces (the black top bar, the
  dark toolbar of an image preview). One step more specific than `focus:outline-none`. On purpose there is one
  ring for the whole look: while an element has keyboard focus (and a text field whenever it has the focus, since
  `:focus-visible` matches fields on a click too) the white ring REPLACES the element's own `box-shadow`, so a
  focus ring of the platform's classes or a resting shadow gives way to the look's ring while the element is
  focused, and comes back when it loses the focus.
- **Shadows:** three, on Tailwind's shadow steps: `shadow-sm` and `shadow` → `0 1px 2px rgb(10 10 10 / 0.08)`;
  `shadow-md` and `shadow-lg` → `0 1px 2px rgb(10 10 10 / 0.06), 0 10px 24px -14px rgb(10 10 10 / 0.3)`;
  `shadow-xl` and `shadow-2xl` → `0 24px 64px -24px rgb(10 10 10 / 0.55)`. The rules under the look set only the
  two names the classes read (`--tw-shadow`, and `--tw-shadow-colored` with the same shapes in
  `var(--tw-shadow-color)`), never `box-shadow`, so rings keep composing with shadows. A resting rule of the look
  (`html[data-look="nuevo"] .shadow-md`, 0,2,1) beats the plain class; its `hover:` rule (0,3,1) beats the
  resting ones. Every shadow class the compiled stylesheet holds is covered, its `hover:` forms too; two more get
  a rule only so they keep winning over the look's steps as they win over the plain classes today: the large
  breakpoint's no-shadow class (inside the same `@media`) and the one shadow colour class (an arbitrary colour,
  on the events timeline). The inner shadow and arbitrary shadows are left alone. The list is pinned in
  `look-nuevo.test.ts`: a shadow class new to the platform is not covered until it is added there and here.
- **Titles:** `h1`, `h2`, `h3` in Mont; `h1` in capitals, spaced, with a line-height of 1.25. Headings inside written
  content (`.prose`, `.tiptap-editor`, `.ProseMirror`) keep their own face and case.
- **Names that exist only under the look**, so that today's look reads a fallback: `--color-serie-1` … `-5` (charts
  with several series: black, amarillo intenso, gris medio, ámbar texto, light grey; written
  `rgb(var(--color-serie-1, var(--color-blue-500)))`, the fallback being the colour the chart had) and
  `--toast-…` (the toasts: `var(--toast-radius, 8px)` in `constants/toastStyles.ts`). A colour that means good or
  bad keeps reading the green and red names.
- **Pages the look never touches** (`PAGES_WITHOUT_THE_LOOK` in `lib/look.ts`): the sign-in family, the public site,
  documents for a client and the error pages. There the attribute is removed whatever the account chose.

Tests: `__tests__/styles/look-nuevo.test.ts` (every rule needs the attribute, the values, the contrast of the usual
pairs), `chart-series.test.ts` (every fallback is the old colour), `__tests__/constants/toastStyles.test.ts`.

With `--look nuevo`, `scripts/redesign/tokens-check.mjs` resolves every `:root` value of both files (the look
overrides names 4a and 4b already had), lists the look's own rules apart, and prints each change with how many
declarations it touches.

## Rules

1. **One declaration each, in `fne-tokens.css`.** A second look (`[data-look="nuevo"]`, phase 5) overrides the names in
   a file of its own, imported after `fne-tokens.css`. The test counts declarations in `fne-tokens.css` and fails on a
   second one.
2. **A value in `:root` is the platform for everyone.** Changing one fails the test by name
   (`__tests__/styles/brand-tokens.test.ts`); it is changed only on purpose, with the test, in a release that says so.
3. **A `ring` that names no colour** (most focus rings) is blue 500 at half strength. Tailwind cannot work that
   default out from a named value and silently falls back to a lighter blue, so `ringColor.DEFAULT` is written out in
   the config. A look that wants another focus ring changes `--color-blue-500` or that line.
4. **Old browsers.** Nothing new is asked of a browser: the platform's colour classes already needed custom
   properties and the `rgb(r g b / a)` spelling before 4a (Tailwind 3 writes every `bg-*` and `text-*` that way).
   A browser too old for those (Chrome before 65, Safari before 12.1) already showed the platform without its
   colours; since 4a it also loses the few values that used to be plain hex (the default border, placeholders,
   gradient stops).

## The proof that naming changed nothing

Two proofs, for two different things:

- **The stylesheet says the same thing.** `scripts/redesign/tokens-check.mjs <before.css> <after.css>` reads two
  compiled stylesheets rule by rule, replaces every named value by what it holds, and answers `EQUIVALENT` or lists
  what differs. It covers every state a rule can describe: hover, focus, pop-ups, tabs, the things a picture of a page
  at rest does not show. For 4a: 4,034 declarations, equivalent. (It is how the focus-ring fallback above was found.)

  ```
  node_modules/.bin/tailwindcss -c tailwind.config.js -i styles/globals.css -o <scratch>/after.css
  node scripts/redesign/tokens-check.mjs <scratch>/before.css <scratch>/after.css
  ```

  With `--look nuevo` it resolves the names as they are under `[data-look="nuevo"]`: the list it then prints is
  exactly what the new look changes through the names. Its limits: it reads what Tailwind's command line writes
  from `styles/globals.css` (not the minified file Next ships, not the other stylesheets, not styles typed in
  code), and it answers for a browser that knows custom properties.
- **The pages look the same.** The picture harness (`harness/README.md`): a full run before and after. For 4a: all
  3,500 landings the same; 3,460 pictures identical; **40 pictures (five addresses) differ, by one shade of 255, 60
  pixels of 757,169 by two.** Nobody can see that; the comparison can, and the reason matters for every later step
  that names a colour:

### Why naming a colour moves it by a shade where it is see-through

Next shrinks the stylesheet it ships, and while doing so it rewrites a colour that has an opacity
(`rgb(10 10 10 / 0.4)`) in a shorter spelling with whole percentages (`hsla(0,0%,4%,.4)`). Whole percentages cannot
say every colour exactly: 4% is 10.2, not 10. So before 4a the live platform drew every see-through brand black,
grey, red and so on from a value rounded by up to about one shade and a half, and drew the same colour exactly
wherever it was solid. A named value cannot be rewritten that way (the shrinker does not know what the name
holds), so since 4a the see-through uses are drawn from the exact value too. Where such a colour is a flat fill
the result rounds to the same pixel; in a fade from one colour to another (the dark fade over a course card, on
`/dashboard`, `/admin/course-builder`, `/admin/upcoming-courses`, `/community/workspace`, `/detailed-reports`)
some pixels land one shade away. Drawn alone in the harness's browser, the same fade spelled both ways differs in
7,498 of 66,000 pixels, each by one shade. `compare.mjs` prints "at most N shades apart" for every changed
picture: 1 or 2 is this; anything larger is a real change.

**So for any step that turns a colour typed with an opacity into a named value (4b, and the new look's values in
phase 5 with the switch off), expect this and nothing more: differences of one or two shades where that colour is
part of a fade or lies over a picture.** `scripts/redesign/tokens-check.mjs` reads the stylesheet before it is
shrunk and so does not see it.
