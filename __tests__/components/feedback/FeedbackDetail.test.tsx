import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { toast } from 'react-hot-toast';
import FeedbackDetail from '../../../components/feedback/FeedbackDetail';
import { renderWithAct, waitForStateUpdate, createMockFeedback, flushPromises } from '../../utils/test-utils';

// Use global vitest mocks from vitest.setup.ts
// No need to re-mock here since the global mock handles it

// Using global toast mock from vitest.setup.ts
const mockToast = toast as any;

const mockFeedback = createMockFeedback();

describe('FeedbackDetail', () => {
  const mockOnClose = jest.fn();
  const mockOnStatusUpdate = jest.fn();
  const mockOnRefresh = jest.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when not open', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={false}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    expect(screen.queryByText(/Detalle de Feedback/)).not.toBeInTheDocument();
  });

  it('renders when open', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    expect(screen.getByText(/Detalle de Feedback/)).toBeInTheDocument();
  });

  it('displays feedback information', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Test feedback description')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/test')).toBeInTheDocument();
  });

  it('displays correct icon for bug type', async () => {
    const { container } = await renderWithAct(
      <FeedbackDetail
        feedback={{ ...mockFeedback, type: 'bug' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    // Look for red icon in the header area
    const redIcon = container.querySelector('.text-red-500');
    expect(redIcon).toBeInTheDocument();
  });

  it('displays correct icon for idea type', async () => {
    const { container } = await renderWithAct(
      <FeedbackDetail
        feedback={{ ...mockFeedback, type: 'idea' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    // Look for blue icon in the header area
    const blueIcon = container.querySelector('.text-blue-500');
    expect(blueIcon).toBeInTheDocument();
  });

  it('displays screenshot when present', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    expect(screen.getByText(/Captura de pantalla/)).toBeInTheDocument();
    const screenshot = screen.getByAltText('Screenshot');
    expect(screenshot).toBeInTheDocument();
    expect(screenshot).toHaveAttribute('src', 'https://example.com/screenshot.jpg');
  });

  it('does not display screenshot section when not present', async () => {
    const feedbackWithoutScreenshot = { ...mockFeedback, screenshot_url: null };
    
    await renderWithAct(
      <FeedbackDetail
        feedback={feedbackWithoutScreenshot}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    expect(screen.queryByText(/Captura de pantalla/)).not.toBeInTheDocument();
  });

  it('displays browser info in collapsible section', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    expect(screen.getByText(/Ver información del navegador/)).toBeInTheDocument();
  });

  it('shows status action buttons based on current status', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={{ ...mockFeedback, status: 'new' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    expect(screen.getByText(/Marcar en progreso/)).toBeInTheDocument();
    expect(screen.getByText(/Marcar como resuelto/)).toBeInTheDocument();
  });

  it('calls onStatusUpdate when status button is clicked', async () => {
    const user = userEvent.setup();
    
    await renderWithAct(
      <FeedbackDetail
        feedback={{ ...mockFeedback, status: 'new' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises(); // Wait for initial render
    
    const progressButton = screen.getByText(/Marcar en progreso/);
    
    await act(async () => {
      await user.click(progressButton);
    });
    
    expect(mockOnStatusUpdate).toHaveBeenCalledWith('in_progress');
  });

  it('displays comment input', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    expect(screen.getByPlaceholderText(/Agregar comentario/)).toBeInTheDocument();
  });

  it('can add comments', async () => {
    const user = userEvent.setup();
    
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises(); // Wait for initial effects
    
    const commentInput = screen.getByPlaceholderText(/Agregar comentario/);
    const sendButton = screen.getByTestId('send-comment-button');
    
    await act(async () => {
      await user.type(commentInput, 'Test comment');
      await flushPromises(); // Ensure state updates
    });
    
    expect(commentInput).toHaveValue('Test comment');
    expect(sendButton).not.toBeDisabled();
    
    await act(async () => {
      await user.click(sendButton);
      await flushPromises(); // Wait for async operations
    });
    
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Comentario agregado');
    }, { timeout: 3000 });
  });

  it('closes modal when close button is clicked', async () => {
    const user = userEvent.setup();
    
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    const closeButton = screen.getByTestId('close-modal-button');
    
    await act(async () => {
      await user.click(closeButton);
    });
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal when overlay is clicked', async () => {
    const user = userEvent.setup();
    
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    const overlay = screen.getByTestId('modal-overlay');
    
    await act(async () => {
      await user.click(overlay);
    });
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('opens full screenshot modal when screenshot is clicked', async () => {
    const user = userEvent.setup();
    
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    const screenshot = screen.getByAltText('Screenshot');
    
    await act(async () => {
      await user.click(screenshot);
    });
    
    // Check for full screenshot modal
    const fullScreenshots = screen.getAllByAltText('Screenshot');
    expect(fullScreenshots).toHaveLength(2); // Original + modal
  });

  it('formats dates correctly', async () => {
    const testDate = '2025-01-23T10:30:00Z';
    const feedbackWithDate = { ...mockFeedback, created_at: testDate };
    
    await renderWithAct(
      <FeedbackDetail
        feedback={feedbackWithDate}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    // Date should be formatted in Spanish locale
    expect(screen.getByText(/23 ene/)).toBeInTheDocument();
  });

  it('shows reference number', async () => {
    await renderWithAct(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    
    await flushPromises();
    
    // Check for the ID display - should show first 8 chars of feedback ID
    expect(screen.getByText(/#FEEDBACK/)).toBeInTheDocument();
  });
});