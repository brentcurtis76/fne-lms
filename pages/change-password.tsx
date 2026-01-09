import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import { LockClosedIcon, ExclamationIcon, LogoutIcon } from '@heroicons/react/outline';

export default function ChangePasswordPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isAdminReset, setIsAdminReset] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    if (!hasCheckedAuth) {
      checkAuth();
      setHasCheckedAuth(true);
    }
  }, [hasCheckedAuth]);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Check if user actually needs to change password
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', session.user.id)
        .single();

      if (profileError) {
        console.error('Error checking password change requirement:', profileError);
        // On error, assume user needs to change password (stay on page)
        // This prevents redirect loop when profile fetch fails
        setLoading(false);
        return;
      }

      if (!profile?.must_change_password) {
        // User doesn't need to change password, redirect to dashboard
        router.push('/dashboard');
        return;
      }

      // Check if this is an admin password reset
      const metadata = session.user.user_metadata;
      if (metadata?.password_reset_by_admin) {
        setIsAdminReset(true);
      }

      setLoading(false);
    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres';
    }
    if (!/[A-Z]/.test(password)) {
      return 'La contraseña debe contener al menos una letra mayúscula';
    }
    if (!/[a-z]/.test(password)) {
      return 'La contraseña debe contener al menos una letra minúscula';
    }
    if (!/[0-9]/.test(password)) {
      return 'La contraseña debe contener al menos un número';
    }
    return null;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUpdating(true);

    try {
      // First attempt: Try direct password update
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      // If we get a 422 error, it means secure password change is enabled
      // and we need to use a workaround for first-time password changes
      if (updateError && (updateError as any).status === 422) {
        console.log('Secure password change detected, using admin endpoint for first-time change');

        // Use the admin endpoint to bypass secure password change requirement
        const response = await fetch('/api/auth/force-password-change', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ newPassword }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to update password');
        }

        // If we reach here, password was updated successfully via admin endpoint
        // Continue with the normal flow
      } else if (updateError) {
        throw updateError;
      }

      // Update the must_change_password flag
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          must_change_password: false
        })
        .eq('id', user.id);

      if (profileError) {
        console.error('Could not update profile flags:', profileError);
        // Continue anyway - password was changed successfully
        // The important thing is the password is updated, not the flags
      }

      // Clear the admin reset metadata
      if (isAdminReset) {
        await supabase.auth.updateUser({
          data: {
            password_reset_by_admin: null,
            password_reset_at: null
          }
        });
      }

      // Check if profile is complete before redirecting
      const { data: profile, error: checkError } = await supabase
        .from('profiles')
        .select('first_name, last_name, school')
        .eq('id', user.id)
        .single();

      let isProfileComplete = false;

      if (checkError) {
        console.error('Could not check profile completion:', checkError);
        // On error, assume profile is incomplete and send to profile page
        toast.success('Contraseña actualizada exitosamente. Por favor completa tu perfil.');
      } else {
        isProfileComplete = profile?.first_name && profile?.last_name && profile?.school;

        if (isProfileComplete) {
          toast.success('Contraseña actualizada exitosamente');
        } else {
          toast.success('Contraseña actualizada exitosamente. Ahora completa tu perfil.');
        }
      }

      // Redirect based on profile completion status
      setTimeout(() => {
        if (isProfileComplete && !checkError) {
          router.push('/dashboard');
        } else {
          router.push('/profile');
        }
      }, 1000);
    } catch (error: any) {
      // Enhanced error logging for debugging
      console.error('Password update error - Full details:', {
        error: error,
        errorMessage: error?.message,
        errorCode: error?.code,
        errorStatus: error?.status,
        errorName: error?.name,
        userEmail: user?.email,
        timestamp: new Date().toISOString()
      });

      // Check for specific Supabase auth errors
      if (error?.message?.includes('reauthentication required') ||
        error?.message?.includes('New password should be different from the old password') ||
        error?.code === 'same_password') {
        toast.error('Por favor usa una contraseña diferente a la anterior');
      } else if (error?.message?.includes('Password should be at least') ||
        error?.message?.includes('password')) {
        // Supabase might have its own password requirements
        toast.error('La contraseña no cumple con los requisitos de seguridad del sistema');
      } else if (error?.status === 422 || error?.message?.includes('auth')) {
        // Common error when secure password change is enabled
        toast.error('Error de autenticación. Es posible que necesites volver a iniciar sesión. Por favor contacta al administrador.');
      } else {
        toast.error(error.message || 'Error al actualizar la contraseña. Por favor intenta nuevamente.');
      }

      // Log to help identify the issue for this specific user
      if (user?.email === 'maritza.cortes@lisamvallenar.cl') {
        console.warn('DEBUG - Password change failed for maritza.cortes:', {
          fullError: JSON.stringify(error, null, 2),
          stack: error?.stack
        });
      }
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a]"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Cambiar Contraseña - Genera</title>
      </Head>

      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        {/* Logout button in top right corner */}
        <div className="absolute top-4 right-4">
          <button
            onClick={handleLogout}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
          >
            <LogoutIcon className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </button>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-[#0a0a0a] rounded-full flex items-center justify-center">
              <LockClosedIcon className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Cambio de Contraseña Requerido
          </h2>
          <div className="mt-2 text-center">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 inline-flex items-center gap-2">
              <ExclamationIcon className="w-5 h-5 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                {isAdminReset
                  ? 'El administrador ha restablecido tu contraseña. Por seguridad, debes crear una nueva.'
                  : 'Por seguridad, debes cambiar tu contraseña en el primer inicio de sesión'
                }
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <form className="space-y-6" onSubmit={handlePasswordChange}>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                  Nueva Contraseña
                </label>
                <div className="mt-1 relative">
                  <input
                    id="new-password"
                    name="new-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#0a0a0a] focus:border-[#0a0a0a] sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                  Confirmar Nueva Contraseña
                </label>
                <div className="mt-1">
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-[#0a0a0a] focus:border-[#0a0a0a] sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="show-password"
                  name="show-password"
                  type="checkbox"
                  checked={showPasswords}
                  onChange={(e) => setShowPasswords(e.target.checked)}
                  className="h-4 w-4 text-[#0a0a0a] focus:ring-[#0a0a0a] border-gray-300 rounded"
                />
                <label htmlFor="show-password" className="ml-2 block text-sm text-gray-900">
                  Mostrar contraseñas
                </label>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Requisitos de la contraseña:
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className={`flex items-center gap-1 ${newPassword.length >= 8 ? 'text-green-600' : ''}`}>
                    <span>{newPassword.length >= 8 ? '✓' : '•'}</span>
                    Al menos 8 caracteres
                  </li>
                  <li className={`flex items-center gap-1 ${/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}`}>
                    <span>{/[A-Z]/.test(newPassword) ? '✓' : '•'}</span>
                    Al menos una letra mayúscula
                  </li>
                  <li className={`flex items-center gap-1 ${/[a-z]/.test(newPassword) ? 'text-green-600' : ''}`}>
                    <span>{/[a-z]/.test(newPassword) ? '✓' : '•'}</span>
                    Al menos una letra minúscula
                  </li>
                  <li className={`flex items-center gap-1 ${/[0-9]/.test(newPassword) ? 'text-green-600' : ''}`}>
                    <span>{/[0-9]/.test(newPassword) ? '✓' : '•'}</span>
                    Al menos un número
                  </li>
                </ul>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={updating || !newPassword || !confirmPassword}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#0a0a0a] hover:bg-[#fbbf24] hover:text-[#0a0a0a] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {updating ? 'Actualizando...' : 'Cambiar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}