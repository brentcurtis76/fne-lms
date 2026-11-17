/**
 * A stand-in for `framer-motion` in unit tests (redesign 6B): `motion.<tag>` draws the plain tag
 * without the animation props, `AnimatePresence` draws its children. What a piece draws and when is
 * its own logic; how framer animates it is not pinned (it would depend on the test's clock).
 * Use: `vi.mock('framer-motion', () => import('../../helpers/motionFake'))`.
 */
import React from 'react';

const MOTION_PROPS = new Set([
  'variants',
  'initial',
  'animate',
  'exit',
  'transition',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'layout',
  'layoutId',
]);

const cache = new Map<string, React.ComponentType<any>>();

function plain(tag: string) {
  if (!cache.has(tag)) {
    const Component = React.forwardRef<unknown, Record<string, unknown>>(function MotionFake(props, ref) {
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) if (!MOTION_PROPS.has(key)) rest[key] = value;
      return React.createElement(tag, { ...rest, ref });
    });
    cache.set(tag, Component);
  }
  return cache.get(tag)!;
}

export const motion = new Proxy({}, { get: (_target, tag: string) => plain(tag) }) as Record<string, React.ComponentType<any>>;

export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

/** `window.matchMedia` for jsdom: `(max-width: 768px)` answers `mobile`, everything else false. */
export function installMatchMedia(state: { mobile: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 768px') ? state.mobile : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
