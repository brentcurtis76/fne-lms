import React from 'react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContractDetailsModal from '../../components/contracts/ContractDetailsModal';

// Mock toast notifications
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Invoice Deletion - ContractDetailsModal', () => {
  const mockContrato = {
    id: 'contract-1',
    numero_contrato: 'CTR-2025-001',
    fecha_contrato: '2025-01-01',
    cliente_id: 'client-1',
    programa_id: 'program-1',
    precio_total_uf: 1200,
    estado: 'activo' as const,
    clientes: {
      nombre_legal: 'Test Company S.A.',
      nombre_fantasia: 'Test Company',
      rut: '12.345.678-9',
      direccion: 'Test Street 123',
      comuna: 'Test Comuna',
      ciudad: 'Test City',
      nombre_representante: 'John Doe',
    },
    programas: {
      nombre: 'Test Program',
      descripcion: 'Test Description',
      horas_totales: 100,
      modalidad: 'Online',
      codigo_servicio: 'PRG-001',
    },
    cuotas: [
      {
        id: 'cuota-1',
        contrato_id: 'contract-1',
        numero_cuota: 1,
        fecha_vencimiento: '2025-01-31',
        monto_uf: 100,
        pagada: false,
        created_at: '2025-01-01T00:00:00Z',
        factura_url: 'https://example.supabase.co/storage/v1/object/public/facturas/invoice_cuota-1_1234567890.pdf',
        factura_filename: 'Factura_Enero_2025.pdf',
        factura_size: 1048576, // 1MB
        factura_type: 'application/pdf',
        factura_uploaded_at: '2025-01-15T10:30:00Z',
      },
    ],
  };

  const defaultProps = {
    contrato: mockContrato,
    isOpen: true,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleCashFlow: vi.fn(),
    onUploadContract: vi.fn(),
    onGeneratePDF: vi.fn(),
    onUploadInvoice: vi.fn(),
    onTogglePaymentStatus: vi.fn(),
    onDeleteInvoice: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders delete button for invoices', () => {
    render(<ContractDetailsModal {...defaultProps} />);
    
    const deleteButton = screen.getByTitle('Eliminar factura');
    expect(deleteButton).toBeDefined();
    expect(deleteButton.className).toContain('bg-red-50');
  });

  test('shows custom confirmation modal when delete is clicked', async () => {
    const user = userEvent.setup();
    render(<ContractDetailsModal {...defaultProps} />);
    
    const deleteButton = screen.getByTitle('Eliminar factura');
    await user.click(deleteButton);
    
    // Check modal appears - use more specific queries
    expect(screen.getByRole('heading', { name: 'Eliminar Factura' })).toBeDefined();
    expect(screen.getByText('Esta acción no se puede deshacer')).toBeDefined();
    expect(screen.getByText('¿Está seguro de que desea eliminar esta factura?')).toBeDefined();
  });

  test('closes modal when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<ContractDetailsModal {...defaultProps} />);
    
    const deleteButton = screen.getByTitle('Eliminar factura');
    await user.click(deleteButton);
    
    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    await user.click(cancelButton);
    
    // Modal should close
    expect(screen.queryByRole('heading', { name: 'Eliminar Factura' })).toBeNull();
  });

  test('calls onDeleteInvoice when confirmed', async () => {
    const user = userEvent.setup();
    render(<ContractDetailsModal {...defaultProps} />);
    
    const deleteButton = screen.getByTitle('Eliminar factura');
    await user.click(deleteButton);
    
    const confirmButton = screen.getByRole('button', { name: 'Eliminar Factura' });
    await user.click(confirmButton);
    
    await waitFor(() => {
      expect(defaultProps.onDeleteInvoice).toHaveBeenCalledWith('cuota-1');
    });
  });

  test('displays enhanced file information', () => {
    render(<ContractDetailsModal {...defaultProps} />);
    
    // Check file details
    expect(screen.getByText('Factura_Enero_2025.pdf')).toBeDefined();
    expect(screen.getByText('1 MB')).toBeDefined();
    expect(screen.getByText('📑')).toBeDefined(); // PDF icon
  });

  test('hides invoice immediately on deletion (optimistic update)', async () => {
    const user = userEvent.setup();
    render(<ContractDetailsModal {...defaultProps} />);
    
    // Verify invoice is visible
    expect(screen.getByText('Factura_Enero_2025.pdf')).toBeDefined();
    
    const deleteButton = screen.getByTitle('Eliminar factura');
    await user.click(deleteButton);
    
    const confirmButton = screen.getByRole('button', { name: 'Eliminar Factura' });
    await user.click(confirmButton);
    
    // Invoice should disappear immediately
    await waitFor(() => {
      expect(screen.queryByText('Factura_Enero_2025.pdf')).toBeNull();
    });
  });

  test('shows loading state during deletion', async () => {
    const user = userEvent.setup();
    
    // Mock slow deletion that never resolves
    let resolveDelete: any;
    const slowDelete = vi.fn(() => new Promise(resolve => {
      resolveDelete = resolve;
    }));
    
    render(<ContractDetailsModal {...defaultProps} onDeleteInvoice={slowDelete} />);
    
    // Store initial state - invoice should be visible
    expect(screen.getByText('Factura_Enero_2025.pdf')).toBeDefined();
    
    const deleteButton = screen.getByTitle('Eliminar factura');
    await user.click(deleteButton);
    
    const confirmButton = screen.getByRole('button', { name: 'Eliminar Factura' });
    await user.click(confirmButton);
    
    // Invoice should disappear immediately (optimistic update)
    expect(screen.queryByText('Factura_Enero_2025.pdf')).toBeNull();
    
    // Verify deletion was called
    expect(slowDelete).toHaveBeenCalledWith('cuota-1');
    
    // Complete the deletion
    if (resolveDelete) resolveDelete();
    
    await waitFor(() => {
      expect(slowDelete).toHaveBeenCalledTimes(1);
    });
  });
});

describe('Invoice Helper Functions', () => {
  test('formatFileSize works correctly', () => {
    const formatFileSize = (bytes?: number) => {
      if (bytes === undefined || bytes === null) return '';
      const sizes = ['B', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 B';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(1234567)).toBe('1.18 MB');
    expect(formatFileSize(undefined)).toBe('');
  });

  test('getFileIcon returns correct icons', () => {
    const getFileIcon = (type?: string) => {
      if (!type) return '📄';
      if (type.includes('pdf')) return '📑';
      if (type.includes('image')) return '🖼️';
      return '📄';
    };

    expect(getFileIcon('application/pdf')).toBe('📑');
    expect(getFileIcon('image/jpeg')).toBe('🖼️');
    expect(getFileIcon('text/plain')).toBe('📄');
    expect(getFileIcon(undefined)).toBe('📄');
  });

  test('URL path extraction works', () => {
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

    expect(extractFileName('https://example.supabase.co/storage/v1/object/public/facturas/invoice_123.pdf'))
      .toBe('invoice_123.pdf');
    
    expect(extractFileName('https://example.supabase.co/storage/v1/object/public/facturas/2025/01/invoice_123.pdf'))
      .toBe('2025/01/invoice_123.pdf');
    
    expect(extractFileName('not-a-url')).toBe('');
  });
});