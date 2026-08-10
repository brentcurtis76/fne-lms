// @vitest-environment jsdom
/**
 * Z3-3 [C8] [C9] · Z3-4 [D3] [D5] — the capability reads behind the embed decision and
 * the preflight, and the two-view support matrix built on top of them.
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
  selectEmbedView,
  supportsClientView,
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
  // Z3-4: the `'none'` cases below take WebAssembly away from the whole environment.
  vi.unstubAllGlobals();
});

/** The engine both views need. Removing it is what leaves a browser with neither. */
function removeWebAssembly() {
  vi.stubGlobal('WebAssembly', undefined);
}

const FIREFOX_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

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

/**
 * Z3-4 [D3] — Zoom's browser-support matrix lists Component View as unsupported on
 * Firefox (re-confirmed against the published matrix on 2026-08-08). A Firefox user who
 * reached it would pay 3.7 MB over a school link before failing into the fallback.
 */
describe('supportsComponentView — Firefox is not one of them [D3]', () => {
  const firefoxAgents: Array<[string, string]> = [
    ['Firefox on Windows', FIREFOX_DESKTOP_UA],
    [
      'Firefox on macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0',
    ],
    [
      'Firefox on Linux',
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    ],
    [
      'Firefox on iOS, which carries no Firefox/ token at all',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
    ],
  ];

  for (const [name, userAgent] of firefoxAgents) {
    it(`refuses ${name}, on a viewport that would otherwise pass`, () => {
      setNavigator({ userAgent });
      setViewport(1600);

      expect(supportsComponentView()).toBe(false);
    });
  }

  it('does not mistake a Chrome that merely mentions Gecko for Firefox', () => {
    // Every Chrome UA string contains "like Gecko"; only Firefox carries "Firefox/".
    expect(supportsComponentView()).toBe(true);
  });
});

describe('supportsClientView — the view for everywhere else [D5]', () => {
  it('supports the desktop browsers Component View refuses', () => {
    setNavigator({ userAgent: FIREFOX_DESKTOP_UA });

    expect(supportsClientView()).toBe(true);
  });

  it('supports mobile', () => {
    setNavigator({ userAgent: ANDROID_UA });
    setViewport(390);

    expect(supportsClientView()).toBe(true);
  });

  it('refuses a browser with no WebAssembly — neither view has a media engine there', () => {
    removeWebAssembly();

    expect(supportsClientView()).toBe(false);
  });
});

describe('selectEmbedView — exactly one view per browser [D3] [D4] [D5]', () => {
  it('gives a desktop Chrome Component View', () => {
    expect(selectEmbedView()).toBe('component');
  });

  it('gives desktop Firefox Client View, not the link', () => {
    setNavigator({ userAgent: FIREFOX_DESKTOP_UA });

    expect(selectEmbedView()).toBe('client');
  });

  it('gives Android Client View', () => {
    setNavigator({ userAgent: ANDROID_UA });
    setViewport(390);

    expect(selectEmbedView()).toBe('client');
  });

  it('gives an iPad reporting a desktop user agent Client View', () => {
    setNavigator({ userAgent: DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    setViewport(1366);

    expect(selectEmbedView()).toBe('client');
  });

  it('gives a narrow desktop window Client View rather than an unusable embed', () => {
    setViewport(MIN_EMBED_VIEWPORT_WIDTH - 1);

    expect(selectEmbedView()).toBe('client');
  });

  it("answers 'none' for an old machine with no WebAssembly at all", () => {
    setNavigator({ userAgent: ANDROID_UA });
    removeWebAssembly();

    expect(selectEmbedView()).toBe('none');
  });
});

describe('supportsWebAssembly', () => {
  it('is true in a browser that has it', () => {
    expect(supportsWebAssembly()).toBe(true);
  });

  it('is false in one that does not', () => {
    removeWebAssembly();

    expect(supportsWebAssembly()).toBe(false);
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
