import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { useRouter } from 'next/router';
import { vi } from 'vitest';
import FeedbackDashboard from '../../../pages/admin/feedback';
import { renderWithAct, flushPromises, createMockFeedback } from '../../utils/test-utils';
import { supabase } from '../../../lib/supabase';

// Using global vitest mocks from vitest.setup.ts

vi.mock('../../../components/layout/MainLayout', () => ({
  default: function MockMainLayout({ children, pageTitle }: { children: React.ReactNode, pageTitle?: string }) {
    return (
      <div data-testid="main-layout">
        {pageTitle && <h1>{pageTitle}</h1>}
        {children}
      </div>
    );
  }
}));

vi.mock('../../../components/feedback/FeedbackDetail', () => ({
  default: function MockFeedbackDetail({ isOpen, onClose }: any) {
    return isOpen ? <div data-testid="feedback-detail" onClick={onClose}>Mock Detail</div> : null;
  }
}));

const mockRouter = {
  push: vi.fn(),
  pathname: '/admin/feedback'
};

const mockFeedbackList = [
  {
    id: 'feedback-1',
    title: null,
    description: 'Test bug report',
    type: 'bug',
    status: 'new',
    page_url: 'https://example.com',
    screenshot_url: 'https://example.com/screenshot.jpg',
    created_at: '2025-01-23T10:00:00Z',
    created_by: 'user-1',
    resolved_at: null,
    resolution_notes: null,
    profiles: {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com'
    },
    _count: {
      feedback_activity: 2
    }
  },
  {
    id: 'feedback-2',
    title: null,
    description: 'Feature request',
    type: 'idea',
    status: 'in_progress',
    page_url: 'https://example.com/feature',
    screenshot_url: null,
    created_at: '2025-01-22T15:30:00Z',
    created_by: 'user-2',
    resolved_at: null,
    resolution_notes: null,
    profiles: {
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane@example.com'
    },
    _count: {
      feedback_activity: 0
    }
  }
];

const mockStats = {
  new_count: 1,
  seen_count: 0,
  in_progress_count: 1,
  resolved_count: 0,
  bug_count: 1,
  idea_count: 1,
  feedback_count: 0
};

describe('FeedbackDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Update the global router mock
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
    
    // Mock admin user session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-123', email: 'admin@example.com' }
        }
      },
      error: null
    });
    
    // Mock admin profile
    const mockFromChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null
      }),
      in: vi.fn().mockResolvedValue({
        data: mockFeedbackList,
        error: null
      }),
      order: vi.fn().mockReturnThis()
    };
    vi.mocked(supabase.from).mockReturnValue(mockFromChain);
  });

  it('renders loading state initially', async () => {
    await renderWithAct(<FeedbackDashboard />);
    expect(screen.getByText(/Cargando feedback/)).toBeInTheDocument();
  });

  it('renders page title', async () => {
    await renderWithAct(<FeedbackDashboard />);
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
  });

  it('contains expected UI elements in loading state', async () => {
    await renderWithAct(<FeedbackDashboard />);
    
    // Should show loading spinner
    const loadingElement = screen.getByText(/Cargando feedback/);
    expect(loadingElement).toBeInTheDocument();
    
    // Should be wrapped in MainLayout
    const layout = screen.getByTestId('main-layout');
    expect(layout).toBeInTheDocument();
  });
});