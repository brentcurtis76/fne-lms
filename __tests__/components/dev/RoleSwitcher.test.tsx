/**
 * Unit tests for RoleSwitcher component
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoleSwitcher from '../../../components/dev/RoleSwitcher';
import { devRoleService } from '../../../lib/services/devRoleService';
import { User } from '@supabase/supabase-js';

// Mock the service
vi.mock('../../../lib/services/devRoleService', () => ({
  devRoleService: {
    getActiveImpersonation: vi.fn(),
    getAvailableRoles: vi.fn(),
    getAvailableSchools: vi.fn(),
    getAvailableGenerations: vi.fn(),
    getAvailableCommunities: vi.fn(),
    startImpersonation: vi.fn(),
    endImpersonation: vi.fn()
  }
}));

describe('RoleSwitcher', () => {
  const mockUser: User = {
    id: 'dev-user-123',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2024-01-01'
  };
  
  const mockRoles = [
    { value: 'admin', label: 'Administrador Global', description: 'Control total' },
    { value: 'consultor', label: 'Consultor FNE', description: 'Instructor' },
    { value: 'equipo_directivo', label: 'Equipo Directivo', description: 'Administración escolar' },
    { value: 'lider_generacion', label: 'Líder de Generación', description: 'Líder Tractor/Innova' },
    { value: 'lider_comunidad', label: 'Líder de Comunidad', description: 'Líder de comunidad' },
    { value: 'docente', label: 'Docente', description: 'Participante' }
  ];
  
  const mockSchools = [
    { id: '1', name: 'Escuela 1' },
    { id: '2', name: 'Escuela 2' }
  ];
  
  const mockGenerations = [
    { id: 'gen-1', name: 'Tractor', school_id: '1' },
    { id: 'gen-2', name: 'Innova', school_id: '1' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(devRoleService.getAvailableRoles).mockReturnValue(mockRoles);
    vi.mocked(devRoleService.getAvailableSchools).mockResolvedValue(mockSchools);
    vi.mocked(devRoleService.getAvailableGenerations).mockResolvedValue(mockGenerations);
    vi.mocked(devRoleService.getAvailableCommunities).mockResolvedValue([]);
    
    // Mock window.confirm
    global.confirm = vi.fn(() => true);
  });

  describe('Initial State', () => {
    it('should render purple dev button when no impersonation active', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      
      render(<RoleSwitcher user={mockUser} />);
      
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /cambiar rol/i });
        expect(button).toBeInTheDocument();
        expect(button).toHaveClass('bg-purple-600');
      });
    });

    it('should render red indicator when impersonation is active', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue({
        id: 'session-123',
        dev_user_id: mockUser.id,
        impersonated_role: 'admin',
        session_token: 'token',
        is_active: true,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        created_at: new Date().toISOString()
      });
      
      render(<RoleSwitcher user={mockUser} />);
      
      await waitFor(() => {
        expect(screen.getByText('Modo Dev Activo')).toBeInTheDocument();
        expect(screen.getByText(/Rol: Administrador Global/)).toBeInTheDocument();
      });
    });
  });

  describe('Modal Interaction', () => {
    it('should open modal when dev button is clicked', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      
      render(<RoleSwitcher user={mockUser} />);
      
      const button = await screen.findByRole('button', { name: /cambiar rol/i });
      await userEvent.click(button);
      
      expect(screen.getByText('Cambiar Rol (Modo Dev)')).toBeInTheDocument();
      expect(screen.getByText('Suplantar un rol para pruebas')).toBeInTheDocument();
    });

    it('should close modal when X button is clicked', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      
      render(<RoleSwitcher user={mockUser} />);
      
      const button = await screen.findByRole('button', { name: /cambiar rol/i });
      await userEvent.click(button);
      
      const closeButton = screen.getByRole('button', { name: '' }); // X button
      await userEvent.click(closeButton);
      
      expect(screen.queryByText('Cambiar Rol (Modo Dev)')).not.toBeInTheDocument();
    });
  });

  describe('Role Selection', () => {
    beforeEach(async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      render(<RoleSwitcher user={mockUser} />);
      
      const button = await screen.findByRole('button', { name: /cambiar rol/i });
      await userEvent.click(button);
    });

    it('should display role options', () => {
      const select = screen.getByLabelText(/rol a suplantar/i);
      expect(select).toBeInTheDocument();
      
      // Check options
      const options = select.querySelectorAll('option');
      expect(options).toHaveLength(mockRoles.length + 1); // +1 for placeholder
    });

    it('should show school selection for consultor role', async () => {
      const select = screen.getByLabelText(/rol a suplantar/i);
      await userEvent.selectOptions(select, 'consultor');
      
      await waitFor(() => {
        expect(screen.getByLabelText(/colegio \(opcional\)/i)).toBeInTheDocument();
      });
    });

    it('should show required fields for lider_generacion', async () => {
      const roleSelect = screen.getByLabelText(/rol a suplantar/i);
      await userEvent.selectOptions(roleSelect, 'lider_generacion');
      
      // Should show school as required - look for the label element specifically
      await waitFor(() => {
        const schoolLabel = screen.getByLabelText(/colegio/i);
        expect(schoolLabel).toBeInTheDocument();
        expect(schoolLabel).toBeRequired();
      });
    });
  });

  describe('Impersonation Actions', () => {
    it('should start impersonation with correct parameters', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      vi.mocked(devRoleService.startImpersonation).mockResolvedValue({
        success: true,
        sessionToken: 'new-token'
      });
      
      render(<RoleSwitcher user={mockUser} />);
      
      const button = await screen.findByRole('button', { name: /cambiar rol/i });
      await userEvent.click(button);
      
      // Select role
      const roleSelect = screen.getByLabelText(/rol a suplantar/i);
      await userEvent.selectOptions(roleSelect, 'admin');
      
      // Click start button
      const startButton = screen.getByRole('button', { name: /iniciar suplantación/i });
      await userEvent.click(startButton);
      
      expect(devRoleService.startImpersonation).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          role: 'admin'
        })
      );
    });

    it('should handle impersonation errors', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      vi.mocked(devRoleService.startImpersonation).mockResolvedValue({
        success: false,
        error: 'No autorizado'
      });
      
      // Mock alert
      global.alert = vi.fn();
      
      render(<RoleSwitcher user={mockUser} />);
      
      const button = await screen.findByRole('button', { name: /cambiar rol/i });
      await userEvent.click(button);
      
      const roleSelect = screen.getByLabelText(/rol a suplantar/i);
      await userEvent.selectOptions(roleSelect, 'admin');
      
      const startButton = screen.getByRole('button', { name: /iniciar suplantación/i });
      await userEvent.click(startButton);
      
      expect(global.alert).toHaveBeenCalledWith('No autorizado');
    });

    it('should end impersonation when X is clicked', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue({
        id: 'session-123',
        dev_user_id: mockUser.id,
        impersonated_role: 'admin',
        session_token: 'token',
        is_active: true,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        created_at: new Date().toISOString()
      });
      
      vi.mocked(devRoleService.endImpersonation).mockResolvedValue({
        success: true
      });
      
      render(<RoleSwitcher user={mockUser} />);
      
      await waitFor(() => {
        expect(screen.getByText('Modo Dev Activo')).toBeInTheDocument();
      });
      
      const endButton = screen.getByRole('button', { name: /terminar suplantación/i });
      await userEvent.click(endButton);
      
      expect(global.confirm).toHaveBeenCalledWith('¿Terminar la suplantación de rol actual?');
      expect(devRoleService.endImpersonation).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('Loading States', () => {
    it('should show loading state when starting impersonation', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      
      // Mock slow response
      vi.mocked(devRoleService.startImpersonation).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      
      render(<RoleSwitcher user={mockUser} />);
      
      const button = await screen.findByRole('button', { name: /cambiar rol/i });
      await userEvent.click(button);
      
      const roleSelect = screen.getByLabelText(/rol a suplantar/i);
      await userEvent.selectOptions(roleSelect, 'admin');
      
      const startButton = screen.getByRole('button', { name: /iniciar suplantación/i });
      await userEvent.click(startButton);
      
      expect(screen.getByText('Iniciando...')).toBeInTheDocument();
      expect(startButton).toBeDisabled();
    });
  });

  describe('Event Handling', () => {
    it('should call onRoleChange when impersonation changes', async () => {
      const onRoleChange = vi.fn();
      
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      vi.mocked(devRoleService.startImpersonation).mockResolvedValue({
        success: true,
        sessionToken: 'token'
      });
      
      await act(async () => {
        render(<RoleSwitcher user={mockUser} onRoleChange={onRoleChange} />);
      });
      
      // Simulate event
      await act(async () => {
        const event = new CustomEvent('dev-impersonation-changed', {
          detail: { role: 'admin' }
        });
        window.dispatchEvent(event);
      });
      
      expect(onRoleChange).toHaveBeenCalledWith({ role: 'admin' });
    });
  });

  describe('Form Validation', () => {
    it('should not submit without selecting a role', async () => {
      vi.mocked(devRoleService.getActiveImpersonation).mockResolvedValue(null);
      
      render(<RoleSwitcher user={mockUser} />);
      
      const button = await screen.findByRole('button', { name: /cambiar rol/i });
      await userEvent.click(button);
      
      const startButton = screen.getByRole('button', { name: /iniciar suplantación/i });
      
      // Button should be disabled without role selection
      expect(startButton).toBeDisabled();
    });
  });
});