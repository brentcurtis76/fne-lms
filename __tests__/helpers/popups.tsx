/**
 * Redesign 6C: what the tests of the panel's four pop-ups share (their pins, the same-pop-up tests in
 * both looks and the new markup's own tests).
 *
 * A pop-up draws into a portal under <body>, so a pin keeps the markup of the whole <body>, not of the
 * render's container. React's and Radix's generated ids (`:r3:`, `radix-:r4:`) depend on how many ids
 * were made before in the same file, so they are renamed «id-1», «id-2»… in the order they first
 * appear: the relations between them (a label pointing at its field) stay visible, the counter does not.
 * Every person and value in these tests is invented.
 */
import React from 'react';
import { act, cleanup } from '@testing-library/react';
import { beforeEach } from 'vitest';
import { serialise } from './pin';

/**
 * Gives <body> back as a fresh page has it: no attribute, no child. With `threads: false` Vitest runs
 * every jsdom test file of a run in ONE document, one file after the other, so what an earlier file
 * leaves on <body> reaches the next: `components/contracts/ContractDetailsModal.tsx` and
 * `components/feed/CommentModal.tsx` restore the page's scroll by writing `overflow: unset` on the
 * body's style when they close, and that style stayed there for every later file (found by the
 * whole unit suite; 6C, send-back 2). The pins of the pop-ups keep the markup of the whole <body>,
 * so they would depend on which files ran before them.
 */
export function clearBody() {
  const { body } = document;
  for (const name of body.getAttributeNames()) body.removeAttribute(name);
  body.replaceChildren();
}

// Every file that imports this helper starts each case on a clean <body> (the pins of the four
// pop-ups, their same-pop-up tests and the new markup's own tests). This module is evaluated again
// for each test file, so the hook belongs to the file that imported it.
if (typeof document !== 'undefined') beforeEach(clearBody);

/** Generated ids renamed in order of appearance. */
export function normaliseIds(text: string): string {
  const seen = new Map<string, string>();
  return text.replace(/:r[0-9a-z]+:/g, (id) => {
    if (!seen.has(id)) seen.set(id, `«id-${seen.size + 1}»`);
    return seen.get(id)!;
  });
}

/**
 * The markup of the whole page body, serialised as a snapshot is, with the generated ids renamed. An
 * empty `style` attribute on <body> is dropped: Radix leaves one behind after a window closes, and with
 * `threads: false` the body is shared by the test files of one run, so it would depend on which file
 * ran before.
 */
export function bodyMarkup() {
  const body = document.body.cloneNode(true) as HTMLElement;
  if (body.getAttribute('style') === '') body.removeAttribute('style');
  return normaliseIds(serialise(body));
}

/** Lets effects, promises, timers of zero and FileReader callbacks run. */
export async function settle(rounds = 4) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** A promise the test settles by hand. */
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * `next/link` as a plain link that forwards its ref; a click runs the caller's `onClick` and then
 * stops the browser's navigation (jsdom cannot navigate).
 */
export const LinkFake = React.forwardRef<HTMLAnchorElement, any>(function LinkFake({ children, href, onClick, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href={typeof href === 'string' ? href : String(href)}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  );
});

/** A small invented PNG (1 × 1 pixel). */
export function smallPng(name = 'imagen-inventada.png') {
  const bytes = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0)
  );
  return new File([bytes], name, { type: 'image/png' });
}

/** A file whose reported size is `size` bytes (the content stays tiny). */
export function fileOfSize(name: string, type: string, size: number) {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/**
 * What a log keeps of a handler's argument: an event as «event click» (its target and time stamp
 * would make the text change on every run), anything else as it is.
 */
export const describeArg = (arg: unknown) =>
  arg && typeof arg === 'object' && 'nativeEvent' in arg && 'type' in arg ? `«event ${(arg as { type: string }).type}»` : arg;

/** The two looks; the pop-up a view is taken of. */
export type Look = 'clasico' | 'nuevo';
export type Popup = 'settings' | 'member' | 'form' | 'confirm';

/**
 * THE ONE LIST of what the comparison of a pop-up in both looks lets differ, each with its reason. Each
 * is applied by `personView` (below) and nowhere else, and only in the look it names: what a look must
 * show under an exception is asserted (a view reports «as allowed» or what it found instead), so an
 * exception never hides a change of its own kind.
 */
export const LOOK_EXCEPTIONS = {
  eyebrows: {
    reason:
      'The kit window draws a small line above the title (the eyebrow), approved with the mock-up; today\'s windows have none. ' +
      'In the new look the eyebrow must be exactly the one named here; in today\'s look there must be none.',
    text: {
      settings: 'Mi Comunidad de Crecimiento',
      member: 'Mi Comunidad de Crecimiento',
      form: 'Propuestas de Cursos',
      confirm: 'Confirmar',
    } as Record<Popup, string>,
  },
  neverFilledRows: {
    reason:
      'The member window\'s rows «Colegio», «Generación» and «Comunidad» need objects the panel never sends; the new markup does not ' +
      'draw them (approved with the mock-up). Today\'s rows (label and value) are left out; the new look must draw none of them.',
    labels: ['Colegio', 'Generación', 'Comunidad'],
  },
  removeImageName: {
    reason:
      'Today\'s remove mark of the community image is a button with no name; the new one is named «Quitar imagen» (a new hidden text, ' +
      'given by the 6C brief on purpose). Compared as one remove mark: nameless today, exactly «Quitar imagen» in the new look.',
    name: 'Quitar imagen',
  },
  uploadControl: {
    reason:
      'Today «Subir imagen» is a label of the hidden file input; the new look has a button that opens the same input (the 6C brief). ' +
      'Its words stay in the texts; its state is compared as «upload»; the hidden input\'s label is not compared.',
    text: 'Subir imagen',
    inputId: 'community-image-upload',
  },
  helpInsideLabel: {
    reason:
      'Today\'s tick box of the proposal form carries its help inside its label; the kit draws it under the label, joined by ' +
      'aria-describedby. The help is taken out of that field\'s label (the words stay in the texts).',
    form: ['Marque esta opción si requiere apoyo de nuestro equipo para estructurar el contenido del curso.'],
  } as { reason: string } & Partial<Record<Popup, string[]>>,
  working: {
    reason:
      'While saving or sending, today\'s save and send buttons are DISABLED; the kit\'s Button with `loading` is BUSY (aria-busy, ' +
      'clicks ignored; the kit\'s rule). The ONE allowed difference of state: only for the save and send buttons while they read ' +
      '«Guardando...», only in the settings window and the proposal form; today must be disabled (not busy), the new look busy.',
    name: 'Guardando...',
    popups: ['settings', 'form'] as Popup[],
  },
} as const;

/** The look a view is being taken in (set by `inBothLooks`); `null` outside it (no exception applies). */
let activeLook: Look | null = null;

/** Collapses white space and trims. */
const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * What can be done with a control: «enabled», «disabled», «busy» (aria-busy), both, or «absent» (not
 * drawn). A link is disabled by `aria-disabled`.
 */
export type ControlState = 'enabled' | 'disabled' | 'busy' | 'disabled, busy' | 'absent';
export function stateOf(element: Element | null | undefined): ControlState {
  if (!element) return 'absent';
  const disabled =
    (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.disabled
      : false) || element.getAttribute('aria-disabled') === 'true';
  const busy = element.getAttribute('aria-busy') === 'true';
  if (disabled && busy) return 'disabled, busy';
  if (busy) return 'busy';
  return disabled ? 'disabled' : 'enabled';
}

/**
 * The window's close X, in either look: today's settings pop-up's X (the nameless button right after
 * its title), the older dialog's X (its hidden text «Close»), the kit's X (named «Cerrar» by
 * `aria-label`, with no text).
 */
export function closeX(): HTMLButtonElement | null {
  const all = Array.from(document.body.querySelectorAll('button'));
  return (
    all.find((b) => b.getAttribute('aria-label') === 'Cerrar' && clean(b.textContent) === '') ??
    all.find((b) => clean(b.textContent) === 'Close') ??
    all.find((b) => b.previousElementSibling?.tagName === 'H3' && clean(b.textContent) === '' && !b.getAttribute('aria-label')) ??
    null
  );
}

/** The eyebrows drawn: a paragraph right before the element that names a dialog. */
function eyebrowElements(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]')).flatMap((dialog) => {
    const titleId = dialog.getAttribute('aria-labelledby');
    const title = titleId ? document.getElementById(titleId) : null;
    const before = title?.previousElementSibling;
    return before instanceof HTMLElement && before.tagName === 'P' ? [before] : [];
  });
}

/** Today's never-filled rows of the member window: each label paragraph and the value beside it. */
function neverFilledRowElements(): HTMLElement[] {
  const labels: readonly string[] = LOOK_EXCEPTIONS.neverFilledRows.labels;
  return Array.from(document.body.querySelectorAll<HTMLElement>('p')).flatMap((p) => {
    const value = p.nextElementSibling;
    return labels.includes(clean(p.textContent)) && value instanceof HTMLElement ? [p, value] : [];
  });
}

export interface PersonViewOptions {
  /** Which pop-up: the exceptions of `LOOK_EXCEPTIONS` that apply are chosen by it. */
  popup: Popup;
}

/**
 * What a person gets from the page body: every visible text WITH ITS COUNT (a sorted list, so a line
 * printed twice or lost shows), every field (id, name, type, label, placeholder, value or tick,
 * maxLength, accept, required mark, disabled), every button with its name and its state (enabled,
 * disabled, busy), the close X's state, every link (name, address, state), every picture. Generated
 * ids are left out; a field's label is its label element's text, or for a field without one (today's
 * settings name) the label in the same box, with the required mark «*» taken out and reported apart.
 * The X's own hidden words are not texts (the X is compared by its state). Only the exceptions of
 * `LOOK_EXCEPTIONS` are applied, in the look they name.
 */
export function personView(options: PersonViewOptions) {
  const { popup } = options;
  const look = activeLook;
  const x = closeX();
  const skipped: Element[] = x ? [x] : [];
  const exceptions: Record<string, string> = {};

  // The eyebrow: in the new look exactly the one named; in today's look none.
  const eyebrows = eyebrowElements();
  if (look === 'nuevo') {
    const wanted = LOOK_EXCEPTIONS.eyebrows.text[popup];
    const found = eyebrows.map((e) => clean(e.textContent));
    const dialogs = document.body.querySelectorAll('[role="dialog"]').length;
    exceptions.eyebrow = found.length === dialogs && found.every((t) => t === wanted) ? 'as allowed' : `found: ${JSON.stringify(found)}`;
    skipped.push(...eyebrows);
  } else {
    exceptions.eyebrow = eyebrows.length === 0 ? 'as allowed' : `found: ${JSON.stringify(eyebrows.map((e) => clean(e.textContent)))}`;
    if (look === null) skipped.push(...eyebrows);
  }

  // The member window's never-filled rows: left out of today's look; the new look draws none.
  if (popup === 'member') {
    const rows = neverFilledRowElements();
    if (look === 'nuevo') {
      exceptions.neverFilledRows = rows.length === 0 ? 'as allowed' : `drawn: ${JSON.stringify(rows.map((r) => clean(r.textContent)))}`;
    } else {
      exceptions.neverFilledRows = 'as allowed';
      skipped.push(...rows);
    }
  }

  const texts: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = clean(node.textContent);
    if (!text) continue;
    if (node.parentElement?.closest('svg, style, script')) continue;
    if (skipped.some((element) => element.contains(node))) continue;
    texts.push(text);
  }

  const uploadInputId = LOOK_EXCEPTIONS.uploadControl.inputId;
  const helpsInLabel = popup === 'form' ? LOOK_EXCEPTIONS.helpInsideLabel.form ?? [] : [];
  const fields = Array.from(document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')).map((control) => {
    const labels = control.labels && control.labels.length > 0 ? Array.from(control.labels) : [];
    const rawLabel = labels.length > 0 ? labels.map((l) => l.textContent).join(' ') : control.parentElement?.querySelector('label')?.textContent ?? '';
    let label = clean(rawLabel);
    const requiredMark = label.includes('*');
    label = clean(label.replace(/\*/g, ''));
    for (const help of helpsInLabel) label = clean(label.replace(help, ''));
    if (popup === 'settings' && control.id === uploadInputId) label = '«hidden input»';
    // No id of its own: none today, a generated one for the kit's label (both are «none» here).
    const id = control.id && !control.id.includes(':r') ? control.id : '«none»';
    const isChoice = control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio');
    return {
      tag: control.tagName.toLowerCase(),
      type: control instanceof HTMLInputElement ? control.type : 'textarea',
      id,
      name: control.getAttribute('name'),
      label,
      requiredMark,
      placeholder: control.getAttribute('placeholder'),
      value: control instanceof HTMLInputElement && control.type === 'file' ? '«file»' : isChoice ? String((control as HTMLInputElement).checked) : control.value,
      maxLength: control.getAttribute('maxlength'),
      accept: control.getAttribute('accept'),
      rows: control instanceof HTMLTextAreaElement ? control.rows : null,
      disabled: control.disabled,
    };
  });

  // «Subir imagen»: today a label of the hidden input (its state is the input's), a button in the new look.
  let upload: ControlState | null = null;
  let uploadButton: HTMLButtonElement | undefined;
  if (popup === 'settings') {
    const uploadText = LOOK_EXCEPTIONS.uploadControl.text;
    uploadButton = Array.from(document.body.querySelectorAll('button')).find((b) => clean(b.textContent) === uploadText);
    const uploadLabel = document.body.querySelector(`label[for="${uploadInputId}"]`);
    upload = uploadButton ? stateOf(uploadButton) : uploadLabel ? stateOf(document.getElementById(uploadInputId)) : 'absent';
  }

  const working = LOOK_EXCEPTIONS.working;
  const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
    .filter((b) => b !== x && b !== uploadButton)
    .map((b) => {
      let name = clean(b.getAttribute('aria-label') || b.textContent);
      let state: string = stateOf(b);
      if (popup === 'settings' && look !== null) {
        const removeName = LOOK_EXCEPTIONS.removeImageName.name;
        if ((look === 'nuevo' && name === removeName) || (look === 'clasico' && name === '')) name = '«remove mark»';
      }
      if (working.popups.includes(popup) && name === working.name && look !== null) {
        const allowed = look === 'clasico' ? state === 'disabled' : state === 'busy' || state === 'disabled, busy';
        if (allowed) state = '«working: disabled today, busy in the new look»';
      }
      return { name, state };
    });

  const links = Array.from(document.body.querySelectorAll<HTMLAnchorElement>('a')).map((a) => ({
    name: clean(a.textContent),
    href: a.getAttribute('href'),
    state: stateOf(a),
  }));

  const images = Array.from(document.body.querySelectorAll('img')).map((img) => ({ alt: img.getAttribute('alt'), src: img.getAttribute('src') }));

  return {
    texts: texts.sort(),
    fields,
    buttons,
    x: stateOf(x),
    ...(upload === null ? {} : { upload }),
    links,
    images,
    exceptions,
  };
}

/** A view whose X is compared apart, in an `it.fails` twin that names the difference. */
export function xApart<T extends { x: ControlState }>(view: T): Omit<T, 'x'> & { x: '«compared in the it.fails twin»' } {
  return { ...view, x: '«compared in the it.fails twin»' };
}

/**
 * Where a help line or a message stands to its control in the markup drawn: `associated` says how a
 * screen reader gets it with the control: «control» (one of its `aria-describedby` targets reads
 * exactly it), «label» (inside its label), «group» (the `aria-describedby` of the named group the
 * control sits in, as for the image of the settings window), or `false`; `hidden` whether the element
 * that carries it (or one around it) is hidden (`hidden`, `aria-hidden`, the class of that name or
 * the one for screen readers only, `display: none`); `found` whether the words are drawn at all.
 */
export function helpOf(control: Element, text: string): { found: boolean; associated: 'control' | 'label' | 'group' | false; hidden: boolean } {
  const byIds = (element: Element | null) =>
    (element?.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null);
  const own = byIds(control).find((e) => clean(e.textContent) === text);
  const labels = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? Array.from(control.labels ?? []) : [];
  const inLabel = labels.find((l) => clean(l.textContent).includes(text));
  const group = control.parentElement?.closest('[role="group"]') ?? null;
  const viaGroup = byIds(group).find((e) => clean(e.textContent) === text);
  const anywhere = Array.from(document.body.querySelectorAll<HTMLElement>('*')).find(
    (e) => clean(e.textContent) === text && !Array.from(e.children).some((child) => clean(child.textContent) === text)
  );
  const carrier = own ?? inLabel ?? viaGroup ?? anywhere ?? null;
  const associated = own ? 'control' : inLabel ? 'label' : viaGroup ? 'group' : false;
  return { found: carrier !== null, associated, hidden: carrier ? isHidden(carrier) : false };
}

function isHidden(element: HTMLElement): boolean {
  for (let e: HTMLElement | null = element; e; e = e.parentElement) {
    if (e.hidden || e.getAttribute('aria-hidden') === 'true') return true;
    if (e.classList.contains('hidden') || e.classList.contains('sr-only')) return true;
    if (e.style.display === 'none' || e.style.visibility === 'hidden') return true;
  }
  return false;
}

/** Today's look first, then the new one: the same scenario, what a person gets and the log of each. */
export async function inBothLooks<T>(
  setLook: (look: Look) => void,
  reset: () => void,
  scenario: () => Promise<T>,
  log: () => unknown[]
) {
  const results: Record<string, { got: T; log: unknown[] }> = {};
  try {
    for (const look of ['clasico', 'nuevo'] as const) {
      setLook(look);
      activeLook = look;
      reset();
      const got = await scenario();
      results[look] = { got, log: log().slice() };
      cleanup();
    }
  } finally {
    activeLook = null;
  }
  return results as { clasico: { got: T; log: unknown[] }; nuevo: { got: T; log: unknown[] } };
}
