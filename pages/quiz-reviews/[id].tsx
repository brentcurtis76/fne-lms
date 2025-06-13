import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import QuizReviewPanel from '../../components/quiz/QuizReviewPanel';
import { useAvatar } from '../../hooks/useAvatar';
import { getQuizSubmission } from '../../lib/services/quizSubmissions';

export default function QuizReviewDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [submission, setSubmission] = useState<any>(null);
  
  const { url: avatarUrl } = useAvatar(user);
  
  useEffect(() => {
    if (!id) return;
    
    const checkSessionAndLoadData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Get user profile and role
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        
        if (profile) {
          setUserRole(profile.role);
          setIsAdmin(profile.role === 'admin');
          
          // Check if user is a consultant/teacher
          if (!['admin', 'consultor', 'equipo_directivo'].includes(profile.role)) {
            toast.error('No tienes permisos para acceder a esta página');
            router.push('/dashboard');
            return;
          }
        }
        
        // Load the submission
        const { data: submissionData, error: submissionError } = await getQuizSubmission(id as string);
        
        if (submissionError) {
          toast.error('Error al cargar el quiz');
          router.push('/quiz-reviews');
          return;
        }
        
        if (!submissionData) {
          toast.error('Quiz no encontrado');
          router.push('/quiz-reviews');
          return;
        }
        
        // Check if already graded
        if (submissionData.grading_status === 'completed') {
          toast('Este quiz ya ha sido calificado', { icon: 'ℹ️' });
          router.push('/quiz-reviews');
          return;
        }
        
        // Update graded_by to current user
        submissionData.graded_by = session.user.id;
        
        setSubmission(submissionData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading quiz submission:', error);
        toast.error('Error al cargar los datos');
        router.push('/quiz-reviews');
      }
    };

    checkSessionAndLoadData();
  }, [id, router]);
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
  
  const handleGradingComplete = () => {
    toast.success('Quiz calificado exitosamente');
    router.push('/quiz-reviews');
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Revisar Quiz - FNE LMS</title>
      </Head>

      <MainLayout 
        user={user}
        currentPage="quiz-reviews"
        pageTitle="Revisar Quiz"
        isAdmin={isAdmin}
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