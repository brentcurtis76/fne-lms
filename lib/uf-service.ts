// UF (Unidad de Fomento) Service for Chilean contracts
// Fetches official UF values from CMF Chile API

/**
 * Where a UF value comes from (N89):
 * - 'live': a value a source gave just now;
 * - 'last-known': the last live value this browser obtained, with ITS date;
 * - 'fixed': the number built into the code, with ITS date.
 */
export type UFSource = 'live' | 'last-known' | 'fixed';

export interface UFValue {
  fecha: string;
  valor: number; // UF value in CLP
  source: UFSource;
}

/**
 * The SII's UF value of 29 May 2025 ($39,184.40 CLP, rounded). Used only when
 * no source and no last-known value exist, and always shown as such, under
 * its own date (never under today's).
 */
const FIXED_UF: Readonly<UFValue> = { fecha: '2025-05-29', valor: 39184, source: 'fixed' };

/** The fixed UF value (see FIXED_UF), for callers that must show something. */
export function getFixedUF(): UFValue {
  return { ...FIXED_UF };
}

/** Every request for the UF gives up after this long (N89). */
const UF_FETCH_TIMEOUT_MS = 5000;

/** Browser storage key of the last live value, as `{ fecha, valor }`. */
const LAST_LIVE_KEY = 'genera.uf.lastLive';

/** A non-live result is answered again for this long without asking the sources (F15d send-back 1). */
const NOT_LIVE_MEMORY_MS = 60_000;

/**
 * The accepted range of a UF value, in CLP (F15d send-back 3). A UF is worth
 * about 39,000 to 40,000 pesos in 2026 and grows a few percent a year, so this
 * range is narrow enough that a number misread by a factor of ten or a
 * thousand (e.g. «39184.4» read the Chilean way as 391,844) can never fall
 * inside it; raise UF_MAX_CLP when the UF approaches it.
 */
const UF_MIN_CLP = 30_000;
const UF_MAX_CLP = 80_000;

/**
 * A usable UF number: finite and between UF_MIN_CLP and UF_MAX_CLP. Anything
 * else (0, a negative, a text, NaN, 5, 391,844, 5,000,000) is not a UF value.
 */
export function isUsableUFNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= UF_MIN_CLP && n <= UF_MAX_CLP;
}

/**
 * A number written the Chilean way: dots are thousands separators, the comma
 * is the decimal separator («39.184,40» → 39184.4, «39.184» → 39184). Any
 * text with anything other than digits, dots and at most one comma, or with
 * no digit, is NaN. Pure.
 */
export function parseChileanNumber(text: string): number {
  if (typeof text !== 'string' || !/^[\d.]*(,[\d.]*)?$/.test(text) || !/\d/.test(text)) return NaN;
  return Number(text.replace(/\./g, '').replace(',', '.'));
}

/** A real calendar date written YYYY-MM-DD (2026-02-30 is not one). */
function isCalendarDate(text: unknown): text is string {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Today's calendar day in Chile (America/Santiago), as YYYY-MM-DD. Read from
 * the time zone's own rules, never by adding hours to UTC.
 */
export function todayInChile(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** A source's answer as a live value, only when its number is usable and its date is today in Chile. */
function liveIfToday(fecha: unknown, valor: unknown, today: string): UFValue | null {
  if (fecha !== today || !isUsableUFNumber(valor)) return null;
  return { fecha: today, valor, source: 'live' };
}

/**
 * Projected UF value for a future date from a known base value: the modest
 * growth the screen has always assumed (2.5% annual = ~0.21% monthly), counted
 * in months from now. Pure arithmetic apart from reading the clock, as before.
 */
export function projectUF(base: UFValue, futureDate: string): UFValue {
  const currentDate = new Date();
  const targetDate = new Date(futureDate);

  // Calculate months difference
  const monthsDiff = (targetDate.getFullYear() - currentDate.getFullYear()) * 12 +
                    (targetDate.getMonth() - currentDate.getMonth());

  // Apply modest monthly growth (2.5% annual = ~0.21% monthly)
  const monthlyGrowthRate = 0.0021;
  const projectedValue = base.valor * Math.pow(1 + monthlyGrowthRate, monthsDiff);

  return {
    fecha: futureDate,
    valor: Math.round(projectedValue),
    source: base.source
  };
}

/**
 * fetch with a 5-second limit that covers fetching AND reading the body:
 * the request carries AbortSignal.timeout where it exists (otherwise an
 * AbortController's signal), and the whole of fetching and reading races a
 * timer of the same length, which is always cleared. Returns the parsed body
 * (only when the answer is ok).
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  read: 'json' | 'text' = 'json'
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(UF_FETCH_TIMEOUT_MS)
      : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`UF request timed out after ${UF_FETCH_TIMEOUT_MS} ms`));
    }, UF_FETCH_TIMEOUT_MS);
  });
  const work = (async () => {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) return { ok: false, status: response.status, body: undefined };
    const body = read === 'json' ? await response.json() : await response.text();
    return { ok: true, status: response.status, body };
  })();
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export interface UFResponse {
  UFs: Array<{
    Fecha: string;
    Valor: string;
  }>;
}

class UFService {
  private static instance: UFService;
  private cache: Map<string, UFValue> = new Map();
  /** The last non-live result and until when it is answered again (ms since epoch). */
  private notLive: { value: UFValue; until: number } | null = null;
  private readonly CMF_API_BASE = 'https://api.cmfchile.cl/api-sbifv3/recursos_api';
  
  static getInstance(): UFService {
    if (!UFService.instance) {
      UFService.instance = new UFService();
    }
    return UFService.instance;
  }

  /**
   * Get current UF value
   */
  async getCurrentUF(): Promise<UFValue> {
    const today = todayInChile(new Date());
    const cached = this.cache.get(today);
    
    if (cached) {
      return cached;
    }

    // A non-live result of the last minute is answered at once, instead of
    // repeating every source's time limit.
    if (this.notLive && Date.now() < this.notLive.until) {
      return { ...this.notLive.value };
    }

    try {
      // Try SII scraping first (most accurate)
      const ufValue = await this.fetchFromSII(today);
      if (ufValue) {
        this.cache.set(today, ufValue);
        this.storeLastLive(ufValue);
        return ufValue;
      }
    } catch (error) {
      console.warn('SII API failed, trying public API:', error);
    }

    try {
      // Try public UF API as backup (no API key required)
      const ufValue = await this.fetchFromPublicAPI(today);
      if (ufValue) {
        this.cache.set(today, ufValue);
        this.storeLastLive(ufValue);
        return ufValue;
      }
    } catch (error) {
      console.warn('Public API failed, trying CMF API:', error);
    }

    try {
      // Try CMF API as last resort (requires API key)
      const ufValue = await this.fetchFromCMF(today);
      if (ufValue) {
        this.cache.set(today, ufValue);
        this.storeLastLive(ufValue);
        return ufValue;
      }
    } catch (error) {
      console.warn('CMF API failed, using fallback:', error);
    }

    // No source gave a value: the last live value this browser obtained (with
    // its own date), otherwise the fixed one. Neither goes into the cache;
    // the result is remembered for a minute only.
    const result = this.readLastLive(today) ?? this.getFallbackUF();
    this.notLive = { value: { ...result }, until: Date.now() + NOT_LIVE_MEMORY_MS };
    return result;
  }

  /** Keep a live value for later days (browser only; never throws). */
  private storeLastLive(value: UFValue): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LAST_LIVE_KEY, JSON.stringify({ fecha: value.fecha, valor: value.valor }));
    } catch {
      // Storage unavailable or full: the value is simply not kept.
    }
  }

  /** The stored last live value, if it is valid (browser only; never throws). */
  private readLastLive(today: string): UFValue | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(LAST_LIVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // A usable number, a real calendar date, and not after today in Chile.
      if (
        parsed &&
        isCalendarDate(parsed.fecha) &&
        parsed.fecha <= today &&
        isUsableUFNumber(parsed.valor)
      ) {
        return { fecha: parsed.fecha, valor: parsed.valor, source: 'last-known' };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get UF value for specific date
   */
  async getUFForDate(date: string): Promise<UFValue> {
    const cached = this.cache.get(date);
    if (cached) return cached;

    try {
      const ufValue = await this.fetchFromCMFByDate(date);
      if (ufValue) {
        this.cache.set(date, ufValue);
        return ufValue;
      }
    } catch (error) {
      console.warn(`Failed to fetch UF for ${date}:`, error);
    }

    // Return current UF as fallback
    return this.getCurrentUF();
  }

  /**
   * Project future UF value based on historical trend
   * UF typically grows 2-4% annually (inflation adjustment)
   */
  async getProjectedUF(futureDate: string): Promise<UFValue> {
    const currentUF = await this.getCurrentUF();
    return projectUF(currentUF, futureDate);
  }

  /**
   * Convert UF amount to CLP
   */
  async convertUFToCLP(ufAmount: number, date?: string): Promise<number> {
    const ufValue = date ? 
      await this.getUFForDate(date) : 
      await this.getCurrentUF();
    
    return Math.round(ufAmount * ufValue.valor);
  }

  /**
   * Convert CLP amount to UF
   */
  async convertCLPToUF(clpAmount: number, date?: string): Promise<number> {
    const ufValue = date ? 
      await this.getUFForDate(date) : 
      await this.getCurrentUF();
    
    return Number((clpAmount / ufValue.valor).toFixed(4));
  }

  /**
   * Fetch from official CMF Chile API
   */
  private async fetchFromCMF(today: string): Promise<UFValue | null> {
    // Note: This requires an API key from CMF Chile
    // For demo purposes, we'll use a mock response
    // In production, you'd need to register at CMF and get an API key
    
    const apiKey = process.env.NEXT_PUBLIC_CMF_API_KEY;
    if (!apiKey) {
      console.warn('CMF API key not configured');
      return null;
    }

    try {
      const response = await fetchWithTimeout(
        `${this.CMF_API_BASE}/uf?apikey=${apiKey}&formato=json`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      if (!response.ok) throw new Error(`CMF API error: ${response.status}`);
      
      const data = response.body as UFResponse;
      const latest = data.UFs[0];
      
      // Live only when the record is today's (Chile) and its number is usable.
      return liveIfToday(latest.Fecha, parseChileanNumber(latest.Valor), today);
    } catch (error) {
      console.error('CMF API fetch failed:', error);
      return null;
    }
  }

  /**
   * Fetch UF for specific date from CMF
   */
  private async fetchFromCMFByDate(date: string): Promise<UFValue | null> {
    const apiKey = process.env.NEXT_PUBLIC_CMF_API_KEY;
    if (!apiKey) return null;

    try {
      const [year, month, day] = date.split('-');
      const response = await fetchWithTimeout(
        `${this.CMF_API_BASE}/uf/${year}/${month}/dias/${day}?apikey=${apiKey}&formato=json`
      );

      if (!response.ok) throw new Error(`CMF API error: ${response.status}`);
      
      const data = response.body as UFResponse;
      const ufData = data.UFs[0];
      
      return {
        fecha: date,
        valor: parseChileanNumber(ufData.Valor),
        source: 'live'
      };
    } catch (error) {
      console.error(`CMF API fetch failed for date ${date}:`, error);
      return null;
    }
  }

  /**
   * Fetch from our SII scraping API (most accurate)
   */
  private async fetchFromSII(today: string): Promise<UFValue | null> {
    try {
      const response = await fetchWithTimeout('/api/uf-value');
      
      if (!response.ok) throw new Error(`SII API error: ${response.status}`);
      
      const data = response.body as { success?: unknown; valor?: unknown; fecha?: unknown };
      
      // Only a real success, dated today (Chile), with a usable number counts.
      const live = data.success === true ? liveIfToday(data.fecha, data.valor, today) : null;
      if (live) {
        return live;
      } else {
        console.warn('SII API returned unsuccessful response:', data);
        return null;
      }
    } catch (error) {
      console.error('SII API fetch failed:', error);
      return null;
    }
  }

  /**
   * Fetch from public UF API (backup)
   */
  private async fetchFromPublicAPI(today: string): Promise<UFValue | null> {
    try {
      // Try mindicador.cl - free Chilean economic indicators API
      const response = await fetchWithTimeout('https://mindicador.cl/api/uf');
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data = response.body as { serie: Array<{ fecha: string; valor: unknown }> };
      const latest = data.serie[0]; // Most recent value
      
      // Its date is an instant: take the Chile calendar day of that instant.
      const instant = new Date(latest.fecha);
      if (Number.isNaN(instant.getTime())) return null;
      // The range is checked on the source's own number; only an accepted
      // value is then rounded, exactly as before.
      if (!isUsableUFNumber(latest.valor)) return null;
      return liveIfToday(todayInChile(instant), Math.round(latest.valor), today);
    } catch (error) {
      console.error('Public API fetch failed:', error);
      return null;
    }
  }

  /**
   * Fixed UF value: the SII's value of 29 May 2025, used only when nothing
   * better exists, and returned under its own date with source 'fixed'.
   */
  private getFallbackUF(): UFValue {
    return { ...FIXED_UF };
  }

  /**
   * Format currency amount based on type
   */
  formatCurrency(amount: number, currency: 'UF' | 'CLP'): string {
    if (currency === 'UF') {
      return `UF ${amount.toLocaleString('es-CL', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 4 
      })}`;
    } else {
      return `$${amount.toLocaleString('es-CL', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 0 
      })}`;
    }
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
    this.notLive = null;
  }
}

export default UFService.getInstance();