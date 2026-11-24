import React, { useCallback, useRef } from 'react';
import { useLook } from '../../../contexts/LookContext';
import { useViewLatch } from '../detail-nuevo/useViewLatch';
import type { Look } from '../../../lib/look';

/**
 * A piece kept mounted across a change of view (redesign 6S, release SC, second send-back).
 *
 * Two admin screens hold a piece that must not be mounted a second time when the view follows the
 * look: the session detail's hours panel (it reads its data when it mounts, and the minutes, reason and
 * category a person is typing live inside it) and the session list's rows piece (it reads the cancelled
 * rows' marks when it mounts). The view follows the look by SB's rule (`useViewLatch`), so a look that
 * arrives late can change the view once. The piece is therefore rendered at ONE place of the page's
 * tree that does not depend on the view, through a portal into ONE element the page keeps
 * (`useKeptNode`), and each view only lends an element of its own as the place where that kept element
 * sits (`useSlotRef`). A change of view moves the kept element from one view's place to the other's; the
 * piece inside it is neither unmounted nor mounted again.
 *
 * The kept element is a plain element with no class and `display: contents`, so it draws no box of its
 * own: what it holds is laid out as if it were a direct child of the place it sits in.
 *
 * The keyboard's place goes with it (third send-back): a browser takes the focus away from an element
 * whose subtree leaves the document, and putting the subtree back elsewhere does not return it. So when
 * the kept element leaves a place while the focus is on something inside it, that element (and, for a
 * text field, its caret, selected range and scroll position) is written down; when the kept element is
 * in its new place, the same element gets the focus back and the caret is put back where it was.
 */

/** The element inside a kept element that had the focus when the kept element left its place. */
interface FocusLeft {
  element: HTMLElement;
  selection: { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null;
  scrollTop: number;
}

/** Per kept element: the focus it carried away from its last place, until it is put in a new one. */
const focusLeft = new WeakMap<HTMLElement, FocusLeft>();

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** The caret and selected range of a text field (`null` for anything else, or a field without one). */
function selectionOf(element: HTMLElement): FocusLeft['selection'] {
  const field = element as Partial<TextField>;
  if (typeof field.setSelectionRange !== 'function') return null;
  try {
    const start = field.selectionStart;
    const end = field.selectionEnd;
    if (typeof start !== 'number' || typeof end !== 'number') return null;
    return { start, end, direction: field.selectionDirection ?? 'none' };
  } catch {
    // An input kind without a caret (a number field, in some browsers) refuses to be asked.
    return null;
  }
}

/**
 * Called just before the kept element leaves the document (or is moved): writes down what inside it has
 * the focus, or forgets what an earlier move wrote down when the focus is not inside it now.
 */
function rememberFocus(node: HTMLElement): void {
  const active = node.ownerDocument.activeElement as HTMLElement | null;
  if (active === null || active === node || !node.contains(active) || typeof active.focus !== 'function') {
    focusLeft.delete(node);
    return;
  }
  focusLeft.set(node, { element: active, selection: selectionOf(active), scrollTop: active.scrollTop });
}

/**
 * Called once the kept element is in its new place: the element written down gets the focus back, with
 * its caret and scroll position, only if it is still inside the kept element, the kept element is in the
 * document, and nothing else has taken the focus in between. What was written down is used once.
 */
function giveFocusBack(node: HTMLElement): void {
  const left = focusLeft.get(node);
  focusLeft.delete(node);
  if (left === undefined || !node.isConnected || !node.contains(left.element)) return;
  const doc = node.ownerDocument;
  const active = doc.activeElement;
  if (active !== null && active !== doc.body && active !== doc.documentElement) return;
  left.element.focus({ preventScroll: true });
  if (doc.activeElement !== left.element) return;
  if (left.selection !== null) {
    try {
      (left.element as TextField).setSelectionRange(left.selection.start, left.selection.end, left.selection.direction);
    } catch {
      // The field no longer takes a caret: the focus alone is given back.
    }
  }
  left.element.scrollTop = left.scrollTop;
}
export function useKeptNode(): HTMLElement | null {
  const node = useRef<HTMLElement | null>(null);
  // Made once, on the browser only (nothing is drawn into it on the server), while rendering: the same
  // element on every render after.
  if (node.current === null && typeof document !== 'undefined') {
    const made = document.createElement('div');
    made.style.display = 'contents';
    node.current = made;
  }
  return node.current;
}

/**
 * The ref of one view's place for the kept element. When the place is attached (and `active`), the
 * kept element is moved into it, as its last child; when the place goes away (or stops being active),
 * the kept element is handed back (taken out of it) if it is still there. The callback keeps its
 * identity while `node` and `active` stay the same, so an ordinary render does not move anything. Across
 * each move, the focus inside the kept element is kept (see above); a focus elsewhere is not touched.
 *
 * A place is an element of its own that React renders with no children (sixth send-back): an element
 * with no class and `display: contents`, standing exactly where the piece stood in the view's markup.
 * React does not know the kept element, so a child React later added to a place that has other children
 * would be put after the kept element; a place that holds nothing else keeps the order of the view.
 */
export function useSlotRef(node: HTMLElement | null, active = true): (place: HTMLElement | null) => void {
  const attached = useRef<HTMLElement | null>(null);
  return useCallback(
    (place: HTMLElement | null) => {
      if (node === null) return;
      if (place !== null) {
        if (!active) return;
        attached.current = place;
        // A move straight from another place also takes the focus away: it is written down first.
        if (node.isConnected) rememberFocus(node);
        place.appendChild(node);
        giveFocusBack(node);
        return;
      }
      const was = attached.current;
      attached.current = null;
      if (was !== null && node.parentNode === was) {
        // React hands the old place back before the view it belongs to leaves the document, and only
        // later lends the new place: the focus is written down here, while it is still where it was.
        rememberFocus(node);
        was.removeChild(node);
      }
    },
    [node, active]
  );
}

/**
 * The list's two views, following the look by SB's rule (`useViewLatch`, one fixed key: the list has
 * one body), with the look read HERE and not by the page. A change of look renders only this
 * component, which draws what the page gave it on its last render: `kept` (the piece kept mounted,
 * always at this same first place) and the view's own elements.
 */
export function FollowedView({
  clasico,
  nuevo,
  kept,
}: {
  clasico: () => React.ReactNode;
  nuevo: () => React.ReactNode;
  kept: (view: Look) => React.ReactNode;
}) {
  const view = useViewLatch({ look: useLook().look, sessionId: 'body', drawing: true });
  return (
    <>
      {kept(view)}
      {view === 'nuevo' ? nuevo() : clasico()}
    </>
  );
}
