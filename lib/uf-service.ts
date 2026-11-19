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

function isPositiveFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * fetch with a 5-second limit: AbortSignal.timeout where the browser has it,
 * otherwise an AbortController whose timer is always cleared.
 */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return fetch(url, { ...init, signal: AbortSignal.timeout(UF_FETCH_TIMEOUT_MS) });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UF_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
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
    const today = new Date().toISOString().split('T')[0];
    const cached = this.cache.get(today);
    
    if (cached) {
      return cached;
    }

    try {
      // Try SII scraping first (most accurate)
      const ufValue = await this.fetchFromSII();
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
      const ufValue = await this.fetchFromPublicAPI();
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
      const ufValue = await this.fetchFromCMF();
      if (ufValue) {
        this.cache.set(today, ufValue);
        this.storeLastLive(ufValue);
        return ufValue;
      }
    } catch (error) {
      console.warn('CMF API failed, using fallback:', error);
    }

    // No source gave a value: the last live value this browser obtained (with
    // its own date), otherwise the fixed one. Neither goes into the cache.
    return this.readLastLive() ?? this.getFallbackUF();
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
  private readLastLive(): UFValue | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(LAST_LIVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.fecha === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha) &&
        isPositiveFinite(parsed.valor)
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
    const currentDate = new Date();
    const targetDate = new Date(futureDate);
    
    // Calculate months difference
    const monthsDiff = (targetDate.getFullYear() - currentDate.getFullYear()) * 12 + 
                      (targetDate.getMonth() - currentDate.getMonth());
    
    // Apply modest monthly growth (2.5% annual = ~0.21% monthly)
    const monthlyGrowthRate = 0.0021;
    const projectedValue = currentUF.valor * Math.pow(1 + monthlyGrowthRate, monthsDiff);
    
    return {
      fecha: futureDate,
      valor: Math.round(projectedValue),
      source: currentUF.source
    };
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
  private async fetchFromCMF(): Promise<UFValue | null> {
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
      
      const data: UFResponse = await response.json();
      const latest = data.UFs[0];
      
      return {
        fecha: latest.Fecha,
        valor: parseFloat(latest.Valor.replace(',', '')),
        source: 'live'
      };
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
      
      const data: UFResponse = await response.json();
      const ufData = data.UFs[0];
      
      return {
        fecha: date,
        valor: parseFloat(ufData.Valor.replace(',', '')),
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
  private async fetchFromSII(): Promise<UFValue | null> {
    try {
      const response = await fetchWithTimeout('/api/uf-value');
      
      if (!response.ok) throw new Error(`SII API error: ${response.status}`);
      
      const data = await response.json();
      
      // Only a real success with a positive finite value counts (N89).
      if (data.success === true && isPositiveFinite(data.valor)) {
        return {
          fecha: data.fecha,
          valor: data.valor,
          source: 'live'
        };
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
  private async fetchFromPublicAPI(): Promise<UFValue | null> {
    try {
      // Try mindicador.cl - free Chilean economic indicators API
      const response = await fetchWithTimeout('https://mindicador.cl/api/uf');
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data = await response.json();
      const latest = data.serie[0]; // Most recent value
      
      return {
        fecha: latest.fecha.split('T')[0], // Convert to YYYY-MM-DD
        valor: Math.round(latest.valor),
        source: 'live'
      };
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
  }
}

export default UFService.getInstance();