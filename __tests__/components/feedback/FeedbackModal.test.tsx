import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { toast } from 'react-hot-toast';
import FeedbackModal from '../../../components/feedback/FeedbackModal';

import { renderWithAct, flushPromises, createMockFile } from '../../utils/test-utils';

// Mock @supabase/auth-helpers-react
vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: vi.fn(),
  useSession: vi.fn(() => ({
    user: { id: 'test-user', email: 'test@example.com' }
  })),
  useUser: vi.fn(() => ({
    id: 'test-user',
    email: 'test@example.com'
  }))
}));

// Import after mocking
import { useSupabaseClient } from '@supabase/auth-helpers-react';

// Using global vitest mocks from vitest.setup.ts
const mockToast = toast as any;

describe('FeedbackModal', () => {
  const mockOnClose = vi.fn();
  
  // Default mock supabase client
  const mockSupabaseClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user', email: 'test@example.com' } },
        error: null
      })
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'platform_feedback') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'test-feedback-id' },
                error: null
              })
            })
          })
        };
      } else if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { first_name: 'Test', last_name: 'User', email: 'test@example.com' },
                error: null
              })
            })
          })
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null })
        })
      };
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path.jpg' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/image.jpg' } })
      })
    }
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set default mock for useSupabaseClient
    vi.mocked(useSupabaseClient).mockReturnValue(mockSupabaseClient as any);
    
    // Mock the fetch API for admin notifications
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, notificationsCreated: 1 }),
    } as Response);
  });

  it('does not render when closed', async () => {
    await renderWithAct(<FeedbackModal isOpen={false} onClose={mockOnClose} />);
    expect(screen.queryByText(/¿Qué sucedió?/)).not.toBeInTheDocument();
  });

  it('renders when open', async () => {
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText(/¿Qué sucedió?/)).toBeInTheDocument();
  });

  it('has description textarea', async () => {
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    const textarea = screen.getByPlaceholderText(/El botón no funciona cuando/);
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('has type selector buttons', async () => {
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByRole('button', { name: /problema/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /idea/i })).toBeInTheDocument();
  });

  it('has screenshot upload area', async () => {
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    expect(screen.getByText(/Adjuntar captura/)).toBeInTheDocument();
    expect(screen.getByText(/Arrastra una imagen/)).toBeInTheDocument();
  });

  it('updates type when buttons are clicked', async () => {
    const user = userEvent.setup();
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    const bugButton = screen.getByRole('button', { name: /problema/i });
    const ideaButton = screen.getByRole('button', { name: /idea/i });
    
    // Initially feedback type should be default
    expect(bugButton).not.toHaveClass('bg-red-50');
    
    // Click bug button
    await act(async () => {
      await user.click(bugButton);
      await flushPromises();
    });
    expect(bugButton).toHaveClass('bg-red-50');
    
    // Click idea button
    await act(async () => {
      await user.click(ideaButton);
      await flushPromises();
    });
    expect(ideaButton).toHaveClass('bg-blue-50');
    expect(bugButton).not.toHaveClass('bg-red-50');
  });

  it('updates description when typing', async () => {
    const user = userEvent.setup();
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    const textarea = screen.getByPlaceholderText(/El botón no funciona cuando/);
    
    await act(async () => {
      await user.type(textarea, 'Test description');
      await flushPromises();
    });
    
    expect(textarea).toHaveValue('Test description');
  });

  it('shows error when submitting empty description', async () => {
    const user = userEvent.setup();
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    // Submit button should be disabled when no description
    const submitButton = screen.getByRole('button', { name: /enviar/i });
    expect(submitButton).toBeDisabled();
    
    // Type something then clear it to trigger validation
    const textarea = screen.getByPlaceholderText(/El botón no funciona cuando/);
    await act(async () => {
      await user.type(textarea, 'test');
      await user.clear(textarea);
      await flushPromises();
    });
    
    // Try to click submit (though it should be disabled)
    expect(submitButton).toBeDisabled();
  });

  it('handles file selection', async () => {
    const { container } = await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    const file = createMockFile('test.jpg', 1024, 'image/jpeg');
    
    // Find the file input - it's hidden inside the upload div
    const fileInput = container.querySelector('input[type="file"]');
    
    expect(fileInput).toBeInTheDocument();
    
    if (fileInput) {
      await act(async () => {
        // Trigger the FileReader mock
        fireEvent.change(fileInput, { target: { files: [file] } });
        // Allow FileReader onload to execute and state to update
        await flushPromises();
        await new Promise(resolve => setTimeout(resolve, 50));
      });
    }
    
    // Should show file preview - look for the preview image
    await waitFor(() => {
      const previewImage = screen.queryByAltText('Preview');
      expect(previewImage).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('rejects files larger than 5MB', async () => {
    const { container } = await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    // Create a file larger than 5MB  
    const largeFile = createMockFile('large.jpg', 6 * 1024 * 1024, 'image/jpeg');
    
    // Find the file input using container query
    const fileInput = container.querySelector('input[type="file"]');
    
    expect(fileInput).toBeInTheDocument();
    
    if (fileInput) {
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [largeFile] } });
        await flushPromises();
      });
    }
    
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('La imagen no puede superar 5MB');
    }, { timeout: 1000 });
  });

  it('closes modal when close button is clicked', async () => {
    const user = userEvent.setup();
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    // Find the X close button in the header
    const modalHeader = screen.getByText(/¿Qué sucedió?/).closest('div');
    const closeButton = modalHeader?.querySelector('button');
    
    expect(closeButton).toBeInTheDocument();
    
    if (closeButton) {
      await act(async () => {
        await user.click(closeButton);
        await flushPromises();
      });
      
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('closes modal when cancel button is clicked', async () => {
    const user = userEvent.setup();
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancelar/i });
    
    await act(async () => {
      await user.click(cancelButton);
      await flushPromises();
    });
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('disables submit button when submitting', async () => {
    const user = userEvent.setup();
    
    // Create a mock supabase client for this test
    const mockSupabaseClient = {
      auth: {
        getUser: vi.fn().mockImplementation(() => 
          new Promise(resolve => {
            setTimeout(() => {
              resolve({
                data: { user: { id: 'test-user', email: 'test@example.com' } },
                error: null
              });
            }, 200); // 200ms delay to catch loading state
          })
        )
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'platform_feedback') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'test-feedback-id' },
                  error: null
                })
              })
            })
          };
        } else if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { first_name: 'Test', last_name: 'User', email: 'test@example.com' },
                  error: null
                })
              })
            })
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        };
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'test/path.jpg' }, error: null }),
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/image.jpg' } })
        })
      }
    };
    
    // Override the useSupabaseClient mock for this test
    vi.mocked(useSupabaseClient).mockReturnValue(mockSupabaseClient as any);
    
    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);
    
    const textarea = screen.getByPlaceholderText(/El botón no funciona cuando/);
    const submitButton = screen.getByRole('button', { name: /enviar/i });
    
    await act(async () => {
      await user.type(textarea, 'Test feedback');
      await flushPromises();
    });
    
    expect(submitButton).not.toBeDisabled();
    
    // Click submit (don't await - we want to check immediate state)
    user.click(submitButton);
    
    // Wait a brief moment for the click to register
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    
    // Should be disabled during submission
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveTextContent('Enviando...');
  });

  it('shows success state after successful submission', async () => {
    const user = userEvent.setup();

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-feedback-123' },
          error: null,
        }),
      }),
    });

    const mockSupabaseClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'test-user', email: 'test@example.com' } },
          error: null,
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'platform_feedback') {
          return { insert: mockInsert };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
        };
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'test/path.jpg' }, error: null }),
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/image.jpg' } }),
        }),
      },
    };

    vi.mocked(useSupabaseClient).mockReturnValue(mockSupabaseClient as any);

    await renderWithAct(<FeedbackModal isOpen={true} onClose={mockOnClose} />);

    const textarea = screen.getByPlaceholderText(/El botón no funciona cuando/);
    const submitButton = screen.getByRole('button', { name: /enviar/i });

    await act(async () => {
      await user.type(textarea, 'Test feedback');
      await flushPromises();
    });

    await act(async () => {
      await user.click(submitButton);
      await flushPromises();
    });

    await waitFor(() => {
      expect(screen.getByText(/¡Gracias!/)).toBeInTheDocument();
      expect(screen.getByText(/Tu reporte fue enviado/)).toBeInTheDocument();
    });

    expect(mockInsert).toHaveBeenCalled();
  });
});