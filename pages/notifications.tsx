import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import MainLayout from '../components/layout/MainLayout';
import { BellIcon, ArrowLeftIcon } from '@heroicons/react/outline';

export default function NotificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkUserAuth();
  }, []);

  const checkUserAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setCurrentUser(session.user);

      // Check if user has admin role
      const { data: userData } = await supabase.auth.getUser();
      const adminFromMetadata = userData?.user?.user_metadata?.role === 'admin';
      
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
        
      const adminFromProfile = profileData?.role === 'admin';
      setIsAdmin(adminFromMetadata || adminFromProfile);
      
    } catch (error) {
      console.error('Authentication error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout 
        user={currentUser} 
        currentPage="notifications"
        pageTitle="Notificaciones"
        isAdmin={isAdmin}
      >
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={currentUser} 
      currentPage="notifications"
      pageTitle="Notificaciones"
      isAdmin={isAdmin}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <button
              onClick={() => router.back()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Todas las Notificaciones</h1>
              <p className="text-gray-600 mt-1">Gestiona todas tus notificaciones desde aquí</p>
            </div>
          </div>
        </div>

        {/* Coming Soon Content */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-12 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <BellIcon className="h-8 w-8 text-blue-600" />
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Página de Notificaciones Completa
            </h2>
            
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Esta página mostrará todas tus notificaciones con filtros avanzados, 
              búsqueda y gestión completa. Estará disponible pronto.
            </p>

            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Funcionalidades Próximas:</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Filtros por categoría y estado</li>
                  <li>• Búsqueda avanzada de notificaciones</li>
                  <li>• Gestión masiva de notificaciones</li>
                  <li>• Configuración de preferencias</li>
                  <li>• Historial completo</li>
                </ul>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#004a7a] transition-colors"
              >
                Volver al Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}