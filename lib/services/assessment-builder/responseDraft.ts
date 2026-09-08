import type { ResponseData } from '@/components/assessment/types';

export type DraftAnswers = Record<string, ResponseData>;
export interface RecoverableDraft {
  key: string;
  raw: string;
  savedAt: string;
  answers: DraftAnswers;
}
export interface DraftState {
  ready: boolean;
  saving: boolean;
  pendingCount: number;
  recovery: RecoverableDraft[];
  storageError: boolean;
  saveError: string | null;
  lastSavedAt: string | null;
}
const PREFIX = 'fne:assessment-draft:v1:';
const INITIAL: DraftState = {
  ready: false, saving: false, pendingCount: 0, recovery: [],
  storageError: false, saveError: null, lastSavedAt: null,
};

function isAnswer(value: unknown): value is ResponseData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  if (answer.coverageValue != null && typeof answer.coverageValue !== 'boolean') return false;
  for (const field of ['frequencyValue', 'profundityLevel']) {
    if (answer[field] != null && (typeof answer[field] !== 'number' || !Number.isFinite(answer[field]))) return false;
  }
  for (const field of ['rationale', 'evidenceNotes', 'frequencyUnit']) {
    if (answer[field] != null && typeof answer[field] !== 'string') return false;
  }
  return answer.subResponses == null || (typeof answer.subResponses === 'object' && !Array.isArray(answer.subResponses));
}

/** One journal per tab: an acknowledgment in one tab must never erase another tab's work. */
export class ResponseDraftSession {
  state: DraftState = { ...INITIAL };
  private answers: DraftAnswers = {};
  private allowed = new Set<string>();
  private listeners = new Set<(state: DraftState) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private flight?: Promise<boolean>;
  private controller?: AbortController;
  private disposed = false;
  private retryDelay = 5000;
  private recovered?: RecoverableDraft;
  private prefix: string;
  private key: string;

  constructor(
    userId: string,
    private instanceId: string,
    private storage: () => Storage,
    private request: typeof fetch = (input, init) => fetch(input, init),
    tabId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'),
  ) {
    this.prefix = `${PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(instanceId)}:`;
    this.key = `${this.prefix}${tabId}`;
  }

  subscribe(listener: (state: DraftState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private update(patch: Partial<DraftState>) {
    this.state = { ...this.state, ...patch, pendingCount: Object.keys(this.answers).length };
    if (!this.disposed) this.listeners.forEach(listener => listener(this.state));
  }

  initialize(allowedIds: string[], canEdit: boolean) {
    if (this.disposed || this.state.ready) return;
    this.allowed = new Set(allowedIds);
    if (!canEdit) { this.update({ ready: true }); return; }
    const recovery: RecoverableDraft[] = [];
    try {
      const store = this.storage();
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key?.startsWith(this.prefix)) continue;
        const raw = store.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.version !== 1 || typeof parsed.savedAt !== 'string' ||
              !parsed.answers || typeof parsed.answers !== 'object' || Array.isArray(parsed.answers)) {
            throw new Error('Invalid draft');
          }
          const entries = Object.entries(parsed.answers);
          if (!entries.every(([id, value]) => this.allowed.has(id) && isAnswer(value))) {
            throw new Error('Invalid draft answers');
          }
          if (entries.length) recovery.push({ key, raw, savedAt: parsed.savedAt, answers: parsed.answers });
        } catch {
          // Preserve unreadable journals; never silently replace or delete them.
          this.update({ storageError: true });
        }
      }
      recovery.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    } catch { this.update({ storageError: true }); }
    this.update({ ready: true, recovery });
  }

  private persist() {
    try {
      const store = this.storage();
      if (Object.keys(this.answers).length) {
        store.setItem(this.key, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), answers: this.answers }));
      } else {
        store.removeItem(this.key);
      }
      this.update({ storageError: false });
      return true;
    } catch {
      this.update({ storageError: true });
      return false;
    }
  }

  record(indicatorId: string, answer: ResponseData) {
    if (this.disposed || !this.state.ready || this.state.recovery.length || !this.allowed.has(indicatorId)) return;
    // Clone now: later UI mutations must not alter the payload of an in-flight save.
    this.answers = { ...this.answers, [indicatorId]: JSON.parse(JSON.stringify(answer)) };
    this.persist();
    this.update({ saveError: null });
    this.schedule(2000);
  }

  recover(key: string): DraftAnswers | null {
    const draft = this.state.recovery.find(item => item.key === key);
    if (!draft || this.disposed) return null;
    this.answers = JSON.parse(JSON.stringify(draft.answers));
    this.recovered = draft;
    this.persist();
    // Keep unselected journals in storage; the user can recover them on another visit.
    this.update({ recovery: [], saveError: null });
    this.schedule(2000);
    return this.answers;
  }

  discardRecovery() {
    try {
      const store = this.storage();
      for (const draft of this.state.recovery) {
        // An active tab may have advanced this journal since we read it.
        if (store.getItem(draft.key) === draft.raw) store.removeItem(draft.key);
      }
      this.update({ recovery: [] });
    } catch { this.update({ storageError: true }); }
  }

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    if (this.disposed) return;
    this.timer = setTimeout(() => { void this.save(); }, delay);
  }

  async save(): Promise<boolean> {
    if (this.disposed || !this.state.ready || this.state.recovery.length) return false;
    if (this.timer) clearTimeout(this.timer);
    // Wait for older writes, then send only the changes still unacknowledged.
    if (this.flight) { await this.flight; return this.save(); }
    if (!Object.keys(this.answers).length) return true;
    this.flight = this.send();
    try { return await this.flight; } finally { this.flight = undefined; }
  }

  private async send(): Promise<boolean> {
    const sent = { ...this.answers };
    this.update({ saving: true });
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    let retry = true;
    try {
      const response = await this.request(`/api/docente/assessments/${this.instanceId}/responses`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ responses: Object.entries(sent).map(([indicator_id, answer]) => ({
          indicator_id, coverage_value: answer.coverageValue, frequency_value: answer.frequencyValue,
          frequency_unit: answer.frequencyUnit, profundity_level: answer.profundityLevel,
          rationale: answer.rationale, evidence_notes: answer.evidenceNotes, sub_responses: answer.subResponses,
        })) }),
      });
      retry = response.status >= 500 || response.status === 408 || response.status === 429;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar las respuestas.');
      if (data.errors?.length || data.saved !== Object.keys(sent).length) {
        retry = false;
        throw new Error('No se guardaron todas las respuestas. Revisa e intenta nuevamente.');
      }
      if (this.disposed) return false;
      for (const [id, answer] of Object.entries(sent)) {
        if (this.answers[id] === answer) delete this.answers[id];
      }
      this.persist();
      if (!Object.keys(this.answers).length && this.recovered) {
        try {
          const store = this.storage();
          if (store.getItem(this.recovered.key) === this.recovered.raw) store.removeItem(this.recovered.key);
          this.recovered = undefined;
        } catch { this.update({ storageError: true }); }
      }
      this.retryDelay = 5000;
      this.update({ lastSavedAt: new Date().toISOString(), saveError: null });
      if (Object.keys(this.answers).length) this.schedule(2000);
      return true;
    } catch (error) {
      if (this.disposed) return false;
      this.update({ saveError: error instanceof Error && error.name !== 'AbortError'
        ? error.message : 'No se pudo confirmar el guardado. Reintentaremos automáticamente.' });
      if (retry) {
        this.schedule(this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, 60000);
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = undefined;
      this.update({ saving: false });
    }
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.controller?.abort();
    this.listeners.clear();
    // Keep the journal: disposal/navigation is not proof of a server acknowledgment.
  }
}
