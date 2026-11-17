# The shared pieces (`components/ui/kit/`)

The platform redesign's interface pieces (release 5c). Import from the folder: `import { Button, Dialog } from '@/components/ui/kit'`.
Every piece is right in **both looks**: today's look (no attribute on `<html>`) draws the platform's commonest hand-made
version of that thing; the new look (`<html data-look="nuevo">`, `lib/look.ts`) draws the approved design
(`DESIGN.md`, section 4). Try them all on `/configuracion/piezas` (QA testers only; linked from «Apariencia»).
`components/ui/button.tsx` and `components/ui/dialog.tsx` are older, different pieces: these do not replace them yet.

## Rules

1. **The look is CSS, not a hook.** A class written `nuevo:…` applies only under `[data-look="nuevo"]`
   (`tailwind.config.js`, one variant). It is one attribute more specific than the plain class, so it wins there;
   `nuevo:hover:…` likewise wins over `hover:…`. A piece needs no context and has no flash when the look arrives.
2. **Two `nuevo:` classes that set the same property on one element must not meet** (same specificity: the
   stylesheet's order decides). Each piece splits such classes by size or variant in code instead.
3. **The new look's shadow rules win over `nuevo:shadow-none`** (they set `--tw-shadow` on `html[data-look] .shadow-md`,
   one element more specific). To drop a shadow in the new look write `nuevo:[box-shadow:none]`.
4. **Colours only by name** (`bg-brand_primary`, `text-gray-600`, `border-red-600/25`) or the brand kit's seven literals.
   Under the new look the names already hold the new values (`gray-100` is gris claro, `red-600` is the error red,
   `blue-50` the info grey); that is why a `nuevo:` class often names a "today" colour.
5. **Class names are written out in full.** Tailwind reads the source text; a class assembled from parts is never
   generated. Never name a class in a comment unless it should exist.
6. **Motion** is a short colour/border change or a spinner, off under `prefers-reduced-motion`. No backdrop blur, no
   `:has`, no container queries, no nesting.
7. `className` is appended, not merged: to change a piece, prefer a prop; a class you add must not fight the piece's own.

## The pieces

| Piece | For | Props (besides every native attribute and a forwarded ref) |
|---|---|---|
| `Button` | Every action. `primary` = the ONE main action of a screen | `variant` `primary` `default` `outline` `quiet` `danger` `danger-outline`; `size` `md` (40 px new look) `sm` (32 px); `iconOnly` (needs `aria-label`, a type error without); `loading` (spinner, `aria-busy`, ignores clicks, keeps focus); `disabled`; `href` (a link; `/…` through Next `Link`). `type="button"` by default. `buttonClasses()` gives the classes for an element that is not a Button |
| `Field` + `Input` `Textarea` `Select` `SearchInput` | One labelled control | `label`, `help`, `error` (marks it `aria-invalid`), `required` (sets `required` + `aria-required`), `disabled`, `controlId` (else `useId`), `group` (a fieldset with legend, for radios/tick boxes) |
| `Checkbox` `Radio` `Switch` | Choices; carry their own words | `label`, `help`; `Switch` is a checkbox with `role="switch"` |
| `Dialog` | A pop-up window | `open`, `onClose`, `title` (required, names it), `eyebrow`, `description`, `footer` (buttons, right-aligned), `size` `md`/`wide`, `dismissable` (default true; false = no X, Escape and veil do nothing), `initialFocusRef` (default: first field of the body, then first footer button). Focus trapped and returned, page scroll locked, a bottom sheet under 560 px in the new look |
| `ConfirmDialog` | A question with two answers | `open`, `title`, `message`, `confirmLabel` («Confirmar»), `cancelLabel` («Cancelar»), `tone` `default`/`danger`, `onConfirm`, `onCancel`, `loading`, `eyebrow`. Focus starts on cancel |
| `useConfirm()` | The promise form of `ConfirmDialog` | returns `{ confirm, confirmDialog }`; `confirm(question \| options)` resolves `true` only for confirm |
| `Table` `TableHead` `TableBody` `TableRow` `TableHeaderCell` `TableCell` | Data in rows | `Table`: `stackOnPhone` (under 760 px rows become cards), `footer`, `boxClassName`. `TableRow`: `selected` (`aria-selected`). `TableHeaderCell`: `sort` + `onSort` (a button, `aria-sort`), `align`. `TableCell`: `label` (its column's name on a phone), `primary` (the card's title), `align` |
| `Pagination` | Under a table | `page` (from 1), `pageSize`, `total`, `onPageChange`, `noun`: «Mostrando x–y de n …», «Anterior», «Siguiente» |
| `Tabs` `TabList` `Tab` `TabPanel` | Views of one thing | `Tabs`: `value`+`onValueChange` or `defaultValue`; `TabList`: `label` (required); `Tab`/`TabPanel`: `value`. Arrows, Home, End; roving tab order |
| `TabLinks` | Tabs that are addresses | `label`, `items` `{ href, label, current }` (`aria-current="page"`) |
| `Badge`, `Count` | A state word; a small number | `tone` `neutral` `success` `warning` `error` `info` `accent`, `plain` (no dot); `Count`: `value`, `label` (what it counts, for screen readers) |
| `Card` `CardHeader` `CardBody` `CardFooter` `CardTitle` | A panel | `interactive` with `href` (one link) or `onClick` (one button); `leading` (yellow top edge, new look only). `CardTitle`: `as` |
| `Notice` | A message that stays on the page | `tone` `neutral` `success` `warning` `error`, `title` (bold lead), `icon`. `role="status"`, `alert` for error |
| `EmptyState` | Nothing to show | `title`, `description`, `icon`, `action`, `headingLevel` |
| `Skeleton` `Spinner` `LoadingBlock` | Loading | `Skeleton`: `width`, `height` (hidden from screen readers). `Spinner`: `size`, `label` (else a hidden «Cargando…»). `LoadingBlock`: `label` («Cargando…»), `role="status"` |
| `PageHeader` | The head of a screen | `eyebrow`, `title` (the `h1`), `description`, `actions`, `primaryAction`, `secondaryAction`, `icon`, `leftAddon`, `searchValue`/`onSearchChange`/`searchPlaceholder`/`searchLabel`, `children` (under the title row) |

## Swapping a `confirm()` call

```tsx
const { confirm, confirmDialog } = useConfirm();          // 1. once in the component
if (!(await confirm('¿Eliminar este usuario?'))) return;  // 2. was: if (!confirm('¿Eliminar este usuario?')) return;
return <>{/* … */}{confirmDialog}</>;                      // 3. render it once
```

The handler must be `async`. A bare question gets the title «Confirmar acción» and the question as its message, and
the answers «Confirmar» / «Cancelar». For a deletion pass `{ title, message, tone: 'danger', confirmLabel: 'Eliminar' }`.
`alert()` calls are not covered: a later release decides between a `Notice` and a toast.

## From `FunctionalPageHeader` to `PageHeader`

| `FunctionalPageHeader` | `PageHeader` |
|---|---|
| `icon` | `icon` |
| `title` | `title` |
| `leftAddon` | `leftAddon` |
| `subtitle` | `description` |
| `searchValue`, `onSearchChange`, `searchPlaceholder` (default «Buscar...») | the same names, same default; plus `searchLabel` («Buscar») for screen readers |
| `primaryAction` `{ label, onClick, icon }` | `primaryAction` (drawn as the yellow `primary` Button, black text) |
| `secondaryAction` (declared there, never drawn) | `secondaryAction` (drawn, as an outline Button) |
| `children` (custom actions on the right) | `actions` (`children` of `PageHeader` go UNDER the title row) |

Differences a screen will see in today's look: the main action's text is black on yellow (it was white, 1.7:1); the
search box is `type="search"` and named; on a phone the actions wrap under the title instead of the mobile variant's
«+» button.
