/**
 * MainLayout Component - Global layout system for FNE LMS
 * Provides consistent sidebar navigation across all authenticated pages
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { User } from '@supabase/supabase-js';
import Sidebar from './Sidebar';

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
  onLogout?: () => void;
  avatarUrl?: string;
  className?: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  user,
  currentPage,
  pageTitle,
  breadcrumbs = [],
  isAdmin = false,
  onLogout,
  avatarUrl,
  className = ''
}) => {
  const router = useRouter();
  
  // Sidebar state with localStorage persistence
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
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
          avatarUrl={avatarUrl}
          onToggle={handleSidebarToggle}
          onLogout={handleLogout}
        />
        
        {/* Main Content Area */}
        <div className={`min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-80'
        }`}>
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
    </>
  );
};

export default MainLayout;