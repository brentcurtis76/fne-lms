import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import Link from 'next/link';
import { checkProfileCompletion } from '../utils/profileUtils';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Debug Supabase configuration
  useEffect(() => {
    console.log('Supabase config check:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      keyExists: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseInstance: !!supabase
    });
  }, []);

  useEffect(() => {
    // Check if we should clear session based on remember me preference
    const checkSessionPersistence = async () => {
      try {
        const rememberMePreference = localStorage.getItem('rememberMe');
        const sessionOnly = sessionStorage.getItem('sessionOnly');
        
        // If user didn't choose "remember me" and this is a new browser session
        if (rememberMePreference === 'false' && sessionOnly !== 'true') {
          // Clear the session as the browser was closed/reopened
          await supabase.auth.signOut();
          sessionStorage.removeItem('sessionOnly');
        }
        
        // Set the checkbox state based on stored preference
        if (rememberMePreference === 'true') {
          setRememberMe(true);
        }
      } catch (error) {
        console.error('Error checking session persistence:', error);
        // If there's an error, just continue without session clearing
      }
    };

    checkSessionPersistence();
  }, [supabase.auth]);

  const handleSignIn = async () => {
    try {
      const { error, data } = await supabase.auth.signInWithPassword({ 
        email, 
        password
      });

      // Store the remember me preference after successful login
      if (!error) {
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          // Remove any session-only flag
          sessionStorage.removeItem('sessionOnly');
        } else {
          localStorage.setItem('rememberMe', 'false');
          // Set a flag to clear session on browser close
          sessionStorage.setItem('sessionOnly', 'true');
        }
      }

      if (error) {
        setMessage('Login failed: ' + error.message);
      } else {
        setMessage('Login successful!');
        
        // Check if profile is complete and redirect accordingly
        const userId = data.user?.id;
        if (userId) {
          const isProfileComplete = await checkProfileCompletion(userId);
          
          if (isProfileComplete) {
            // If profile is complete, redirect to dashboard
            router.push('/dashboard');
          } else {
            // If profile is incomplete, redirect to profile page
            router.push('/profile');
          }
        } else {
          // Fallback if user ID is not available
          router.push('/profile');
        }
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setMessage('Login failed: An unexpected error occurred');
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      setMessage('Por favor ingresa email y contraseña');
      return;
    }

    if (password.length < 6) {
      setMessage('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      console.log('Attempting signup with:', { email, passwordLength: password.length });
      
      // Clear any existing sessions first
      await supabase.auth.signOut();
      
      // Check if user already exists first
      const { data: existingSession } = await supabase.auth.getSession();
      console.log('Current session before signup:', existingSession);
      
      const { error, data } = await supabase.auth.signUp({ 
        email: email.trim(), 
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/profile`
        }
      });

      console.log('Signup response:', { 
        error, 
        data,
        userExists: data?.user && !data?.session,
        needsConfirmation: data?.user && !data?.session,
        autoSignedIn: !!data?.session
      });

      if (error) {
        console.error('Signup error details:', error);
        setMessage('Error de registro: ' + error.message);
      } else {
        setMessage('¡Registro exitoso! Revisa tu email para confirmar tu cuenta.');
        // Don't redirect immediately, let them confirm email first
      }
    } catch (err) {
      console.error('Sign up error:', err);
      setMessage('Error de registro: Ocurrió un error inesperado');
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setMessage('Por favor ingresa tu correo electrónico');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        setMessage('Error al enviar email: ' + error.message);
      } else {
        setMessage('Se ha enviado un link de recuperación a tu correo electrónico');
        setIsResetMode(false);
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setMessage('Error al enviar email: An unexpected error occurred');
    }
  };

  return (
    <>
      <Head>
        <title>Inicia sesión en tu cuenta | FNE LMS</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
          integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" 
          crossOrigin="anonymous" 
          referrerPolicy="no-referrer" 
        />
      </Head>
      
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand_beige relative overflow-hidden">
      
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-brand_yellow opacity-20 -mr-20 -mt-20"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-gray-300 opacity-30 -ml-20 -mb-20"></div>
      
      
      {/* Login Card */}
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md z-10">
        <h1 className="text-2xl font-bold text-center text-brand_blue mb-8">
          {isResetMode ? 'Recuperar contraseña' : 'Inicia sesión en tu cuenta'}
        </h1>
        
        {/* Email input */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Correo electrónico</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i className="fa-solid fa-envelope text-gray-400"></i>
            </div>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
            />
          </div>
        </div>
        
        {/* Password input - only show in login mode */}
        {!isResetMode && (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-gray-400"></i>
              </div>
              <input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Reset mode instructions */}
        {isResetMode && (
          <div className="mb-6">
            <p className="text-sm text-gray-600">
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>
        )}
        
        {/* Remember me and Forgot password - only show in login mode */}
        {!isResetMode && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="remember" 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-brand_blue focus:ring-brand_blue border-gray-300 rounded"
              />
              <label htmlFor="remember" className="ml-2 block text-sm">Recordarme</label>
            </div>
            <div>
              <button 
                type="button"
                onClick={() => setIsResetMode(true)}
                className="text-sm text-brand_blue hover:text-brand_yellow"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>
        )}
        
        {/* Buttons */}
        {isResetMode ? (
          <div className="flex gap-4 mb-6">
            <button 
              onClick={() => setIsResetMode(false)} 
              className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
            >
              Volver
            </button>
            <button 
              onClick={handlePasswordReset} 
              className="flex-1 bg-brand_blue hover:bg-brand_yellow text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
            >
              Enviar enlace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button 
              onClick={handleSignIn} 
              className="bg-brand_blue hover:bg-brand_yellow text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
            >
              Entrar
            </button>
            <button 
              onClick={handleSignUp} 
              className="bg-white border-2 border-brand_blue hover:bg-brand_yellow hover:border-brand_yellow text-brand_blue hover:text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
            >
              Registrarse
            </button>
          </div>
        )}
        
        {/* Error/success message */}
        {message && (
          <div className={`text-center p-2 rounded ${message.includes('failed') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}
        

      </div>
    </div>
    </>
  );
}