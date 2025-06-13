import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import MainLayout from '../../components/layout/MainLayout';
import {
  UserGroupIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  ArchiveIcon as ArchiveBoxIcon,
  UsersIcon,
  AcademicCapIcon,
  BookOpenIcon,
  CalendarIcon,
  ChevronRightIcon,
  FilterIcon as FunnelIcon,
  SearchIcon as MagnifyingGlassIcon
} from '@heroicons/react/outline';
import { getAssignmentInstances } from '../../lib/services/assignmentInstances';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AssignmentInstance {
  id: string;
  title: string;
  due_date: string | null;
  start_date: string | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  cohort_name: string | null;
  groups: any[];
  created_at: string;
  assignment_templates: {
    template_title: string;
    assignment_type: string;
    lessons: {
      lesson_title: string;
      modules: {
        module_title: string;
      };
    };
  };
  profiles: {
    full_name: string;
  };
}

interface CourseWithAssignments {
  id: string;
  title: string;
  assignmentCount: number;
  assignments: AssignmentInstance[];
}

export default function GroupAssignmentsManagement() {
  const router = useRouter();
  const { user, profile, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseWithAssignments[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (user) {
      const timeoutId = setTimeout(() => {
        if (loading) {
          setError('La carga está tardando más de lo esperado. Por favor, recarga la página.');
          setLoading(false);
        }
      }, 10000); // 10 second timeout

      fetchAssignments();
      
      return () => clearTimeout(timeoutId);
    }
  }, [user]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      
      // Get all courses the user has access to
      let coursesList: { id: string; title: string }[] = [];
      
      if (!isAdmin) {
        // For consultants, get only assigned courses
        const { data: assignedCourses, error: assignedError } = await supabase
          .from('course_assignments')
          .select(`
            course_id,
            courses!inner (
              id,
              title
            )
          `)
          .eq('teacher_id', user?.id);
          
        if (assignedError) throw assignedError;
        coursesList = assignedCourses?.map((ca: any) => ({ 
          id: ca.courses.id, 
          title: ca.courses.title 
        })) || [];
      } else {
        // For admins, get all courses
        const { data: allCourses, error: coursesError } = await supabase
          .from('courses')
          .select('id, title')
          .order('title');
          
        if (coursesError) throw coursesError;
        coursesList = allCourses || [];
      }
      
      // Get assignments for each course
      const coursesWithAssignments = await Promise.all(
        (coursesList || []).map(async (course) => {
          const { data: assignments } = await getAssignmentInstances(course.id);
          
          // Filter only group assignments
          const groupAssignments = assignments?.filter(a => 
            a.assignment_templates?.assignment_type === 'group'
          ) || [];
          
          return {
            id: course.id,
            title: course.title,
            assignmentCount: groupAssignments.length,
            assignments: groupAssignments
          };
        })
      );
      
      // Filter out courses with no group assignments
      setCourses(coursesWithAssignments.filter(c => c.assignmentCount > 0));
      
      // Select first course by default
      if (coursesWithAssignments.length > 0 && !selectedCourse) {
        setSelectedCourse(coursesWithAssignments[0].id);
      }
    } catch (error: any) {
      console.error('Error fetching assignments:', error);
      setError(error.message || 'Error al cargar las tareas grupales');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'completed':
        return <AcademicCapIcon className="h-5 w-5 text-blue-500" />;
      case 'archived':
        return <ArchiveBoxIcon className="h-5 w-5 text-gray-400" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'active':
        return 'Activa';
      case 'completed':
        return 'Completada';
      case 'archived':
        return 'Archivada';
      default:
        return status;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'archived':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredAssignments = selectedCourse
    ? courses
        .find(c => c.id === selectedCourse)
        ?.assignments.filter(assignment => {
          const matchesSearch = searchTerm === '' || 
            assignment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            assignment.assignment_templates.template_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            assignment.cohort_name?.toLowerCase().includes(searchTerm.toLowerCase());
          
          const matchesStatus = statusFilter === 'all' || assignment.status === statusFilter;
          
          return matchesSearch && matchesStatus;
        }) || []
    : [];

  const selectedCourseData = courses.find(c => c.id === selectedCourse);

  return (
    <MainLayout 
      user={user}
      currentPage="group-assignments"
      isAdmin={isAdmin}
      userRole={profile?.role}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <UserGroupIcon className="h-8 w-8 mr-3 text-[#00365b]" />
                Gestión de Tareas Grupales
              </h1>
              <p className="mt-2 text-gray-600">
                Administra y crea instancias de tareas grupales para tus cursos
              </p>
            </div>
            <Link
              href="/group-assignments/new"
              className="bg-[#00365b] text-white px-4 py-2 rounded-lg hover:bg-[#004a7a] transition-colors flex items-center"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Nueva Tarea Grupal
            </Link>
          </div>
        </div>

        {/* Course Tabs */}
        {courses.length > 0 && (
          <div className="mb-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 overflow-x-auto">
                {courses.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourse(course.id)}
                    className={`
                      whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm
                      ${selectedCourse === course.id
                        ? 'border-[#00365b] text-[#00365b]'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <div className="flex items-center">
                      <BookOpenIcon className="h-4 w-4 mr-2" />
                      {course.title}
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                        selectedCourse === course.id
                          ? 'bg-[#00365b] text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {course.assignmentCount}
                      </span>
                    </div>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por título, plantilla o cohorte..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="active">Activas</option>
              <option value="completed">Completadas</option>
              <option value="archived">Archivadas</option>
            </select>
          </div>
        </div>

        {/* Assignments List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00365b] mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando tareas grupales...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
              <p className="text-red-800 mb-4">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  fetchAssignments();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : filteredAssignments.length > 0 ? (
          <div className="grid gap-4">
            {filteredAssignments.map((assignment) => (
              <Link
                key={assignment.id}
                href={`/group-assignments/${assignment.id}`}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      {getStatusIcon(assignment.status)}
                      <h3 className="ml-2 text-lg font-semibold text-gray-900">
                        {assignment.title}
                      </h3>
                      <span className={`ml-3 px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(assignment.status)}`}>
                        {getStatusLabel(assignment.status)}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <p className="flex items-center">
                        <BookOpenIcon className="h-4 w-4 mr-2 text-gray-400" />
                        {assignment.assignment_templates.lessons.modules.module_title} → {assignment.assignment_templates.lessons.lesson_title}
                      </p>
                      
                      {assignment.cohort_name && (
                        <p className="flex items-center">
                          <UsersIcon className="h-4 w-4 mr-2 text-gray-400" />
                          Cohorte: {assignment.cohort_name}
                        </p>
                      )}
                      
                      <div className="flex items-center space-x-4">
                        {assignment.due_date && (
                          <p className="flex items-center">
                            <CalendarIcon className="h-4 w-4 mr-2 text-gray-400" />
                            Vence: {format(new Date(assignment.due_date), "d 'de' MMMM, yyyy", { locale: es })}
                          </p>
                        )}
                        
                        <p className="flex items-center">
                          <UserGroupIcon className="h-4 w-4 mr-2 text-gray-400" />
                          {assignment.groups.length} grupos
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <ChevronRightIcon className="h-5 w-5 text-gray-400 ml-4" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter !== 'all'
                ? 'No se encontraron tareas grupales con los filtros aplicados'
                : selectedCourseData
                  ? `No hay tareas grupales en ${selectedCourseData.title}`
                  : 'No hay tareas grupales disponibles'
              }
            </p>
            <Link
              href="/group-assignments/new"
              className="text-[#00365b] hover:text-[#004a7a] font-medium"
            >
              Crear primera tarea grupal →
            </Link>
          </div>
        )}
      </div>
    </MainLayout>
  );
}