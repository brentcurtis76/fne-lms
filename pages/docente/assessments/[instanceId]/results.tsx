import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { BarChart3, ArrowLeft } from 'lucide-react';
import HelpButton from '@/components/tutorials/HelpButton';
import {
  SummaryCards,
  StrengthsWeaknesses,
  GapAnalysisSection,
  ResultsCharts,
  DetailedResults,
} from '@/components/assessment/results';
import type { ResultsData } from '@/components/assessment/results';

const AssessmentResults: React.FC = () => {
  const router = useRouter();
  const { instanceId } = router.query;
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [results, setResults] = useState<ResultsData | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Check auth
  useEffect(() => {
    const checkAuth = async () => {
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
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch results
  const fetchResults = useCallback(async () => {
    if (!user || !instanceId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/docente/assessments/${instanceId}/results`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar resultados');
      }

      const data = await response.json();
      setResults(data);

      // Expand first module by default
      if (data.results?.moduleScores?.length > 0) {
        setExpandedModules(new Set([data.results.moduleScores[0].moduleId]));
      }
    } catch (error: any) {
      console.error('Error fetching results:', error);
      toast.error(error.message || 'Error al cargar resultados');
      router.push('/docente/assessments');
    } finally {
      setLoading(false);
    }
  }, [user, instanceId, router]);

  useEffect(() => {
    if (user && instanceId) {
      fetchResults();
    }
  }, [user, instanceId, fetchResults]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Loading state
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-gray-600">No se encontraron resultados</p>
      </div>
    );
  }

  const { template, results: res, stats } = results;

  return (
    <MainLayout
      user={user}
      currentPage="assessments"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={false}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<BarChart3 />}
        title="Resultados"
        subtitle={`${template.areaLabel} - ${template.name}`}
      >
        <HelpButton sectionId="proceso-de-cambio" />
      </ResponsiveFunctionalPageHeader>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link href="/docente/assessments" legacyBehavior>
          <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_primary mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a evaluaciones
          </a>
        </Link>

        <SummaryCards
          totalScore={res.totalScore}
          overallLevel={res.overallLevel}
          overallLevelLabel={res.overallLevelLabel}
          expectedLevelLabel={res.expectedLevelLabel}
          meetsExpectations={res.meetsExpectations}
          transformationYear={results.instance.transformationYear}
          generationType={results.instance.generationType}
          indicatorsAboveExpectation={stats.indicatorsAboveExpectation}
          totalIndicators={stats.totalIndicators}
        />

        <StrengthsWeaknesses
          strongestModule={stats.strongestModule}
          weakestModule={stats.weakestModule}
        />

        {results.gapAnalysis && (
          <GapAnalysisSection
            gapAnalysis={results.gapAnalysis}
            transformationYear={results.instance.transformationYear}
            generationType={results.instance.generationType}
          />
        )}

        <ResultsCharts moduleScores={res.moduleScores} />

        <DetailedResults
          objectiveScores={res.objectiveScores}
          moduleScores={res.moduleScores}
          expandedModules={expandedModules}
          onToggleModule={toggleModule}
        />

        {/* Completion info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Evaluación completada el{' '}
            {new Date(results.instance.completedAt).toLocaleDateString('es-CL', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <p className="text-xs mt-1">Versión del instrumento: {results.instance.snapshotVersion}</p>
        </div>
      </div>
    </MainLayout>
  );
};

export default AssessmentResults;
