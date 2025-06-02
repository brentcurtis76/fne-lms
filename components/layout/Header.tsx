import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { User } from '@supabase/supabase-js';

interface HeaderProps {
  user?: User | null;
  isAdmin?: boolean;
  onLogout?: () => void;
  avatarUrl?: string;
  showNavigation?: boolean;
}

export default function Header({ user, isAdmin, onLogout, avatarUrl: propAvatarUrl, showNavigation = true }: HeaderProps) {
  const router = useRouter();
  const [localUser, setLocalUser] = useState<User | null>(user || null);
  const [localIsAdmin, setLocalIsAdmin] = useState(isAdmin || false);
  const [avatarUrl, setAvatarUrl] = useState('');

  // FIXED: Simple effect with proper dependencies
  useEffect(() => {
    if (user) {
      setLocalUser(user);
      setLocalIsAdmin(isAdmin || false);
      
      // Use passed avatar or generate fallback
      if (propAvatarUrl) {
        setAvatarUrl(propAvatarUrl);
      } else {
        const fallbackAvatar = 'https://ui-avatars.com/api/?name=' + 
          encodeURIComponent(user.email?.split('@')[0] || 'User') + 
          '&background=00365b&color=fdb933&size=128';
        setAvatarUrl(fallbackAvatar);
      }
    }
  }, [user?.id, isAdmin, propAvatarUrl]);

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    
    // If no onLogout provided, just redirect to login
    router.push('/login');
  };

  // Determine active link
  const isActive = (path: string) => {
    return router.pathname === path || router.pathname.startsWith(`${path}/`);
  };

  // Determine if a user is effectively logged in for UI purposes
  const isLoggedIn = !!localUser;

  return (
    <header className="fixed w-full top-0 z-50 bg-gradient-to-r from-[#00365b] via-[#004080] to-[#00365b] backdrop-blur-lg border-b border-white/10 shadow-2xl">
      {/* Glassmorphism overlay */}
      <div className="absolute inset-0 bg-white/5 backdrop-blur-sm"></div>
      
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" legacyBehavior>
              <a className="flex items-center space-x-3 group">
                <div className="relative">
                  <img 
                    src="/images/logo.png" 
                    alt="FNE LMS Logo" 
                    className="h-16 w-auto transform group-hover:scale-105 transition-transform duration-200 filter drop-shadow-lg" 
                  />
                  <div className="absolute inset-0 bg-[#fdb933]/20 rounded-full blur-xl group-hover:bg-[#fdb933]/30 transition-all duration-300"></div>
                </div>
              </a>
            </Link>
          </div>

          {/* Desktop Navigation */}
          {showNavigation && (
            <nav className="hidden md:flex items-center space-x-1">
              {!isLoggedIn && (
              <>
                <Link href="/" legacyBehavior>
                  <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                    isActive('/') 
                      ? 'text-white' 
                      : 'text-white/80 hover:text-white'
                  }`}>
                    <span className="relative z-10">Inicio</span>
                    {isActive('/') && (
                      <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                    )}
                    {!isActive('/') && (
                      <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                    )}
                  </a>
                </Link>
                <Link href="#" legacyBehavior>
                  <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                    isActive('/programas') 
                      ? 'text-white' 
                      : 'text-white/80 hover:text-white'
                  }`}>
                    <span className="relative z-10">Programas</span>
                    {isActive('/programas') && (
                      <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                    )}
                    {!isActive('/programas') && (
                      <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                    )}
                  </a>
                </Link>
                <Link href="#" legacyBehavior>
                  <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                    isActive('/contacto') 
                      ? 'text-white' 
                      : 'text-white/80 hover:text-white'
                  }`}>
                    <span className="relative z-10">Contacto</span>
                    {isActive('/contacto') && (
                      <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                    )}
                    {!isActive('/contacto') && (
                      <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                    )}
                  </a>
                </Link>
              </>
            )}

            {isLoggedIn && (
              <>
                <Link href="/dashboard" legacyBehavior>
                  <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                    isActive('/dashboard') 
                      ? 'text-[#00365b]' 
                      : 'text-white/80 hover:text-white'
                  }`}>
                    <span className="relative z-10">Mi Panel</span>
                    {isActive('/dashboard') && (
                      <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                    )}
                    {!isActive('/dashboard') && (
                      <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                    )}
                  </a>
                </Link>
                
                {localIsAdmin && (
                  <>
                    <div className="h-6 w-px bg-white/20 mx-2"></div>
                    <Link href="/admin/course-builder" legacyBehavior>
                      <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                        isActive('/admin/course-builder') 
                          ? 'text-[#00365b]' 
                          : 'text-[#fdb933]/90 hover:text-[#fdb933]'
                      }`}>
                        <span className="relative z-10">Cursos</span>
                        {isActive('/admin/course-builder') && (
                          <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                        )}
                        {!isActive('/admin/course-builder') && (
                          <div className="absolute inset-0 bg-[#fdb933]/20 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                        )}
                      </a>
                    </Link>
                    <Link href="/admin/user-management" legacyBehavior>
                      <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                        isActive('/admin/user-management') 
                          ? 'text-[#00365b]' 
                          : 'text-[#fdb933]/90 hover:text-[#fdb933]'
                      }`}>
                        <span className="relative z-10">Usuarios</span>
                        {isActive('/admin/user-management') && (
                          <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                        )}
                        {!isActive('/admin/user-management') && (
                          <div className="absolute inset-0 bg-[#fdb933]/20 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                        )}
                      </a>
                    </Link>
                    <Link href="/admin/consultant-assignments" legacyBehavior>
                      <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                        isActive('/admin/consultant-assignments') 
                          ? 'text-[#00365b]' 
                          : 'text-[#fdb933]/90 hover:text-[#fdb933]'
                      }`}>
                        <span className="relative z-10">Consultorías</span>
                        {isActive('/admin/consultant-assignments') && (
                          <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                        )}
                        {!isActive('/admin/consultant-assignments') && (
                          <div className="absolute inset-0 bg-[#fdb933]/20 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                        )}
                      </a>
                    </Link>
                  </>
                )}
                
                {/* Reports link for all authenticated users (role filtering happens on the page) */}
                <Link href="/reports" legacyBehavior>
                  <a className={`relative px-6 py-3 text-sm font-medium transition-all duration-300 group ${
                    isActive('/reports') 
                      ? 'text-[#00365b]' 
                      : 'text-[#fdb933]/90 hover:text-[#fdb933]'
                  }`}>
                    <span className="relative z-10">Reportes</span>
                    {isActive('/reports') && (
                      <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-105"></div>
                    )}
                    {!isActive('/reports') && (
                      <div className="absolute inset-0 bg-[#fdb933]/20 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                    )}
                  </a>
                </Link>
              </>
            )}
            </nav>
          )}

          {/* User Area & Auth Buttons */}
          <div className="hidden md:flex items-center space-x-3">
            {isLoggedIn ? (
              <>
                {/* Admin Badge */}
                {localIsAdmin && (
                  <div className="px-3 py-1 bg-[#fdb933] text-[#00365b] text-xs font-bold rounded-full animate-pulse shadow-lg">
                    ADMIN
                  </div>
                )}
                
                {/* User Avatar */}
                <div className="flex items-center">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="User Avatar" 
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-[#fdb933] shadow-lg hover:ring-4 transition-all duration-300"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[#fdb933] flex items-center justify-center shadow-lg hover:scale-110 transition-transform duration-300">
                      <span className="text-[#00365b] font-bold text-lg">
                        {localUser?.email?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={handleLogout}
                  className="relative px-6 py-3 text-sm font-medium transition-all duration-300 group text-white/80 hover:text-white"
                >
                  <span className="relative z-10">Salir</span>
                  <div className="absolute inset-0 bg-red-500/20 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                </button>
              </>
            ) : (
              <>
                <Link href="/login" legacyBehavior>
                  <a className="relative px-6 py-3 text-sm font-medium transition-all duration-300 group text-white/80 hover:text-white">
                    <span className="relative z-10">Iniciar Sesión</span>
                    <div className="absolute inset-0 bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transform scale-95 group-hover:scale-100 transition-all duration-300"></div>
                  </a>
                </Link>
                <Link href="/signup" legacyBehavior> 
                  <a className="relative px-6 py-3 text-sm font-bold transition-all duration-300 group text-[#00365b]">
                    <span className="relative z-10">Registrarse</span>
                    <div className="absolute inset-0 bg-[#fdb933] rounded-lg shadow-lg transform scale-100 group-hover:scale-105 transition-all duration-300"></div>
                  </a>
                </Link>
              </>
            )}
          </div>
          
          {/* Mobile Menu */}
          <div className="md:hidden flex items-center space-x-3">
            {localIsAdmin && (
              <div className="px-2 py-1 bg-[#fdb933] text-[#00365b] text-xs font-bold rounded-full">
                ADMIN
              </div>
            )}
            {isLoggedIn && (
              <button 
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-medium text-white bg-white/20 border border-white/30 rounded-lg shadow-md hover:bg-white/30 transition-all duration-200"
              >
                Salir
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Bottom glow effect */}
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#fdb933]/50 to-transparent"></div>
    </header>
  );
}
