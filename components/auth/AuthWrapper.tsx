import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthEnhanced } from '../../hooks/useAuthEnhanced';

interface AuthWrapperProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireRoles?: string[];
  requirePermissions?: string[];
  fallbackPath?: string;
  showError?: boolean;
}

export const AuthWrapper: React.FC<AuthWrapperProps> = ({
  children,
  requireAuth = true,
  requireRoles = [],
  requirePermissions = [],
  fallbackPath = '/login',
  showError = true
}) => {
  const router = useRouter();
  const auth = useAuthEnhanced();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuthorization = async () => {
      // Wait for auth to finish loading
      if (auth.loading) return;

      // Check if authentication is required
      if (requireAuth && !auth.user) {
        setAuthError('Debes iniciar sesión para acceder a esta página');
        setIsAuthorized(false);
        router.push(fallbackPath);
        return;
      }

      // Check session validity
      if (requireAuth && !auth.sessionValid) {
        setAuthError('Tu sesión ha expirado. Por favor, inicia sesión nuevamente');
        setIsAuthorized(false);
        await auth.logout();
        return;
      }

      // Check required roles
      if (requireRoles.length > 0) {
        const hasRequiredRole = requireRoles.some(role => auth.hasRole(role));
        if (!hasRequiredRole) {
          setAuthError('No tienes los permisos necesarios para acceder a esta página');
          setIsAuthorized(false);
          router.push('/dashboard');
          return;
        }
      }

      // Check required permissions
      if (requirePermissions.length > 0) {
        const hasRequiredPermission = requirePermissions.every(permission => 
          auth.hasPermission(permission as any)
        );
        if (!hasRequiredPermission) {
          setAuthError('No tienes los permisos necesarios para realizar esta acción');
          setIsAuthorized(false);
          router.push('/dashboard');
          return;
        }
      }

      // All checks passed
      setIsAuthorized(true);
      setAuthError(null);
    };

    checkAuthorization();
  }, [
    auth.loading,
    auth.user,
    auth.sessionValid,
    requireAuth,
    requireRoles,
    requirePermissions,
    router,
    fallbackPath,
    auth
  ]);

  // Show loading state
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0a0a0a] mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Show auth error if any
  if (auth.error && showError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              Error de Autenticación
            </h3>
            <p className="mt-2 text-sm text-gray-600">{auth.error}</p>
            <div className="mt-6 space-y-2">
              <button
                onClick={() => auth.refreshAuth()}
                className="w-full px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#0a0a0a]/90 transition-colors"
              >
                Reintentar
              </button>
              <button
                onClick={() => router.push('/login')}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                Ir al inicio de sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show authorization error
  if (!isAuthorized && authError && showError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-yellow-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              Acceso Denegado
            </h3>
            <p className="mt-2 text-sm text-gray-600">{authError}</p>
            <button
              onClick={() => router.back()}
              className="mt-6 w-full px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#0a0a0a]/90 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not authorized but no error to show
  if (!isAuthorized) {
    return null;
  }

  // Authorized - render children
  return <>{children}</>;
};

// HOC for protecting pages
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<AuthWrapperProps, 'children'>
) {
  return function ProtectedComponent(props: P) {
    return (
      <AuthWrapper {...options}>
        <Component {...props} />
      </AuthWrapper>
    );
  };
}

// Hook for checking auth in components
export function useAuthCheck(options?: {
  requireRoles?: string[];
  requirePermissions?: string[];
}) {
  const auth = useAuthEnhanced();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (auth.loading) return;

    let authorized = true;

    // Check roles
    if (options?.requireRoles && options.requireRoles.length > 0) {
      authorized = options.requireRoles.some(role => auth.hasRole(role));
    }

    // Check permissions
    if (authorized && options?.requirePermissions && options.requirePermissions.length > 0) {
      authorized = options.requirePermissions.every(permission => 
        auth.hasPermission(permission as any)
      );
    }

    setIsAuthorized(authorized);
  }, [auth, options]);

  return {
    isAuthorized,
    isLoading: auth.loading,
    user: auth.user,
    profile: auth.profile
  };
}