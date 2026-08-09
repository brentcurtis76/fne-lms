// @vitest-environment jsdom
/**
 * Z3-3 [C8] [C9] — the capability reads behind the embed decision and the preflight.
 *
 * Tested here rather than through a rendered tree because both answers are decisions
 * about hardware the CI machine is not: the whole point is to cover the user agents and
 * the viewports a school actually has, and a component test can only reach the one
 * jsdom presents.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MIN_EMBED_VIEWPORT_WIDTH,
  readDevicePermission,
  supportsComponentView,
  supportsWebAssembly,
} from '../../../lib/meet/embed-capabilities';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function setNavigator(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true });
  }
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

beforeEach(() => {
  setNavigator({ userAgent: DESKTOP_UA, platform: 'Win32', maxTouchPoints: 0 });
  setViewport(1280);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('supportsComponentView — Component View is desktop only [C9]', () => {
  it('a desktop browser on a normal screen supports it', () => {
    expect(supportsComponentView()).toBe(true);
  });

  it('accepts exactly the minimum width and refuses one pixel below it', () => {
    setViewport(MIN_EMBED_VIEWPORT_WIDTH);
    expect(supportsComponentView()).toBe(true);

    setViewport(MIN_EMBED_VIEWPORT_WIDTH - 1);
    expect(supportsComponentView()).toBe(false);
  });

  const mobileAgents: Array<[string, string]> = [
    [
      'Chrome on Android',
      'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ],
    [
      'Safari on iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ],
    [
      'an Android tablet',
      'Mozilla/5.0 (Linux; Android 12; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ],
  ];

  for (const [name, userAgent] of mobileAgents) {
    it(`refuses ${name} even on a wide viewport`, () => {
      setNavigator({ userAgent });
      // A tablet in landscape is wider than the desktop floor: the user agent has to
      // be what decides, or Client View would never be reached.
      setViewport(1600);

      expect(supportsComponentView()).toBe(false);
    });
  }

  it('refuses an iPad reporting the desktop macOS user agent', () => {
    setNavigator({ userAgent: DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    setViewport(1366);

    expect(supportsComponentView()).toBe(false);
  });

  it('does not mistake a real Mac for one', () => {
    setNavigator({ userAgent: DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 0 });

    expect(supportsComponentView()).toBe(true);
  });
});

describe('supportsWebAssembly', () => {
  it('is true in a browser that has it', () => {
    expect(supportsWebAssembly()).toBe(true);
  });
});

describe('readDevicePermission — never asks for the device [C8]', () => {
  it('reports unavailable when the browser has no getUserMedia at all', async () => {
    setNavigator({ mediaDevices: undefined });

    await expect(readDevicePermission('camera')).resolves.toBe('unavailable');
  });

  it('reports unknown when there is no Permissions API to ask', async () => {
    setNavigator({ mediaDevices: { getUserMedia: vi.fn() }, permissions: undefined });

    await expect(readDevicePermission('microphone')).resolves.toBe('unknown');
  });

  for (const state of ['granted', 'denied', 'prompt'] as const) {
    it(`passes '${state}' through, and never touches getUserMedia`, async () => {
      const getUserMedia = vi.fn();
      const query = vi.fn().mockResolvedValue({ state });
      setNavigator({ mediaDevices: { getUserMedia }, permissions: { query } });

      await expect(readDevicePermission('camera')).resolves.toBe(state);
      expect(query).toHaveBeenCalledWith({ name: 'camera' });
      // A preflight that lit the camera to find out whether it could would be worse
      // than the black rectangle it exists to prevent.
      expect(getUserMedia).not.toHaveBeenCalled();
    });
  }

  it('reports unknown when the browser rejects the permission name (Firefox)', async () => {
    setNavigator({
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query: vi.fn().mockRejectedValue(new TypeError('unsupported')) },
    });

    await expect(readDevicePermission('camera')).resolves.toBe('unknown');
  });

  it('reports unknown for a state it does not recognise', async () => {
    setNavigator({
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query: vi.fn().mockResolvedValue({ state: 'something-new' }) },
    });

    await expect(readDevicePermission('microphone')).resolves.toBe('unknown');
  });
});
