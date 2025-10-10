import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { usePermissions } from '../../contexts/PermissionContext';

interface PermissionGuardProps {
  children: React.ReactNode;
  permission: string | string[];
  requireAll?: boolean; // If true with array, requires ALL permissions. Default: ANY
  fallback?: React.ReactNode;
  redirectTo?: string;
  onDenied?: () => void;
}

export function PermissionGuard({
  children,
  permission,
  requireAll = false,
  fallback = null,
  redirectTo,
  onDenied
}: PermissionGuardProps) {
  const router = useRouter();
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermissions();

  const hasAccess = Array.isArray(permission)
    ? requireAll
      ? hasAllPermissions(permission)
      : hasAnyPermission(permission)
    : hasPermission(permission);

  useEffect(() => {
    if (!loading && !hasAccess) {
      if (onDenied) {
        onDenied();
      }

      if (redirectTo) {
        router.push(redirectTo);
      }
    }
  }, [loading, hasAccess, redirectTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b] mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-16 w-16 text-red-500"
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
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600 mb-6">
            No tienes los permisos necesarios para acceder a esta página.
          </p>
          <button
            onClick={() => router.back()}
            className="bg-[#00365b] text-white px-6 py-2 rounded-md hover:bg-[#004080] transition"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Hook version for use in components
export function usePermissionGuard(permission: string | string[], requireAll = false): boolean {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermissions();

  if (loading) return false;

  return Array.isArray(permission)
    ? requireAll
      ? hasAllPermissions(permission)
      : hasAnyPermission(permission)
    : hasPermission(permission);
}

// Component to conditionally render based on permission
export function HasPermission({
  permission,
  requireAll = false,
  children,
  fallback = null
}: {
  permission: string | string[];
  requireAll?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const hasAccess = usePermissionGuard(permission, requireAll);
  const { loading } = usePermissions();

  if (loading) return null;

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
