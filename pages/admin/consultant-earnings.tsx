import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import MainLayout from '../../components/layout/MainLayout';
import ConsultantEarningsDashboard from '../../components/hours/ConsultantEarningsDashboard';
import { getUserPrimaryRole } from '../../utils/roleUtils';
import { TrendingUp } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface ConsultantProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const ConsultantEarningsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [consultants, setConsultants] = useState<ConsultantProfile[]>([]);
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>('');
  const [selectedConsultantName, setSelectedConsultantName] = useState<string>('');

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

      // Load consultants for the selector
      await loadConsultants();
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadConsultants = async () => {
    try {
      const response = await fetch('/api/admin/consultant-assignment-users');
      if (!response.ok) return;
      const json = await response.json();
      // The endpoint returns { consultants: [...], students: [...], ... }
      const users: ConsultantProfile[] = json.consultants ?? [];
      if (Array.isArray(users)) {
        setConsultants(users);
        if (users.length > 0) {
          setSelectedConsultantId(users[0].id);
          setSelectedConsultantName(`${users[0].first_name} ${users[0].last_name}`);
        }
      }
    } catch {
      // Silently fail
    }
  };

  function handleConsultantChange(consultantId: string) {
    setSelectedConsultantId(consultantId);
    const found = consultants.find((c) => c.id === consultantId);
    setSelectedConsultantName(found ? `${found.first_name} ${found.last_name}` : '');
  }

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
      currentPage="consultant-earnings"
      isAdmin={isAdmin}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-brand_primary/10 rounded-lg">
            <TrendingUp className="h-6 w-6 text-brand_primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ganancias de Consultores</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Visualice las ganancias en EUR y CLP por consultor y período.
            </p>
          </div>
        </div>

        {/* Consultant selector */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Seleccionar Consultor
          </label>
          <select
            value={selectedConsultantId}
            onChange={(e) => handleConsultantChange(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand_accent min-w-[250px]"
          >
            <option value="">Seleccionar consultor...</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </select>
        </div>

        {/* Earnings dashboard */}
        {selectedConsultantId ? (
          <ConsultantEarningsDashboard
            consultantId={selectedConsultantId}
            consultantName={selectedConsultantName}
          />
        ) : (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            Seleccione un consultor para ver sus ganancias.
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ConsultantEarningsPage;
