// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BlockRenderer from '../BlockRenderer';
import { Block, TextBlock, VideoBlock } from '../../../types/blocks'; // Adjusted path if needed

describe('BlockRenderer Component', () => {
  it('renders a text block and calls onChange when textarea is edited', () => {
    const mockOnChange = vi.fn();
    const initialTextBlock: TextBlock = {
      id: 'text-1',
      type: 'text',
      payload: { content: 'Initial text' },
    };

    render(<BlockRenderer block={initialTextBlock} onChange={mockOnChange} />);

    const textarea = screen.getByPlaceholderText('Enter text content...') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('Initial text');

    fireEvent.change(textarea, { target: { value: 'Updated text' } });

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const expectedUpdatedBlock: TextBlock = {
      ...initialTextBlock,
      payload: { content: 'Updated text' },
    };
    expect(mockOnChange).toHaveBeenCalledWith(expectedUpdatedBlock);
  });

  it('renders a video block and calls onChange when input is edited', () => {
    const mockOnChange = vi.fn();
    const initialVideoBlock: VideoBlock = {
      id: 'video-1',
      type: 'video',
      payload: { url: 'http://example.com/initial.mp4' },
    };

    render(<BlockRenderer block={initialVideoBlock} onChange={mockOnChange} />);

    const input = screen.getByPlaceholderText('Video URL (e.g., YouTube, Vimeo)') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('http://example.com/initial.mp4');

    fireEvent.change(input, { target: { value: 'http://example.com/updated.mp4' } });

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const expectedUpdatedBlock: VideoBlock = {
      ...initialVideoBlock,
      payload: { url: 'http://example.com/updated.mp4' },
    };
    expect(mockOnChange).toHaveBeenCalledWith(expectedUpdatedBlock);
  });

  it('renders fallback UI for an unknown block type', () => {
    const mockOnChange = vi.fn();
    // Cast to 'any' then to 'Block' to simulate an unsupported type for testing purposes
    const unknownBlock = {
      id: 'unknown-1',
      type: 'quiz', // Assuming 'quiz' is not yet handled by BlockRenderer
      payload: { question: 'What is this?' },
    } as any as Block;

    render(<BlockRenderer block={unknownBlock} onChange={mockOnChange} />);

    expect(screen.getByText('Unknown block type: quiz')).toBeInTheDocument();
    expect(mockOnChange).not.toHaveBeenCalled();
  });
});