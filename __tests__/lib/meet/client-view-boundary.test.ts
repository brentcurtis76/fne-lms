/**
 * Z3-r5 (Sol M4) — the CSS boundary Client View runs behind, verified rather than
 * asserted.
 *
 * The defect: `pages/meet/session/[id].tsx` inherits `_app.tsx`'s global Tailwind, Zoom
 * warns that global framework CSS conflicts with Client View, and `init`/`join` can
 * SUCCEED against a broken layout — so the catch-based link fallback cannot detect this
 * failure class at all. A NEW PAGE WOULD NOT HAVE FIXED IT: Next's Pages Router permits
 * a global stylesheet to be imported from `_app` and nowhere else, and `_app` wraps
 * every page, so no route in this app can be a boundary.
 *
 * Hence a static document under `public/`, served without the app pipeline. The claims
 * below are the ones that make it a boundary, and each is checked against the bytes on
 * disk rather than taken on trust. The first one is a positive control: it fails if
 * `_app.tsx` ever stops carrying the stylesheet, at which point this whole file is
 * arguing about something that no longer exists.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  CLIENT_VIEW_FRAME_SRC,
  CLIENT_VIEW_ROOT_ID,
} from '../../../lib/meet/zoom-client-view-loader';

const ROOT = path.resolve(__dirname, '../../..');
const SHELL_PATH = path.join(ROOT, 'public', CLIENT_VIEW_FRAME_SRC);

const shell = readFileSync(SHELL_PATH, 'utf8');

/** Everything between `<!--` and `-->`: prose, not markup, and not part of any claim. */
const markup = shell.replace(/<!--[\s\S]*?-->/g, '');

describe('the Client View document is a real CSS boundary [M4]', () => {
  it('is escaping something that actually exists — _app.tsx carries the global stylesheet', () => {
    const app = readFileSync(path.join(ROOT, 'pages/_app.tsx'), 'utf8');

    expect(app).toContain("import '../styles/globals.css'");
    // …and that stylesheet is what would reach Client View: Tailwind's Preflight plus a
    // `body` rule, applied document-wide, on every page `_app` wraps.
    const globals = readFileSync(path.join(ROOT, 'styles/globals.css'), 'utf8');
    expect(globals).toContain('@tailwind base');
    expect(globals).toMatch(/^body\s*\{/m);
  });

  it('is not a Next page, so nothing can wrap it', () => {
    // A page at this path would go through `_app` and inherit the globals again — the
    // exact mistake this replaces. `public/` is served as a static asset instead.
    for (const extension of ['tsx', 'ts', 'jsx', 'js']) {
      expect(existsSync(path.join(ROOT, `pages/meet/zoom-client-view.${extension}`))).toBe(false);
    }
    expect(existsSync(SHELL_PATH)).toBe(true);
  });

  it('carries no stylesheet, no style block and no class of ours', () => {
    expect(markup).not.toMatch(/<link[^>]+stylesheet/i);
    expect(markup).not.toMatch(/<style[\s>]/i);
    expect(markup).not.toMatch(/\bclass=/i);
    expect(markup).not.toContain('globals.css');
    expect(markup).not.toContain('tailwind');
  });

  it('carries no script — the bootstrap stays in typed, tested code', () => {
    // The parent drives the SDK across the same-origin boundary. A copy of the loader
    // living here as plain JS would be outside type-check, lint and every test above.
    expect(markup).not.toMatch(/<script[\s>]/i);
    expect(markup).not.toMatch(/\son[a-z]+=/i);
  });

  it('holds the root Zoom looks up by id, and nothing else', () => {
    expect(markup).toContain(`id="${CLIENT_VIEW_ROOT_ID}"`);
    // One element in the body. Anything more is ours, and ours does not belong in here.
    expect(markup.match(/<div/g) ?? []).toHaveLength(1);
  });

  it('is a constant: no credential, no session identifier, no interpolation', () => {
    // It is the same bytes for every user, which is why it can be a static file at all.
    expect(markup).not.toMatch(/\{\{|\$\{|<%/);
    expect(markup).not.toMatch(/signature|passcode|zak|sdk_key|join_url/i);
  });

  it('sits under the one path granted camera and microphone', () => {
    // A nested context is refused what its own path is refused, and `next.config.js`
    // denies camera and microphone everywhere except `/meet/`.
    expect(CLIENT_VIEW_FRAME_SRC.startsWith('/meet/')).toBe(true);

    const config = readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');
    expect(config).toContain("source: '/meet/:path*'");
    expect(config).toContain('camera=(self), microphone=(self), display-capture=(self)');
  });
});
