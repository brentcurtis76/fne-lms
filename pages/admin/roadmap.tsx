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

    if (data?.value && Array.isArray((data.value as { weeks?: unknown }).weeks)) {
      // Valid new-schema data with weeks array
      setRoadmapData(data.value as unknown as RoadmapData);
    } else {
      // No row yet, or old-schema data without weeks array — seed fresh with DEFAULT_DATA
      await supabase.from('roadmap_data').upsert(
        {
          key: ROADMAP_KEY,
          value: DEFAULT_DATA,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        },
        { onConflict: 'key' }
      );
      setRoadmapData(DEFAULT_DATA);
    }
  };

  const handleSave = async (data: RoadmapData): Promise<void> => {
    if (!user) return;

    const { error } = await supabase.from('roadmap_data').upsert(
      {
        key: ROADMAP_KEY,
        value: data,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: 'key' }
    );

    if (error) {
      throw error;
    }

    setRoadmapData(data);
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
      {roadmapData ? (
        <GeneraRoadmap initialData={roadmapData} onSave={handleSave} />
      ) : (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-500">Cargando roadmap...</div>
        </div>
      )}
    </MainLayout>
  );
};

export default RoadmapPage;
