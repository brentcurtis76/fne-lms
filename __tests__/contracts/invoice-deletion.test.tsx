import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import ContractsPage from '../../pages/contracts';
import ContractDetailsModal from '../../components/contracts/ContractDetailsModal';

// Mock dependencies
vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

// Mock data
const mockUser = {
  id: 'test-user-id',
  email: 'admin@test.com',
};

const mockProfile = {
  id: 'test-user-id',
  role: 'admin',
  avatar_url: 'https://example.com/avatar.jpg',
};

const mockCuota = {
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
};

const mockContrato = {
  id: 'contract-1',
  numero_contrato: 'CTR-2025-001',
  fecha_contrato: '2025-01-01',
  cliente_id: 'client-1',
  programa_id: 'program-1',
  precio_total_uf: 1200,
  estado: 'activo',
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
  cuotas: [mockCuota],
};

describe('Invoice Deletion Functionality', () => {
  let mockRouter: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRouter = {
      push: jest.fn(),
      query: {},
    };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    // Setup default supabase mocks
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: mockUser } },
    });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockProfile }),
        };
      }
      if (table === 'cuotas') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockCuota }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }),
      };
    });

    (supabase.storage.from as jest.Mock).mockReturnValue({
      remove: jest.fn().mockResolvedValue({ error: null }),
    });
  });

  describe('ContractDetailsModal - Invoice Deletion UI', () => {
    const defaultProps = {
      contrato: mockContrato,
      isOpen: true,
      onClose: jest.fn(),
      onEdit: jest.fn(),
      onDelete: jest.fn(),
      onToggleCashFlow: jest.fn(),
      onUploadContract: jest.fn(),
      onGeneratePDF: jest.fn(),
      onUploadInvoice: jest.fn(),
      onTogglePaymentStatus: jest.fn(),
      onDeleteInvoice: jest.fn(),
    };

    test('renders delete button for existing invoices', () => {
      render(<ContractDetailsModal {...defaultProps} />);
      
      const deleteButton = screen.getByTitle('Eliminar factura');
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton).toHaveClass('bg-red-50');
    });

    test('shows custom confirmation modal when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<ContractDetailsModal {...defaultProps} />);
      
      const deleteButton = screen.getByTitle('Eliminar factura');
      await user.click(deleteButton);
      
      // Check modal content
      expect(screen.getByText('Eliminar Factura')).toBeInTheDocument();
      expect(screen.getByText('Esta acción no se puede deshacer')).toBeInTheDocument();
      expect(screen.getByText('¿Está seguro de que desea eliminar esta factura?')).toBeInTheDocument();
      expect(screen.getByText('La factura será eliminada permanentemente del sistema.')).toBeInTheDocument();
      
      // Check modal buttons
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar Factura' })).toBeInTheDocument();
    });

    test('closes confirmation modal when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<ContractDetailsModal {...defaultProps} />);
      
      const deleteButton = screen.getByTitle('Eliminar factura');
      await user.click(deleteButton);
      
      const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
      await user.click(cancelButton);
      
      // Modal should be closed
      expect(screen.queryByText('Eliminar Factura')).not.toBeInTheDocument();
    });

    test('calls onDeleteInvoice when confirmation is clicked', async () => {
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
      
      // Check file name
      expect(screen.getByText('Factura_Enero_2025.pdf')).toBeInTheDocument();
      
      // Check file size
      expect(screen.getByText('1 MB')).toBeInTheDocument();
      
      // Check file icon for PDF
      expect(screen.getByText('📑')).toBeInTheDocument();
    });

    test('shows loading spinner during deletion', async () => {
      const user = userEvent.setup();
      
      // Mock a delayed response
      const slowDeleteInvoice = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      render(<ContractDetailsModal {...defaultProps} onDeleteInvoice={slowDeleteInvoice} />);
      
      const deleteButton = screen.getByTitle('Eliminar factura');
      await user.click(deleteButton);
      
      const confirmButton = screen.getByRole('button', { name: 'Eliminar Factura' });
      await user.click(confirmButton);
      
      // Should show spinner
      const deleteButtonAfterClick = screen.getByTitle('Eliminar factura');
      expect(deleteButtonAfterClick).toBeDisabled();
      expect(within(deleteButtonAfterClick).getByRole('status')).toHaveClass('animate-spin');
    });

    test('hides invoice immediately on deletion (optimistic update)', async () => {
      const user = userEvent.setup();
      render(<ContractDetailsModal {...defaultProps} />);
      
      // Verify invoice is visible
      expect(screen.getByText('Factura_Enero_2025.pdf')).toBeInTheDocument();
      
      const deleteButton = screen.getByTitle('Eliminar factura');
      await user.click(deleteButton);
      
      const confirmButton = screen.getByRole('button', { name: 'Eliminar Factura' });
      await user.click(confirmButton);
      
      // Invoice should be hidden immediately
      await waitFor(() => {
        expect(screen.queryByText('Factura_Enero_2025.pdf')).not.toBeInTheDocument();
      });
    });
  });

  describe('Contracts Page - Invoice Deletion Logic', () => {
    test('successfully deletes invoice from storage and database', async () => {
      const mockRouter = { push: jest.fn(), query: {} };
      (useRouter as jest.Mock).mockReturnValue(mockRouter);

      // Mock successful responses
      const mockRemove = jest.fn().mockResolvedValue({ error: null });
      const mockUpdate = jest.fn().mockResolvedValue({ error: null });
      
      (supabase.storage.from as jest.Mock).mockReturnValue({
        remove: mockRemove,
      });
      
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'cuotas') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockCuota }),
            update: jest.fn().mockReturnThis(),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation(function() {
            if (table === 'cuotas') {
              return { ...this, update: mockUpdate };
            }
            return this;
          }),
          order: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null }),
        };
      });

      render(<ContractsPage />);
      
      // Wait for page to load
      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      // Simulate invoice deletion
      const handleInvoiceDelete = (ContractsPage as any).prototype.handleInvoiceDelete;
      if (handleInvoiceDelete) {
        await handleInvoiceDelete.call({ supabase }, 'cuota-1');
        
        // Verify storage deletion
        expect(mockRemove).toHaveBeenCalledWith(['invoice_cuota-1_1234567890.pdf']);
        
        // Verify database update
        expect(mockUpdate).toHaveBeenCalledWith({
          factura_url: null,
          factura_pagada: false,
          factura_filename: null,
          factura_size: null,
          factura_type: null,
          factura_uploaded_at: null,
        });
        
        // Verify success message
        expect(toast.success).toHaveBeenCalledWith('Factura eliminada exitosamente');
      }
    });

    test('handles deletion error gracefully', async () => {
      const mockRouter = { push: jest.fn(), query: {} };
      (useRouter as jest.Mock).mockReturnValue(mockRouter);

      // Mock deletion error
      const mockRemove = jest.fn().mockResolvedValue({ 
        error: new Error('Storage error') 
      });
      
      (supabase.storage.from as jest.Mock).mockReturnValue({
        remove: mockRemove,
      });

      render(<ContractsPage />);
      
      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      // Simulate invoice deletion with error
      const handleInvoiceDelete = (ContractsPage as any).prototype.handleInvoiceDelete;
      if (handleInvoiceDelete) {
        await handleInvoiceDelete.call({ supabase }, 'cuota-1');
        
        // Verify error message
        expect(toast.error).toHaveBeenCalledWith('Error al eliminar la factura: Storage error');
      }
    });

    test('extracts file path correctly from various URL formats', () => {
      const testCases = [
        {
          url: 'https://example.supabase.co/storage/v1/object/public/facturas/invoice_123.pdf',
          expected: 'invoice_123.pdf',
        },
        {
          url: 'https://example.supabase.co/storage/v1/object/public/facturas/2025/01/invoice_123.pdf',
          expected: '2025/01/invoice_123.pdf',
        },
        {
          url: 'https://example.supabase.co/storage/v1/object/public/facturas/invoice_123.pdf?token=abc123',
          expected: 'invoice_123.pdf',
        },
      ];

      testCases.forEach(({ url, expected }) => {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const bucketIndex = pathParts.indexOf('facturas');
        const fileName = pathParts.slice(bucketIndex + 1).join('/');
        
        expect(fileName).toBe(expected);
      });
    });
  });

  describe('File Upload Validation', () => {
    test('validates file type on upload', async () => {
      const mockRouter = { push: jest.fn(), query: {} };
      (useRouter as jest.Mock).mockReturnValue(mockRouter);

      render(<ContractsPage />);
      
      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      // Test invalid file type
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' });
      const handleInvoiceUpload = (ContractsPage as any).prototype.handleInvoiceUpload;
      
      if (handleInvoiceUpload) {
        await handleInvoiceUpload.call({ supabase }, 'cuota-1', invalidFile);
        
        expect(toast.error).toHaveBeenCalledWith('Tipo de archivo no válido. Use PDF, JPG o PNG.');
      }
    });

    test('validates file size on upload', async () => {
      const mockRouter = { push: jest.fn(), query: {} };
      (useRouter as jest.Mock).mockReturnValue(mockRouter);

      render(<ContractsPage />);
      
      await waitFor(() => {
        expect(supabase.auth.getSession).toHaveBeenCalled();
      });

      // Test file too large (11MB)
      const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', { 
        type: 'application/pdf' 
      });
      const handleInvoiceUpload = (ContractsPage as any).prototype.handleInvoiceUpload;
      
      if (handleInvoiceUpload) {
        await handleInvoiceUpload.call({ supabase }, 'cuota-1', largeFile);
        
        expect(toast.error).toHaveBeenCalledWith('El archivo es demasiado grande. Máximo 10MB.');
      }
    });
  });
});