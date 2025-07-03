import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/router';
import NotificationsPage from '../pages/notifications';
import { supabase } from '../lib/supabase';

// Mock Next.js router
vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

// Mock components
vi.mock('../components/layout/MainLayout', () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="main-layout">{children}</div>,
}));

vi.mock('../components/notifications/NotificationDeleteModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, onConfirm, count }: any) => 
    isOpen ? <div data-testid="delete-modal">Delete {count} notifications?</div> : null,
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock Supabase - need to define the mock inline due to vitest hoisting
vi.mock('../lib/supabase', () => {
  const mockSupabase = {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  };
  
  return {
    supabase: mockSupabase,
  };
});

describe('Notifications Page', () => {
  let mockRouter: any;
  const mockSupabase = supabase as any;

  beforeEach(() => {
    mockRouter = {
      push: vi.fn(),
      query: {},
    };
    vi.mocked(useRouter).mockReturnValue(mockRouter);

    // Reset the mock for each test
    vi.clearAllMocks();
    
    // Default successful auth
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-123' }
        }
      }
    });

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { role: 'docente', avatar_url: null },
                error: null,
              }),
            })),
          })),
        };
      } else if (table === 'user_notifications') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: [],
                error: null,
              })),
            })),
          })),
          update: vi.fn(),
          delete: vi.fn(),
        };
      }
    });
  });

  it('should render the notifications page', async () => {
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('Todas las Notificaciones')).toBeInTheDocument();
    });
  });

  it('should show filters when filter button is clicked', async () => {
    render(<NotificationsPage />);

    await waitFor(() => {
      const filterButton = screen.getByTitle('Filtros');
      fireEvent.click(filterButton);
    });

    expect(screen.getByPlaceholderText('Buscar notificaciones...')).toBeInTheDocument();
    expect(screen.getByText('Todas las categorías')).toBeInTheDocument();
  });

  it('should show empty state when no notifications', async () => {
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText('No hay notificaciones')).toBeInTheDocument();
      expect(screen.getByText('No tienes notificaciones en este momento')).toBeInTheDocument();
    });
  });

  it('should handle authentication redirect', async () => {
    // Override the default auth mock for this test
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null }
    });

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/login');
    });
  });

  it('should show notification count in header', async () => {
    // Mock notifications data
    const mockNotifications = [
      {
        id: '1',
        title: 'Test Notification',
        description: 'Test description',
        is_read: false,
        created_at: new Date().toISOString(),
        notification_type: { category: 'system' }
      },
      {
        id: '2',
        title: 'Another Notification',
        description: 'Another description',
        is_read: true,
        created_at: new Date().toISOString(),
        notification_type: { category: 'assignments' }
      }
    ];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { role: 'docente', avatar_url: null },
                error: null,
              }),
            })),
          })),
        };
      } else if (table === 'user_notifications') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: mockNotifications,
                error: null,
              })),
            })),
          })),
        };
      }
    });

    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText(/2 notificación\(es\)/)).toBeInTheDocument();
      expect(screen.getByText(/1 sin leer/)).toBeInTheDocument();
    });
  });
});