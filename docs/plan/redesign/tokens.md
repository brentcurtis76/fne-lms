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
| `--color-gray-50` … `--color-gray-950`, and the same for `yellow`, `amber`, `red`, `green`, `blue` | 66 | the stock classes `bg-gray-100`, `text-red-600`, … | Tailwind's default palette |
| `--font-sans`, `--font-serif`, `--font-mono`, `--font-mont`, `--font-eames` | 5 | `font-sans` (also the page's default face), `font-serif`, `font-mono`, `font-mont`, `font-eames` | Inter and its fallbacks; Tailwind's serif and mono lists; Mont; Eames |
| `--rounded-sm`, `--rounded`, `--rounded-md`, `--rounded-lg`, `--rounded-xl`, `--rounded-2xl`, `--rounded-3xl` | 7 | `rounded-sm`, `rounded`, `rounded-md`, … | Tailwind's defaults (0.125 to 1.5 rem) |

Colours are RGB triplets without `rgb()` (`--color-gray-200: 229 231 235`). The config wraps each as
`rgb(var(--color-gray-200) / <alpha-value>)` and Tailwind fills in the opacity; that is what keeps the opacity
modifiers (`bg-brand_primary/40`) working. Outside a class: `rgb(var(--color-gray-200))` or
`rgb(var(--color-gray-200) / 0.5)`.

## What does not read a name (yet, or on purpose)

- **Other stock families.** `slate`, `orange`, `sky`, `emerald`, `rose`, `purple`, `indigo`, `teal`, `pink`, `violet`,
  `cyan`, `fuchsia` and Tailwind's `black` and `white` keep Tailwind's literal values (about 930 class uses of the
  first twelve, half of them `slate`). Adding a family is one line in the config (`slate: family('slate')`), eleven
  lines in the token file and one word in the test.
- **`rounded-none` and `rounded-full`:** not values of a look.
- **Tailwind's typography plugin (`prose`)** takes its greys from Tailwind's palette directly, not from the theme. A
  look that changes the greys must also set the plugin's `--tw-prose-*` variables.
- **Colours typed by hand** (`bg-[#0a0a0a]`, `style={{ color: '#fbbf24' }}`, chart colours): phase 4b names only the
  ones that are not the brand kit's.
- **The older hex tokens** of the first `:root` block (`--fne-black`, `--fne-yellow`, `--fne-gray-200`, …): whole
  colours. The config reads the three gold ones (`bg-gold-gradient`, used on `/pasantias`); the others are read only
  by the semantic aliases of that block (`--surface-page`, `--text-title`, …), which no screen uses yet. Each brand one is pinned to its triplet by the test. A
  look that changes a brand colour must override both names.
- **The other stylesheets** `pages/_app.tsx` loads (`sitio.css`, `notifications.css`, `propuesta-web.css`) and
  `tiptap.css`, `tour.css`: plain CSS with their own colours.

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
