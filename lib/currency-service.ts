// Currency conversion service for expense reports
// Supports USD, EUR to CLP conversion

interface ExchangeRates {
  USD: number;
  EUR: number;
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
let ratesCache: { rates: ExchangeRates | null; timestamp: number } = {
  rates: null,
  timestamp: 0
};

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// Fallback exchange rates (updated manually as needed)
const FALLBACK_RATES: ExchangeRates = {
  USD: 950,  // 1 USD ≈ 950 CLP (approximate)
  EUR: 1050, // 1 EUR ≈ 1050 CLP (approximate)
  CLP: 1     // 1 CLP = 1 CLP
};

/**
 * Fetch current exchange rates from external API
 */
async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    // Using a free exchange rate API (you can replace with your preferred service)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/CLP');
    
    if (!response.ok) {
      throw new Error('Exchange rate API error');
    }
    
    const data = await response.json();
    
    // Convert rates to CLP base (1 foreign currency = X CLP)
    const rates: ExchangeRates = {
      USD: 1 / data.rates.USD, // How many CLP for 1 USD
      EUR: 1 / data.rates.EUR, // How many CLP for 1 EUR
      CLP: 1
    };
    
    return rates;
  } catch (error) {
    console.warn('Failed to fetch live exchange rates, using fallback:', error);
    return FALLBACK_RATES;
  }
}

/**
 * Get current exchange rates (with caching)
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  
  // Check if we have cached rates that are still valid
  if (ratesCache.rates && (now - ratesCache.timestamp) < CACHE_DURATION) {
    return ratesCache.rates;
  }
  
  // Fetch fresh rates
  const rates = await fetchExchangeRates();
  
  // Update cache
  ratesCache = {
    rates,
    timestamp: now
  };
  
  return rates;
}

/**
 * Convert amount from any supported currency to CLP
 */
export async function convertToCLP(
  amount: number, 
  fromCurrency: 'USD' | 'EUR' | 'CLP'
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
export function formatCurrency(amount: number, currency: 'USD' | 'EUR' | 'CLP'): string {
  const formatters = {
    USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    CLP: new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 })
  };
  
  return formatters[currency].format(amount);
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: 'USD' | 'EUR' | 'CLP'): string {
  const symbols = {
    USD: '$',
    EUR: '€',
    CLP: '$'
  };
  
  return symbols[currency];
}

/**
 * Get available currencies for expense reporting
 */
export function getAvailableCurrencies() {
  return [
    { code: 'CLP', name: 'Peso Chileno', symbol: '$' },
    { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' }
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
    EUR: 0
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