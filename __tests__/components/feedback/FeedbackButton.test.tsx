import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import FeedbackButton from '../../../components/feedback/FeedbackButton';
import { flushPromises, setupTimers } from '../../utils/test-utils';

describe('FeedbackButton', () => {
  it('renders the floating button', async () => {
    render(<FeedbackButton />);
    const button = screen.getByRole('button', { name: /enviar feedback/i });
    expect(button).toBeInTheDocument();
  });

  it('has correct styling classes', async () => {
    render(<FeedbackButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('fixed', 'bottom-6', 'right-6', 'z-40');
    expect(button).toHaveClass('bg-[#fbbf24]');
  });

  it('contains the MessageCircle icon', async () => {
    const { container } = render(<FeedbackButton />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('w-6', 'h-6');
  });

  it('opens feedback modal when clicked', async () => {
    render(<FeedbackButton />);
    const button = screen.getByRole('button');
    
    // Modal should not be visible initially
    expect(screen.queryByText(/¿Qué sucedió?/)).not.toBeInTheDocument();
    
    // Click the button
    await act(async () => {
      fireEvent.click(button);
      await flushPromises();
    });
    
    // Modal should now be visible
    expect(screen.getByText(/¿Qué sucedió?/)).toBeInTheDocument();
  });

  it('has pulse animation class', async () => {
    render(<FeedbackButton />);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('animate-pulse');
  });

  it('removes pulse animation after interaction', async () => {
    render(<FeedbackButton />);
    const button = screen.getByRole('button');
    
    // Initially has pulse animation
    expect(button).toHaveClass('animate-pulse');
    
    // Click the button to interact
    await act(async () => {
      fireEvent.click(button);
      await flushPromises();
    });
    
    // Should no longer have pulse animation after interaction
    expect(button).not.toHaveClass('animate-pulse');
  });
});