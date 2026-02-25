import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '../components/layout/MainLayout';
import ConsultantEarningsDashboard from '../components/hours/ConsultantEarningsDashboard';
import { getUserPrimaryRole } from '../utils/roleUtils';
import { Clock } from 'lucide-react';
import { User } from '@supabase/supabase-js';

const MisHorasPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [consultantName, setConsultantName] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    initializeAuth();
  }, [router.isReady]);

  const initializeAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData) {
        setAvatarUrl(profileData.avatar_url ?? '');
        setConsultantName(
          `${profileData.first_name ?? ''} ${profileData.last_name ?? ''}`.trim()
        );
      }

      const userRole = await getUserPrimaryRole(session.user.id);
      const isAdminUser = userRole === 'admin';
      const isConsultor = userRole === 'consultor';
      setIsAdmin(isAdminUser);

      // Only admin and consultor can access this page
      if (!isAdminUser && !isConsultor) {
        router.push('/dashboard');
        return;
      }
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <MainLayout
      user={user}
      currentPage="mis-horas"
      isAdmin={isAdmin}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-brand_primary/10 rounded-lg">
            <Clock className="h-6 w-6 text-brand_primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mis Horas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Consulte sus ganancias en EUR y CLP por período de tiempo.
            </p>
          </div>
        </div>

        <ConsultantEarningsDashboard
          consultantId={user.id}
          consultantName={consultantName}
        />
      </div>
    </MainLayout>
  );
};

export default MisHorasPage;
