import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Head from 'next/head';
import Header from '../components/layout/Header';

export default function ResetPasswordPage() {
  const [supabase] = useState(() => createClientComponentClient());
  const router = useRouter();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Handle the password reset
    const handleAuthStateChange = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // If there's no session, redirect to login
        router.push('/login');
      }
    };

    handleAuthStateChange();
  }, [router, supabase.auth]);

  const handlePasswordUpdate = async () => {
    if (password !== confirmPassword) {
      setMessage('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setMessage('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        setMessage('Error al actualizar contraseña: ' + error.message);
      } else {
        setMessage('Contraseña actualizada exitosamente');
        // Redirect to dashboard after successful password reset
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      }
    } catch (err) {
      console.error('Password update error:', err);
      setMessage('Error al actualizar contraseña: An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand_beige relative overflow-hidden pt-40">
        <Head>
          <title>Restablecer Contraseña | FNE LMS</title>
        </Head>
        
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-brand_yellow opacity-20 -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-gray-300 opacity-30 -ml-20 -mb-20"></div>
        
        {/* Reset Password Card */}
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md z-10">
          <h1 className="text-2xl font-bold text-center text-brand_blue mb-8">
            Restablecer Contraseña
          </h1>
          
          <p className="text-sm text-gray-600 mb-6 text-center">
            Ingresa tu nueva contraseña
          </p>
          
          {/* New Password input */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Nueva Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-gray-400"></i>
              </div>
              <input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Confirm Password input */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Confirmar Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-gray-400"></i>
              </div>
              <input
                type="password"
                placeholder="••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Update Password Button */}
          <div className="mb-6">
            <button 
              onClick={handlePasswordUpdate}
              disabled={loading}
              className="w-full bg-brand_blue hover:bg-brand_yellow text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:opacity-50"
            >
              {loading ? 'Actualizando...' : 'Actualizar Contraseña'}
            </button>
          </div>
          
          {/* Back to Login */}
          <div className="text-center">
            <button 
              onClick={() => router.push('/login')}
              className="text-sm text-brand_blue hover:text-brand_yellow"
            >
              Volver al inicio de sesión
            </button>
          </div>
          
          {/* Error/success message */}
          {message && (
            <div className={`text-center p-2 rounded mt-4 ${
              message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </>
  );
}