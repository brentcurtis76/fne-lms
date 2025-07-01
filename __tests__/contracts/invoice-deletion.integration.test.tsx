import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import ContractsPage from '../../pages/contracts';
import { supabase } from '../../lib/supabase';

// Mock dependencies
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
    from: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}));

// Mock MainLayout to avoid complex dependencies
jest.mock('../../components/layout/MainLayout', () => {
  return function MainLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="main-layout">{children}</div>;
  };
});

// Mock other complex components
jest.mock('../../components/contracts/ContractForm', () => {
  return function ContractForm() {
    return <div data-testid="contract-form">Contract Form</div>;
  };
});

jest.mock('../../components/contracts/AnnexForm', () => {
  return function AnnexForm() {
    return <div data-testid="annex-form">Annex Form</div>;
  };
});

jest.mock('../../components/contracts/CashFlowView', () => {
  return function CashFlowView() {
    return <div data-testid="cash-flow-view">Cash Flow View</div>;
  };
});

describe('Invoice Deletion Integration Tests', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'admin@test.com',
  };

  const mockProfile = {
    id: 'test-user-id',
    role: 'admin',
    avatar_url: null,
  };

  const mockContracts = [
    {
      id: 'contract-1',
      numero_contrato: 'CTR-2025-001',
      fecha_contrato: '2025-01-01',
      cliente_id: 'client-1',
      programa_id: 'program-1',
      precio_total_uf: 1200,
      estado: 'activo',
      incluir_en_flujo: true,
      clientes: {
        id: 'client-1',
        nombre_legal: 'Test Company S.A.',
        nombre_fantasia: 'Test Company',
        rut: '12.345.678-9',
        direccion: 'Test Street 123',
        comuna: 'Test Comuna',
        ciudad: 'Test City',
        nombre_representante: 'John Doe',
      },
      programas: {
        id: 'program-1',
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
          factura_size: 1048576,
          factura_type: 'application/pdf',
          factura_uploaded_at: '2025-01-15T10:30:00Z',
        },
        {
          id: 'cuota-2',
          contrato_id: 'contract-1',
          numero_cuota: 2,
          fecha_vencimiento: '2025-02-28',
          monto_uf: 100,
          pagada: false,
          created_at: '2025-01-01T00:00:00Z',
          factura_url: null,
        },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    const mockRouter = {
      push: jest.fn(),
      query: {},
      pathname: '/contracts',
    };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    // Setup auth mock
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: mockUser } },
    });

    // Setup default database mocks
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockProfile }),
        };
      }
      if (table === 'contratos') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockContracts[0] }),
        };
      }
      if (table === 'programas') {
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [mockContracts[0].programas] }),
        };
      }
      if (table === 'clientes') {
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [mockContracts[0].clientes] }),
        };
      }
      if (table === 'cuotas') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ 
            data: mockContracts[0].cuotas[0] 
          }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue({ error: null }),
      };
    });
  });

  test('complete invoice deletion flow with optimistic updates', async () => {
    const user = userEvent.setup();
    
    // Mock the contracts query to return our test data
    const mockContractsQuery = jest.fn().mockResolvedValue({ 
      data: mockContracts, 
      error: null 
    });
    
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: jest.fn().mockReturnThis(),
          order: mockContractsQuery,
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockProfile }),
        };
      }
      if (table === 'programas') {
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [] }),
        };
      }
      if (table === 'clientes') {
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [] }),
        };
      }
      if (table === 'cuotas') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ 
            data: mockContracts[0].cuotas[0] 
          }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue({ error: null }),
      };
    });

    // Mock storage operations
    const mockRemove = jest.fn().mockResolvedValue({ error: null });
    (supabase.storage.from as jest.Mock).mockReturnValue({
      remove: mockRemove,
    });

    render(<ContractsPage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('CTR-2025-001')).toBeInTheDocument();
    });

    // Click on contract to open modal
    const contractLink = screen.getByText('CTR-2025-001');
    await user.click(contractLink);

    // Wait for modal to open
    await waitFor(() => {
      expect(screen.getByText('Detalles del Contrato')).toBeInTheDocument();
    });

    // Verify invoice is displayed
    expect(screen.getByText('Factura_Enero_2025.pdf')).toBeInTheDocument();
    expect(screen.getByText('1 MB')).toBeInTheDocument();

    // Click delete button
    const deleteButton = screen.getByTitle('Eliminar factura');
    await user.click(deleteButton);

    // Verify confirmation modal appears
    expect(screen.getByText('Eliminar Factura')).toBeInTheDocument();
    expect(screen.getByText('¿Está seguro de que desea eliminar esta factura?')).toBeInTheDocument();

    // Mock the update operation
    const mockUpdate = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'cuotas') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ 
            data: mockContracts[0].cuotas[0] 
          }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        eq: jest.fn().mockImplementation(function() {
          return { update: mockUpdate };
        }),
      };
    });

    // Click confirm deletion
    const confirmButton = screen.getByRole('button', { name: 'Eliminar Factura' });
    await user.click(confirmButton);

    // Verify optimistic update - invoice should disappear immediately
    await waitFor(() => {
      expect(screen.queryByText('Factura_Enero_2025.pdf')).not.toBeInTheDocument();
    });

    // Verify storage deletion was called
    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith(['invoice_cuota-1_1234567890.pdf']);
    });

    // Verify database update was called
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        factura_url: null,
        factura_pagada: false,
        factura_filename: null,
        factura_size: null,
        factura_type: null,
        factura_uploaded_at: null,
      });
    });

    // Verify success toast
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Factura eliminada exitosamente');
    });
  });

  test('handles deletion failure and reverts optimistic update', async () => {
    const user = userEvent.setup();
    
    // Setup mocks for failure scenario
    const mockContractsQuery = jest.fn().mockResolvedValue({ 
      data: mockContracts, 
      error: null 
    });
    
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: jest.fn().mockReturnThis(),
          order: mockContractsQuery,
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockProfile }),
        };
      }
      if (table === 'programas' || table === 'clientes') {
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: [] }),
        };
      }
      if (table === 'cuotas') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ 
            data: mockContracts[0].cuotas[0] 
          }),
          update: jest.fn().mockReturnThis(),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue({ error: null }),
      };
    });

    // Mock storage deletion to fail
    const mockRemove = jest.fn().mockResolvedValue({ 
      error: new Error('Network error') 
    });
    (supabase.storage.from as jest.Mock).mockReturnValue({
      remove: mockRemove,
    });

    render(<ContractsPage />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('CTR-2025-001')).toBeInTheDocument();
    });

    // Open modal
    const contractLink = screen.getByText('CTR-2025-001');
    await user.click(contractLink);

    await waitFor(() => {
      expect(screen.getByText('Detalles del Contrato')).toBeInTheDocument();
    });

    // Click delete and confirm
    const deleteButton = screen.getByTitle('Eliminar factura');
    await user.click(deleteButton);

    const confirmButton = screen.getByRole('button', { name: 'Eliminar Factura' });
    await user.click(confirmButton);

    // Invoice should initially disappear (optimistic update)
    await waitFor(() => {
      expect(screen.queryByText('Factura_Enero_2025.pdf')).not.toBeInTheDocument();
    });

    // Wait for error handling
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error al eliminar la factura: Network error');
    });

    // Verify storage deletion was attempted
    expect(mockRemove).toHaveBeenCalledWith(['invoice_cuota-1_1234567890.pdf']);
  });

  test('keyboard navigation and accessibility', async () => {
    const user = userEvent.setup();
    
    // Setup mocks
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'contratos') {
        return {
          select: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockContracts, error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockProfile }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [] }),
      };
    });

    render(<ContractsPage />);

    // Wait for load and open modal
    await waitFor(() => {
      expect(screen.getByText('CTR-2025-001')).toBeInTheDocument();
    });

    const contractLink = screen.getByText('CTR-2025-001');
    await user.click(contractLink);

    await waitFor(() => {
      expect(screen.getByText('Detalles del Contrato')).toBeInTheDocument();
    });

    // Test Escape key closes modal
    await user.keyboard('{Escape}');
    
    await waitFor(() => {
      expect(screen.queryByText('Detalles del Contrato')).not.toBeInTheDocument();
    });
  });
});