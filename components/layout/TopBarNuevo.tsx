/**
 * The new look's top bar (redesign 5b), drawn by MainLayout inside the same element as today's bar.
 *
 * White, 56 px, a hairline under it. Left: the phone's menu button, then the breadcrumbs (on a phone
 * only the current page's name). Right: the school's name, the bell, the avatar (to «Mi Perfil») and
 * «Salir». Everything it shows and does comes from MainLayout, which keeps every data call and
 * handler: this component only draws.
 */
import React from 'react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { LogOut } from 'lucide-react';
import { MenuIcon as Bars3Icon, ChevronRightIcon } from '@heroicons/react/outline';
import Avatar from '../common/Avatar';
import ModernNotificationCenter from '../notifications/ModernNotificationCenter';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface TopBarNuevoProps {
  user?: User | null;
  pageTitle?: string;
  breadcrumbs: Breadcrumb[];
  schoolName: string;
  avatarUrl?: string;
  onMobileSidebarOpen: () => void;
  onLogout: () => void;
}

const CAPS = 'font-mont text-[11px] uppercase tracking-[0.08em]';

export default function TopBarNuevo({
  user,
  pageTitle,
  breadcrumbs,
  schoolName,
  avatarUrl,
  onMobileSidebarOpen,
  onLogout,
}: TopBarNuevoProps) {
  // On a phone only the current page's name shows: the last crumb, else the page's title.
  const currentName = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : pageTitle;

  return (
    <div className="px-4 sm:px-6 lg:px-8 w-full">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile Menu Trigger */}
        <button
          type="button"
          onClick={onMobileSidebarOpen}
          className="lg:hidden -ml-2 p-2 text-gray-900 hover:bg-gray-100 rounded-md transition-colors duration-150 motion-reduce:transition-none"
          aria-label="Abrir menú de navegación"
          data-testid="mobile-sidebar-trigger"
        >
          <Bars3Icon className="h-6 w-6" />
        </button>

        {/* Breadcrumbs (desktop) */}
        {breadcrumbs.length > 0 && (
          <nav className="hidden lg:flex min-w-0" aria-label="Breadcrumb">
            <ol className={`flex items-center gap-1.5 min-w-0 ${CAPS}`}>
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li key={index} className="flex items-center gap-1.5 min-w-0">
                    {index > 0 && <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />}
                    {crumb.href ? (
                      <a
                        href={crumb.href}
                        className={`truncate transition-colors duration-150 motion-reduce:transition-none ${
                          isLast ? 'font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {crumb.label}
                      </a>
                    ) : (
                      <span className={`truncate ${isLast ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                        {crumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {/* The current page's name (phone) */}
        {currentName && (
          <span className={`lg:hidden min-w-0 truncate font-semibold text-gray-900 ${CAPS}`} data-testid="topbar-current-page">
            {currentName}
          </span>
        )}

        {/* Right side: school, bell, avatar, Salir */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          {user && (
            <>
              {schoolName && (
                <span className="hidden lg:block max-w-[16rem] truncate text-sm text-gray-600">
                  {schoolName}
                </span>
              )}

              <ModernNotificationCenter panelAlign="right" />

              <Link href="/profile" legacyBehavior>
                <a className="block rounded-full" title="Mi Perfil">
                  <Avatar
                    user={user}
                    avatarUrl={avatarUrl}
                    size="sm"
                    className="ring-2 ring-gray-200 hover:ring-[#fbbf24] transition-colors duration-150 motion-reduce:transition-none"
                  />
                </a>
              </Link>

              <button
                type="button"
                onClick={onLogout}
                aria-label="Salir"
                className={`flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors duration-150 motion-reduce:transition-none ${CAPS}`}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden lg:inline">Salir</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
