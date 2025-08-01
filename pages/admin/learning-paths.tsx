import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Link from 'next/link';
import Head from 'next/head';
import MainLayout from '../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import { toast } from 'react-hot-toast';
import { PlusCircleIcon, PencilIcon, UserGroupIcon, TrashIcon } from '@heroicons/react/solid';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { LearningPathWithDetails } from '../../types/learningPaths';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { Map, Plus } from 'lucide-react';

export default function AdminLearningPaths() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  
  // Data state
  const [learningPaths, setLearningPaths] = useState<LearningPathWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pathToDelete, setPathToDelete] = useState<LearningPathWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Check authentication and load data
  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        router.push('/login');
        return;
      }
      
      setUser(session.user);
      
      // Check admin status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();
      
      const userRole = await getUserPrimaryRole(session.user.id);
      const hasAccess = ['admin', 'equipo_directivo', 'consultor'].includes(userRole);
      
      if (!hasAccess) {
        toast.error('No tienes permisos para acceder a esta página');
        router.push('/dashboard');
        return;
      }
      
      setIsAdmin(userRole === 'admin');
      
      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
      
      // Load learning paths
      await loadLearningPaths();
      
    } catch (error) {
      console.error('Error checking auth:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadLearningPaths = async () => {
    try {
      const response = await fetch('/api/learning-paths', {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch learning paths');
      }

      const data = await response.json();
      setLearningPaths(data);
    } catch (error: any) {
      console.error('Error loading learning paths:', error);
      toast.error('Error al cargar las rutas de aprendizaje');
    }
  };

  const handleDelete = async () => {
    if (!pathToDelete) return;
    
    setIsDeleting(true);
    const loadingToast = toast.loading('Eliminando ruta de aprendizaje...');
    
    try {
      const response = await fetch(`/api/learning-paths/${pathToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete learning path');
      }

      toast.success('Ruta de aprendizaje eliminada exitosamente', { id: loadingToast });
      
      // Remove from local state
      setLearningPaths(prev => prev.filter(p => p.id !== pathToDelete.id));
      setDeleteModalOpen(false);
      setPathToDelete(null);
      
    } catch (error: any) {
      console.error('Error deleting learning path:', error);
      toast.error(error.message || 'Error al eliminar la ruta de aprendizaje', { id: loadingToast });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const openDeleteModal = (path: LearningPathWithDetails) => {
    setPathToDelete(path);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setPathToDelete(null);
    setDeleteModalOpen(false);
  };

  if (loading) {
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
      pageTitle="Rutas de Aprendizaje"
      breadcrumbs={[
        { label: 'Panel', href: '/dashboard' },
        { label: 'Rutas de Aprendizaje' }
      ]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <Head>
        <title>Rutas de Aprendizaje - Administración</title>
      </Head>

      <ResponsiveFunctionalPageHeader
        icon={<Map />}
        title="Rutas de Aprendizaje"
        subtitle="Crea y gestiona rutas de aprendizaje personalizadas"
        primaryAction={{
          label: 'Crear Nueva Ruta',
          onClick: () => router.push('/admin/learning-paths/new'),
          icon: <Plus className="w-4 h-4" />
        }}
      />

      <div className="px-4 md:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {learningPaths.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <Map className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay rutas de aprendizaje
              </h3>
              <p className="text-gray-500 mb-6">
                Comienza creando tu primera ruta de aprendizaje para guiar a los estudiantes.
              </p>
              <button
                onClick={() => router.push('/admin/learning-paths/new')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue"
              >
                <PlusCircleIcon className="h-5 w-5 mr-2" />
                Crear Primera Ruta
              </button>
            </div>
          ) : (
            <div className="bg-white shadow-sm rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Descripción
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cursos
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Creado por
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {learningPaths.map((path) => (
                    <tr key={path.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {path.name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500 max-w-xs truncate">
                          {path.description}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {path.course_count || 0} cursos
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm ${path.created_by_name === 'Sistema' ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                          {path.created_by_name || 'Desconocido'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <Link href={`/admin/learning-paths/${path.id}/edit`} legacyBehavior>
                            <a className="text-brand_blue hover:text-brand_blue/80 p-2 rounded-md hover:bg-gray-100 transition-colors">
                              <PencilIcon className="h-4 w-4" />
                            </a>
                          </Link>
                          <Link href={`/admin/learning-paths/${path.id}/assign`} legacyBehavior>
                            <a className="text-green-600 hover:text-green-700 p-2 rounded-md hover:bg-gray-100 transition-colors">
                              <UserGroupIcon className="h-4 w-4" />
                            </a>
                          </Link>
                          <button
                            onClick={() => openDeleteModal(path)}
                            className="text-red-600 hover:text-red-700 p-2 rounded-md hover:bg-gray-100 transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        title="Eliminar Ruta de Aprendizaje"
        message={`¿Estás seguro de que deseas eliminar la ruta "${pathToDelete?.name}"? Esta acción eliminará todas las asignaciones y no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous={true}
        isLoading={isDeleting}
      />
    </MainLayout>
  );
}