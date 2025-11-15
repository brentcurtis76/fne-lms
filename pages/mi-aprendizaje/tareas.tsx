/**
 * Mis Tareas Page
 * Centralized view of all assignments across all Growth Communities
 * Supports collaborative submission with member selection
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { userAssignmentsService, Assignment } from '@/lib/services/userAssignments';
import {
  ClipboardCheckIcon,
  FilterIcon,
  SearchIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  AcademicCapIcon,
  UsersIcon
} from '@heroicons/react/outline';
import { toast } from 'react-hot-toast';
import GroupSubmissionModalV2 from '@/components/assignments/GroupSubmissionModalV2';
import { groupAssignmentsV2Service } from '@/lib/services/groupAssignmentsV2';

type TabType = 'pending' | 'submitted' | 'graded';

const TareasPage: React.FC = () => {
  const router = useRouter();
  const user = useUser();
  const supabase = useSupabaseClient();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Load assignments on mount
  useEffect(() => {
    if (user) {
      loadAssignments();
      checkOnboardingStatus();
    }
  }, [user]);

  // Check if user has seen onboarding
  const checkOnboardingStatus = () => {
    const seen = localStorage.getItem('tareas_onboarding_seen');
    if (!seen) {
      setShowOnboarding(true);
      localStorage.setItem('tareas_onboarding_seen', 'true');
    }
  };

  const loadAssignments = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Use groupAssignmentsV2Service - it handles RLS properly via server-side logic
      const { assignments: data, error } = await groupAssignmentsV2Service.getGroupAssignmentsForUser(user.id);

      if (error) {
        console.error('Error loading assignments:', error);
        toast.error('Error al cargar las tareas');
        setAssignments([]);
      } else {
        // Transform groupAssignmentsV2 format to match Assignment interface expected by page
        const transformed = (data || []).map((assignment: any) => ({
          id: assignment.id,
          assignment_id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          instructions: assignment.instructions || '',
          resources: assignment.resources || [],
          course_id: assignment.course_id,
          lesson_id: assignment.lesson_id,
          course_title: assignment.course_title,
          lesson_title: assignment.lesson_title,
          due_date: null, // Group assignments don't have due dates in current schema
          points: 100, // Default points - group assignments don't track this currently
          assignment_type: 'group-assignment',
          status: assignment.status,
          score: assignment.grade,
          feedback: null, // Will be populated when we fetch full submission details
          file_url: null, // Will be populated when we fetch full submission details
          grade: assignment.grade
        }));
        setAssignments(transformed);
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast.error('Error al cargar las tareas');
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  // Get unique courses from assignments (replacing community filter)
  const courses = useMemo(() => {
    const courseMap = new Map<string, any>();
    assignments.forEach((a) => {
      if (a.course_id && !courseMap.has(a.course_id)) {
        courseMap.set(a.course_id, {
          id: a.course_id,
          name: a.course_title || 'Curso'
        });
      }
    });
    return Array.from(courseMap.values());
  }, [assignments]);

  // Filter assignments
  const filteredAssignments = useMemo(() => {
    let filtered = assignments;

    // Filter by tab (status)
    filtered = filtered.filter((a) => {
      if (activeTab === 'pending') return a.status === 'pending';
      if (activeTab === 'submitted') return a.status === 'submitted';
      if (activeTab === 'graded') return a.status === 'graded';
      return true;
    });

    // Filter by selected courses (replacing community filter)
    if (selectedCommunities.length > 0) {
      filtered = filtered.filter((a) =>
        a.course_id && selectedCommunities.includes(a.course_id)
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.description?.toLowerCase().includes(query) ||
          a.course_title?.toLowerCase().includes(query) ||
          a.lesson_title?.toLowerCase().includes(query)
      );
    }

    // Sort by due date (earliest first)
    filtered.sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    return filtered;
  }, [assignments, activeTab, selectedCommunities, searchQuery]);

  const handleToggleCommunity = (communityId: string) => {
    setSelectedCommunities((prev) =>
      prev.includes(communityId)
        ? prev.filter((id) => id !== communityId)
        : [...prev, communityId]
    );
  };

  const handleSubmitAssignment = async (assignment: Assignment) => {
    if (!user) return;

    try {
      // Show loading toast
      const loadingToast = toast.loading('Cargando detalles de la tarea...');

      // Fetch full assignment details to get fresh instructions/resources
      const { assignment: fullAssignment, error: assignmentError } = await groupAssignmentsV2Service.getGroupAssignment(
        assignment.assignment_id
      );

      if (assignmentError || !fullAssignment) {
        toast.dismiss(loadingToast);
        toast.error('Error al cargar los detalles de la tarea');
        return;
      }

      // Get or create user's group for this assignment
      const { group, error: groupError } = await groupAssignmentsV2Service.getOrCreateGroup(
        assignment.assignment_id,
        user.id
      );

      if (groupError || !group) {
        toast.dismiss(loadingToast);
        toast.error('Error al cargar el grupo');
        return;
      }

      // Merge full assignment payload with existing assignment data
      const enrichedAssignment = {
        ...assignment,
        instructions: fullAssignment.instructions || '',
        resources: fullAssignment.resources || []
      };

      toast.dismiss(loadingToast);
      setSelectedAssignment(enrichedAssignment);
      setSelectedGroup(group);
      setShowSubmissionModal(true);
    } catch (error) {
      console.error('Error loading assignment details:', error);
      toast.error('Error al preparar la entrega');
    }
  };

  const handleSubmissionSuccess = () => {
    setShowSubmissionModal(false);
    setSelectedAssignment(null);
    setSelectedGroup(null);
    loadAssignments();
    toast.success('¡Trabajo enviado exitosamente!');
  };

  const handleGroupSubmit = async (submissionData: any) => {
    if (!user || !selectedAssignment || !selectedGroup) return;

    try {
      const result = await groupAssignmentsV2Service.submitGroupAssignment(
        selectedAssignment.assignment_id,
        selectedGroup.id,
        submissionData
      );

      if (result.error) {
        toast.error(result.error);
        return;
      }

      handleSubmissionSuccess();
    } catch (error) {
      console.error('Error submitting assignment:', error);
      toast.error('Error al enviar el trabajo');
    }
  };

  const formatDueDate = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="text-red-600 font-medium">
          Venció hace {Math.abs(diffDays)} día{Math.abs(diffDays) > 1 ? 's' : ''}
        </span>
      );
    } else if (diffDays === 0) {
      return <span className="text-orange-600 font-medium">Vence hoy</span>;
    } else if (diffDays === 1) {
      return <span className="text-yellow-600 font-medium">Vence mañana</span>;
    } else if (diffDays <= 7) {
      return (
        <span className="text-yellow-600">
          Vence en {diffDays} días
        </span>
      );
    }
    return (
      <span className="text-gray-600">
        {date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
      </span>
    );
  };

  // Redirect from workspace query params
  useEffect(() => {
    const { communityId, from } = router.query;
    if (communityId && typeof communityId === 'string') {
      setSelectedCommunities([communityId]);
    }
  }, [router.query]);

  const tabs = [
    { id: 'pending' as TabType, label: 'Pendientes', icon: ClockIcon },
    { id: 'submitted' as TabType, label: 'Entregadas', icon: CheckCircleIcon },
    { id: 'graded' as TabType, label: 'Calificadas', icon: AcademicCapIcon }
  ];

  return (
    <MainLayout
      user={user}
      currentPage="tareas"
      pageTitle="Mis Tareas"
      userRole="estudiante"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <ClipboardCheckIcon className="h-8 w-8 text-brand_yellow mr-3" />
                Mis Tareas
              </h1>
              <p className="text-gray-600 mt-1">
                Tareas de todos tus cursos
              </p>
            </div>
            {router.query.from === 'workspace' && (
              <button
                onClick={() => router.back()}
                className="text-sm text-brand_blue hover:underline"
              >
                ← Volver al Espacio Colaborativo
              </button>
            )}
          </div>

          {/* Onboarding Banner */}
          {showOnboarding && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 relative">
              <button
                onClick={() => setShowOnboarding(false)}
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
              <h3 className="font-semibold text-blue-900 mb-2">
                ¡Bienvenido a Mis Tareas! 🎉
              </h3>
              <p className="text-sm text-blue-800">
                Aquí puedes ver todas tus tareas grupales de todos tus cursos en un solo lugar.
                <strong className="block mt-1">
                  Envía tus trabajos directamente desde esta página.
                </strong>
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const count = assignments.filter((a) => {
                if (tab.id === 'pending') return a.status === 'pending';
                if (tab.id === 'submitted') return a.status === 'submitted';
                if (tab.id === 'graded') return a.status === 'graded';
                return false;
              }).length;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white text-brand_blue shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.label}
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === tab.id
                        ? 'bg-brand_yellow text-brand_blue'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar tareas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand_blue focus:border-transparent"
            />
          </div>

          {/* Course Filter (replacing community filter for group assignments) */}
          {courses.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FilterIcon className="inline h-4 w-4 mr-1" />
                Filtrar por Curso
              </label>
              <div className="flex flex-wrap gap-2">
                {courses.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => handleToggleCommunity(course.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedCommunities.includes(course.id)
                        ? 'bg-brand_blue text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <AcademicCapIcon className="inline h-4 w-4 mr-1" />
                    {course.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Assignments Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand_blue"></div>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <ClipboardCheckIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              No hay tareas {activeTab === 'pending' ? 'pendientes' : activeTab === 'submitted' ? 'entregadas' : 'calificadas'}
            </h3>
            <p className="text-gray-500">
              {searchQuery || selectedCommunities.length > 0
                ? 'Intenta cambiar los filtros'
                : 'Las tareas aparecerán aquí cuando sean asignadas'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
              >
                {/* Course Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-brand_blue">
                    <AcademicCapIcon className="h-3 w-3 mr-1" />
                    {assignment.course_title}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {assignment.title}
                </h3>

                {/* Course/Lesson */}
                <p className="text-sm text-gray-600 mb-3">
                  {assignment.course_title}
                  {assignment.lesson_title && ` • ${assignment.lesson_title}`}
                </p>

                {/* Description */}
                {assignment.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {assignment.description}
                  </p>
                )}

                {/* Metadata */}
                <div className="space-y-2 mb-4">
                  {assignment.due_date && (
                    <div className="flex items-center text-sm">
                      <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                      {formatDueDate(assignment.due_date)}
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-600">
                    <AcademicCapIcon className="h-4 w-4 text-gray-400 mr-2" />
                    {assignment.points} puntos
                  </div>
                </div>

                {/* Submission Status */}
                {assignment.status === 'submitted' && (
                  <div className="mb-4 p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center text-sm text-green-800">
                      <CheckCircleIcon className="h-5 w-5 mr-2" />
                      <div>
                        <p className="font-medium">Trabajo enviado</p>
                        {!assignment.is_original && assignment.submitter_name && (
                          <p className="text-xs text-green-600 mt-1">
                            Compartido por {assignment.submitter_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {assignment.status === 'graded' && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-800 font-medium">
                        Calificado
                      </span>
                      <span className="text-blue-900 font-bold">
                        {assignment.score}/{assignment.points}
                      </span>
                    </div>
                    {assignment.feedback && (
                      <p className="text-xs text-blue-700 mt-1 line-clamp-2">
                        {assignment.feedback}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex space-x-2">
                  {assignment.status === 'pending' && (
                    <button
                      onClick={() => handleSubmitAssignment(assignment)}
                      className="flex-1 bg-brand_blue text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Ver Detalles
                    </button>
                  )}
                  {(assignment.status === 'submitted' || assignment.status === 'graded') &&
                    assignment.file_url && (
                      <a
                        href={assignment.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium text-center"
                      >
                        Ver Trabajo
                      </a>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Group Submission Modal */}
      {showSubmissionModal && selectedAssignment && selectedGroup && (
        <GroupSubmissionModalV2
          assignment={selectedAssignment}
          group={selectedGroup}
          onClose={() => {
            setShowSubmissionModal(false);
            setSelectedAssignment(null);
            setSelectedGroup(null);
          }}
          onSubmit={handleGroupSubmit}
        />
      )}
    </MainLayout>
  );
};

export default TareasPage;
