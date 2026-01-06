/**
 * MainLayout Component - Global layout system for Genera
 * Provides consistent sidebar navigation across all authenticated pages
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { User } from '@supabase/supabase-js';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Sidebar from './Sidebar';
import Footer from '../Footer';
import Avatar from '../common/Avatar';
import { useAvatar } from '../../hooks/useAvatar';
import { useAuth } from '../../hooks/useAuth';
import { getHighestRole, extractRolesFromMetadata } from '../../utils/roleUtils';
import { LogOut } from 'lucide-react';
import FeedbackButtonWithPermissions from '../feedback/FeedbackButtonWithPermissions';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface MainLayoutProps {
  children: React.ReactNode;
  user?: User | null;
  currentPage?: string;
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
  user: userProp,
  currentPage,
  pageTitle,
  breadcrumbs = [],
  isAdmin: isAdminProp,
  userRole: userRoleProp,
  onLogout: onLogoutProp,
  avatarUrl: avatarUrlProp,
  profileData,
  className = ''
}) => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  // Use useAuth if props aren't provided (for pages that don't pass props)
  const auth = useAuth();

  // Prefer props if provided, otherwise use auth hook
  const user = userProp || auth.user;
  const rawIsAdmin = isAdminProp !== undefined ? isAdminProp : auth.isAdmin;
  const highestRole = getHighestRole(auth.userRoles);
  const userRole = userRoleProp || highestRole || '';
  const avatarUrl = avatarUrlProp || auth.avatarUrl;
  const onLogout = onLogoutProp || auth.logout;
  const collectedRoles = new Set<string>();

  if (userRole) {
    collectedRoles.add(userRole);
  }

  if (Array.isArray(auth.userRoles)) {
    auth.userRoles.forEach(role => collectedRoles.add(role.role_type));
  }

  if (profileData?.role) {
    collectedRoles.add(profileData.role);
  }

  if (user?.user_metadata) {
    extractRolesFromMetadata(user.user_metadata).forEach((role) => collectedRoles.add(role));
  }

  const hasAdminRole = collectedRoles.has('admin') || auth.isGlobalAdmin;
  const effectiveIsAdmin = hasAdminRole || (rawIsAdmin && collectedRoles.size === 0);

  // Sidebar state with localStorage persistence
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [schoolName, setSchoolName] = useState<string>('Sin colegio');

  // Fetch profile data if not provided as prop
  const [fetchedProfileData, setFetchedProfileData] = useState<any>(null);
  const effectiveProfileData = profileData || fetchedProfileData;

  useEffect(() => {
    const loadProfileData = async () => {
      if (profileData || !user?.id) return; // Skip if already provided or no user

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, school, growth_community, avatar_url')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          setFetchedProfileData(data);
        }
      } catch (err) {
        console.error('Failed to fetch profile data for header:', err);
      }
    };

    loadProfileData();
  }, [user?.id, profileData, supabase]);
  
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

  // Fetch school name for header pill
  useEffect(() => {
    const loadSchool = async () => {
      if (!user) {
        setSchoolName('Sin colegio');
        return;
      }

      // 1) Use effectiveProfileData if available
      if (effectiveProfileData?.school) {
        setSchoolName(effectiveProfileData.school);
        return;
      }

      try {
        // 2) Check profiles.school column first
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('school')
          .eq('id', user.id)
          .single();
        if (!profileError && profileData?.school) {
          setSchoolName(profileData.school);
          return;
        }

        // 3) If no school in profiles, check user_roles for school assignment
        const { data: roleData, error: roleError } = await supabase
          .from('user_roles')
          .select('school_id, schools:school_id(name)')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .not('school_id', 'is', null)
          .limit(1)
          .single();

        if (!roleError && roleData?.schools && (roleData.schools as any)?.name) {
          setSchoolName((roleData.schools as any).name);
          return;
        }
      } catch (err) {
        // ignore and fallback
      }

      setSchoolName('Sin colegio');
    };
    loadSchool();
  }, [user?.id, supabase, effectiveProfileData?.school]);
  
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
    ? `${pageTitle} - Genera`
    : 'Genera - Hub de Transformación';

  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="description" content="Hub de Transformación Educativa - Genera" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <div className={`min-h-screen bg-gray-50 ${className}`}>
        {/* Global Sidebar */}
        <Sidebar
          user={user}
          currentPage={currentPage}
          isCollapsed={sidebarCollapsed}
          isAdmin={effectiveIsAdmin}
          userRole={userRole}
          avatarUrl={avatarUrl || cachedAvatarUrl || fetchedAvatarUrl}
          onToggle={handleSidebarToggle}
          onLogout={handleLogout}
        />
        
        {/* Main Content Area */}
        <div className={`min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-80'
        }`}>
          {/* Top Header Bar - Minimal Design (h-20 to align with Sidebar) */}
          <div className="bg-[#0a0a0a] sticky top-0 z-20 h-20 flex items-center">
            <div className="px-4 sm:px-6 lg:px-8 w-full">
              <div className="flex items-center justify-between">
                {/* Left side - Brand text + School badge */}
                <div className="flex items-center gap-4">
                  <Link href="/" legacyBehavior>
                    <a className="text-white font-light tracking-wide text-sm hover:text-white/80 transition-colors">
                      Hub de Transformación
                    </a>
                  </Link>

                  {/* School Badge */}
                  <div className="hidden sm:flex items-center">
                    <div className="px-3 py-1.5 bg-white/10 rounded-lg border border-white/20">
                      <span className="text-white/90 text-sm truncate max-w-xs" title={schoolName || 'Sin colegio'}>
                        {schoolName || 'Sin colegio'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side - User avatar + Logout */}
                <div className="flex items-center gap-3">
                  {user && (
                    <>
                      {/* User Avatar - clickable to profile */}
                      <Link href="/profile" legacyBehavior>
                        <a className="block">
                          <Avatar
                            user={user}
                            avatarUrl={avatarUrl || cachedAvatarUrl || fetchedAvatarUrl}
                            size="sm"
                            className="ring-2 ring-white/20 hover:ring-[#fbbf24] transition-all"
                          />
                        </a>
                      </Link>

                      {/* Logout button */}
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden sm:inline">Salir</span>
                      </button>
                    </>
                  )}
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
                                className="ml-1 text-sm font-medium text-gray-700 hover:text-[#0a0a0a] md:ml-2"
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
                    <h1 className="text-2xl sm:text-3xl font-bold text-[#0a0a0a]">
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

            {/* Footer */}
            <Footer />
          </div>
        </div>
      </div>

      {/* Feedback Button - Only visible to users with permission */}
      <FeedbackButtonWithPermissions />
    </>
  );
};

export default MainLayout;
