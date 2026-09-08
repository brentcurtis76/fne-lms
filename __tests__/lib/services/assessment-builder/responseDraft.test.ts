// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponseDraftSession } from '@/lib/services/assessment-builder/responseDraft';

const reply = (saved = 1, status = 200) => ({ ok: status === 200, status,
  json: async () => ({ saved, error: status === 200 ? undefined : 'Servidor no disponible' }) }) as Response;
let sessions: ResponseDraftSession[];
function session(request = vi.fn().mockResolvedValue(reply()), user = 'adult-a', instance = 'assessment-a', tab?: string) {
  const result = new ResponseDraftSession(user, instance, () => localStorage, request, tab);
  sessions.push(result);
  result.initialize(['one', 'two'], true);
  return result;
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); sessions = []; });
afterEach(() => { sessions.forEach(value => value.dispose()); vi.useRealTimers(); });

describe('durable assessment response journals', () => {
  it('recovers the last edit even when the tab closes before the debounce', async () => {
    const request = vi.fn().mockResolvedValue(reply());
    const first = session(request);
    first.record('one', { rationale: 'Borrador sintético', coverageValue: false });
    expect(localStorage.length).toBe(1);
    first.dispose();
    await vi.advanceTimersByTimeAsync(2500);
    expect(request).not.toHaveBeenCalled();
    const next = session(request);
    expect(next.state.recovery).toHaveLength(1);
    expect(next.recover(next.state.recovery[0].key)).toEqual({ one: { rationale: 'Borrador sintético', coverageValue: false } });
    expect(await next.save()).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it('does not expose or clear another user or evaluation journal', () => {
    session().record('one', { frequencyValue: 7 });
    expect(session(undefined, 'adult-b').state.recovery).toEqual([]);
    expect(session(undefined, 'adult-a', 'assessment-b').state.recovery).toEqual([]);
    expect(localStorage.length).toBe(1);
  });

  it('batches rapid edits to different indicators', async () => {
    const request = vi.fn().mockResolvedValue(reply(2));
    const draft = session(request);
    draft.record('one', { frequencyValue: 3 });
    draft.record('two', { profundityLevel: 2 });
    await vi.advanceTimersByTimeAsync(2000);
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.responses.map((row: any) => row.indicator_id)).toEqual(['one', 'two']);
    expect(draft.state.pendingCount).toBe(0);
  });

  it('retains newer edits when an older request is acknowledged', async () => {
    let resolve!: (response: Response) => void;
    const request = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; }))
      .mockResolvedValue(reply());
    const draft = session(request);
    draft.record('one', { frequencyValue: 3 });
    const save = draft.save();
    draft.record('one', { frequencyValue: 9 });
    resolve(reply());
    await save;
    expect(draft.state.pendingCount).toBe(1);
    expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!).answers.one.frequencyValue).toBe(9);
    await draft.save();
    expect(JSON.parse(request.mock.calls[1][1].body).responses[0].frequency_value).toBe(9);
    expect(localStorage.length).toBe(0);
  });

  it.each([500, 429])('retries temporary HTTP %s failures without discarding the journal', async status => {
    const request = vi.fn().mockResolvedValueOnce(reply(0, status)).mockResolvedValue(reply());
    const draft = session(request);
    draft.record('one', { frequencyValue: 8 });
    expect(await draft.save()).toBe(false);
    expect(localStorage.length).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(draft.state.pendingCount).toBe(0);
  });

  it('retains answers and stops automatic retries on an authorization error', async () => {
    const request = vi.fn().mockResolvedValue(reply(0, 403));
    const draft = session(request);
    draft.record('one', { frequencyValue: 8 });
    expect(await draft.save()).toBe(false);
    await vi.advanceTimersByTimeAsync(65000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(draft.state.pendingCount).toBe(1);
    expect(localStorage.length).toBe(1);
  });

  it('does not acknowledge a partially saved batch', async () => {
    const draft = session(vi.fn().mockResolvedValue(reply(1)));
    draft.record('one', { frequencyValue: 8 });
    draft.record('two', { frequencyValue: 6 });
    expect(await draft.save()).toBe(false);
    expect(draft.state.pendingCount).toBe(2);
    expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!).answers.two.frequencyValue).toBe(6);
  });

  it('times out a stalled save, preserves it and retries', async () => {
    const request = vi.fn().mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')));
    })).mockResolvedValue(reply());
    const draft = session(request);
    draft.record('one', { frequencyValue: 8 });
    const pending = draft.save();
    await vi.advanceTimersByTimeAsync(15000);
    expect(await pending).toBe(false);
    expect(draft.state.pendingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(draft.state.pendingCount).toBe(0);
  });

  it('keeps a different tab journal after successfully saving this tab', async () => {
    const first = session();
    const second = session();
    first.record('one', { frequencyValue: 2 });
    second.record('two', { frequencyValue: 3 });
    expect(localStorage.length).toBe(2);
    await first.save();
    expect(localStorage.length).toBe(1);
    expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!).answers.two.frequencyValue).toBe(3);
  });

  it('does not erase a source journal advanced by another tab during recovery', async () => {
    const first = session();
    first.record('one', { frequencyValue: 2 });
    const second = session();
    second.recover(second.state.recovery[0].key);
    first.record('one', { frequencyValue: 10 });
    await second.save();
    expect(localStorage.length).toBe(1);
    expect(JSON.parse(localStorage.getItem(localStorage.key(0)!)!).answers.one.frequencyValue).toBe(10);
  });

  it('reports unavailable local storage while still allowing a server save', async () => {
    const draft = new ResponseDraftSession('adult', 'assessment', () => { throw new Error('Quota'); }, vi.fn().mockResolvedValue(reply()));
    sessions.push(draft);
    draft.initialize(['one'], true);
    draft.record('one', { frequencyValue: 8 });
    expect(draft.state.storageError).toBe(true);
    expect(draft.state.pendingCount).toBe(1);
    expect(await draft.save()).toBe(true);
    expect(draft.state.pendingCount).toBe(0);
  });

  it('retains unreadable journals and never offers them as valid answers', () => {
    const first = session();
    first.record('one', { frequencyValue: 2 });
    const key = localStorage.key(0)!;
    localStorage.setItem(key, '{broken');
    const second = session();
    expect(second.state.recovery).toEqual([]);
    expect(second.state.storageError).toBe(true);
    expect(localStorage.getItem(key)).toBe('{broken');
  });
});
