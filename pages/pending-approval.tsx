import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import Header from '../components/layout/Header';

export default function PendingApprovalPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Get user profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(profileData);

      // If user is approved, redirect to dashboard
      if (profileData?.approval_status === 'approved') {
        router.push('/dashboard');
        return;
      }

      // If user is rejected, show rejection message
      if (profileData?.approval_status === 'rejected') {
        // Stay on this page but show rejection message
      }

      setLoading(false);
    };

    checkUser();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  const isRejected = profile?.approval_status === 'rejected';

  return (
    <>
      <Head>
        <title>Estado de Cuenta | FNE LMS</title>
      </Head>
      <Header user={user} isAdmin={false} showNavigation={false} onLogout={handleSignOut} />
      
      <div className="min-h-screen bg-brand_beige pt-40 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            {isRejected ? (
              <>
                {/* Rejection Message */}
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                
                <h1 className="text-2xl font-bold text-red-600 mb-4">
                  Acceso Denegado
                </h1>
                
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Tu solicitud de acceso a la plataforma ha sido revisada y no ha sido aprobada. 
                  Esto puede deberse a que tu institución educativa no forma parte de nuestros 
                  programas de capacitación actuales.
                </p>
                
                <p className="text-gray-600 mb-8">
                  Si crees que esto es un error o tienes preguntas sobre nuestros programas, 
                  puedes contactarnos a través de nuestro sitio web.
                </p>
                
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={handleSignOut}
                    className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cerrar Sesión
                  </button>
                  <a
                    href="https://nuevaeducacion.org/contacto"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-brand_blue text-white rounded-lg hover:bg-brand_yellow transition-colors"
                  >
                    Contactar FNE
                  </a>
                </div>
              </>
            ) : (
              <>
                {/* Pending Approval Message */}
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                
                <h1 className="text-2xl font-bold text-brand_blue mb-4">
                  Cuenta en Revisión
                </h1>
                
                <p className="text-gray-600 mb-6 leading-relaxed">
                  ¡Gracias por registrarte en la plataforma de Fundación Nueva Educación!
                </p>
                
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Tu cuenta está siendo revisada por nuestro equipo administrativo para verificar 
                  que tu institución educativa forma parte de nuestros programas de capacitación.
                </p>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-blue-800 mb-2">Información de tu perfil:</h3>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p><strong>Nombre:</strong> {profile?.first_name} {profile?.last_name}</p>
                    <p><strong>Email:</strong> {user?.email}</p>
                    <p><strong>Institución:</strong> {profile?.school}</p>
                  </div>
                </div>
                
                <p className="text-gray-600 mb-8">
                  Te notificaremos por correo electrónico una vez que tu cuenta sea aprobada. 
                  Este proceso generalmente toma 1-2 días hábiles.
                </p>
                
                <div className="flex justify-center">
                  <button
                    onClick={handleSignOut}
                    className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cerrar Sesión
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}