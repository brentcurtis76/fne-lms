import { useState, useEffect } from 'react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import RealtimeNotificationBell from '../notifications/RealtimeNotificationBell';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

interface HeaderProps {
  user?: User | null;
  isAdmin?: boolean;
  onLogout?: () => void;
  avatarUrl?: string;
  showNavigation?: boolean;
}

export default function Header({ user }: HeaderProps) {
  const supabase = useSupabaseClient();
  const [localUser, setLocalUser] = useState<User | null>(user || null);
  const [schoolName, setSchoolName] = useState<string>('');

  // Update local user when prop changes
  useEffect(() => {
    if (user) {
      setLocalUser(user);
    }
  }, [user?.id]);

  // Load school for header badge
  useEffect(() => {
    const loadSchool = async () => {
      if (!user) {
        setSchoolName('');
        return;
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('school')
          .eq('id', user.id)
          .single();

        if (!error && data?.school) {
          setSchoolName(data.school);
        } else {
          setSchoolName('Sin colegio');
        }
      } catch (err) {
        setSchoolName('Sin colegio');
      }
    };
    loadSchool();
  }, [user?.id, supabase]);

  // Determine if a user is effectively logged in for UI purposes
  const isLoggedIn = !!localUser;

  return (
    <header className="fixed w-full top-0 z-50 bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
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

          {/* Navigation is now handled by the Sidebar, Header is minimal */}

          {/* Right side - User Area */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {/* Notification Bell */}
                <RealtimeNotificationBell className="text-white/70 hover:text-white" />

                {/* User Avatar */}
                <div className="w-8 h-8 bg-[#fbbf24] rounded-full flex items-center justify-center">
                  <span className="text-[#0a0a0a] text-sm font-bold">
                    {localUser?.email?.substring(0, 2).toUpperCase() || 'US'}
                  </span>
                </div>
              </>
            ) : (
              <>
                <Link href="/login" legacyBehavior>
                  <a className="text-white/70 hover:text-white text-sm transition-colors">
                    Iniciar Sesión
                  </a>
                </Link>
              </>
            )}
          </div>
          
        </div>
      </div>
    </header>
  );
}
