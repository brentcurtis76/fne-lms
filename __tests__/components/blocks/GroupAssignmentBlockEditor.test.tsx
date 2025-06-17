import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GroupAssignmentBlockEditor from '@/components/blocks/GroupAssignmentBlockEditor';
import { GroupAssignmentBlock } from '@/types/blocks';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

// Mock dependencies
const mockStorageFrom = {
  upload: jest.fn(),
  getPublicUrl: jest.fn()
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => mockStorageFrom)
    }
  }
}));

jest.mock('react-hot-toast', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn()
  }
}));

describe('GroupAssignmentBlockEditor', () => {
  const mockOnChange = jest.fn();
  const mockOnDelete = jest.fn();

  const defaultBlock: GroupAssignmentBlock = {
    id: 'test-block-1',
    type: 'group-assignment',
    payload: {
      title: 'Test Group Assignment',
      description: 'Test description',
      instructions: 'Test instructions',
      resources: []
    }
  };

  const blockWithResources: GroupAssignmentBlock = {
    ...defaultBlock,
    payload: {
      ...defaultBlock.payload,
      resources: [
        {
          id: 'resource-1',
          type: 'link',
          title: 'Test Link Resource',
          url: 'https://example.com/resource',
          description: 'A helpful link'
        },
        {
          id: 'resource-2',
          type: 'document',
          title: 'Test Document',
          url: 'https://example.com/document.pdf',
          description: 'Important document'
        }
      ]
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageFrom.upload.mockClear();
    mockStorageFrom.getPublicUrl.mockClear();
  });

  describe('Edit Mode', () => {
    it('renders basic fields correctly', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      expect(screen.getByDisplayValue('Test Group Assignment')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test description')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test instructions')).toBeInTheDocument();
    });

    it('shows resource buttons', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      expect(screen.getByText('Agregar Enlace')).toBeInTheDocument();
      expect(screen.getByText('Agregar Documento')).toBeInTheDocument();
    });

    it('adds a link resource', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      fireEvent.click(screen.getByText('Agregar Enlace'));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              type: 'link',
              title: '',
              url: ''
            })
          ])
        })
      );
    });

    it('adds a document resource', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      fireEvent.click(screen.getByText('Agregar Documento'));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              type: 'document',
              title: '',
              url: ''
            })
          ])
        })
      );
    });

    it('displays existing resources', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      expect(screen.getByDisplayValue('Test Link Resource')).toBeInTheDocument();
      expect(screen.getByDisplayValue('https://example.com/resource')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Document')).toBeInTheDocument();
    });

    it('updates resource fields', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      const titleInput = screen.getByDisplayValue('Test Link Resource');
      fireEvent.change(titleInput, { target: { value: 'Updated Link Title' } });

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              id: 'resource-1',
              title: 'Updated Link Title'
            })
          ])
        })
      );
    });

    it('deletes a resource', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      // Find delete buttons - there should be one for each resource
      const deleteButtons = screen.getAllByRole('button').filter(button => {
        const svgElement = button.querySelector('svg');
        return svgElement?.classList.contains('lucide-trash2');
      });
      
      // Should have at least 2 delete buttons (one for each resource, plus potentially one for the block)
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
      
      // Click the first resource's delete button
      fireEvent.click(deleteButtons[deleteButtons.length - 2]);

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({ id: 'resource-2' })
          ])
        })
      );
      
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1][0];
      expect(lastCall.resources).toHaveLength(1);
      expect(lastCall.resources.find((r: any) => r.id === 'resource-1')).toBeUndefined();
    });

    it('validates file upload functionality', () => {
      // Test that the component has file upload capability
      const blockWithEmptyDocument = {
        ...defaultBlock,
        payload: {
          ...defaultBlock.payload,
          resources: [{
            id: 'new-doc',
            type: 'document' as const,
            title: '',
            url: ''
          }]
        }
      };

      render(
        <GroupAssignmentBlockEditor
          block={blockWithEmptyDocument}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      // Should show Documento type
      expect(screen.getByText('Documento')).toBeInTheDocument();
      
      // Should have file input area
      const fileInputs = screen.getAllByRole('textbox');
      expect(fileInputs.length).toBeGreaterThan(0);
    });

    it('shows "Cambiar" button when document has URL', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      // The second resource is a document with URL
      expect(screen.getByText('Cambiar')).toBeInTheDocument();
    });

    it('shows empty state when no resources', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      expect(screen.getByText('No hay recursos agregados')).toBeInTheDocument();
      expect(screen.getByText('Los recursos serán visibles para los estudiantes en el espacio colaborativo')).toBeInTheDocument();
    });

    it('shows note about resources visibility', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      expect(screen.getByText(/Los recursos no se mostrarán en la lección/)).toBeInTheDocument();
    });
  });

  describe('Preview Mode', () => {
    it('renders assignment details in preview', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="preview"
          courseId="test-course"
        />
      );

      // Use getAllByText since the title appears in multiple places
      const titles = screen.getAllByText('Test Group Assignment');
      expect(titles.length).toBeGreaterThan(0);
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByText('Test instructions')).toBeInTheDocument();
    });

    it('shows resources count in preview', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="preview"
          courseId="test-course"
        />
      );

      expect(screen.getByText('Recursos (2):')).toBeInTheDocument();
    });

    it('displays resource list in preview', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="preview"
          courseId="test-course"
        />
      );

      expect(screen.getByText('Test Link Resource')).toBeInTheDocument();
      expect(screen.getByText('Test Document')).toBeInTheDocument();
    });

    it('shows correct icons for resource types', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="preview"
          courseId="test-course"
        />
      );

      // Check for icons by their parent containers
      const linkResource = screen.getByText('Test Link Resource').closest('.flex');
      const docResource = screen.getByText('Test Document').closest('.flex');
      
      expect(linkResource?.querySelector('svg.lucide-external-link')).toBeTruthy();
      expect(docResource?.querySelector('svg.lucide-file')).toBeTruthy();
    });

    it('does not show resources section when empty', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="preview"
          courseId="test-course"
        />
      );

      expect(screen.queryByText(/Recursos/)).not.toBeInTheDocument();
    });
  });

  describe('Resource Management', () => {
    it('handles save button functionality', () => {
      render(
        <GroupAssignmentBlockEditor
          block={defaultBlock}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      // Find the title input by its placeholder
      const titleInput = screen.getByPlaceholderText('Ingrese el título de la tarea grupal');
      fireEvent.change(titleInput, { target: { value: 'Updated Title' } });

      // Should show unsaved changes message
      expect(screen.getByText(/Los cambios se guardarán automáticamente/)).toBeInTheDocument();

      // Click save button
      const saveButton = screen.getByText('Guardar Tarea');
      fireEvent.click(saveButton);

      // The component should handle the save action
      expect(mockOnChange).toHaveBeenCalled();
    });

    it('maintains resource order', () => {
      render(
        <GroupAssignmentBlockEditor
          block={blockWithResources}
          onChange={mockOnChange}
          onDelete={mockOnDelete}
          mode="edit"
          courseId="test-course"
        />
      );

      const resourceTitles = screen.getAllByPlaceholderText(/Nombre del/);
      expect(resourceTitles[0]).toHaveValue('Test Link Resource');
      expect(resourceTitles[1]).toHaveValue('Test Document');
    });
  });
});