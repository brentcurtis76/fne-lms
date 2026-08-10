// @vitest-environment jsdom
/**
 * Z3-r8 [U2] [U3] — the deadline that bounds the MACHINE and never the person.
 *
 * ## The defect this file is the standing proof against
 *
 * Client View's `join` renders Zoom's own pre-join screen and answers its `success`
 * callback **when a human presses «Entrar»**. Until r8 that call was wrapped in the same
 * 45 s deadline as every machine step, so r7 measured the fallback firing at 46.5–46.7 s
 * in front of a healthy Zoom screen: the user was yanked to a link for thinking too long.
 *
 * `awaitClientViewJoin` keeps the deadline and changes the question it asks. It bounds
 * **"has Zoom put a screen up?"** — and once the answer is yes there is no timer left,
 * for as long as the person wants.
 *
 * Both halves of the contract are asserted here, and the second one is the whole point:
 *
 *  - a machine that renders nothing still reaches the link, on the same bound as before;
 *  - a rendered, interactive screen is never interrupted, at any distance past 45 s.
 *
 * The layout reading is the one thing jsdom cannot produce on its own — it has no layout
 * engine, so `getClientRects()` is empty for every element — so `layOut()` below supplies
 * exactly that one browser fact and nothing else about the DOM is faked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  awaitClientViewJoin,
  clientViewIsInteractive,
  CLIENT_VIEW_ROOT_ID,
} from '../../../lib/meet/zoom-client-view-loader';
import { SDK_CALL_TIMEOUT_MS, SDK_TIMEOUT_MESSAGE } from '../../../lib/meet/zoom-sdk-loader';

/** A day of deliberation. Anything the user does inside this must not be interrupted. */
const A_VERY_LONG_THINK_MS = 24 * 60 * 60 * 1_000;

/**
 * Give `element` a layout box, which is the half of "on screen" jsdom cannot answer.
 * Everything else the predicate reads — the root, the selector, `aria-hidden` — is real.
 */
function layOut(element: Element) {
  element.getClientRects = () => [{ width: 120, height: 32 }] as unknown as DOMRectList;
}

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  root.id = CLIENT_VIEW_ROOT_ID;
  document.body.appendChild(root);
  return root;
}

/** What Zoom's pre-join screen is, reduced to the property the signal reads. */
function renderZoomScreen(root: HTMLElement) {
  const button = document.createElement('button');
  button.textContent = 'Entrar';
  root.appendChild(button);
  layOut(button);
  return button;
}

/** The SDK still working: a shell with nothing to press in it. */
function renderZoomShell(root: HTMLElement) {
  const spinner = document.createElement('div');
  spinner.className = 'loading';
  root.appendChild(spinner);
  layOut(spinner);
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('clientViewIsInteractive — what counts as a screen [U3]', () => {
  it('is false with no root at all', () => {
    expect(clientViewIsInteractive(document)).toBe(false);
  });

  it('is false while the root is empty', () => {
    mountRoot();
    expect(clientViewIsInteractive(document)).toBe(false);
  });

  it('is false for a shell with nothing to press — that is still the machine working', () => {
    renderZoomShell(mountRoot());
    expect(clientViewIsInteractive(document)).toBe(false);
  });

  it('is false for a control with no layout box', () => {
    const root = mountRoot();
    // Present in the tree, not on the screen: how a bundle carries UI it does not need
    // yet. `getClientRects()` is left as jsdom's own empty list.
    root.appendChild(document.createElement('button'));
    expect(clientViewIsInteractive(document)).toBe(false);
  });

  it('is false for a control hidden from assistive technology', () => {
    const root = mountRoot();
    const button = renderZoomScreen(root);
    button.setAttribute('aria-hidden', 'true');
    expect(clientViewIsInteractive(document)).toBe(false);
  });

  it('is true once a laid-out control is inside the root', () => {
    renderZoomScreen(mountRoot());
    expect(clientViewIsInteractive(document)).toBe(true);
  });
});

describe('awaitClientViewJoin — a machine that renders nothing is still bounded [U2]', () => {
  it('rejects on the deadline when the SDK calls neither callback and renders nothing', async () => {
    mountRoot();
    const settled = vi.fn();

    const join = awaitClientViewJoin(window, () => {}).then(settled, settled);

    await vi.advanceTimersByTimeAsync(SDK_CALL_TIMEOUT_MS - 1_000);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    await join;

    expect(settled).toHaveBeenCalledWith(new Error(SDK_TIMEOUT_MESSAGE));
  });

  it('rejects on the deadline when the root never appears at all', async () => {
    const settled = vi.fn();
    const join = awaitClientViewJoin(window, () => {}).then(settled, settled);

    await vi.advanceTimersByTimeAsync(SDK_CALL_TIMEOUT_MS + 1_000);
    await join;

    expect(settled).toHaveBeenCalledWith(new Error(SDK_TIMEOUT_MESSAGE));
  });

  it('rejects when Zoom refuses the join before anything is rendered', async () => {
    mountRoot();

    await expect(
      awaitClientViewJoin(window, ({ error }) => error({ type: 'JOIN_MEETING_FAILED' }))
    ).rejects.toThrow();
  });
});

describe('awaitClientViewJoin — a person in front of a screen is never interrupted [U1] [U3]', () => {
  it('cancels the deadline the moment Zoom renders, and waits as long as the user does', async () => {
    const root = mountRoot();
    const settled = vi.fn();
    let enter = () => {};

    const join = awaitClientViewJoin(window, ({ success }) => {
      enter = success;
    }).then(settled, settled);

    // Zoom takes a few seconds to put its pre-join screen up. That part is ours to bound.
    await vi.advanceTimersByTimeAsync(4_000);
    renderZoomScreen(root);
    await vi.advanceTimersByTimeAsync(0);

    // Past the old bound, and past any bound. Nothing fires, nothing tears down.
    await vi.advanceTimersByTimeAsync(A_VERY_LONG_THINK_MS);
    expect(settled).not.toHaveBeenCalled();

    // «Entrar», at last.
    enter();
    await join;

    expect(settled).toHaveBeenCalledWith(undefined);
  });

  it('cancels it even when Zoom renders synchronously, before the first poll', async () => {
    const root = mountRoot();
    const settled = vi.fn();
    let enter = () => {};

    const join = awaitClientViewJoin(window, ({ success }) => {
      renderZoomScreen(root);
      enter = success;
    }).then(settled, settled);

    await vi.advanceTimersByTimeAsync(A_VERY_LONG_THINK_MS);
    expect(settled).not.toHaveBeenCalled();

    enter();
    await join;
    expect(settled).toHaveBeenCalledWith(undefined);
  });

  it('still honours a refusal after the screen is up — an error is the machine answering', async () => {
    const root = mountRoot();
    const settled = vi.fn();
    let refuse = (_reason: unknown) => {};

    const join = awaitClientViewJoin(window, ({ error }) => {
      refuse = error;
    }).then(settled, settled);

    renderZoomScreen(root);
    await vi.advanceTimersByTimeAsync(A_VERY_LONG_THINK_MS);
    expect(settled).not.toHaveBeenCalled();

    refuse({ type: 'JOIN_MEETING_FAILED' });
    await join;

    expect(settled).toHaveBeenCalledWith(expect.any(Error));
  });

  it('keeps the deadline running while only a shell is up', async () => {
    const root = mountRoot();
    const settled = vi.fn();

    const join = awaitClientViewJoin(window, () => {}).then(settled, settled);

    renderZoomShell(root);
    await vi.advanceTimersByTimeAsync(SDK_CALL_TIMEOUT_MS + 1_000);
    await join;

    // A spinner is not a screen: the machine never got there and the link is the answer.
    expect(settled).toHaveBeenCalledWith(new Error(SDK_TIMEOUT_MESSAGE));
  });
});
