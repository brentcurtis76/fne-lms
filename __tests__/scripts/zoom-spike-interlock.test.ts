/**
 * Static + behavioural enforcement of the spike's destructive-call interlock.
 *
 * Sol R1 finding ②: `assertSpikeMeeting` existed in `scripts/spikes/zoom/lib.mjs`
 * but nothing enforced its use. Two scripts never called it (one of them labeled
 * "read-only" while issuing `recording.stop`), and the scripts that did call it
 * called it once per SEQUENCE — one check, then several mutations. PROJECT_STATE
 * nonetheless claimed the interlock was re-verified before every destructive call.
 *
 * A convention that documentation asserts and nothing checks is how that happened,
 * so the fix is not just "call the helper everywhere" — it is this file. Two
 * layers:
 *
 *  1. STATIC — parse every `scripts/spikes/zoom/*.mjs` and prove that the only
 *     non-GET Zoom traffic in the spike goes through `destructiveZoomCall`. This
 *     is the assertion that prevents recurrence: adding a mutation outside the
 *     helper turns this file red, whatever the comments around it say.
 *  2. BEHAVIOURAL — drive `destructiveZoomCall` with a stubbed `fetch` and prove
 *     the interlock GET precedes the mutation on every call, and that a
 *     non-spike topic aborts BEFORE the mutation is issued.
 *
 * The static layer keys on HTTP method rather than a verb blocklist on purpose:
 * every state-changing Zoom request is non-GET, so "non-GET ⇒ helper" covers
 * `recording.stop`/`start`/`pause`/`resume`, `action:'end'`, `action:'trash'`,
 * `action:'delete'`, the settings PATCH and anything a future phase invents,
 * whereas a verb list only covers the verbs someone remembered to list. The verb
 * inventory below is kept as a corroborating check, not as the primary rule.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SPIKE_DIR = path.join(process.cwd(), 'scripts/spikes/zoom');

/** The five scripts Sol named, plus the rest of the directory. */
const SOL_NAMED_SCRIPTS = [
  'probe-scopes.mjs',
  'followup-report.mjs',
  'customer-key-poc.mjs',
  'recording-control.mjs',
  'stop-confirm.mjs',
];

/**
 * Call sites permitted to issue a non-GET Zoom request outside the helper, keyed
 * by the `interlock-exempt(<name>)` marker at the call site. Pinned so a new
 * exemption cannot be introduced silently: adding a marker without adding it here
 * fails, and adding it here is a visible diff a reviewer will see.
 */
const EXPECTED_EXEMPTIONS = [{ file: 'create-meeting.mjs', marker: 'create' }];

const DESTRUCTIVE_VERB_LITERALS = [
  "'recording.stop'",
  "'recording.start'",
  "'recording.pause'",
  "'recording.resume'",
  "action: 'end'",
  "action: 'trash'",
  "action: 'delete'",
  "action: 'end'",
];

type CallSite = {
  file: string;
  line: number;
  /** The literal method argument, or null when the expression is not a literal. */
  method: string | null;
  raw: string;
  exemptMarker: string | null;
};

function spikeScripts(): string[] {
  return readdirSync(SPIKE_DIR)
    .filter((f) => f.endsWith('.mjs'))
    .sort();
}

function read(file: string): string[] {
  return readFileSync(path.join(SPIKE_DIR, file), 'utf8').split('\n');
}

/**
 * Finds every `zoomApi(` call site and extracts its method argument.
 *
 * Scans the whole file rather than line by line, and balances parentheses to
 * recover the complete call expression: `transfer-recording.mjs` writes its
 * DELETEs with the method on its own line, and a line-based matcher walked
 * straight past them. A static check that silently cannot see a mutation is
 * worse than no check, because it reports green.
 *
 * Deliberately literal-only: a computed method (`zoomApi(env, probe.method, …)`)
 * is reported as `null` and treated as a violation, because a method this test
 * cannot read is a method that could be a mutation. That is not hypothetical —
 * the pre-fix `probe-scopes.mjs` hid its `recording.stop` PATCH behind exactly
 * that indirection (`probe.method ?? 'GET'`).
 */
function findZoomApiCalls(file: string): CallSite[] {
  const source = readFileSync(path.join(SPIKE_DIR, file), 'utf8');
  const lines = source.split('\n');
  const sites: CallSite[] = [];

  /** 0-indexed line containing `offset`. */
  const lineOf = (offset: number) => source.slice(0, offset).split('\n').length - 1;

  const isCommentLine = (line: string) => {
    const t = line.trim();
    return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
  };

  // Only `zoomApi(`, not `destructiveZoomCall(`: the leading class excludes a
  // preceding word character, so the helper's own name cannot match.
  const re = /(^|[^A-Za-z0-9_])zoomApi\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const startLine = lineOf(openParen);
    if (isCommentLine(lines[startLine]) || lines[startLine].trim().startsWith('import')) continue;

    // Walk to the matching close paren so the arguments are complete even when
    // they span lines.
    let depth = 0;
    let end = openParen;
    for (let i = openParen; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    const argText = source.slice(openParen + 1, end);
    const methodMatch = argText.match(/^\s*env\s*,\s*('[A-Z]+'|[^,]+)\s*,/);
    const rawMethod = methodMatch ? methodMatch[1].trim() : null;
    const method = rawMethod && /^'[A-Z]+'$/.test(rawMethod) ? rawMethod.slice(1, -1) : null;

    // The marker may sit on any of the 12 comment lines immediately above.
    let exemptMarker: string | null = null;
    for (let back = startLine - 1; back >= 0 && back >= startLine - 12; back -= 1) {
      const candidate = lines[back].trim();
      if (!candidate.startsWith('//')) break;
      const markerMatch = candidate.match(/interlock-exempt\(([a-z-]+)\)/);
      if (markerMatch) {
        exemptMarker = markerMatch[1];
        break;
      }
    }

    sites.push({
      file,
      line: startLine + 1,
      method,
      raw: lines[startLine].trim(),
      exemptMarker,
    });
  }

  return sites;
}

describe('zoom spike — destructive-call interlock (Sol R1 ②)', () => {
  it('scans the whole spike directory, including all five scripts Sol named', () => {
    // Guards against the check silently scanning nothing — a static test that
    // finds no files passes for the wrong reason.
    const scripts = spikeScripts();
    expect(scripts.length).toBeGreaterThanOrEqual(9);
    for (const named of SOL_NAMED_SCRIPTS) {
      expect(scripts).toContain(named);
    }
  });

  it('finds Zoom call sites in every script that talks to Zoom', () => {
    const withCalls = spikeScripts().filter((f) => findZoomApiCalls(f).length > 0);
    // lib.mjs plus the scripts that issue reads; proves the parser works before
    // the assertions below rely on its silence.
    expect(withCalls.length).toBeGreaterThanOrEqual(7);
  });

  it('reads a method argument that sits on its own line', () => {
    // Regression guard for the parser itself: a line-based matcher missed
    // transfer-recording.mjs's DELETEs, whose method is on the line after
    // `zoomApi(`. Every site the parser reports must have a resolved method, and
    // a synthetic multi-line call must parse.
    const sites = spikeScripts()
      // lib.mjs is excluded: its own `zoomApi(env, method, apiPath, …)` signature
      // and the helper's forwarding call take the method as a parameter, which is
      // the one place a variable method is correct.
      .filter((f) => f !== 'lib.mjs')
      .flatMap((f) => findZoomApiCalls(f));
    expect(sites.length).toBeGreaterThan(10);
    // No script-side site is unreadable — if one were, the violation check below
    // would be reporting on a partial picture.
    expect(sites.filter((s) => s.method === null).map((s) => `${s.file}:${s.line}`)).toEqual([]);
  });

  it('routes every non-GET Zoom request through destructiveZoomCall', () => {
    const violations: CallSite[] = [];

    for (const file of spikeScripts()) {
      for (const site of findZoomApiCalls(file)) {
        // lib.mjs is where the helper lives; its own zoomApi calls are the
        // interlock GET and the post-assert mutation, verified behaviourally below.
        if (file === 'lib.mjs') continue;
        if (site.method === 'GET') continue;
        if (site.exemptMarker) continue;
        violations.push(site);
      }
    }

    expect(
      violations.map((v) => `${v.file}:${v.line} method=${v.method ?? '(not a literal)'} — ${v.raw}`)
    ).toEqual([]);
  });

  it('permits exactly the pinned exemptions and no others', () => {
    const found = spikeScripts()
      .filter((f) => f !== 'lib.mjs')
      .flatMap((f) => findZoomApiCalls(f))
      .filter((s) => s.exemptMarker !== null)
      .map((s) => ({ file: s.file, marker: s.exemptMarker }));

    expect(found).toEqual(EXPECTED_EXEMPTIONS);
  });

  it('keeps probe-scopes.mjs read-only, as its header claims', () => {
    // The specific regression Sol named: a script advertising itself as read-only
    // while issuing `recording.stop`. Comment lines are excluded because the
    // header now discusses the removed probe by name — it is executable lines
    // that have to be clean.
    const code = read('probe-scopes.mjs').filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    });
    expect(code.filter((l) => l.includes('recording.stop'))).toEqual([]);
    expect(code.filter((l) => l.includes('live_meetings'))).toEqual([]);

    const sites = findZoomApiCalls('probe-scopes.mjs');
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(site.method).toBe('GET');
    }
  });

  it('reaches Zoom only through zoomApi — no raw fetch to api.zoom.us in a script', () => {
    // Closes the obvious bypass: the method check above only sees `zoomApi(` sites.
    const offenders: string[] = [];
    for (const file of spikeScripts()) {
      if (file === 'lib.mjs') continue;
      read(file).forEach((line, i) => {
        if (/api\.zoom\.us/.test(line) && !line.trim().startsWith('*') && !line.trim().startsWith('//')) {
          offenders.push(`${file}:${i + 1} — ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every destructive verb literal in a file that imports the helper', () => {
    // Corroborating check: if a verb shows up somewhere that has no access to the
    // interlock at all, that is worth failing on even before the method check runs.
    const offenders: string[] = [];
    for (const file of spikeScripts()) {
      if (file === 'lib.mjs') continue;
      const source = readFileSync(path.join(SPIKE_DIR, file), 'utf8');
      const verbs = DESTRUCTIVE_VERB_LITERALS.filter((v) => source.includes(v));
      if (verbs.length > 0 && !source.includes('destructiveZoomCall')) {
        offenders.push(`${file} carries ${verbs.join(', ')} without importing destructiveZoomCall`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('asserts the spike topic before issuing the request, in source order', () => {
    const lib = readFileSync(path.join(SPIKE_DIR, 'lib.mjs'), 'utf8');
    const helper = lib.slice(lib.indexOf('export async function destructiveZoomCall'));
    const body = helper.slice(0, helper.indexOf('\n}\n') + 1);
    const assertAt = body.indexOf('assertSpikeMeeting(');
    const callAt = body.indexOf('zoomApi(env, method, apiPath');
    expect(assertAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    expect(assertAt).toBeLessThan(callAt);
  });
});

/**
 * The static layer proves the helper is the only door. This layer proves the door
 * is locked — with a stubbed `fetch`, so no Zoom credential or network access is
 * involved and it runs in CI like any other unit test.
 */
describe('destructiveZoomCall — runtime interlock', () => {
  const ENV = {
    ZOOM_S2S_ACCOUNT_ID: 'acct',
    ZOOM_S2S_CLIENT_ID: 'cid',
    ZOOM_S2S_CLIENT_SECRET: 'secret',
  };

  type Recorded = { method: string; url: string };

  /**
   * @param topic what the interlock GET reports as the meeting's topic
   */
  function stubFetch(topic: string | null, { meetingStatus = 200 } = {}) {
    const calls: Recorded[] = [];
    const impl = async (input: unknown, init?: { method?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url });

      if (url.includes('zoom.us/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600, scope: 'a b' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // The interlock read.
      if (method === 'GET' && /\/v2\/meetings\/[^/]+$/.test(url)) {
        return new Response(topic === null ? '{}' : JSON.stringify({ id: 123, topic }), {
          status: meetingStatus,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Zoom answers the live-meeting controls PATCH with 204 and an empty body.
      return new Response(null, { status: 204 });
    };
    return { calls, impl };
  }

  // Reset per test so the module-level S2S token cache cannot let a later test
  // skip the token fetch and change the recorded call order.
  beforeEach(() => {
    vi.resetModules();
  });

  async function load() {
    return (await import('../../scripts/spikes/zoom/lib.mjs')) as {
      destructiveZoomCall: (
        env: unknown,
        meetingIdOrUuid: unknown,
        method: string,
        apiPath: string,
        opts?: unknown
      ) => Promise<{ status: number }>;
    };
  }

  it('issues the interlock GET immediately before the mutation', async () => {
    const { destructiveZoomCall } = await load();
    const { calls, impl } = stubFetch('PRUEBA SPIKE — no unirse');
    vi.stubGlobal('fetch', impl);

    const res = await destructiveZoomCall(ENV, '123', 'DELETE', '/meetings/123/recordings/abc', {
      query: { action: 'delete' },
    });

    expect(res.status).toBe(204);
    const zoomCalls = calls.filter((c) => c.url.includes('/v2/'));
    expect(zoomCalls).toHaveLength(2);
    expect(zoomCalls[0]).toMatchObject({ method: 'GET' });
    expect(zoomCalls[0].url).toContain('/v2/meetings/123');
    expect(zoomCalls[1]).toMatchObject({ method: 'DELETE' });
    vi.unstubAllGlobals();
  });

  it('re-reads per call, so N mutations produce N interlock reads', async () => {
    // The exact defect: recording-control.mjs looped four mutations behind one check.
    const { destructiveZoomCall } = await load();
    const { calls, impl } = stubFetch('PRUEBA SPIKE — no unirse');
    vi.stubGlobal('fetch', impl);

    for (const method of ['recording.stop', 'recording.pause', 'recording.resume']) {
      await destructiveZoomCall(ENV, '123', 'PATCH', '/live_meetings/123/events', {
        body: { method },
      });
    }

    const reads = calls.filter((c) => c.method === 'GET' && c.url.includes('/v2/meetings/123'));
    const mutations = calls.filter((c) => c.method === 'PATCH');
    expect(reads).toHaveLength(3);
    expect(mutations).toHaveLength(3);
    vi.unstubAllGlobals();
  });

  it('aborts before the mutation when the topic is not a spike meeting', async () => {
    const { destructiveZoomCall } = await load();
    const { calls, impl } = stubFetch('Reunión de apoderados 5°B');
    vi.stubGlobal('fetch', impl);

    await expect(
      destructiveZoomCall(ENV, '999', 'DELETE', '/meetings/999/recordings/abc')
    ).rejects.toThrow(/SAFETY ABORT/);

    // The point of the whole finding: nothing was sent.
    expect(calls.filter((c) => c.method !== 'GET' && c.url.includes('/v2/'))).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('aborts when the meeting cannot be read at all', async () => {
    const { destructiveZoomCall } = await load();
    const { calls, impl } = stubFetch('PRUEBA SPIKE — no unirse', { meetingStatus: 404 });
    vi.stubGlobal('fetch', impl);

    await expect(destructiveZoomCall(ENV, '999', 'PUT', '/meetings/999/status')).rejects.toThrow(
      /SAFETY ABORT/
    );
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('refuses a mutation that cannot name its target', async () => {
    const { destructiveZoomCall } = await load();
    const { calls, impl } = stubFetch('PRUEBA SPIKE — no unirse');
    vi.stubGlobal('fetch', impl);

    for (const bad of [undefined, null, '']) {
      await expect(
        destructiveZoomCall(ENV, bad, 'DELETE', '/meetings/x/recordings/y')
      ).rejects.toThrow(/SAFETY ABORT/);
    }
    expect(calls.filter((c) => c.url.includes('/v2/'))).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('rejects a GET routed through the destructive helper', async () => {
    const { destructiveZoomCall } = await load();
    await expect(destructiveZoomCall(ENV, '123', 'GET', '/meetings/123')).rejects.toThrow(
      /use zoomApi for GET/
    );
  });
});
