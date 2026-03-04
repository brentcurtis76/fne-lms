import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { User } from '@supabase/supabase-js';
import MainLayout from '../../components/layout/MainLayout';
import GeneraRoadmap, { DEFAULT_DATA, RoadmapData } from '../../components/admin/GeneraRoadmap';
import { getUserPrimaryRole } from '../../utils/roleUtils';

const ROADMAP_KEY = 'genera-roadmap-v1';

const RoadmapPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [roadmapData, setRoadmapData] = useState<RoadmapData | null>(null);

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

      // Fetch roadmap data (admin gate passed)
      await loadRoadmapData(session.user.id);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadRoadmapData = async (userId: string) => {
    const { data, error } = await supabase
      .from('roadmap_data')
      .select('value')
      .eq('key', ROADMAP_KEY)
      .maybeSingle();

    if (error) {
      // On error, fall back to default data (don't block the UI)
      setRoadmapData(DEFAULT_DATA);
      return;
    }

    if (data?.value) {
      setRoadmapData(data.value as unknown as RoadmapData);
    } else {
      // No row yet — seed with default data
      const seedData: RoadmapData = { ...DEFAULT_DATA, lastUpdated: new Date().toISOString() };
      await supabase.from('roadmap_data').upsert(
        {
          key: ROADMAP_KEY,
          value: seedData,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'key' }
      );
      setRoadmapData(seedData);
    }
  };

  const handleSave = async (data: RoadmapData): Promise<void> => {
    if (!user) return;

    const payload = { ...data, lastUpdated: new Date().toISOString() };

    const { error } = await supabase.from('roadmap_data').upsert(
      {
        key: ROADMAP_KEY,
        value: payload,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: 'key' }
    );

    if (error) {
      throw error;
    }

    setRoadmapData(payload);
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
      currentPage="roadmap"
      isAdmin={isAdmin}
      avatarUrl={avatarUrl}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {roadmapData ? (
          <GeneraRoadmap initialData={roadmapData} onSave={handleSave} />
        ) : (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-500">Cargando roadmap...</div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default RoadmapPage;
