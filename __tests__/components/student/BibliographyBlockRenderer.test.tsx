import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import StudentBlockRenderer from '@/components/student/StudentBlockRenderer';

describe('Bibliography Block - Student View', () => {
  const mockOnComplete = jest.fn();
  const mockOnProgressUpdate = jest.fn();

  const bibliographyBlock = {
    id: 'test-block-1',
    type: 'bibliography',
    payload: {
      title: 'Bibliografía & Recursos',
      description: 'Recursos recomendados para el curso',
      items: [
        {
          id: 'item-1',
          type: 'pdf',
          title: 'Introducción a la Programación',
          description: 'Libro de texto principal del curso',
          url: 'https://example.com/intro-programming.pdf',
          author: 'García, M. & López, J.',
          year: '2023',
          category: 'Lecturas Obligatorias'
        },
        {
          id: 'item-2',
          type: 'link',
          title: 'Documentación Oficial de React',
          description: 'Referencia completa de React',
          url: 'https://react.dev',
          author: 'Meta',
          year: '2024',
          category: 'Referencias'
        },
        {
          id: 'item-3',
          type: 'pdf',
          title: 'Patrones de Diseño',
          description: 'Guía de patrones de diseño en JavaScript',
          url: 'https://example.com/patterns.pdf',
          author: 'Smith, J.',
          year: '2022',
          category: 'Lecturas Complementarias'
        }
      ],
      showCategories: false,
      sortBy: 'manual'
    }
  };

  const bibliographyBlockWithCategories = {
    ...bibliographyBlock,
    payload: {
      ...bibliographyBlock.payload,
      showCategories: true
    }
  };

  const bibliographyBlockSortedByTitle = {
    ...bibliographyBlock,
    payload: {
      ...bibliographyBlock.payload,
      sortBy: 'title'
    }
  };

  const emptyBibliographyBlock = {
    id: 'test-block-2',
    type: 'bibliography',
    payload: {
      title: 'Bibliografía',
      description: '',
      items: [],
      showCategories: false,
      sortBy: 'manual'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders bibliography block with title and description', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('Bibliografía & Recursos')).toBeInTheDocument();
      expect(screen.getByText('Recursos recomendados para el curso')).toBeInTheDocument();
    });

    it('renders all bibliography items', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('Introducción a la Programación')).toBeInTheDocument();
      expect(screen.getByText('Documentación Oficial de React')).toBeInTheDocument();
      expect(screen.getByText('Patrones de Diseño')).toBeInTheDocument();
    });

    it('displays author and year information', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('García, M. & López, J.')).toBeInTheDocument();
      expect(screen.getByText('2023')).toBeInTheDocument();
      expect(screen.getByText('Meta')).toBeInTheDocument();
      expect(screen.getByText('2024')).toBeInTheDocument();
    });

    it('displays item descriptions', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('Libro de texto principal del curso')).toBeInTheDocument();
      expect(screen.getByText('Referencia completa de React')).toBeInTheDocument();
    });

    it('shows correct badges for PDF and link types', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const pdfBadges = screen.getAllByText('PDF');
      const linkBadges = screen.getAllByText('Enlace');

      expect(pdfBadges).toHaveLength(2);
      expect(linkBadges).toHaveLength(1);
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no items', () => {
      render(
        <StudentBlockRenderer
          block={emptyBibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('No hay recursos disponibles')).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('sorts items by title when sortBy is set to title', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlockSortedByTitle}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const titles = screen.getAllByRole('heading', { level: 4 });
      const titleTexts = titles.map(t => t.textContent);

      expect(titleTexts[0]).toBe('Documentación Oficial de React');
      expect(titleTexts[1]).toBe('Introducción a la Programación');
      expect(titleTexts[2]).toBe('Patrones de Diseño');
    });

    it('sorts items by author', () => {
      const blockSortedByAuthor = {
        ...bibliographyBlock,
        payload: {
          ...bibliographyBlock.payload,
          sortBy: 'author'
        }
      };

      render(
        <StudentBlockRenderer
          block={blockSortedByAuthor}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const items = screen.getAllByRole('link');
      // First should be García (comes before Meta and Smith alphabetically)
      expect(items[0]).toHaveTextContent('Introducción a la Programación');
    });

    it('sorts items by year (newest first)', () => {
      const blockSortedByYear = {
        ...bibliographyBlock,
        payload: {
          ...bibliographyBlock.payload,
          sortBy: 'year'
        }
      };

      render(
        <StudentBlockRenderer
          block={blockSortedByYear}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const years = screen.getAllByText(/202[2-4]/);
      expect(years[0]).toHaveTextContent('2024');
      expect(years[1]).toHaveTextContent('2023');
      expect(years[2]).toHaveTextContent('2022');
    });
  });

  describe('Categories', () => {
    it('groups items by category when showCategories is true', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlockWithCategories}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('Lecturas Obligatorias')).toBeInTheDocument();
      expect(screen.getByText('Referencias')).toBeInTheDocument();
      expect(screen.getByText('Lecturas Complementarias')).toBeInTheDocument();
    });

    it('shows items without category headers when showCategories is false', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.queryByText('Lecturas Obligatorias')).not.toBeInTheDocument();
      expect(screen.queryByText('Referencias')).not.toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('opens links in new tab', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const links = screen.getAllByRole('link');
      
      links.forEach(link => {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });

    it('calls onComplete when continue button is clicked', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const continueButton = screen.getByText('He revisado los recursos - Continuar');
      fireEvent.click(continueButton);

      expect(mockOnComplete).toHaveBeenCalledWith({
        timeSpent: expect.any(Number),
        resourcesViewed: 3
      });
    });

    it('shows completed state', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={true}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('Recursos bibliográficos revisados')).toBeInTheDocument();
      expect(screen.queryByText('He revisado los recursos - Continuar')).not.toBeInTheDocument();
    });

    it('tracks time spent via progress updates', () => {
      jest.useFakeTimers();

      act(() => {
        render(
          <StudentBlockRenderer
            block={bibliographyBlock}
            isCompleted={false}
            onComplete={mockOnComplete}
            onProgressUpdate={mockOnProgressUpdate}
          />
        );
      });

      // Advance time by 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockOnProgressUpdate).toHaveBeenCalledWith({ timeSpent: 5 });

      jest.useRealTimers();
    });
  });

  describe('Accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const mainHeading = screen.getByRole('heading', { level: 2 });
      expect(mainHeading).toHaveTextContent('Bibliografía & Recursos');

      const itemHeadings = screen.getAllByRole('heading', { level: 4 });
      expect(itemHeadings).toHaveLength(3);
    });

    it('provides descriptive link text', () => {
      render(
        <StudentBlockRenderer
          block={bibliographyBlock}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      const links = screen.getAllByRole('link');
      
      links.forEach(link => {
        // Each link should have meaningful text content
        expect(link.textContent).not.toBe('');
        expect(link.textContent?.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles items without optional fields', () => {
      const blockWithMinimalItems = {
        ...bibliographyBlock,
        payload: {
          ...bibliographyBlock.payload,
          items: [
            {
              id: 'minimal-1',
              type: 'pdf' as const,
              title: 'Minimal PDF',
              url: 'https://example.com/minimal.pdf'
            },
            {
              id: 'minimal-2',
              type: 'link' as const,
              title: 'Minimal Link',
              url: 'https://example.com'
            }
          ]
        }
      };

      render(
        <StudentBlockRenderer
          block={blockWithMinimalItems}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('Minimal PDF')).toBeInTheDocument();
      expect(screen.getByText('Minimal Link')).toBeInTheDocument();
    });

    it('handles items with "Sin categoría" when categories are shown', () => {
      const blockWithUncategorized = {
        ...bibliographyBlock,
        payload: {
          ...bibliographyBlock.payload,
          showCategories: true,
          items: [
            {
              id: 'uncategorized-1',
              type: 'pdf' as const,
              title: 'Uncategorized Resource',
              url: 'https://example.com/resource.pdf'
            }
          ]
        }
      };

      render(
        <StudentBlockRenderer
          block={blockWithUncategorized}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      expect(screen.getByText('Sin categoría')).toBeInTheDocument();
    });

    it('handles missing title gracefully', () => {
      const blockWithoutTitle = {
        ...bibliographyBlock,
        payload: {
          ...bibliographyBlock.payload,
          title: ''
        }
      };

      render(
        <StudentBlockRenderer
          block={blockWithoutTitle}
          isCompleted={false}
          onComplete={mockOnComplete}
          onProgressUpdate={mockOnProgressUpdate}
        />
      );

      // Should show default title
      expect(screen.getByText('Bibliografía & Recursos')).toBeInTheDocument();
    });
  });
});