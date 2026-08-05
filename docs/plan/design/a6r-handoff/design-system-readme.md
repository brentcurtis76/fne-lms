# Fundación Nueva Educación — Design System

Fundación Nueva Educación (FNE) accompanies the educational transformation of
schools in Chile and the Spanish-speaking world. The Fundación is the **marca
madre**: it signs the institution, its team, its consultancy, its pasantías and
every official document. **Genera** is its product brand — the *hub de
transformación* (an LMS with growth communities, evaluations and learning-path
management) and operates as a product brand inside the same system.

Since December 2025 both share one visual system: the black–yellow palette and
the Mont type family. What distinguishes them is the symbol and the level at
which they speak, not the style.

## Sources

- `uploads/FNE Brand Kit.pdf` — *Manual de marca*, 16 pages, December 2025. The
  authoritative source for colour, type, logo usage, voice and applications.
  All hex values, tracking values and size minimums here are copied from it.
- **GitHub: `brentcurtis76/fne-lms`** (branch `main`) — "Plataforma FNE" /
  GENERA. Next.js Pages Router + TypeScript + Tailwind 3 + shadcn/ui + Supabase.
  Read for: `tailwind.config.js` (token values), `styles/globals.css` (the Mont
  `@font-face` set), `constants/toastStyles.ts`, `components/ui/{button,dialog}.tsx`,
  `components/layout/{MainLayout,Sidebar,FunctionalPageHeader}.tsx`,
  `components/learning-paths/LearningPathCard.tsx`, `pages/{login,dashboard,mi-aprendizaje}.tsx`.
  Real Mont OTF binaries and the Genera logo SVGs were copied from
  `public/fonts` and `public/genera`. See `github.md`.

Where the two disagree, **the manual wins.** The live code still carries
pre-December decisions the manual explicitly retires: Inter as the UI family
(`tailwind.config.js` says "new UI should use default sans"), gradient buttons
and glowing orbs on the login page, the beige `#E8E5E2` background, and grey
logo versions. Those are not reproduced here.

## Index

| Path | What it is |
| --- | --- |
| `styles.css` | Global entry point — `@import` list only. Consumers link this file. |
| `tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `surfaces.css`, `motion.css` |
| `components/core/` | Button, IconButton, Icon, Card, Badge, Tag, Eyebrow, SectionTitle, ProgressBar, Avatar, Logo |
| `components/forms/` | Input, Select, Checkbox, Radio, Switch, SearchField |
| `components/navigation/` | Tabs, NavItem, Breadcrumb |
| `components/feedback/` | Alert, Toast, Dialog, EmptyState |
| `ui_kits/genera/` | Click-through recreation of the Genera platform (`README.md` inside) |
| `templates/genera-screen/` | Starting template — Genera app screen (top bar, sidebar, panel) |
| `templates/presentation/` | Starting template — six-slide deck in the brand pattern |
| `slides/` | Seven 1280×720 slide types (`README.md` inside) |
| `guidelines/` | Foundation specimen cards for the Design System tab |
| `assets/` | Logotipo files, símbolo, Genera marks, Mont OTFs, application mockups |
| `SKILL.md` | Agent Skill front-matter for use in Claude Code |
| `github.md` | Source-repo association and sync receipt |

### Components

Core: **Button**, **IconButton**, **Icon**, **Card**, **Badge**, **Tag**,
**Eyebrow**, **SectionTitle**, **ProgressBar**, **Avatar**, **Logo**.
Forms: **Input**, **Select**, **Checkbox**, **Radio**, **Switch**,
**SearchField**. Navigation: **Tabs**, **NavItem**, **Breadcrumb**.
Feedback: **Alert**, **Toast**, **Dialog**, **EmptyState**.

Every component has a sibling `.d.ts` (props contract) and `.prompt.md` (what &
when, with an example). Each directory carries one `@dsCard` HTML.

**Intentional additions** — the manual defines no component library, so the set
above is authored from the brand rules plus the patterns already in the platform
code. Two are brand-specific rather than generic: `SectionTitle` (title + gold
rule, the manual's signature heading unit) and `Eyebrow` (the *antetítulo*).
`Icon` is a thin wrapper over Lucide, the library the manual names. The spacing
scale in `tokens/spacing.css` is also an addition — the manual fixes no screen
spacing scale, so the platform's existing 4 px scale is carried over.

---

## Content fundamentals

**Language.** Chilean Spanish (es-CL) for everything a user reads. Code,
comments and technical docs in English.

**Person.** Second person, *tuteo respetuoso*. The reader is a colleague on a
shared mission, not a "usuario". No commercial "nosotros" inside the product —
you speak *to* the person: «Ingresa a tu cuenta para continuar.»

**Voice: cercana, concreta, sin adorno.**
- Cercana — «¡Hola, María! Bienvenida de vuelta al hub de transformación de tu colegio.»
- Concreta — action verbs, not abstract nouns: «Guardar», «Continuar», «Ver espacio completo →».
- Sin adorno — the work described plainly: «Agencia Técnica Educativa certificada por Mineduc.»

**Así sí / Así no** (verbatim from the manual):

| Así sí | Así no |
| --- | --- |
| «Correo o contraseña incorrectos.» | «Estimado usuario, le informamos que…» |
| «Contraseña actualizada exitosamente.» | «¡Ups! Algo salió mal 😅» |
| «45 % completado · 3 de 8 módulos» | «Potenciamos sinergias para empoderar comunidades.» |
| «Sin datos disponibles» | «Lamentamos mucho no tener información…» |

**Fixed rules.**
- **No emoji** — not in the interface, not in institutional documents.
- Chilean number format: 1.250 educadores. Percentages with a space: 45 %.
- Dates with an abbreviated month: 15 mar 2025.
- Errors inform, they do not blame, and they do not over-apologise.
- One message, one idea. If two sentences are needed, they are two short sentences.
- Quotations use guillemets « ». Arrow bullets (→) are used inside black rule blocks.
- Case: display headlines and short labels in MAYÚSCULAS; document and section
  titles in sentence case; English Title Case is never used. **Accents are kept
  in caps** — FUNDACIÓN, EDUCACIÓN, PASANTÍAS. Dropping them is an error, not a style.

The focus is always educational transformation, never the product itself.

---

## Visual foundations

**Palette.** Three colours do 95 % of the work: negro `#0A0A0A`, amarillo
`#FBBF24`, blanco `#FFFFFF`. The yellow is warm and golden, never lemon; the
black is pure, never brown or blue-shifted. The **degradado dorado**
(`#FDB833 → #B47410`, 135°, light from the upper left) belongs to the brand, not
to decoration: it lives in the logotipo, in the gold rule, in an accent — never
as a full background. Support colours: ámbar `#F59E0B` (hover), amarillo claro
`#FCD34D` (soft highlights), gris oscuro `#1F1F1F` (body text), gris medio
`#6B7280` (secondary text). Interface greys run 50–700. Functional green/red/blue
exist for interface state only and never appear in brand pieces. The beige
`#E8E5E2` inherited from the old system is **discontinued**.

**Proportion.** Blanco 60 / negro 30 / amarillo 10. One solid-yellow element per
surface; a maximum of two background colours per document or presentation. Black
text on yellow, never white on yellow. If a piece reads as "yellow", reduce it to
an accent and give the weight back to black.

**Type.** Mont (Fontfabric) is the only family — 300 Light (logo signature,
0.20em) · 400 Book (running text, 1.6) · 500 Regular (labels, navigation) ·
600 SemiBold (buttons, antetítulos, 0.08em) · 700 Bold (section titles) ·
800 Heavy (page titles) · 900 Black (display, always uppercase, −0.02em). Scale:
44/900 display, 32/800 h1, 24/700 h2, 18/700 h3, 15/400 body, 13/400 small,
11/600 antetítulo. Only four tracking values exist: 0.20em, 0.15em, 0.08em,
normal. Display headlines are *tight*, not expanded — only caps text opens up.
Inter is a load-failure fallback, never a design choice.

**Backgrounds.** Flat colour. White is the default page; black is used for
covers, rule blocks, top bars and quote panels. No gradient backgrounds, no
patterns, no textures. The single permitted background flourish is the **símbolo
lineal as a watermark at a maximum of 12 % opacity**.

**Photography.** Real school situations — classrooms, teaching teams, people
working and talking. Natural light, warm colour. Framed full-bleed (a sangre),
with a black veil of at least 40 % when text sits on top; the white logo goes on
that veil. Never: generic office stock or hands-with-cogs, black and white, heavy
grain, colour filters, or decorative gradients and textures laid over the image.

**Graphic elements.** Exactly two, plus the watermark: the **filete dorado**
(4 px gradient rule) as a separator or section underline, and the **short yellow
bar** (56 × 4 px) under page titles. Nothing else is added.

**Cards and surfaces.** Flat white, 1 px `#E5E7EB` border, 12 px radius, **no
drop shadow** on content cards. The black rule/callout block uses a 16 px radius.
A sunken grey-50 surface groups without competing. Shadow is reserved for things
that float — dialogs (`--shadow-overlay`), dropdowns, toasts (`--shadow-raised`).

**Corner radii.** 4 checkbox · 6 small · 8 buttons, inputs, toasts, dialogs ·
12 cards and the app icon · 16 black blocks · full for pills, badges, avatars.

**Borders.** Always 1 px. Grey 200 for structure, grey 300 for form controls,
white at 20 % on black surfaces. Coloured left borders are used in exactly one
place — the 4 px edge on a toast; never as a decorative card accent.

**States.** Hover darkens rather than lightens: black → `#1F1F1F`, yellow →
ámbar `#F59E0B`, white → grey 50. Secondary and ghost controls fill with grey
50/100. Press states do not scale or bounce — the colour deepens one step.
Focus is a yellow ring (2 px yellow at 35 %, or the white + yellow double ring
in `--ring-focus`); inputs also switch their border to yellow. Disabled is 50 %
opacity with `not-allowed`.

**Motion.** Short and functional: 150/200/300 ms on
`cubic-bezier(.4,0,.2,1)`. Colour, opacity, width and the sidebar's width
transition — that is the whole vocabulary. No bounce, no parallax, no decorative
entrance animation. Progress bars grow with `--duration-slow` and `--ease-out`.
`prefers-reduced-motion` zeroes every duration.

**Transparency and blur.** Transparency only as tint over black or over
photography: white at 10/20/50/70 % for surfaces and text on black, black at
40–55 % as a photo veil, functional colours at 6–10 % as alert backgrounds. **No
backdrop blur, no frosted glass.**

**Layout.** Sidebar 320 px, 80 px collapsed; top bar 80 px, always black and
sticky; 32 px page gutter (16 px small screens); content capped at 1280 px, prose
at 768 px. The logotipo keeps a clear space of 1× on every side, x being the cap
height of "FUNDACIÓN" in the firma — no text, image, border or fold enters that
zone. Minimum sizes: vertical 25 mm / 96 px, horizontal 35 mm / 140 px, símbolo
8 mm / 32 px, lineal 40 mm / 200 px.

**Logo usage.** Choose the file, never modify the mark: taller than wide →
vertical; a band under 25 mm → horizontal; under 20 mm total → símbolo. Gradient
on white or black, white on dark backgrounds and photography, flat yellow for
small screens/silkscreen/embroidery, black for one-ink work. The grey version is
historical material only. Do not deform, rotate, recolour, add shadows or
outlines, or rebuild the lockup in another typeface. If a piece needs something
that is not in the original files, the answer is to request the missing file.

---

## Iconography

**Lucide is the reference library** — confirmed twice over: the manual names it,
and the platform ships `lucide-react`. Continuous stroke of 1.5–2 px, rounded
terminals, monochrome and inheriting the text colour. **No filled icons, no mixed
sets, no hand-drawn illustrations.** Sizes: 16 px compact, 20 px inline, 24 px
navigation. Yellow is reserved for the single active or highlighted icon in a
view; inactive is grey 400, resting is black.

`components/core/Icon.jsx` wraps Lucide and expects the UMD build on the page:

```html
<script src="https://unpkg.com/lucide@0.544.0/dist/umd/lucide.js"></script>
```

Icons are loaded from the Lucide CDN rather than copied in, because the platform
consumes them as an npm package (`lucide-react@0.511.0`) and there is no local
sprite or icon font in the repo to copy. Icons seen in the product:
`book-open`, `map-pin`, `graduation-cap`, `bar-chart-3`, `users`, `clock`,
`award`, `trending-up`, `log-out`, `search`, `x`, `file-text`, `calendar`.

**Emoji are never used** — the manual lists «¡Ups! Algo salió mal 😅» as an
example of what not to write. Unicode characters do appear as typography, not as
icons: the guillemets « », the middot separator ·, the arrow → in black rule
blocks and in link labels («Ver espacio completo →»).

**Brand marks in `assets/`.** `logo-vertical-{gold,flat,black,white,gray}.png`,
`logo-horizontal-gold.png`, `symbol-gold.png`, `symbol-lineal.png`, the Genera
set under `assets/genera/`, and the two application mockups
(`mockup-stationery.png`, `mockup-presentation.png`) lifted from the manual's
*Aplicaciones* page. The vertical/horizontal/symbol PNGs were extracted from the
brand PDF at 1181 px and 1535 px with transparency intact.

---

## Applications (from the manual)

- **Papelería** — horizontal logotipo top left at 35 mm; footer with the website in grey 400.
- **Redes sociales** — black background, Black 900 headline in caps, golden símbolo as the signature, one yellow accent.
- **Presentaciones** — covers in black, content slides in white, logotipo at the foot, not on every title.
- **Avatares e iconos de app** — símbolo centred, no firma, 12 px radius or a full circle depending on the platform.

## Files and contact (from the manual)

Original logo files: `fne-vertical-gold`, `fne-horizontal-gold`,
`fne-vertical-flat`, `fne-vertical-black/-white`, `fne-icon-gold/-black/-white`,
`fne-favicon` (16–64 px). Mont is licensed to the Fundación (OTF, 10 weights +
italics) and must not be redistributed outside licensed pieces. The visual system
was updated in **December 2025**, replacing the inherited beige `#E8E5E2` and the
grey logotipo versions. Before adapting the logotipo or creating a new variant,
write to the Fundación's communications team.

## Known substitutions and gaps

- **None on type.** The real Mont OTFs (300–900 + Book Italic) are in
  `assets/fonts/`, so specimens render in the actual brand face.
- **Icons are CDN-linked**, not vendored (see Iconography).
- **Photography is not included** — the manual shows no photographic assets and
  the repo's images are school- and person-specific. `slides/photo.html` leaves a
  labelled placeholder rather than substituting stock.
- **Genera's own logo files** (`assets/genera/*.svg`) are the ones in the repo:
  simple generated marks set in Inter with opaque background rects. They are not
  described in the manual, so they are reproduced as-is rather than reinterpreted.
- **Admin surfaces of the platform** (course builder, licitaciones, consultant
  assignment, reports, QA) are not recreated in the UI kit.
