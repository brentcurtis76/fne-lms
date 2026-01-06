/**
 * ProtectedRoute Component
 * Wraps pages that require authentication and handles loading states
 * Prevents redirect loops by waiting for auth state to load
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireProfile?: boolean;
}

export default function ProtectedRoute({ 
  children, 
  requireAdmin = false,
  requireProfile = true 
}: ProtectedRouteProps) {
  const router = useRouter();
  const { user, profile, loading, isAdmin } = useAuth();

  useEffect(() => {
    // Wait for auth state to load
    if (loading) return;

    // If no user, redirect to login
    if (!user) {
      router.push('/login');
      return;
    }

    // If user exists but no profile and profile is required, redirect to pending approval
    if (requireProfile && !profile) {
      router.push('/pending-approval');
      return;
    }

    // If admin is required but user is not admin, redirect to dashboard
    if (requireAdmin && !isAdmin) {
      router.push('/dashboard');
      return;
    }
  }, [user, profile, loading, isAdmin, requireAdmin, requireProfile, router]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-[#0a0a0a] animate-pulse">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Cargando...
          </div>
        </div>
      </div>
    );
  }

  // If user is authenticated and meets requirements, render children
  if (user && (!requireProfile || profile) && (!requireAdmin || isAdmin)) {
    return <>{children}</>;
  }

  // Default: don't render anything while redirecting
  return null;
}