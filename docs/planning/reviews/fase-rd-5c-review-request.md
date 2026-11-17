# RD-5c — platform redesign, step 5c: the shared pieces, behind the switch. Review request

- **Branch:** `feat/rd-pieces` · **Base:** main at `8966d3f36` (step 5b and the fixes' level 2, first part, both published) · **Commits:** 18 (the variant; the pieces in three groups; the sample page; the fixes and tests from the code read; the stylesheet check's fix; two fixes from the test by sight; this record; the inventory rebuilt)
- **Part of the platform redesign** (plan phase 5). The last of three releases of that phase.
- **Built the new way:** builder agents from written briefs, an independent code read (Sol), a test by sight in a real browser from a list of scenarios written without the code; the lead session wrote no product code (it fixed its own stylesheet check).

## Objective and scope

A kit of shared interface pieces that the platform's screens will be rebuilt with in the next phases, each right in BOTH looks: today's, and the new one under `<html data-look="nuevo">`. **No existing screen uses a piece yet,** so nothing a person sees today changes; the pieces can be tried on one new sample page that only «Tester QA» accounts can open.

**In:**
- `components/ui/kit/` (new; its own folder, because `components/ui/` already holds older files whose names would collide on a file system that ignores case): `Button` (main action, ordinary, outlined, quiet, delete and its outlined form, confirm; sizes; icon-only; working state), `Field` with its controls (text, long text, search, select, tick box, radio, switch; label, help, error, required; groups), `Dialog` (on `@radix-ui/react-dialog`, already a dependency), `ConfirmDialog` with `useConfirm`, `Table` (sorting, selection, pagination line; cards on a phone), `Tabs`, `Badge` and `Count`, `Card`, `Notice`, `EmptyState`, `Loading`, `PageHeader`; `README.md` with the rules for using them.
- `tailwind.config.js`: one variant, `nuevo:`, which applies a class only under the new look. Only the kit uses it.
- `pages/configuracion/piezas.tsx` («Piezas de la interfaz»): a sample sheet of every piece, gated on the server exactly like «Apariencia» (a signed-in account marked «Tester QA»; anyone else is sent to the notification settings), linked from «Apariencia». It reads and saves nothing.
- `tests/e2e/look-kit.spec.ts`, added to CI's list.
- `scripts/redesign/tokens-check.mjs`: the stylesheet comparison sets a look's own rules aside in both files and can list added rules apart.

**Out, on purpose:** moving any screen onto the pieces (phase 6 onwards, area by area); the older files in `components/ui/`; the platform's existing confirmation and modal components.

## Files, grouped by risk

**Higher — reaches today's platform if wrong**
- `tailwind.config.js`: the variant. The compiled stylesheet with the switch off must hold every rule it held, unchanged.
- `pages/configuracion/apariencia.tsx`: one link added.

**Medium — new, used by nobody yet, multiplied later**
- The pieces. A defect here is copied onto every screen that adopts them: focus handling in `Dialog`, the promise of `useConfirm`, label and id wiring in `Field`, keyboard and ids in `Tabs`, the roles of `Table` when it stacks on a phone.
- `pages/configuracion/piezas.tsx`: its server-side gate.

**Lower**
- Tests, the README, the inventory (one new address in its area file).

## Tests

- `__tests__/components/ui/kit/`: `Button` (11), `Field` (20), `Dialog` (22, with `ConfirmDialog` and `useConfirm`), `Table` (12), `Tabs` (11), `Display` (12: badges, cards, notices, empty state, loading, page header), and `contrast.test.ts`, which computes from the two token files the contrast of every text and background pair the kit's class lists use, in both looks, and fails under 4.5:1 (nothing exempt; disabled states are not measured).
- `__tests__/pages/piezas.test.tsx` (9: the gate and the sheet); `__tests__/pages/apariencia.test.tsx` (the link).
- `tests/e2e/look-kit.spec.ts`: an account that is not a tester is sent away; a tester tries the pieces in today's look; the same tester chooses the new look and tries them again, with three computed styles that only the variant can produce.
- Each point fixed after the code read has a test that failed before its fix.

## Evidence (local, 16–17 Nov 2026)

- **Stylesheet, switch off:** 5b's compiled stylesheet and this branch's are EQUIVALENT once the look's own rules are set aside; every rule an existing screen reads is unchanged. The added rules are the kit's classes.
- **Pictures, switch off** (every screen for every role at two widths, 3,020 visits; 5b, then this branch, on the same data): **IDENTICAL, 3,020 of 3,020**; no picture unstable, no error Taken again after the two last fixes: identical again.
- **Independent code read** (Sol): its findings fixed here, each with a test that failed before the fix; the points left are under "Known limitations".
- **Test by sight in a real browser** (another agent, from a list written without the code; the sample sheet in both looks at desktop width): the window, the confirmation, the table, the tabs, the fields and the keyboard order passed in both looks; an account that is not a tester is sent away; three existing screens unchanged. Two things it saw were fixed here: the icon-only button showed no hint on hover (it now carries its name as `title` unless the caller gives one), and a sample's help text said something untrue in one look. Phone width was not reachable in that browser; it is covered by the browser test's phone part and by the lead's own pictures at 390 and 320 px in both looks (no sideways overflow).
- **Gates** (on the final line, replayed on main with the fixes' level 2 and step 5b; `git range-diff` shows every commit unchanged by the replay): type-check, lint with no warnings, the whole unit suite: 617 files, 19,333 tests passed, 18 skipped. CI's browser list against a production build on a fresh local stack made from that main: 344 passed, none failed. The pictures, the stylesheet comparison, the code read and the test by sight above were made before the replay.

## Where to look hardest

1. **The variant in `tailwind.config.js`** and what it does to specificity: a `nuevo:` class is one attribute more specific than the same class without it, which is what makes the look's value win inside the kit.
2. **`Dialog.tsx`:** where the focus goes on opening (never to a hidden or disabled element, never left outside), and back on closing.
3. **`useConfirm`:** a question asked after its component is gone settles as "no"; a second question starts with the focus on the safe answer.
4. **The gate of `pages/configuracion/piezas.tsx`:** the same server-side checks as «Apariencia», in the same order.

## Known limitations

- The sample page checks who may see it when it is opened, not again while it stays open (as «Apariencia» does).
- On a phone, a screen reader in table mode may read a column's name twice (the hidden head row is kept so sorting stays reachable).
- A required group of tick boxes stops the form through the browser's own validation, but is not announced as required.
- In today's look, the window's close mark and the ticked yellow box measure under 3:1 as graphics.
- The sample page and its link are scaffolding: they go at the redesign's clean-up.
