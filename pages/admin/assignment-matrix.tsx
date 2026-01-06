import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import MainLayout from '../../components/layout/MainLayout';
import { AssignmentMatrixContainer } from '../../components/admin/assignment-matrix';
import { Grid3X3 } from 'lucide-react';
import { getUserPrimaryRole } from '../../utils/roleUtils';

export default function AssignmentMatrixPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Check authentication and authorization
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Check role
      const userRole = await getUserPrimaryRole(session.user.id);
      const allowedRoles = ['admin', 'consultor'];

      if (!userRole || !allowedRoles.includes(userRole)) {
        router.push('/dashboard');
        return;
      }

      setIsAdmin(userRole === 'admin');

      // Get avatar URL
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }

      setLoading(false);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  };

  if (loading) {
    return (
      <MainLayout
        user={null}
        isAdmin={false}
        avatarUrl=""
        pageTitle="Cargando..."
      >
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      <Head>
        <title>Matriz de Asignaciones | Genera</title>
      </Head>

      <MainLayout
        user={user}
        isAdmin={isAdmin}
        avatarUrl={avatarUrl}
        pageTitle=""
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page header */}
          <div className="mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Grid3X3 className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Matriz de Asignaciones
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Visualiza y gestiona asignaciones de cursos y rutas por usuario o grupo
                </p>
              </div>
            </div>
          </div>

          {/* Main content */}
          <AssignmentMatrixContainer />
        </div>
      </MainLayout>
    </>
  );
}
