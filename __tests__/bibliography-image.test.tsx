import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import BibliographyBlockEditor from '../components/blocks/BibliographyBlockEditor';
import { toast } from 'react-hot-toast';

// Mock dependencies
jest.mock('react-hot-toast');
jest.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ 
          data: { publicUrl: 'https://example.com/test-image.jpg' } 
        })
      }))
    }
  }
}));

describe('BibliographyBlockEditor - Image Support', () => {
  const mockBlock = {
    id: 'test-block',
    type: 'bibliography',
    payload: {
      title: 'Test Bibliography',
      description: 'Test description',
      items: []
    }
  };

  const mockOnChange = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render Add Image button', () => {
    render(
      <BibliographyBlockEditor
        block={mockBlock}
        onChange={mockOnChange}
        onDelete={mockOnDelete}
        mode="edit"
        courseId="test-course"
      />
    );

    const addImageButton = screen.getByRole('button', { name: /Agregar Imagen/i });
    expect(addImageButton).toBeInTheDocument();
    expect(addImageButton).toHaveClass('bg-green-600');
  });

  test('should add new image item when Add Image button is clicked', () => {
    render(
      <BibliographyBlockEditor
        block={mockBlock}
        onChange={mockOnChange}
        onDelete={mockOnDelete}
        mode="edit"
        courseId="test-course"
      />
    );

    const addImageButton = screen.getByRole('button', { name: /Agregar Imagen/i });
    fireEvent.click(addImageButton);

    expect(mockOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            title: '',
            description: '',
            url: '',
          })
        ])
      })
    );
  });

  test('should validate image file type on upload', async () => {
    const blockWithImage = {
      ...mockBlock,
      payload: {
        ...mockBlock.payload,
        items: [{
          id: 'image-1',
          type: 'image',
          title: 'Test Image',
          url: ''
        }]
      }
    };

    const { container } = render(
      <BibliographyBlockEditor
        block={blockWithImage}
        onChange={mockOnChange}
        onDelete={mockOnDelete}
        mode="edit"
        courseId="test-course"
      />
    );

    // Expand the item first
    const expandButtons = container.querySelectorAll('button');
    const expandButton = Array.from(expandButtons).find(btn => 
      btn.querySelector('[class*="ChevronDown"], [class*="ChevronUp"]')
    );
    if (expandButton) {
      fireEvent.click(expandButton);
    }

    // Create a mock PDF file
    const pdfFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    const fileInput = container.querySelector('input[type="file"]');
    
    if (fileInput) {
      // Simulate file selection
      fireEvent.change(fileInput, { target: { files: [pdfFile] } });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Solo se permiten archivos de imagen (JPG, PNG, GIF, etc.)');
      });
    }
  });

  test('should show image preview when uploaded', () => {
    const blockWithUploadedImage = {
      ...mockBlock,
      payload: {
        ...mockBlock.payload,
        items: [{
          id: 'image-1',
          type: 'image',
          title: 'Test Image',
          url: 'https://example.com/test-image.jpg'
        }]
      }
    };

    render(
      <BibliographyBlockEditor
        block={blockWithUploadedImage}
        onChange={mockOnChange}
        onDelete={mockOnDelete}
        mode="edit"
        courseId="test-course"
      />
    );

    // Click to expand the item
    const expandButton = screen.getAllByRole('button').find(btn => 
      btn.querySelector('svg') && btn.closest('.bg-gray-50')
    );
    fireEvent.click(expandButton);

    // Check for image preview
    const imagePreview = screen.getByAltText(/Test Image|Vista previa/);
    expect(imagePreview).toBeInTheDocument();
    expect(imagePreview).toHaveAttribute('src', 'https://example.com/test-image.jpg');
  });

  test('should display image icon in preview mode', () => {
    const blockWithImage = {
      ...mockBlock,
      payload: {
        ...mockBlock.payload,
        items: [{
          id: 'image-1',
          type: 'image',
          title: 'Test Image',
          url: 'https://example.com/test-image.jpg'
        }]
      }
    };

    const { container } = render(
      <BibliographyBlockEditor
        block={blockWithImage}
        onChange={mockOnChange}
        onDelete={mockOnDelete}
        mode="preview"
        courseId="test-course"
      />
    );

    // Should show green image icon
    const greenIcons = container.querySelectorAll('.text-green-600');
    expect(greenIcons.length).toBeGreaterThan(0);
  });
});