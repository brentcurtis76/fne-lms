import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { useRouter } from 'next/router';
import { vi } from 'vitest';
import FeedbackDashboard from '../../../pages/admin/feedback';
import { flushPromises, createMockFeedback } from '../../utils/test-utils';

// Using global vitest mocks from vitest.setup.ts

vi.mock('next/router', () => ({
  useRouter: vi.fn(),
}));

vi.mock('../../../utils/roleUtils', () => ({
  getEffectiveRoleAndStatus: vi.fn(() => Promise.resolve({ isAdmin: true, effectiveRole: 'admin' })),
}));

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: vi.fn(),
}));

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
  const mockGetSession = vi.fn();
  const mockFrom = vi.fn();
  const mockSupabase = {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as any);
    vi.mocked(useSupabaseClient).mockReturnValue(mockSupabase as any);

    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'admin-123', email: 'admin@example.com' }
        }
      },
      error: null
    });

    mockFrom.mockImplementation((tableName) => {
      if (tableName === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
        };
      }
      if (tableName === 'platform_feedback') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: mockFeedbackList, error: null }),
        };
      }
      if (tableName === 'feedback_activity') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (tableName === 'feedback_stats') {
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockStats, error: null }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });
  });

  it('renders feedback data and stats after loading', async () => {
    render(<FeedbackDashboard />);

    // Wait for loading to finish and check for final content
    await waitFor(() => {
      expect(screen.queryByText(/Cargando feedback/)).not.toBeInTheDocument();
    });

    // Check that the main layout is there
    expect(screen.getByTestId('main-layout')).toBeInTheDocument();
    
    // Check for rendered feedback items from mock data
    expect(screen.getByText('Test bug report')).toBeInTheDocument();
    expect(screen.getByText('Feature request')).toBeInTheDocument();

    // Check for rendered stats from mock data
    expect(screen.getByText('Nuevos', { selector: 'p' })).toBeInTheDocument();
    await waitFor(() => {
      const newCountElements = screen.getAllByText('1');
      expect(newCountElements.length).toBeGreaterThan(0);
    });
  });
});