import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '../../components/layout/MainLayout';
import ConsultantRateManager from '../../components/admin/ConsultantRateManager';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { DollarSign } from 'lucide-react';
import { User } from '@supabase/supabase-js';

const ConsultantRatesPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);

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
      }

      const userRole = await getUserPrimaryRole(session.user.id);
      const isAdminUser = userRole === 'admin';
      setIsAdmin(isAdminUser);

      if (!isAdminUser) {
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

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <MainLayout
      user={user}
      currentPage="consultant-rates"
      isAdmin={isAdmin}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-brand_primary/10 rounded-lg">
            <DollarSign className="h-6 w-6 text-brand_primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tarifas de Consultores</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gestione las tarifas por hora en EUR para cada consultor y tipo de servicio.
            </p>
          </div>
        </div>

        <ConsultantRateManager />
      </div>
    </MainLayout>
  );
};

export default ConsultantRatesPage;
