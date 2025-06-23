import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PasswordResetModal from '../PasswordResetModal';
import { toast } from 'react-hot-toast';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('PasswordResetModal', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockOnPasswordReset = vi.fn();
  const mockOnClose = vi.fn();

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    user: mockUser,
    onPasswordReset: mockOnPasswordReset,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(
      <PasswordResetModal {...defaultProps} isOpen={false} />
    );
    
    expect(screen.queryByText('Restablecer Contraseña')).not.toBeInTheDocument();
  });

  it('should not render when user is null', () => {
    render(
      <PasswordResetModal {...defaultProps} user={null} />
    );
    
    expect(screen.queryByText('Restablecer Contraseña')).not.toBeInTheDocument();
  });

  it('should render correctly when open with user', () => {
    render(<PasswordResetModal {...defaultProps} />);
    
    // Check header exists
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Restablecer Contraseña');
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Importante')).toBeInTheDocument();
    expect(screen.getByText(/El usuario deberá cambiar esta contraseña temporal/)).toBeInTheDocument();
  });

  it('should show error when submitting empty password', async () => {
    const user = userEvent.setup();
    render(<PasswordResetModal {...defaultProps} />);
    
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    await user.click(submitButton);
    
    expect(toast.error).toHaveBeenCalledWith('Por favor ingresa una contraseña temporal');
    expect(mockOnPasswordReset).not.toHaveBeenCalled();
  });

  it('should show error when passwords do not match', async () => {
    const user = userEvent.setup();
    render(<PasswordResetModal {...defaultProps} />);
    
    const tempPasswordInput = screen.getByLabelText('Contraseña Temporal');
    const confirmPasswordInput = screen.getByLabelText('Confirmar Contraseña');
    
    await user.type(tempPasswordInput, 'password123');
    await user.type(confirmPasswordInput, 'password456');
    
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    await user.click(submitButton);
    
    expect(toast.error).toHaveBeenCalledWith('Las contraseñas no coinciden');
    expect(mockOnPasswordReset).not.toHaveBeenCalled();
  });

  it('should show error for password less than 6 characters', async () => {
    const user = userEvent.setup();
    render(<PasswordResetModal {...defaultProps} />);
    
    const tempPasswordInput = screen.getByLabelText('Contraseña Temporal');
    const confirmPasswordInput = screen.getByLabelText('Confirmar Contraseña');
    
    await user.type(tempPasswordInput, 'pass');
    await user.type(confirmPasswordInput, 'pass');
    
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    await user.click(submitButton);
    
    expect(toast.error).toHaveBeenCalledWith('La contraseña debe tener al menos 6 caracteres');
    expect(mockOnPasswordReset).not.toHaveBeenCalled();
  });

  it('should generate random password when button is clicked', async () => {
    const user = userEvent.setup();
    render(<PasswordResetModal {...defaultProps} />);
    
    const generateButton = screen.getByText('Generar contraseña aleatoria');
    await user.click(generateButton);
    
    const tempPasswordInput = screen.getByLabelText('Contraseña Temporal') as HTMLInputElement;
    const confirmPasswordInput = screen.getByLabelText('Confirmar Contraseña') as HTMLInputElement;
    
    expect(tempPasswordInput.value).toHaveLength(12);
    expect(confirmPasswordInput.value).toHaveLength(12);
    expect(tempPasswordInput.value).toEqual(confirmPasswordInput.value);
  });

  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    render(<PasswordResetModal {...defaultProps} />);
    
    const tempPasswordInput = screen.getByLabelText('Contraseña Temporal') as HTMLInputElement;
    const showButton = screen.getByText('Mostrar');
    
    expect(tempPasswordInput.type).toBe('password');
    
    await user.click(showButton);
    expect(tempPasswordInput.type).toBe('text');
    expect(screen.getByText('Ocultar')).toBeInTheDocument();
    
    await user.click(screen.getByText('Ocultar'));
    expect(tempPasswordInput.type).toBe('password');
  });

  it('should successfully reset password with valid inputs', async () => {
    const user = userEvent.setup();
    mockOnPasswordReset.mockResolvedValueOnce(undefined);
    
    render(<PasswordResetModal {...defaultProps} />);
    
    const tempPasswordInput = screen.getByLabelText('Contraseña Temporal');
    const confirmPasswordInput = screen.getByLabelText('Confirmar Contraseña');
    
    await user.type(tempPasswordInput, 'validPassword123');
    await user.type(confirmPasswordInput, 'validPassword123');
    
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockOnPasswordReset).toHaveBeenCalledWith('test-user-id', 'validPassword123');
      expect(toast.success).toHaveBeenCalledWith('Contraseña restablecida correctamente');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should show error when password reset fails', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Network error';
    mockOnPasswordReset.mockRejectedValueOnce(new Error(errorMessage));
    
    render(<PasswordResetModal {...defaultProps} />);
    
    const tempPasswordInput = screen.getByLabelText('Contraseña Temporal');
    const confirmPasswordInput = screen.getByLabelText('Confirmar Contraseña');
    
    await user.type(tempPasswordInput, 'validPassword123');
    await user.type(confirmPasswordInput, 'validPassword123');
    
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error al restablecer la contraseña');
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  it('should disable buttons while resetting', async () => {
    const user = userEvent.setup();
    
    // Create a promise that we can control
    let resolveReset: () => void;
    const resetPromise = new Promise<void>((resolve) => {
      resolveReset = resolve;
    });
    mockOnPasswordReset.mockReturnValueOnce(resetPromise);
    
    render(<PasswordResetModal {...defaultProps} />);
    
    const tempPasswordInput = screen.getByLabelText('Contraseña Temporal');
    const confirmPasswordInput = screen.getByLabelText('Confirmar Contraseña');
    
    await user.type(tempPasswordInput, 'validPassword123');
    await user.type(confirmPasswordInput, 'validPassword123');
    
    const submitButton = screen.getByRole('button', { name: 'Restablecer Contraseña' });
    const cancelButton = screen.getByText('Cancelar');
    
    await user.click(submitButton);
    
    // Check that buttons are disabled and text changed
    expect(screen.getByText('Restableciendo...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
    
    // Resolve the promise
    resolveReset!();
    
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('should close modal when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<PasswordResetModal {...defaultProps} />);
    
    const cancelButton = screen.getByText('Cancelar');
    await user.click(cancelButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close modal when X button is clicked', async () => {
    const user = userEvent.setup();
    render(<PasswordResetModal {...defaultProps} />);
    
    // Find the X button by its parent class
    const closeButton = document.querySelector('.text-gray-400.hover\\:text-gray-500') as HTMLElement;
    await user.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });
});