// @vitest-environment jsdom
/**
 * Redesign 6S, release SC (third send-back): the kept element of `keptNode` carries the keyboard's place
 * across a move. The two places' refs are called here in the order React calls them when a view is
 * replaced by the other (the old place is handed back while it is still in the document; the new place is
 * lent afterwards), and in the order of a move straight from one place to the other. Between the two
 * calls the test does what a browser may do to a field that left the document: it forgets its caret and
 * scroll position. Everything here is invented.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useKeptNode, useSlotRef } from '@/components/sessions/admin-nuevo/keptNode';

function setUp() {
  const node = renderHook(() => useKeptNode()).result.current!;
  const first = renderHook(() => useSlotRef(node)).result.current;
  const second = renderHook(() => useSlotRef(node)).result.current;
  const placeA = document.createElement('section');
  const placeB = document.createElement('section');
  document.body.append(placeA, placeB);
  const reason = document.createElement('textarea');
  reason.value = 'Un motivo inventado bastante largo';
  node.appendChild(reason);
  const outside = document.createElement('input');
  document.body.appendChild(outside);
  first(placeA);
  return { node, first, second, placeA, placeB, reason, outside };
}

/** What a browser may do to a field while it is out of the document. */
function forget(reason: HTMLTextAreaElement) {
  reason.setSelectionRange(0, 0, 'none');
  reason.scrollTop = 0;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the kept element keeps the focus inside it across a move', () => {
  it('handed back, then lent: the same field gets the focus, the selected range and its direction, and the scroll position', () => {
    const { first, second, placeB, reason, node } = setUp();
    reason.focus();
    reason.setSelectionRange(3, 9, 'backward');
    reason.scrollTop = 17;
    first(null);
    expect(node.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(reason);
    forget(reason);
    second(placeB);
    expect(placeB.lastElementChild).toBe(node);
    expect(document.activeElement).toBe(reason);
    expect([reason.selectionStart, reason.selectionEnd, reason.selectionDirection]).toEqual([3, 9, 'backward']);
    expect(reason.scrollTop).toBe(17);
  });

  it('moved straight from one place to the other: the focus and caret stay', () => {
    const { second, placeB, reason } = setUp();
    reason.focus();
    reason.setSelectionRange(5, 5);
    second(placeB);
    expect(document.activeElement).toBe(reason);
    expect([reason.selectionStart, reason.selectionEnd]).toEqual([5, 5]);
  });

  it('a focus outside the kept element is not touched', () => {
    const { first, second, placeB, outside, reason } = setUp();
    outside.focus();
    first(null);
    second(placeB);
    expect(document.activeElement).toBe(outside);
    expect(document.activeElement).not.toBe(reason);
  });

  it('nothing focused: nothing is focused after the move', () => {
    const { first, second, placeB } = setUp();
    first(null);
    second(placeB);
    expect(document.activeElement).toBe(document.body);
  });

  it('a focus taken elsewhere between the two calls is left there', () => {
    const { first, second, placeB, outside, reason } = setUp();
    reason.focus();
    first(null);
    outside.focus();
    second(placeB);
    expect(document.activeElement).toBe(outside);
  });

  it('what was written down is used once: a later move with nothing focused does not bring the focus back', () => {
    const { first, second, placeA, placeB, reason } = setUp();
    reason.focus();
    first(null);
    second(placeB);
    expect(document.activeElement).toBe(reason);
    reason.blur();
    second(null);
    first(placeA);
    expect(document.activeElement).toBe(document.body);
  });

  it('a field taken out of the kept element meanwhile does not get the focus back', () => {
    const { first, second, placeB, reason } = setUp();
    reason.focus();
    first(null);
    reason.remove();
    second(placeB);
    expect(document.activeElement).toBe(document.body);
  });
});
