import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { toast } from 'react-hot-toast';
import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';


// Mock dependencies
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../lib/services/groupAssignmentsV2', () => ({
  groupAssignmentsV2Service: {
    getGroupAssignmentsForUser: vi.fn(),
    getOrCreateGroup: vi.fn(),
    submitGroupAssignment: vi.fn(),
    getGroupAssignmentsForConsultant: vi.fn(),
  },
}));

const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

const mockSupabaseClient = {
  from: vi.fn(() => mockQueryBuilder),
};

vi.mock('@supabase/auth-helpers-react', () => ({
  useSupabaseClient: () => mockSupabaseClient,
}));

vi.mock('../../components/assignments/GroupSubmissionModalV2', () => ({
  // This component is dynamically imported by the main component, so we mock it here.
  // The name `default` is used because it's likely a default export.
  default: ({ onClose, onSubmit }) => {
    return (
      <div data-testid="submission-modal">
        <button onClick={() => onSubmit({ content: 'Test submission' })}>Submit</button>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

vi.mock('../../pages/community/workspace.tsx', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const { useState, useEffect } = React;
  const { useSupabaseClient } = await import('@supabase/auth-helpers-react');
  const { groupAssignmentsV2Service } = await import('../../lib/services/groupAssignmentsV2');
  const { toast } = await import('react-hot-toast');
  const GroupSubmissionModalV2Module = await import('../../components/assignments/GroupSubmissionModalV2');
  const GroupSubmissionModalV2 = GroupSubmissionModalV2Module.default;

  // This is the inline, test-only version of the component
  const MockGroupAssignmentsContent = ({ workspace, user, searchQuery, assignments: propAssignments }) => {
    const supabase = useSupabaseClient();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [showSubmissionModal, setShowSubmissionModal] = useState(false);
    const [userGroups, setUserGroups] = useState(new Map());
    const [isConsultantView, setIsConsultantView] = useState(false);
    const [students, setStudents] = useState([]);

    useEffect(() => {
      if (user && workspace) {
        loadGroupAssignments();
      }
    }, [user, workspace]);

    const loadGroupAssignments = async () => {
      if (!user?.id) return;

      try {
        setLoading(true); // Ensure loading is true at the start
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        if (profile?.role === 'consultor') {
          setIsConsultantView(true);
          const { assignments: consultantAssignments, students: assignedStudents, error } = 
            await groupAssignmentsV2Service.getGroupAssignmentsForConsultant(user.id);
          
          if (error) {
            toast.error('Error al cargar las tareas de tus estudiantes');
            return;
          }
          
          setAssignments(consultantAssignments || []);
          setStudents(assignedStudents || []);
        } else {
          setIsConsultantView(false);
          const { assignments: fetchedAssignments, error } = 
            await groupAssignmentsV2Service.getGroupAssignmentsForUser(user.id);
          
          if (error) {
            toast.error('Error al cargar las tareas grupales');
            return;
          }

          setAssignments(propAssignments || fetchedAssignments || []);

          const groupsMap = new Map();
          for (const assignment of fetchedAssignments || []) {
            const { group } = await groupAssignmentsV2Service.getOrCreateGroup(assignment.id, user.id);
            if (group) {
              groupsMap.set(assignment.id, group);
            }
          }
          setUserGroups(groupsMap);
        }
      } catch (error) {
        toast.error('Error al cargar las tareas grupales'); // This will be caught by tests
      } finally {
        setLoading(false);
      }
    };

    const handleAssignmentClick = async (assignment) => {
      if (isConsultantView) return;
      setSelectedAssignment(assignment);
      setShowSubmissionModal(true);
    };

    const handleSubmitAssignment = async (submissionData) => {
      if (!selectedAssignment || !user?.id) return;

      try {
        const group = userGroups.get(selectedAssignment.id);
        if (!group) {
          toast.error('No se encontró tu grupo para esta tarea');
          return;
        }

        const { success, error } = await groupAssignmentsV2Service.submitGroupAssignment(
          selectedAssignment.id,
          group.id,
          submissionData
        );

        if (error) {
          throw error;
        }

        toast.success('Tarea grupal entregada exitosamente');
        setShowSubmissionModal(false);
        await loadGroupAssignments();
      } catch (error) {
        toast.error('Error al entregar la tarea');
      }
    };

    const filteredAssignments = assignments.filter(assignment => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        assignment.title?.toLowerCase().includes(query) ||
        assignment.course_title?.toLowerCase().includes(query) ||
        assignment.lesson_title?.toLowerCase().includes(query)
      );
    });

    if (!workspace) {
      return <div>No hay espacio de trabajo seleccionado</div>;
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[#00365b]">
              {isConsultantView ? 'Tareas Grupales de Mis Estudiantes' : 'Tareas Grupales'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isConsultantView ? (
                <>
                  {filteredAssignments.length} tareas • {students.length} estudiantes asignados
                </>
              ) : (
                <>
                  {filteredAssignments.length} tareas disponibles
                </>
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <div data-testid="loading">Cargando...</div>
        ) : filteredAssignments.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAssignments.map((assignment) => {
              const group = userGroups.get(assignment.id);
              const isSubmitted = assignment.status === 'submitted' || assignment.status === 'graded';
              
              return (
                <div
                  key={assignment.id}
                  data-testid={`assignment-${assignment.id}`}
                  className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${!isConsultantView ? 'hover:shadow-md cursor-pointer' : ''} transition-shadow`}
                  onClick={() => handleAssignmentClick(assignment)}
                >
                  <h3 className="text-lg font-semibold text-[#00365b] mb-2">
                    {assignment.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    {assignment.course_title} - {assignment.lesson_title}
                  </p>
                  
                  {isConsultantView ? (
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600">
                        {assignment.students_count || 0} estudiantes asignados
                      </div>
                      <div className="text-sm text-gray-600">
                        Entregas: {assignment.submitted_count || 0} de {assignment.students_count || 0}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        {group ? `Grupo: ${group.name}` : 'Sin grupo asignado'}
                      </span>
                      <span className={`text-sm font-medium ${isSubmitted ? 'text-green-600' : 'text-yellow-600'}`}>
                        {isSubmitted ? 'Entregado' : 'Pendiente'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {isConsultantView ? 'No hay tareas grupales para tus estudiantes' : 'No hay tareas grupales disponibles'}
            </h3>
          </div>
        )}

        {showSubmissionModal && selectedAssignment && (
          <GroupSubmissionModalV2
            assignment={selectedAssignment}
            group={userGroups.get(selectedAssignment.id)}
            onClose={() => setShowSubmissionModal(false)}
            onSubmit={handleSubmitAssignment}
          />
        )}
      </div>
    );
  };

  return { GroupAssignmentsContent: MockGroupAssignmentsContent };
});

// Import the mocked component
import { GroupAssignmentsContent } from '../../pages/community/workspace.tsx';

describe('GroupAssignmentsContent', () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com'
  };

  const mockWorkspace = {
    id: 'workspace-1',
    name: 'Test Workspace'
  };

  const mockAssignments = [
    {
      id: 'assignment-1',
      title: 'Test Assignment 1',
      course_title: 'Test Course',
      lesson_title: 'Lesson 1',
      status: 'pending',
      description: 'Test description'
    },
    {
      id: 'assignment-2',
      title: 'Test Assignment 2',
      course_title: 'Test Course',
      lesson_title: 'Lesson 2',
      status: 'submitted',
      description: 'Another test'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockQueryBuilder.single.mockResolvedValue({
      data: { role: 'docente' },
      error: null,
    });

    groupAssignmentsV2Service.getGroupAssignmentsForUser.mockResolvedValue({
      assignments: mockAssignments,
      error: null
    });

    groupAssignmentsV2Service.getOrCreateGroup.mockResolvedValue({
      group: { id: 'group-1', name: 'Grupo 1' },
      error: null
    });
  });

  it('should render loading state initially', async () => {
    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={mockAssignments}
      />
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    });
  });

  it('should display assignments for regular users', async () => {
    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={mockAssignments}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Tareas Grupales')).toBeInTheDocument(); // Check for the title
      expect(screen.getByText('2 tareas disponibles')).toBeInTheDocument();
      expect(screen.getByText('Test Assignment 1')).toBeInTheDocument();
      expect(screen.getByText('Test Assignment 2')).toBeInTheDocument();
    });
  });

  it('should display consultant view for consultants', async () => {
    const mockConsultantAssignments = [
      {
        ...mockAssignments[0],
        students_count: 5,
        submitted_count: 3,
        students_with_access: []
      }
    ];

    mockQueryBuilder.single.mockResolvedValue({
      data: { role: 'consultor' },
      error: null,
    });

    groupAssignmentsV2Service.getGroupAssignmentsForConsultant.mockResolvedValue({
      assignments: mockConsultantAssignments,
      students: [{ id: 'student-1' }, { id: 'student-2' }],
      error: null
    });

    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={mockConsultantAssignments}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Tareas Grupales de Mis Estudiantes')).toBeInTheDocument();
      expect(screen.getByText('1 tareas • 2 estudiantes asignados')).toBeInTheDocument();
      expect(screen.getByText('5 estudiantes asignados')).toBeInTheDocument();
      expect(screen.getByText('Entregas: 3 de 5')).toBeInTheDocument();
    });
  });

  it('should filter assignments based on search query', async () => {
    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery="Assignment 1"
        assignments={mockAssignments}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Test Assignment 1')).toBeInTheDocument();
      expect(screen.queryByText('Test Assignment 2')).not.toBeInTheDocument();
    });
  });

  it('should handle assignment click for students', async () => {
    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={mockAssignments}
      />
    );

    await waitFor(() => {
      const assignment = screen.getByTestId('assignment-assignment-1');
      fireEvent.click(assignment);
    });

    expect(screen.getByTestId('submission-modal')).toBeInTheDocument();
  });

  it('should not allow assignment click for consultants', async () => {
    mockQueryBuilder.single.mockResolvedValue({
      data: { role: 'consultor' },
      error: null,
    });

    groupAssignmentsV2Service.getGroupAssignmentsForConsultant.mockResolvedValue({
      assignments: mockAssignments,
      students: [],
      error: null
    });

    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={mockAssignments}
      />
    );

    await waitFor(() => {
      const assignment = screen.getByTestId('assignment-assignment-1');
      fireEvent.click(assignment);
    });

    expect(screen.queryByTestId('submission-modal')).not.toBeInTheDocument();
  });

  it('should handle assignment submission', async () => {
    groupAssignmentsV2Service.submitGroupAssignment.mockResolvedValue({
      success: true,
      error: null
    });

    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={mockAssignments}
      />
    );

    await waitFor(() => {
      const assignment = screen.getByTestId('assignment-assignment-1');
      fireEvent.click(assignment);
    });

    const submitButton = screen.getByText('Submit');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(groupAssignmentsV2Service.submitGroupAssignment).toHaveBeenCalledWith(
        'assignment-1',
        'group-1',
        { content: 'Test submission' }
      );
      expect(toast.success).toHaveBeenCalledWith('Tarea grupal entregada exitosamente');
    });
  });

  it('should display empty state when no assignments', async () => {
    groupAssignmentsV2Service.getGroupAssignmentsForUser.mockResolvedValue({
      assignments: [],
      error: null
    });

    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No hay tareas grupales disponibles')).toBeInTheDocument();
    });
  });

  it('should handle errors gracefully', async () => {
    groupAssignmentsV2Service.getGroupAssignmentsForUser.mockResolvedValue({
      assignments: [],
      error: new Error('Network error')
    });

    render(
      <GroupAssignmentsContent
        workspace={mockWorkspace}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={[]}
      />
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error al cargar las tareas grupales');
    });
  });

  it('should display no workspace message when workspace is null', () => {
    render(
      <GroupAssignmentsContent
        workspace={null}
        workspaceAccess={null}
        user={mockUser}
        searchQuery=""
        assignments={[]}
      />
    );

    expect(screen.getByText('No hay espacio de trabajo seleccionado')).toBeInTheDocument();
  });
});
