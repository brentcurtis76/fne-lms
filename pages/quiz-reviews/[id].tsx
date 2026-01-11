import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import QuizReviewPanel from '../../components/quiz/QuizReviewPanel';
import { useAvatar } from '../../hooks/useAvatar';

export default function QuizReviewDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const session = useSession();
  const supabaseClient = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [submission, setSubmission] = useState<any>(null);

  const user = session?.user ?? null;
  const { url: avatarUrl } = useAvatar(user);

  useEffect(() => {
    if (!id || !session) return;

    const loadData = async () => {
      try {
        setLoading(true);

        // Get auth token for API call
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession?.access_token) {
          toast.error('Sesión no válida');
          router.push('/login');
          return;
        }

        // Call API endpoint that uses service role to bypass RLS
        const response = await fetch(`/api/quiz-reviews/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`
          }
        });

        if (!response.ok) {
          const errorData = await response.json();

          if (response.status === 403) {
            toast.error(errorData.error || 'No tienes permisos para acceder a esta página');
            router.push('/dashboard');
            return;
          }

          if (response.status === 404) {
            toast.error('Quiz no encontrado');
            router.push('/quiz-reviews');
            return;
          }

          throw new Error(errorData.error || 'Failed to fetch quiz');
        }

        const { data: submissionData, userRole: role, isAdmin: adminStatus } = await response.json();

        setIsAdmin(adminStatus);
        setUserRole(role);

        if (submissionData.review_status && submissionData.review_status !== 'pending') {
          toast('Este quiz ya ha sido revisado', { icon: 'ℹ️' });
          router.push('/quiz-reviews');
          return;
        }

        setSubmission(submissionData);
      } catch (error) {
        console.error('Error loading quiz submission:', error);
        toast.error('Error al cargar los datos');
        router.push('/quiz-reviews');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, session, router]);

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/login');
  };

  const handleGradingComplete = () => {
    toast.success('Quiz calificado exitosamente');
    router.push('/quiz-reviews');
  };

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Revisar Quiz - Genera</title>
      </Head>

      <MainLayout
        user={user}
        currentPage="quiz-reviews"
        pageTitle="Revisar Quiz"
        isAdmin={isAdmin}
        userRole={userRole}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="p-6">
          {submission && (
            <QuizReviewPanel
              submission={submission}
              onGradingComplete={handleGradingComplete}
            />
          )}
        </div>
      </MainLayout>
    </>
  );
}
