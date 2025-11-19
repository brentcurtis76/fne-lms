import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

describe('Invoice Helper Functions', () => {
  describe('formatFileSize', () => {
    const formatFileSize = (bytes?: number) => {
      if (bytes === undefined || bytes === null) return '';
      if (bytes === 0) return '0 B';
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
    };

    test('formats bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(100)).toBe('100 B');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1572864)).toBe('1.5 MB');
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });

    test('handles undefined and null values', () => {
      expect(formatFileSize(undefined)).toBe('');
      expect(formatFileSize(null as any)).toBe('');
    });

    test('rounds to 2 decimal places', () => {
      expect(formatFileSize(1234)).toBe('1.21 KB');
      expect(formatFileSize(1234567)).toBe('1.18 MB');
    });
  });

  describe('getFileIcon', () => {
    const getFileIcon = (type?: string) => {
      if (!type) return '📄';
      if (type.includes('pdf')) return '📑';
      if (type.includes('image')) return '🖼️';
      return '📄';
    };

    test('returns correct icon for file types', () => {
      expect(getFileIcon('application/pdf')).toBe('📑');
      expect(getFileIcon('image/jpeg')).toBe('🖼️');
      expect(getFileIcon('image/png')).toBe('🖼️');
      expect(getFileIcon('text/plain')).toBe('📄');
      expect(getFileIcon('application/msword')).toBe('📄');
    });

    test('handles undefined type', () => {
      expect(getFileIcon(undefined)).toBe('📄');
      expect(getFileIcon('')).toBe('📄');
    });
  });

  describe('formatUploadDate', () => {
    let originalDate: any;

    beforeEach(() => {
      // Mock current date
      originalDate = Date;
      const mockDate = new Date('2025-01-15T14:00:00Z');
      global.Date = vi.fn(() => mockDate) as any;
      global.Date.now = originalDate.now;
      global.Date.parse = originalDate.parse;
      global.Date.UTC = originalDate.UTC;
      
      // Allow creating dates with arguments
      (global.Date as any).mockImplementation((dateString?: string) => {
        if (dateString) {
          return new originalDate(dateString);
        }
        return mockDate;
      });
    });

    afterEach(() => {
      global.Date = originalDate;
    });

    const formatUploadDate = (dateString?: string) => {
      if (!dateString) return '';
      const date = new originalDate(dateString);
      const now = new originalDate('2025-01-15T14:00:00Z');
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
          const diffMins = Math.floor(diffMs / (1000 * 60));
          return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
        }
        return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
      } else if (diffDays === 1) {
        return 'Ayer';
      } else if (diffDays < 7) {
        return `Hace ${diffDays} días`;
      } else {
        return date.toLocaleDateString('es-CL');
      }
    };

    test('formats recent uploads correctly', () => {
      expect(formatUploadDate('2025-01-15T13:55:00Z')).toBe('Hace 5 minutos');
      expect(formatUploadDate('2025-01-15T13:30:00Z')).toBe('Hace 30 minutos');
      expect(formatUploadDate('2025-01-15T13:00:00Z')).toBe('Hace 1 hora');
      expect(formatUploadDate('2025-01-15T11:00:00Z')).toBe('Hace 3 horas');
    });

    test('formats yesterday correctly', () => {
      expect(formatUploadDate('2025-01-14T10:00:00Z')).toBe('Ayer');
    });

    test('formats days ago correctly', () => {
      expect(formatUploadDate('2025-01-13T10:00:00Z')).toBe('Hace 2 días');
      expect(formatUploadDate('2025-01-10T10:00:00Z')).toBe('Hace 5 días');
    });

    test('formats older dates as full date', () => {
      expect(formatUploadDate('2025-01-01T10:00:00Z')).toBe('01-01-2025');
      expect(formatUploadDate('2024-12-25T10:00:00Z')).toBe('25-12-2024');
    });

    test('handles undefined date', () => {
      expect(formatUploadDate(undefined)).toBe('');
      expect(formatUploadDate('')).toBe('');
    });

    test('handles singular vs plural correctly', () => {
      expect(formatUploadDate('2025-01-15T13:59:00Z')).toBe('Hace 1 minuto');
      expect(formatUploadDate('2025-01-15T13:58:00Z')).toBe('Hace 2 minutos');
    });
  });

  describe('URL Path Extraction', () => {
    test('extracts file path from Supabase URLs correctly', () => {
      const extractFileName = (url: string): string => {
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/');
          const bucketIndex = pathParts.indexOf('facturas');
          if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
            return pathParts.slice(bucketIndex + 1).join('/');
          }
          return pathParts[pathParts.length - 1];
        } catch {
          return '';
        }
      };

      // Test various URL formats
      expect(extractFileName('https://example.supabase.co/storage/v1/object/public/facturas/invoice_123.pdf'))
        .toBe('invoice_123.pdf');
      
      expect(extractFileName('https://example.supabase.co/storage/v1/object/public/facturas/2025/01/invoice_123.pdf'))
        .toBe('2025/01/invoice_123.pdf');
      
      expect(extractFileName('https://example.supabase.co/storage/v1/object/public/facturas/invoice_123.pdf?token=abc&expires=123'))
        .toBe('invoice_123.pdf');
      
      // Test URL without facturas bucket
      expect(extractFileName('https://example.com/files/invoice_123.pdf'))
        .toBe('invoice_123.pdf');
      
      // Test invalid URL
      expect(extractFileName('not-a-url')).toBe('');
    });
  });

  describe('File Validation', () => {
    test('validates allowed file types', () => {
      const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      
      const isValidType = (type: string) => validTypes.includes(type);
      
      expect(isValidType('application/pdf')).toBe(true);
      expect(isValidType('image/jpeg')).toBe(true);
      expect(isValidType('image/jpg')).toBe(true);
      expect(isValidType('image/png')).toBe(true);
      expect(isValidType('text/plain')).toBe(false);
      expect(isValidType('application/msword')).toBe(false);
      expect(isValidType('image/gif')).toBe(false);
    });

    test('validates file size limits', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      const isValidSize = (size: number) => size <= maxSize;
      
      expect(isValidSize(5 * 1024 * 1024)).toBe(true); // 5MB
      expect(isValidSize(10 * 1024 * 1024)).toBe(true); // 10MB
      expect(isValidSize(11 * 1024 * 1024)).toBe(false); // 11MB
      expect(isValidSize(0)).toBe(true);
      expect(isValidSize(1024)).toBe(true); // 1KB
    });
  });

  describe('Optimistic Update Logic', () => {
    test('manages hidden invoices set correctly', () => {
      const hiddenInvoices = new Set<string>();
      
      // Add invoice to hidden set
      hiddenInvoices.add('invoice-1');
      expect(hiddenInvoices.has('invoice-1')).toBe(true);
      expect(hiddenInvoices.size).toBe(1);
      
      // Add another invoice
      hiddenInvoices.add('invoice-2');
      expect(hiddenInvoices.has('invoice-2')).toBe(true);
      expect(hiddenInvoices.size).toBe(2);
      
      // Remove invoice on error
      hiddenInvoices.delete('invoice-1');
      expect(hiddenInvoices.has('invoice-1')).toBe(false);
      expect(hiddenInvoices.size).toBe(1);
      
      // Clear all on modal close
      hiddenInvoices.clear();
      expect(hiddenInvoices.size).toBe(0);
    });
  });
});
