/**
 * MainLayout Component - Global layout system for FNE LMS
 * Provides consistent sidebar navigation across all authenticated pages
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { User } from '@supabase/supabase-js';
import Sidebar from './Sidebar';
import Avatar from '../common/Avatar';
import { useAvatar } from '../../hooks/useAvatar';
import { LogOut } from 'lucide-react';
import FeedbackButtonWithPermissions from '../feedback/FeedbackButtonWithPermissions';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface MainLayoutProps {
  children: React.ReactNode;
  user: User | null;
  currentPage: string;
  pageTitle?: string;
  breadcrumbs?: Breadcrumb[];
  isAdmin?: boolean;
  userRole?: string;
  onLogout?: () => void;
  avatarUrl?: string;
  profileData?: any; // Add profile data prop
  className?: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  user,
  currentPage,
  pageTitle,
  breadcrumbs = [],
  isAdmin = false,
  userRole,
  onLogout,
  avatarUrl,
  profileData,
  className = ''
}) => {
  const router = useRouter();
  
  // Sidebar state with localStorage persistence
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Use the avatar hook for better performance
  const { url: fetchedAvatarUrl } = useAvatar(user);
  
  // Try to get avatar from cache immediately if not provided
  const [cachedAvatarUrl, setCachedAvatarUrl] = useState<string | null>(null);
  
  useEffect(() => {
    if (!avatarUrl && user) {
      try {
        const sessionCacheData = sessionStorage.getItem('fne-avatar-cache');
        if (sessionCacheData) {
          const sessionCache = JSON.parse(sessionCacheData);
          const userCache = sessionCache[user.id];
          if (userCache && userCache.url && Date.now() - userCache.timestamp < 1000 * 60 * 30) {
            setCachedAvatarUrl(userCache.url);
          }
        }
      } catch (e) {
        // Ignore session storage errors
      }
    }
  }, [user, avatarUrl]);
  
  // Initialize sidebar state from localStorage
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('fne-sidebar-collapsed');
    const isLargeScreen = window.innerWidth >= 1024;
    
    if (savedCollapsed !== null) {
      setSidebarCollapsed(JSON.parse(savedCollapsed));
    } else {
      // Default to collapsed on mobile/tablet, expanded on desktop
      setSidebarCollapsed(!isLargeScreen);
    }
    
    // Handle window resize
    const handleResize = () => {
      const isLarge = window.innerWidth >= 1024;
      if (!isLarge && !sidebarCollapsed) {
        // Auto-collapse on mobile/tablet
        setSidebarCollapsed(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('fne-sidebar-collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);
  
  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };
  
  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      router.push('/login');
    }
  };
  
  // Generate page title
  const fullTitle = pageTitle 
    ? `${pageTitle} - FNE LMS` 
    : 'FNE LMS - Fundación Nueva Educación';
    
  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="description" content="Sistema de Gestión de Aprendizaje - Fundación Nueva Educación" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <div className={`min-h-screen bg-gray-50 ${className}`}>
        {/* Global Sidebar */}
        <Sidebar
          user={user}
          currentPage={currentPage}
          isCollapsed={sidebarCollapsed}
          isAdmin={isAdmin}
          userRole={userRole}
          avatarUrl={avatarUrl || cachedAvatarUrl || fetchedAvatarUrl}
          onToggle={handleSidebarToggle}
          onLogout={handleLogout}
        />
        
        {/* Main Content Area */}
        <div className={`min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-80'
        }`}>
          {/* Top Header Bar with Logout */}
          <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
            <div className="px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between">
                {/* Left side - can be empty or add page title here */}
                <div className="flex-1">
                  {/* Empty for now */}
                </div>
                
                {/* Right side - User info and logout */}
                <div className="flex items-center space-x-4">
                  {/* User info with avatar - clickable */}
                  {user && (
                    <Link
                      href="/profile"
                      className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 cursor-pointer"
                    >
                      <Avatar 
                        user={user}
                        avatarUrl={avatarUrl || cachedAvatarUrl || fetchedAvatarUrl}
                        size="sm"
                      />
                      <div className="hidden sm:block">
                        <p className="text-sm font-medium text-gray-900">
                          {profileData?.first_name && profileData?.last_name
                            ? `${profileData.first_name} ${profileData.last_name}`
                            : user.user_metadata?.first_name && user.user_metadata?.last_name
                            ? `${user.user_metadata.first_name} ${user.user_metadata.last_name}`
                            : user.email?.split('@')[0] || 'Usuario'
                          }
                        </p>
                        <p className="text-xs text-gray-500">
                          {profileData?.growth_community 
                            ? profileData.growth_community 
                            : isAdmin ? 'Administrador' : 'Usuario'}
                        </p>
                      </div>
                    </Link>
                  )}
                  
                  {/* Logout button */}
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-[#ef4044] rounded-lg transition-all duration-200 group"
                  >
                    <LogOut className="h-4 w-4 group-hover:text-[#ef4044]" />
                    <span className="hidden sm:inline">Cerrar Sesión</span>
                    <span className="sm:hidden">Salir</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Content wrapper */}
          <div className="min-h-screen w-full">
            {/* Page Header with Breadcrumbs */}
            {(pageTitle || breadcrumbs.length > 0) && (
              <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
                <div className="max-w-7xl mx-auto">
                  {/* Breadcrumbs */}
                  {breadcrumbs.length > 0 && (
                    <nav className="flex mb-2" aria-label="Breadcrumb">
                      <ol className="inline-flex items-center space-x-1 md:space-x-3">
                        {breadcrumbs.map((crumb, index) => (
                          <li key={index} className="inline-flex items-center">
                            {index > 0 && (
                              <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            {crumb.href ? (
                              <a
                                href={crumb.href}
                                className="ml-1 text-sm font-medium text-gray-700 hover:text-[#00365b] md:ml-2"
                              >
                                {crumb.label}
                              </a>
                            ) : (
                              <span className="ml-1 text-sm font-medium text-gray-500 md:ml-2">
                                {crumb.label}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </nav>
                  )}
                  
                  {/* Page Title */}
                  {pageTitle && (
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#00365b]">
                      {pageTitle}
                    </h1>
                  )}
                </div>
              </div>
            )}
            
            {/* Main Content */}
            <main className="flex-1">
              {children}
            </main>
          </div>
        </div>
      </div>
      
      {/* Feedback Button - Only visible to users with permission */}
      <FeedbackButtonWithPermissions />
    </>
  );
};

export default MainLayout;