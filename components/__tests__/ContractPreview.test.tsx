import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ContractPreview from '../ContractPreview'; // Assuming the component exists at this path
import { generateContractPDF } from '../../lib/pdf/contractGenerator'; // Assuming a utility like this exists

// Mock the PDF generation utility. The actual PDF renderer is already
// mocked in vitest.setup.ts, but we mock the direct utility for easier assertion.
vi.mock('../../lib/pdf/contractGenerator', () => ({
  generateContractPDF: vi.fn(),
}));

const mockContract = {
  id: 'contract-123',
  studentName: 'Ana García',
  courseName: 'Bootcamp de Data Science',
  totalAmount: 600000,
  installments: 12,
  startDate: '2023-03-01',
};

describe('ContractPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the contract details correctly', () => {
    render(<ContractPreview contract={mockContract} />);

    expect(screen.getByText('Vista Previa del Contrato')).toBeInTheDocument();
    expect(screen.getByText(mockContract.studentName)).toBeInTheDocument();
    expect(screen.getByText(mockContract.courseName)).toBeInTheDocument();
    expect(screen.getByText(/600.000/)).toBeInTheDocument(); // Check for formatted amount
    expect(screen.getByText(/12 cuotas/)).toBeInTheDocument();
  });

  it('should generate and download the PDF when the button is clicked', async () => {
    // Mock the utility to simulate a successful PDF generation
    (generateContractPDF as vi.Mock).mockResolvedValue(new Blob(['fake-pdf-content'], { type: 'application/pdf' }));

    render(<ContractPreview contract={mockContract} />);

    const downloadButton = screen.getByRole('button', { name: /Descargar PDF/i });
    fireEvent.click(downloadButton);

    await waitFor(() => {
      // Verify that our PDF generation utility was called with the correct data
      expect(generateContractPDF).toHaveBeenCalledWith(mockContract);
    });
  });

  it('should display an error if contract data is missing', () => {
    // @ts-ignore - Intentionally passing null to test error handling
    render(<ContractPreview contract={null} />);

    expect(screen.getByText(/No se pudo cargar la información del contrato/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descargar PDF/i })).not.toBeInTheDocument();
  });
});