import React, { useState, useEffect, useCallback } from 'react';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '@/components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, Eye, EyeOff, Calendar, User, Clock, GripVertical } from 'lucide-react';
import { getEnhancedUserInfo } from '@/utils/authHelpers';
import { UpcomingCourse, UpcomingCourseCard } from '@/components/courses/UpcomingCourseCard';

interface Instructor {
  id: string;
  full_name: string;
  avatar_url?: string;
}

export default function UpcomingCoursesAdmin() {
  const user = useUser();
  const supabase = useSupabaseClient();

  const [courses, setCourses] = useState<UpcomingCourse[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<UpcomingCourse | null>(null);
  const [saving, setSaving] = useState(false);

  // Role detection state
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [estimatedReleaseDate, setEstimatedReleaseDate] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);

  // Fetch courses
  const fetchCourses = useCallback(async () => {
    try {
      const response = await fetch('/api/upcoming-courses/admin');
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          toast.error('No tienes permisos para acceder a esta página');
          return;
        }
        throw new Error('Error al cargar cursos próximos');
      }

      const data = await response.json();
      setCourses(data);
    } catch (error) {
      console.error('Error fetching upcoming courses:', error);
      toast.error('Error al cargar los cursos próximos');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch instructors
  const fetchInstructors = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/get-instructors');
      if (response.ok) {
        const data = await response.json();
        setInstructors(data);
      }
    } catch (error) {
      console.error('Error fetching instructors:', error);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
    fetchInstructors();
  }, [fetchCourses, fetchInstructors]);

  // Role detection
  useEffect(() => {
    const detectUserRole = async () => {
      try {
        const userInfo = await getEnhancedUserInfo(user, supabase);
        setUserRole(userInfo.userRole);
        setIsAdmin(userInfo.isAdmin);
      } catch (error) {
        console.error('Error detecting user role:', error);
        setIsAdmin(false);
        setUserRole('');
      }
    };

    detectUserRole();
  }, [user, supabase]);

  const resetForm = () => {
    setEditingCourse(null);
    setTitle('');
    setDescription('');
    setInstructorId('');
    setThumbnailUrl('');
    setEstimatedReleaseDate('');
    setDisplayOrder(courses.length);
    setIsActive(true);
  };

  const openEditModal = (course: UpcomingCourse) => {
    setEditingCourse(course);
    setTitle(course.title);
    setDescription(course.description || '');
    setInstructorId(course.instructor_id || '');
    setThumbnailUrl(course.thumbnail_url || '');
    setEstimatedReleaseDate(
      course.estimated_release_date
        ? new Date(course.estimated_release_date).toISOString().split('T')[0]
        : ''
    );
    setDisplayOrder(course.display_order);
    setIsActive(course.is_active);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('El título es requerido');
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        instructor_id: instructorId || null,
        thumbnail_url: thumbnailUrl.trim() || null,
        estimated_release_date: estimatedReleaseDate || null,
        display_order: displayOrder,
        is_active: isActive,
      };

      let response;
      if (editingCourse) {
        response = await fetch(`/api/upcoming-courses/${editingCourse.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        response = await fetch('/api/upcoming-courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al guardar');
      }

      toast.success(editingCourse ? 'Curso actualizado' : 'Curso creado');
      resetForm();
      setShowModal(false);
      fetchCourses();
    } catch (error: any) {
      console.error('Error saving course:', error);
      toast.error(error.message || 'Error al guardar el curso');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este curso próximo?')) return;

    try {
      const response = await fetch(`/api/upcoming-courses/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Error al eliminar');

      toast.success('Curso eliminado');
      fetchCourses();
    } catch (error) {
      console.error('Error deleting course:', error);
      toast.error('Error al eliminar el curso');
    }
  };

  const handleToggleActive = async (course: UpcomingCourse) => {
    try {
      const response = await fetch(`/api/upcoming-courses/${course.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !course.is_active }),
      });

      if (!response.ok) throw new Error('Error al actualizar');

      toast.success(course.is_active ? 'Curso desactivado' : 'Curso activado');
      fetchCourses();
    } catch (error) {
      console.error('Error toggling active:', error);
      toast.error('Error al cambiar el estado');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <MainLayout
      user={user}
      currentPage="upcoming-courses"
      pageTitle="Próximos Cursos"
      isAdmin={isAdmin}
      userRole={userRole}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Próximos Cursos</h1>
              <p className="mt-1 text-sm text-gray-600">
                Administra los cursos que aparecerán como "Próximamente" en el dashboard
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="inline-flex items-center rounded-md border border-transparent bg-brand_primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2"
            >
              <Plus className="mr-2 h-5 w-5" />
              Agregar Curso
            </button>
          </div>
        </div>

        {/* Courses Grid */}
        <div className="rounded-lg bg-white p-6 shadow">
          {loading ? (
            <div className="py-8 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-brand_primary"></div>
              <p className="mt-2 text-gray-600">Cargando cursos...</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="py-8 text-center">
              <Clock className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-gray-500">No hay cursos próximos aún</p>
              <button
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="mt-4 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <Plus className="mr-2 h-5 w-5" />
                Crear primer curso próximo
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Preview section */}
              <div>
                <h2 className="mb-4 text-lg font-medium text-gray-900">
                  Vista previa (como se verá en el dashboard)
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {courses
                    .filter((c) => c.is_active)
                    .map((course) => (
                      <div key={course.id} className="w-full max-w-[280px]">
                        <UpcomingCourseCard course={course} />
                      </div>
                    ))}
                </div>
              </div>

              {/* Management table */}
              <div>
                <h2 className="mb-4 text-lg font-medium text-gray-900">
                  Gestionar Cursos ({courses.length})
                </h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Orden
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Curso
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Relator
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Fecha Estimada
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Estado
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {courses.map((course) => (
                        <tr key={course.id} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                              <GripVertical className="h-4 w-4 text-gray-400" />
                              {course.display_order}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center">
                              {course.thumbnail_url ? (
                                <img
                                  src={course.thumbnail_url}
                                  alt=""
                                  className="mr-3 h-10 w-10 rounded object-cover"
                                />
                              ) : (
                                <div className="mr-3 flex h-10 w-10 items-center justify-center rounded bg-gray-200">
                                  <Clock className="h-5 w-5 text-gray-400" />
                                </div>
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {course.title}
                                </div>
                                {course.description && (
                                  <div className="max-w-xs truncate text-sm text-gray-500">
                                    {course.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {course.instructor ? (
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                {course.instructor.full_name}
                              </div>
                            ) : (
                              <span className="text-gray-400">Sin asignar</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-500">
                            {course.estimated_release_date ? (
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-brand_accent" />
                                {formatDate(course.estimated_release_date)}
                              </div>
                            ) : (
                              <span className="text-gray-400">Por confirmar</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                course.is_active
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {course.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => handleToggleActive(course)}
                                className="text-gray-600 hover:text-gray-900"
                                title={course.is_active ? 'Desactivar' : 'Activar'}
                              >
                                {course.is_active ? (
                                  <EyeOff className="h-5 w-5" />
                                ) : (
                                  <Eye className="h-5 w-5" />
                                )}
                              </button>
                              <button
                                onClick={() => openEditModal(course)}
                                className="text-brand_primary hover:text-gray-700"
                                title="Editar"
                              >
                                <Edit2 className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(course.id)}
                                className="text-red-600 hover:text-red-900"
                                title="Eliminar"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Editor Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center px-4 pb-20 pt-4 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
              </div>

              <div className="inline-block w-full transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:max-w-lg sm:align-middle">
                <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium leading-6 text-gray-900">
                      {editingCourse ? 'Editar Curso Próximo' : 'Nuevo Curso Próximo'}
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {/* Title */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Título <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm"
                        placeholder="Nombre del curso"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Descripción
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm"
                        placeholder="Descripción breve del curso"
                      />
                    </div>

                    {/* Instructor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Relator
                      </label>
                      <select
                        value={instructorId}
                        onChange={(e) => setInstructorId(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm"
                      >
                        <option value="">Seleccionar relator...</option>
                        {instructors.map((instructor) => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Thumbnail URL */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        URL de Imagen
                      </label>
                      <input
                        type="url"
                        value={thumbnailUrl}
                        onChange={(e) => setThumbnailUrl(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm"
                        placeholder="https://..."
                      />
                      {thumbnailUrl && (
                        <div className="mt-2">
                          <img
                            src={thumbnailUrl}
                            alt="Preview"
                            className="h-24 w-auto rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Estimated Release Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Fecha Estimada de Lanzamiento
                      </label>
                      <input
                        type="date"
                        value={estimatedReleaseDate}
                        onChange={(e) => setEstimatedReleaseDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Se mostrará como "Disponible en [Mes Año]"
                      </p>
                    </div>

                    {/* Display Order */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Orden de Visualización
                      </label>
                      <input
                        type="number"
                        value={displayOrder}
                        onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                        min={0}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 sm:text-sm"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Números menores aparecen primero
                      </p>
                    </div>

                    {/* Active Status */}
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                      />
                      <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                        Activo (visible en el dashboard)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex w-full justify-center rounded-md border border-transparent bg-brand_primary px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 disabled:opacity-50 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    {saving ? 'Guardando...' : editingCourse ? 'Actualizar' : 'Crear'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand_accent focus:ring-offset-2 sm:ml-3 sm:mt-0 sm:w-auto sm:text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
