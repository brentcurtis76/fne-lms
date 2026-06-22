// Currency conversion service for expense reports
// Supports USD, EUR, GBP to CLP conversion

interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  CLP: number;
}

interface ConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  conversionRate: number;
  conversionDate: string;
}

// Cache for exchange rates (valid for 1 hour)
let ratesCache: { rates: ExchangeRates | null; timestamp: number; live: boolean } = {
  rates: null,
  timestamp: 0,
  live: false
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
// After a transient API failure we serve FALLBACK_RATES, but only briefly — so a
// recovered API is picked up within a minute instead of being pinned for an hour.
const FAILURE_CACHE_DURATION = 60 * 1000; // 1 minute in milliseconds

/** Test-only: clears the module-level rate cache so stubbed fetches stay deterministic. */
export function resetRatesCache(): void {
  ratesCache = { rates: null, timestamp: 0, live: false };
}

/**
 * Converts an upstream "foreign units per 1 CLP" quote into "CLP per 1 foreign",
 * rejecting missing/NaN/non-positive values so a bad rate can never reach storage.
 */
function toClpPerUnit(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const inverted = 1 / raw;
    if (Number.isFinite(inverted) && inverted > 0) return inverted;
  }
  return fallback;
}

// Fallback exchange rates (updated manually as needed)
const FALLBACK_RATES: ExchangeRates = {
  USD: 950,  // 1 USD ≈ 950 CLP (approximate)
  EUR: 1050, // 1 EUR ≈ 1050 CLP (approximate)
  GBP: 1230, // 1 GBP ≈ 1230 CLP (approximate)
  CLP: 1     // 1 CLP = 1 CLP
};

/**
 * Fetch current exchange rates from external API
 */
async function fetchExchangeRates(): Promise<{ rates: ExchangeRates; live: boolean }> {
  try {
    // Using a free exchange rate API (you can replace with your preferred service)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/CLP');

    if (!response.ok) {
      throw new Error('Exchange rate API error');
    }

    const data = await response.json();
    const apiRates = data?.rates ?? {};

    // Convert rates to CLP base (1 foreign currency = X CLP). Each quote is
    // validated; a missing/NaN/non-positive value falls back per-currency so a
    // malformed payload can never produce a NaN amount downstream.
    const rates: ExchangeRates = {
      USD: toClpPerUnit(apiRates.USD, FALLBACK_RATES.USD), // How many CLP for 1 USD
      EUR: toClpPerUnit(apiRates.EUR, FALLBACK_RATES.EUR), // How many CLP for 1 EUR
      GBP: toClpPerUnit(apiRates.GBP, FALLBACK_RATES.GBP), // How many CLP for 1 GBP
      CLP: 1
    };

    // "live" only if EVERY required rate was a real quote. A 200 with a missing
    // or invalid rate is a partial fallback and must use the short failure TTL,
    // not be pinned for the full hour.
    const isValid = (raw: unknown) => typeof raw === 'number' && Number.isFinite(raw) && raw > 0;
    const live = isValid(apiRates.USD) && isValid(apiRates.EUR) && isValid(apiRates.GBP);

    return { rates, live };
  } catch (error) {
    console.warn('Failed to fetch live exchange rates, using fallback:', error);
    return { rates: FALLBACK_RATES, live: false };
  }
}

/**
 * Get current exchange rates (with caching)
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();

  // A live result is cached for the full hour; a fallback (from a failed fetch)
  // only for a short window, so a recovered API is picked up quickly.
  const ttl = ratesCache.live ? CACHE_DURATION : FAILURE_CACHE_DURATION;
  if (ratesCache.rates && (now - ratesCache.timestamp) < ttl) {
    return ratesCache.rates;
  }

  // Fetch fresh rates
  const { rates, live } = await fetchExchangeRates();

  // Update cache
  ratesCache = { rates, timestamp: now, live };

  return rates;
}

/**
 * Convert amount from any supported currency to CLP
 */
export async function convertToCLP(
  amount: number,
  fromCurrency: 'USD' | 'EUR' | 'GBP' | 'CLP'
): Promise<ConversionResult> {
  if (fromCurrency === 'CLP') {
    return {
      originalAmount: amount,
      originalCurrency: 'CLP',
      convertedAmount: amount,
      conversionRate: 1,
      conversionDate: new Date().toISOString().split('T')[0]
    };
  }
  
  const rates = await getExchangeRates();
  const conversionRate = rates[fromCurrency];
  const convertedAmount = Math.round(amount * conversionRate);
  
  return {
    originalAmount: amount,
    originalCurrency: fromCurrency,
    convertedAmount,
    conversionRate,
    conversionDate: new Date().toISOString().split('T')[0]
  };
}

/**
 * Format currency amount with proper symbol and decimal places
 */
export function formatCurrency(amount: number, currency: string): string {
  const formatters: Record<string, Intl.NumberFormat> = {
    USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
    CLP: new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 })
  };

  // hasOwnProperty guard: expense_items.currency is free-form text, and a value
  // like "constructor"/"__proto__" would otherwise resolve to an inherited
  // prototype member and throw on .format().
  const formatter = Object.prototype.hasOwnProperty.call(formatters, currency) ? formatters[currency] : undefined;
  // never throw on a non-canonical code.
  if (!formatter) return `${amount.toLocaleString('es-CL')} ${currency}`;
  return formatter.format(amount);
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CLP: '$'
  };

  // hasOwnProperty guard so prototype keys ("constructor", "__proto__") don't
  // return an inherited member instead of the "$" fallback.
  return Object.prototype.hasOwnProperty.call(symbols, currency) ? symbols[currency] : '$';
}

/**
 * Get available currencies for expense reporting
 */
export function getAvailableCurrencies() {
  return [
    { code: 'CLP', name: 'Peso Chileno', symbol: '$' },
    { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'GBP', name: 'Libra Esterlina', symbol: '£' }
  ] as const;
}

/**
 * Calculate total amounts in different currencies
 */
export function calculateMultiCurrencyTotal(expenses: Array<{
  amount: number;
  currency: string;
  original_amount?: number;
}>) {
  const totals = {
    CLP: 0,
    USD: 0,
    EUR: 0,
    GBP: 0
  };
  
  expenses.forEach(expense => {
    // Add CLP equivalent to CLP total
    totals.CLP += expense.amount;
    
    // Add original amount to respective currency total
    if (expense.currency && expense.original_amount) {
      const currency = expense.currency as keyof typeof totals;
      if (totals[currency] !== undefined) {
        totals[currency] += expense.original_amount;
      }
    }
  });
  
  return totals;
}