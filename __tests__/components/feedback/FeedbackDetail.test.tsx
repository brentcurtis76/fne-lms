import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'react-hot-toast';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

import FeedbackDetail from '../../../components/feedback/FeedbackDetail';
import { createMockFeedback } from '../../utils/test-utils';

// Mocks
vi.mock('@supabase/auth-helpers-react');
const mockToast = toast as any;
const mockFeedback = createMockFeedback();

describe('FeedbackDetail', () => {
  const mockOnClose = vi.fn();
  const mockOnStatusUpdate = vi.fn();
  const mockOnRefresh = vi.fn();
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const queryBuilderMock = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mockSupabase = {
      from: vi.fn().mockReturnValue(queryBuilderMock),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
      },
      storage: {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://example.com/screenshot.png' } }),
        }),
      },
    };
    (useSupabaseClient as vi.Mock).mockReturnValue(mockSupabase);
  });

  it('does not render when not open', () => {
    render(
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
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByText(/Detalle de Feedback/)).toBeInTheDocument();
  });

  it('displays feedback information', async () => {
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('Test feedback description')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/test')).toBeInTheDocument();
  });

  it('displays correct icon for bug type', async () => {
    const { container } = render(
      <FeedbackDetail
        feedback={{ ...mockFeedback, type: 'bug' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    await screen.findByText(/Detalle de Feedback/);
    const redIcon = container.querySelector('.text-red-500');
    expect(redIcon).toBeInTheDocument();
  });

  it('displays correct icon for idea type', async () => {
    const { container } = render(
      <FeedbackDetail
        feedback={{ ...mockFeedback, type: 'idea' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    await screen.findByText(/Detalle de Feedback/);
    const blueIcon = container.querySelector('.text-blue-500');
    expect(blueIcon).toBeInTheDocument();
  });

  it('displays screenshot when present', async () => {
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByText(/Captura de pantalla/)).toBeInTheDocument();
    const screenshot = screen.getByAltText('Screenshot');
    expect(screenshot).toBeInTheDocument();
    expect(screenshot).toHaveAttribute('src', 'http://example.com/screenshot.png');
  });

  it('does not display screenshot section when not present', async () => {
    const feedbackWithoutScreenshot = { ...mockFeedback, screenshot_url: null };
    render(
      <FeedbackDetail
        feedback={feedbackWithoutScreenshot}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    await screen.findByText(/Detalle de Feedback/);
    expect(screen.queryByText(/Captura de pantalla/)).not.toBeInTheDocument();
  });

  it('displays browser info in collapsible section', async () => {
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByText(/Ver información del navegador/)).toBeInTheDocument();
  });

  it('shows status action buttons based on current status', async () => {
    render(
      <FeedbackDetail
        feedback={{ ...mockFeedback, status: 'new' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByText(/Marcar en progreso/)).toBeInTheDocument();
    expect(screen.getByText(/Marcar como resuelto/)).toBeInTheDocument();
  });

  it('calls onStatusUpdate when status button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackDetail
        feedback={{ ...mockFeedback, status: 'new' }}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    const progressButton = await screen.findByText(/Marcar en progreso/);
    await user.click(progressButton);
    expect(mockOnStatusUpdate).toHaveBeenCalledWith('in_progress');
  });

  it('displays comment input', async () => {
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByPlaceholderText(/Agregar comentario/)).toBeInTheDocument();
  });

  it('can add comments', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );

    const commentInput = await screen.findByPlaceholderText(/Agregar comentario/);
    await user.type(commentInput, 'A new comment');
    expect(commentInput).toHaveValue('A new comment');

    const sendButton = screen.getByTestId('send-comment-button');
    await user.click(sendButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Comentario agregado');
    });

    expect(commentInput).toHaveValue('');
    expect(mockOnRefresh).toHaveBeenCalledTimes(1);
  });

  it('closes modal when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    const closeButton = await screen.findByTestId('close-modal-button');
    await user.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal when overlay is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    const overlay = await screen.findByTestId('modal-overlay');
    await user.click(overlay);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('opens full screenshot modal when screenshot is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    const screenshot = await screen.findByAltText('Screenshot');
    await user.click(screenshot);
    
    const fullScreenshots = await screen.findAllByAltText('Screenshot');
    expect(fullScreenshots).toHaveLength(2);
  });

  it('formats dates correctly', async () => {
    const testDate = '2025-01-23T10:30:00Z';
    const feedbackWithDate = { ...mockFeedback, created_at: testDate };
    render(
      <FeedbackDetail
        feedback={feedbackWithDate}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByText(/23 ene/)).toBeInTheDocument();
  });

  it('shows reference number', async () => {
    render(
      <FeedbackDetail
        feedback={mockFeedback}
        isOpen={true}
        onClose={mockOnClose}
        onStatusUpdate={mockOnStatusUpdate}
        onRefresh={mockOnRefresh}
      />
    );
    expect(await screen.findByText(/#FEEDBACK/)).toBeInTheDocument();
  });
});