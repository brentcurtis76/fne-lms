/**
 * Global Sidebar Component - Complete navigation system for FNE LMS
 * Provides consistent navigation across all authenticated pages
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import {
  HomeIcon,
  BookOpenIcon,
  UsersIcon,
  ChartBarIcon,
  UserGroupIcon,
  CogIcon,
  MenuIcon as Bars3Icon,
  XIcon as XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LogoutIcon as ArrowRightOnRectangleIcon,
  UserCircleIcon,
  UserIcon,
  ClipboardListIcon as ClipboardDocumentListIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ClipboardCheckIcon as ClipboardDocumentCheckIcon,
  OfficeBuildingIcon,
  ExclamationCircleIcon as BugIcon,
  MapIcon,
  GlobeIcon as NetworkIcon
} from '@heroicons/react/outline';
import ModernNotificationCenter from '../notifications/ModernNotificationCenter';
import { navigationManager } from '../../utils/navigationManager';

interface SidebarProps {
  user: User | null;
  currentPage: string;
  isCollapsed: boolean;
  isAdmin: boolean;
  userRole?: string;
  avatarUrl?: string;
  onToggle: () => void;
  onLogout: () => void;
  className?: string;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  href?: string;
  description?: string;
  adminOnly?: boolean;
  consultantOnly?: boolean;
  restrictedRoles?: string[];
  children?: NavigationChild[];
  isExpanded?: boolean;
}

interface NavigationChild {
  id: string;
  label: string;
  href: string;
  description?: string;
  adminOnly?: boolean;
  icon?: React.ComponentType<any>;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Mi Panel',
    icon: HomeIcon,
    href: '/dashboard',
    description: 'Panel principal'
  },
  {
    id: 'profile',
    label: 'Mi Perfil',
    icon: UserCircleIcon,
    href: '/profile',
    description: 'Información personal'
  },
  {
    id: 'my-paths',
    label: 'Mis Rutas',
    icon: MapIcon,
    href: '/my-paths',
    description: 'Rutas de aprendizaje asignadas'
  },
  {
    id: 'quiz-reviews',
    label: 'Revisión de Quizzes',
    icon: ClipboardDocumentCheckIcon,
    href: '/quiz-reviews',
    description: 'Calificar preguntas abiertas',
    consultantOnly: true
  },
  {
    id: 'courses',
    label: 'Cursos',
    icon: BookOpenIcon,
    href: '/admin/course-builder',
    description: 'Gestión de cursos',
    adminOnly: true
  },
  {
    id: 'learning-paths',
    label: 'Rutas de Aprendizaje',
    icon: MapIcon,
    href: '/admin/learning-paths',
    description: 'Gestión de rutas de aprendizaje',
    restrictedRoles: ['admin', 'equipo_directivo', 'consultor']
  },
  {
    id: 'users',
    label: 'Usuarios',
    icon: UsersIcon,
    href: '/admin/user-management',
    description: 'Administrar usuarios',
    adminOnly: true
  },
  {
    id: 'schools',
    label: 'Escuelas',
    icon: OfficeBuildingIcon,
    href: '/admin/schools',
    description: 'Gestión de escuelas y generaciones',
    adminOnly: true
  },
  {
    id: 'networks',
    label: 'Redes de Colegios',
    icon: NetworkIcon,
    href: '/admin/network-management',
    description: 'Gestión de redes y supervisores',
    adminOnly: true
  },
  {
    id: 'consultants',
    label: 'Consultorías',
    icon: UserIcon,
    description: 'Gestión de consultorías',
    restrictedRoles: ['admin', 'consultor'],
    children: [
      {
        id: 'consultant-assignments',
        label: 'Asignación de Consultores',
        href: '/admin/consultant-assignments',
        description: 'Gestionar asignaciones',
        adminOnly: true
      },
      {
        id: 'assignment-overview',
        label: 'Vista de Tareas',
        href: '/admin/assignment-overview',
        description: 'Monitoreo de tareas grupales',
        icon: ClipboardDocumentCheckIcon
      }
    ]
  },
  {
    id: 'gestion',
    label: 'Gestión',
    icon: ClipboardDocumentListIcon,
    description: 'Gestión empresarial',
    adminOnly: true,
    children: [
      {
        id: 'contracts',
        label: 'Contratos',
        href: '/contracts',
        description: 'Gestión de contratos',
        icon: DocumentTextIcon
      },
      {
        id: 'expense-reports',
        label: 'Rendición de Gastos',
        href: '/expense-reports',
        description: 'Reportes de gastos',
        icon: CurrencyDollarIcon
      },
      {
        id: 'feedback',
        label: 'Soporte Técnico',
        href: '/admin/feedback',
        description: 'Gestión de errores y solicitudes',
        icon: BugIcon
      }
    ]
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: ChartBarIcon,
    description: 'Análisis y reportes',
    restrictedRoles: ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red'],
    children: [
      {
        id: 'detailed-reports',
        label: 'Reportes Detallados',
        href: '/detailed-reports',
        description: 'Análisis completo'
      },
      {
        id: 'enhanced-reports',
        label: 'Reportes Avanzados',
        href: '/enhanced-reports',
        description: 'Reportes mejorados'
      }
    ]
  },
  {
    id: 'workspace',
    label: 'Espacio Colaborativo',
    icon: UserGroupIcon,
    description: 'Comunidades de crecimiento',
    children: [
      {
        id: 'workspace-overview',
        label: 'Vista General',
        href: '/community/workspace?section=overview',
        description: 'Resumen del espacio'
      },
      {
        id: 'workspace-communities',
        label: 'Gestión Comunidades',
        href: '/community/workspace?section=communities',
        description: 'Administrar comunidades',
        adminOnly: true
      }
    ]
  },
  {
    id: 'admin',
    label: 'Configuración',
    icon: CogIcon,
    href: '/admin/configuration',
    description: 'Configuración del sistema',
    adminOnly: true
  }
];

const Sidebar: React.FC<SidebarProps> = ({
  user,
  currentPage,
  isCollapsed,
  isAdmin,
  userRole,
  avatarUrl,
  onToggle,
  onLogout,
  className = ''
}) => {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);

  // Fetch new feedback count for admins
  useEffect(() => {
    if (isAdmin) {
      fetchNewFeedbackCount();
      // Refresh count every 30 seconds
      const interval = setInterval(fetchNewFeedbackCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  const fetchNewFeedbackCount = async () => {
    try {

      const { count, error } = await supabase
        .from('platform_feedback')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');
      
      if (!error && count !== null) {
        setNewFeedbackCount(count);
      }
    } catch (error) {
      console.error('Error fetching feedback count:', error);
    }
  };

  // Auto-expand parent items based on current page
  useEffect(() => {
    const newExpanded = new Set<string>();
    
    NAVIGATION_ITEMS.forEach(item => {
      if (item.children) {
        const hasActiveChild = item.children.some(child => 
          isItemActive(child.href, router.pathname)
        );
        if (hasActiveChild) {
          newExpanded.add(item.id);
        }
      }
    });
    
    setExpandedItems(newExpanded);
  }, [router.pathname]);

  const isItemActive = (href: string, pathname: string): boolean => {
    if (href === pathname) return true;
    
    // Special handling for workspace sections
    if (href.includes('/community/workspace') && pathname.includes('/community/workspace')) {
      const urlParams = new URLSearchParams(href.split('?')[1] || '');
      const currentParams = new URLSearchParams(window.location.search);
      return urlParams.get('section') === currentParams.get('section');
    }
    
    // Check if pathname starts with href for nested routes
    return pathname.startsWith(href + '/');
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const filteredNavigationItems = NAVIGATION_ITEMS.filter(item => {
    // Check admin-only items
    if (item.adminOnly && !isAdmin) {
      console.log(`🔍 SIDEBAR DEBUG: Filtering out admin-only item "${item.label}" (isAdmin: ${isAdmin})`);
      return false;
    }
    
    // Check consultant-only items
    if (item.consultantOnly && !isAdmin && !['admin', 'consultor'].includes(userRole || '')) {
      console.log(`🔍 SIDEBAR DEBUG: Filtering out consultant-only item "${item.label}" (userRole: ${userRole})`);
      return false;
    }
    
    // Check restricted roles
    if (item.restrictedRoles && item.restrictedRoles.length > 0) {
      // If user role is not in the restricted roles list, hide the item
      if (!item.restrictedRoles.includes(userRole || '') && !isAdmin) {
        console.log(`🔍 SIDEBAR DEBUG: Filtering out restricted item "${item.label}" (userRole: ${userRole}, restrictedRoles: ${item.restrictedRoles.join(', ')})`);
        return false;
      }
    }
    
    console.log(`🔍 SIDEBAR DEBUG: Including item "${item.label}" (hasChildren: ${!!item.children}, childrenCount: ${item.children?.length || 0})`);
    return true;
  });

  const SidebarItem: React.FC<{ item: NavigationItem }> = ({ item }) => {
    const [showCollapsedMenu, setShowCollapsedMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const isExpanded = expandedItems.has(item.id);

    // Close floating menu when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setShowCollapsedMenu(false);
        }
      };

      if (showCollapsedMenu) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [showCollapsedMenu]);
    
    // Filter children based on admin status
    const filteredChildren = item.children?.filter(child => 
      !child.adminOnly || isAdmin
    ) || [];
    
    const hasChildren = filteredChildren.length > 0;
    const isActive = item.href ? isItemActive(item.href, router.pathname) : false;

    const handleClick = async () => {
      console.log(`🔍 SIDEBAR DEBUG: Item "${item.label}" clicked`, {
        isCollapsed,
        hasChildren,
        filteredChildrenCount: filteredChildren.length,
        showCollapsedMenu,
        itemId: item.id
      });

      if (isCollapsed && hasChildren) {
        // In collapsed state, toggle the floating menu
        console.log(`🔍 SIDEBAR DEBUG: Toggling floating menu for "${item.label}" from ${showCollapsedMenu} to ${!showCollapsedMenu}`);
        setShowCollapsedMenu(!showCollapsedMenu);
      } else if (hasChildren) {
        // In expanded state, toggle normal expansion
        console.log(`🔍 SIDEBAR DEBUG: Toggling expansion for "${item.label}"`);
        toggleExpanded(item.id);
      } else if (item.href) {
        // Use navigation manager to prevent concurrent navigation
        console.log(`🔍 SIDEBAR DEBUG: Navigating to "${item.href}" for "${item.label}"`);
        try {
          await navigationManager.navigate(async () => {
            await router.push(item.href);
          });
        } catch (err) {
          console.error('Navigation error in sidebar:', err);
        }
      }
    };

    return (
      <div className="relative">
        <button
          onClick={handleClick}
          onMouseDown={() => console.log(`🔍 SIDEBAR DEBUG: MouseDown on "${item.label}"`)}
          onMouseUp={() => console.log(`🔍 SIDEBAR DEBUG: MouseUp on "${item.label}"`)}
          className={`
            group flex items-center w-full text-left transition-all duration-200 rounded-lg relative
            ${isCollapsed ? 'px-3 py-3 justify-center' : 'px-3 py-3'}
            ${isActive && !hasChildren
              ? 'bg-[#00365b] text-white shadow-lg'
              : 'text-gray-700 hover:bg-gray-100 hover:text-[#00365b]'
            }
            ${isCollapsed && hasChildren && showCollapsedMenu ? 'bg-gray-100 text-[#00365b]' : ''}
          `}
          title={isCollapsed ? item.label : undefined}
          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        >
          {/* Active indicator */}
          {isActive && !hasChildren && !isCollapsed && (
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fdb933] rounded-r-lg"></div>
          )}
          
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} flex-1`}>
            <item.icon className={`flex-shrink-0 ${isCollapsed ? 'h-6 w-6' : 'h-5 w-5'} ${
              isActive && !hasChildren ? 'text-white' : 'text-gray-500 group-hover:text-[#00365b]'
            }`} />
            
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium truncate">
                    {item.label}
                  </div>
                  {/* Show badge for feedback item if there are new items */}
                  {item.id === 'feedback' && newFeedbackCount > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                      {newFeedbackCount}
                    </span>
                  )}
                </div>
                {item.description && (
                  <div className={`text-xs truncate mt-0.5 ${
                    isActive && !hasChildren ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {item.description}
                  </div>
                )}
              </div>
            )}
            
            {!isCollapsed && hasChildren && (
              <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-180' : ''
              } ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#00365b]'}`} />
            )}
            
            {/* Badge count for collapsed state with children */}
            {isCollapsed && hasChildren && filteredChildren.length > 0 && (
              <div className="absolute -top-1 -right-1 bg-[#fdb933] text-[#00365b] text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm pointer-events-none">
                {filteredChildren.length}
              </div>
            )}
          </div>
        </button>

        {/* Collapsed state floating menu */}
        {isCollapsed && hasChildren && showCollapsedMenu && (
          <div 
            ref={menuRef}
            className="absolute left-full top-0 ml-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 min-w-48 overflow-hidden"
          >
            <div className="p-2 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">{item.label}</h3>
              {item.description && (
                <p className="text-xs text-gray-500 mt-1">{item.description}</p>
              )}
            </div>
            <div className="py-1">
              {filteredChildren.map(child => (
                <Link
                  key={child.id}
                  href={child.href}
                  onClick={() => setShowCollapsedMenu(false)}
                  className={`
                    group flex items-center px-3 py-2 text-sm transition-colors
                    ${isItemActive(child.href, router.pathname)
                      ? 'bg-[#00365b] text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-[#00365b]'
                    }
                  `}
                >
                  {child.icon ? (
                    <child.icon className={`h-4 w-4 mr-3 ${
                      isItemActive(child.href, router.pathname)
                        ? 'text-white'
                        : 'text-gray-400 group-hover:text-[#00365b]'
                    }`} />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 mr-3 text-gray-400 group-hover:text-[#00365b]" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{child.label}</span>
                      {/* Show badge for feedback child item if there are new items */}
                      {child.id === 'feedback' && newFeedbackCount > 0 && (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                          {newFeedbackCount}
                        </span>
                      )}
                    </div>
                    {child.description && (
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {child.description}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Children */}
        {!isCollapsed && hasChildren && isExpanded && (
          <div className="ml-6 mt-1 space-y-1">
            {filteredChildren.map(child => (
              <Link
                key={child.id}
                href={child.href}
                className={`
                  group flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-200
                  ${isItemActive(child.href, router.pathname)
                    ? 'bg-[#00365b]/10 text-[#00365b] font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-[#00365b]'
                  }
                `}
              >
                {child.icon ? (
                  <child.icon className={`h-4 w-4 mr-2 ${
                    isItemActive(child.href, router.pathname)
                      ? 'text-[#00365b]'
                      : 'text-gray-400 group-hover:text-[#00365b]'
                  }`} />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 mr-2 text-gray-400 group-hover:text-[#00365b]" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate">{child.label}</div>
                    {/* Show badge for feedback child item if there are new items */}
                    {child.id === 'feedback' && newFeedbackCount > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                        {newFeedbackCount}
                      </span>
                    )}
                  </div>
                  {child.description && (
                    <div className="text-xs text-gray-500 truncate">
                      {child.description}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed left-0 top-0 h-full bg-white border-r border-gray-200 shadow-xl transition-all duration-300
        lg:fixed lg:z-30
        ${isCollapsed 
          ? 'w-20 -translate-x-full lg:translate-x-0' 
          : 'w-80 translate-x-0'
        }
        z-50 lg:z-30
        ${className}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between h-20 px-4 border-b border-gray-200 bg-gradient-to-r from-[#00365b] to-[#004a7a]">
          {!isCollapsed ? (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[#fdb933] rounded-lg flex items-center justify-center p-0.5">
                {/* FNE Logo */}
                <img 
                  src="/Logo plataforma.png"
                  alt="FNE Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">
                  Fundación Nueva Educación
                </h2>
                <p className="text-blue-200 text-xs">
                  Plataforma De Crecimiento
                </p>
              </div>
            </div>
          ) : (
            <div className="w-8 h-8 bg-[#fdb933] rounded-lg flex items-center justify-center p-0.5 mx-auto">
              {/* FNE Logo - Collapsed state */}
              <img 
                src="/Logo plataforma.png"
                alt="FNE Logo"
                className="w-full h-full object-contain"
              />
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            {/* Modern Notification Center */}
            {!isCollapsed && user && (
              <ModernNotificationCenter />
            )}
            
            <button
              onClick={onToggle}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
              title={isCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
            >
              {isCollapsed ? (
                <Bars3Icon className="h-5 w-5" />
              ) : (
                <XMarkIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 max-h-[calc(100vh-8rem)]">
          {filteredNavigationItems.map(item => (
            <SidebarItem key={item.id} item={item} />
          ))}
        </div>

        {/* Empty Footer for spacing */}
        <div className="p-2">
        </div>
      </div>
    </>
  );
};

export default Sidebar;