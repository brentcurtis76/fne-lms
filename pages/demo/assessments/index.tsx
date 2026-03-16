import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  Eye,
  Play,
  ChevronRight,
} from 'lucide-react';
import { TransformationArea } from '@/types/assessment-builder';

interface DemoItem {
  templateId: string;
  name: string;
  area: TransformationArea;
  areaLabel: string;
  version: string;
  description: string;
  grantedAt: string;
}

const AREA_BADGE_COLORS: Partial<Record<TransformationArea, string>> = {
  personalizacion: 'bg-purple-100 text-purple-700',
  aprendizaje: 'bg-blue-100 text-blue-700',
  evaluacion: 'bg-amber-100 text-amber-700',
  proposito: 'bg-emerald-100 text-emerald-700',
  familias: 'bg-pink-100 text-pink-700',
  trabajo_docente: 'bg-cyan-100 text-cyan-700',
  liderazgo: 'bg-indigo-100 text-indigo-700',
};

const DemoAssessmentsListPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [demos, setDemos] = useState<DemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch demos
  const fetchDemos = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetch('/api/demo/assessments');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar demos');
      }

      const data = await response.json();
      setDemos(data.demos || []);
    } catch (error: any) {
      console.error('Error fetching demos:', error);
      toast.error(error.message || 'Error al cargar demos');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDemos();
    }
  }, [user, fetchDemos]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="demos"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={false}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Eye />}
        title="Demos Disponibles"
        subtitle="Instrumentos de evaluación en modo de práctica"
      />

      {/* MODO DEMO banner */}
      <div className="bg-amber-50 border-b-2 border-amber-400 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Eye className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            MODO DEMO — Las respuestas no se guardan. Este es un entorno de práctica para conocer los instrumentos.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Cargando demos...</p>
          </div>
        ) : demos.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <Eye className="mx-auto h-16 w-16 text-brand_blue/30" />
            <h3 className="mt-4 text-xl font-semibold text-brand_blue">
              No tienes demos asignados
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Contacta a un administrador para solicitar acceso a demos de instrumentos.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demos.map((demo) => (
              <DemoCard key={demo.templateId} demo={demo} />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

interface DemoCardProps {
  demo: DemoItem;
}

const DemoCard: React.FC<DemoCardProps> = ({ demo }) => {
  const badgeColor = AREA_BADGE_COLORS[demo.area] || 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="text-base font-semibold text-gray-900 line-clamp-2">
            {demo.name}
          </h3>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            v{demo.version}
          </span>
        </div>

        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mb-3 ${badgeColor}`}>
          {demo.areaLabel}
        </span>

        {demo.description && (
          <p className="text-sm text-gray-500 line-clamp-3">
            {demo.description}
          </p>
        )}
      </div>

      <div className="px-5 pb-5">
        <Link href={`/demo/assessments/${demo.templateId}`} legacyBehavior>
          <a className="inline-flex items-center justify-center w-full gap-1.5 px-4 py-2 bg-brand_primary text-white text-sm font-medium rounded-lg hover:bg-brand_primary/90 transition-colors">
            <Play className="w-4 h-4" />
            Iniciar Demo
          </a>
        </Link>
      </div>
    </div>
  );
};

export default DemoAssessmentsListPage;
