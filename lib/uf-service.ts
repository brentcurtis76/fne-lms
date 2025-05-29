// UF (Unidad de Fomento) Service for Chilean contracts
// Fetches official UF values from CMF Chile API

export interface UFValue {
  fecha: string;
  valor: number; // UF value in CLP
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
      // Try CMF API first (requires API key)
      const ufValue = await this.fetchFromCMF();
      if (ufValue) {
        this.cache.set(today, ufValue);
        return ufValue;
      }
    } catch (error) {
      console.warn('CMF API failed, trying fallback:', error);
    }

    // Fallback to SII scraping or alternative sources
    return this.getFallbackUF();
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
      valor: Math.round(projectedValue)
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
      const response = await fetch(
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
        valor: parseFloat(latest.Valor.replace(',', ''))
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
      const response = await fetch(
        `${this.CMF_API_BASE}/uf/${year}/${month}/dias/${day}?apikey=${apiKey}&formato=json`
      );

      if (!response.ok) throw new Error(`CMF API error: ${response.status}`);
      
      const data: UFResponse = await response.json();
      const ufData = data.UFs[0];
      
      return {
        fecha: date,
        valor: parseFloat(ufData.Valor.replace(',', ''))
      };
    } catch (error) {
      console.error(`CMF API fetch failed for date ${date}:`, error);
      return null;
    }
  }

  /**
   * Fallback UF value when API is unavailable
   * Uses approximate current value (updates manually as needed)
   */
  private getFallbackUF(): UFValue {
    const today = new Date().toISOString().split('T')[0];
    
    // Approximate UF value as of late 2024/early 2025
    // This should be updated periodically if API access is unavailable
    return {
      fecha: today,
      valor: 37500 // Approximate current UF value in CLP
    };
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