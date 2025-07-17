import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import MainLayout from '../../../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { SearchIcon, XIcon, MenuIcon as GripVerticalIcon } from '@heroicons/react/solid';
import { getUserPrimaryRole } from '../../../../utils/roleUtils';
import { ChevronLeft, Save } from 'lucide-react';
import { LearningPathWithCourses, CourseInPath } from '../../../../types/learningPaths';

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail_url?: string;
}

export default function EditLearningPath() {
  const router = useRouter();
  const { id: pathId } = router.query;
  const supabase = useSupabaseClient();
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  
  // Learning path state
  const [learningPath, setLearningPath] = useState<LearningPathWithCourses | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCourses, setSelectedCourses] = useState<CourseInPath[]>([]);
  
  // Course list state
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Loading state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    if (router.isReady && pathId) {
      checkAuthAndLoadData();
    }
  }, [router.isReady, pathId]);

  useEffect(() => {
    // Filter courses based on search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredCourses(
        allCourses.filter(course => 
          course.title.toLowerCase().includes(query) ||
          course.description.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredCourses(allCourses);
    }
  }, [searchQuery, allCourses]);

  const checkAuthAndLoadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        router.push('/login');
        return;
      }
      
      setUser(session.user);
      
      // Check permissions
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();
      
      const userRole = await getUserPrimaryRole(session.user.id);
      const hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole);
      
      if (!hasAccess) {
        toast.error('No tienes permisos para editar rutas de aprendizaje');
        router.push('/dashboard');
        return;
      }
      
      setIsAdmin(userRole === 'admin');
      
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
      
      // Load learning path
      const pathResponse = await fetch(`/api/learning-paths/${pathId}`);
      if (!pathResponse.ok) {
        throw new Error('Failed to load learning path');
      }
      
      const pathData: LearningPathWithCourses = await pathResponse.json();
      setLearningPath(pathData);
      setName(pathData.name);
      setDescription(pathData.description);
      setSelectedCourses(pathData.courses || []);
      
      // Check ownership if not admin
      if (userRole !== 'admin' && pathData.created_by !== session.user.id) {
        toast.error('Solo puedes editar tus propias rutas de aprendizaje');
        router.push('/admin/learning-paths');
        return;
      }
      
      // Load all courses
      const { data: courses, error } = await supabase
        .from('courses')
        .select('id, title, description, thumbnail_url')
        .order('title');
      
      if (error) throw error;
      
      setAllCourses(courses || []);
      setFilteredCourses(courses || []);
      
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar los datos');
      router.push('/admin/learning-paths');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCourse = (course: Course) => {
    // Check if course is already selected
    if (selectedCourses.find(c => c.course_id === course.id)) {
      toast.error('Este curso ya está en la ruta');
      return;
    }
    
    const newCourse: CourseInPath = {
      course_id: course.id,
      course_title: course.title,
      course_description: course.description,
      sequence: selectedCourses.length + 1
    };
    
    setSelectedCourses([...selectedCourses, newCourse]);
    toast.success(`"${course.title}" agregado a la ruta`);
  };

  const handleRemoveCourse = (courseId: string) => {
    setSelectedCourses(prev => {
      const filtered = prev.filter(c => c.course_id !== courseId);
      // Resequence remaining courses
      return filtered.map((course, index) => ({
        ...course,
        sequence: index + 1
      }));
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const items = Array.from(selectedCourses);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update sequence numbers
    const resequenced = items.map((course, index) => ({
      ...course,
      sequence: index + 1
    }));
    
    setSelectedCourses(resequenced);
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    
    if (!description.trim()) {
      toast.error('La descripción es requerida');
      return;
    }
    
    if (selectedCourses.length === 0) {
      toast.error('Debes agregar al menos un curso a la ruta');
      return;
    }
    
    setSaving(true);
    const loadingToast = toast.loading('Actualizando ruta de aprendizaje...');
    
    try {
      const courseIds = selectedCourses
        .sort((a, b) => a.sequence - b.sequence)
        .map(c => c.course_id);
      
      const response = await fetch(`/api/learning-paths/${pathId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          courseIds
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update learning path');
      }

      toast.success('Ruta de aprendizaje actualizada exitosamente', { id: loadingToast });
      router.push('/admin/learning-paths');
      
    } catch (error: any) {
      console.error('Error updating learning path:', error);
      toast.error(error.message || 'Error al actualizar la ruta de aprendizaje', { id: loadingToast });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading || !learningPath) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="learning-paths"
      pageTitle={`Editar: ${learningPath.name}`}
      breadcrumbs={[
        { label: 'Panel', href: '/dashboard' },
        { label: 'Rutas de Aprendizaje', href: '/admin/learning-paths' },
        { label: 'Editar' }
      ]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <Head>
        <title>Editar Ruta de Aprendizaje</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin/learning-paths')}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver a Rutas de Aprendizaje
          </button>
          
          <h1 className="text-3xl font-bold text-brand_blue">
            Editar Ruta de Aprendizaje
          </h1>
          <p className="mt-2 text-gray-600">
            Modifica la secuencia de cursos para esta ruta de aprendizaje
          </p>
        </div>

        {/* Two-panel layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Panel - Available Courses */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Cursos Disponibles
            </h2>
            
            {/* Search input */}
            <div className="relative mb-4">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cursos..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-brand_blue focus:border-brand_blue sm:text-sm"
              />
            </div>
            
            {/* Course list */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredCourses.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No se encontraron cursos
                </p>
              ) : (
                filteredCourses.map((course) => {
                  const isSelected = selectedCourses.find(c => c.course_id === course.id);
                  return (
                    <div
                      key={course.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelected 
                          ? 'border-green-500 bg-green-50' 
                          : 'border-gray-200 hover:border-brand_blue hover:bg-gray-50'
                      }`}
                      onClick={() => !isSelected && handleAddCourse(course)}
                    >
                      <h3 className="font-medium text-gray-900">
                        {course.title}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {course.description}
                      </p>
                      {isSelected && (
                        <p className="text-xs text-green-600 mt-2">
                          ✓ Agregado a la ruta
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel - Learning Path Builder */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Detalles de la Ruta
            </h2>
            
            {/* Name and Description */}
            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Nombre de la Ruta <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand_blue focus:ring-brand_blue sm:text-sm"
                  placeholder="Ej: Introducción a la Docencia"
                />
              </div>
              
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Descripción <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand_blue focus:ring-brand_blue sm:text-sm"
                  placeholder="Describe el objetivo y contenido de esta ruta de aprendizaje..."
                />
              </div>
            </div>
            
            {/* Selected Courses */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Cursos en la Ruta ({selectedCourses.length})
              </h3>
              
              {selectedCourses.length === 0 ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <p className="text-gray-500">
                    Haz clic en los cursos de la izquierda para agregarlos a esta ruta
                  </p>
                </div>
              ) : (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable droppableId="selected-courses">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="space-y-2"
                      >
                        {selectedCourses.map((course, index) => (
                          <Draggable
                            key={course.course_id}
                            draggableId={course.course_id}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`p-3 bg-gray-50 border rounded-lg flex items-center ${
                                  snapshot.isDragging ? 'shadow-lg' : ''
                                }`}
                              >
                                <div
                                  {...provided.dragHandleProps}
                                  className="mr-3 text-gray-400 cursor-grab"
                                >
                                  <GripVerticalIcon className="h-5 w-5" />
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex items-center">
                                    <span className="text-sm font-medium text-gray-500 mr-2">
                                      {course.sequence}.
                                    </span>
                                    <h4 className="text-sm font-medium text-gray-900">
                                      {course.course_title}
                                    </h4>
                                  </div>
                                </div>
                                
                                <button
                                  onClick={() => handleRemoveCourse(course.course_id)}
                                  className="ml-2 text-red-600 hover:text-red-700"
                                >
                                  <XIcon className="h-5 w-5" />
                                </button>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => router.push('/admin/learning-paths')}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name || !description || selectedCourses.length === 0}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}