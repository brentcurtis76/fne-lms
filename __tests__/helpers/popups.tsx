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
import { serialise } from './pin';

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

/** Collapses white space and trims. */
const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The window's close X, in either look: today's settings pop-up's first button (nameless), the older
 * dialog's X (its hidden text «Close»), the kit's X (named «Cerrar» by `aria-label`, with no text).
 */
export function closeX(): HTMLButtonElement | null {
  const all = Array.from(document.body.querySelectorAll('button'));
  return (
    all.find((b) => b.getAttribute('aria-label') === 'Cerrar' && clean(b.textContent) === '') ??
    all.find((b) => clean(b.textContent) === 'Close') ??
    null
  );
}

function isX(button: Element) {
  return (button.getAttribute('aria-label') === 'Cerrar' && clean(button.textContent) === '') || clean(button.textContent) === 'Close';
}

export interface PersonViewOptions {
  /** Texts not compared (the new look's eyebrows, the X's hidden «Close», rows the new look leaves out). */
  ignoreTexts?: string[];
  /** Help texts taken out of a field's label (today's tick box carries its help inside its label). */
  helpTexts?: string[];
  /** Buttons not compared by name (an X, today's nameless remove mark). */
  ignoreButton?: (button: HTMLButtonElement) => boolean;
}

/**
 * What a person gets from the page body, look-independent: every visible text (a set), every field
 * (id, name, type, label, placeholder, value or tick, maxLength, accept, required mark, disabled),
 * every button (name, unavailable: disabled or busy), every link (name, address). Generated ids are
 * left out; a field's label is its label element's text, or for a field without one (today's settings
 * name) the label in the same box, with the required mark «*» taken out and reported apart.
 */
export function personView(options: PersonViewOptions = {}) {
  const ignore = new Set(options.ignoreTexts ?? []);
  const texts = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = clean(node.textContent);
    if (!text || ignore.has(text)) continue;
    if (node.parentElement?.closest('svg, style, script')) continue;
    texts.add(text);
  }

  const fields = Array.from(document.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')).map((control) => {
    const labels = control.labels && control.labels.length > 0 ? Array.from(control.labels) : [];
    const rawLabel = labels.length > 0 ? labels.map((l) => l.textContent).join(' ') : control.parentElement?.querySelector('label')?.textContent ?? '';
    let label = clean(rawLabel);
    const requiredMark = label.includes('*');
    label = clean(label.replace(/\*/g, ''));
    for (const help of options.helpTexts ?? []) label = clean(label.replace(help, ''));
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

  const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
    .filter((b) => !isX(b) && !(options.ignoreButton?.(b) ?? false))
    .map((b) => ({
      name: clean(b.getAttribute('aria-label') || b.textContent),
      unavailable: b.disabled || b.getAttribute('aria-busy') === 'true',
    }));

  const links = Array.from(document.body.querySelectorAll<HTMLAnchorElement>('a')).map((a) => ({
    name: clean(a.textContent),
    href: a.getAttribute('href'),
  }));

  const images = Array.from(document.body.querySelectorAll('img')).map((img) => ({ alt: img.getAttribute('alt'), src: img.getAttribute('src') }));

  return { texts: [...texts].sort(), fields, buttons, links, images };
}

/** Today's look first, then the new one: the same scenario, what a person gets and the log of each. */
export async function inBothLooks<T>(
  setLook: (look: 'clasico' | 'nuevo') => void,
  reset: () => void,
  scenario: () => Promise<T>,
  log: () => unknown[]
) {
  const results: Record<string, { got: T; log: unknown[] }> = {};
  for (const look of ['clasico', 'nuevo'] as const) {
    setLook(look);
    reset();
    const got = await scenario();
    results[look] = { got, log: log().slice() };
    cleanup();
  }
  return results as { clasico: { got: T; log: unknown[] }; nuevo: { got: T; log: unknown[] } };
}
