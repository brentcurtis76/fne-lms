/**
 * Global Sidebar Component - Complete navigation system for Genera
 * Provides consistent navigation across all authenticated pages
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  GlobeIcon as NetworkIcon,
  NewspaperIcon,
  LightningBoltIcon,
  ViewGridIcon,
  PencilAltIcon,
  AcademicCapIcon,
  BriefcaseIcon
} from '@heroicons/react/outline';
import { CalendarIcon } from '@heroicons/react/solid';
import ModernNotificationCenter from '../notifications/ModernNotificationCenter';
import { navigationManager } from '../../utils/navigationManager';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { usePermissions } from '../../contexts/PermissionContext';

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
  superadminOnly?: boolean;
  restrictedRoles?: string[];
  permission?: string | string[]; // Required permission(s)
  requireAllPermissions?: boolean; // If true, require ALL permissions (AND logic)
  requiresCommunity?: boolean; // If true, only show for users with community_id
  children?: NavigationChild[];
  isExpanded?: boolean;
}

interface NavigationChild {
  id: string;
  label: string;
  href: string;
  description?: string;
  adminOnly?: boolean;
  permission?: string | string[]; // Required permission(s)
  requireAllPermissions?: boolean;
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
    id: 'mi-aprendizaje',
    label: 'Mi Aprendizaje',
    icon: BookOpenIcon,
    href: '/mi-aprendizaje',
    description: 'Rutas y cursos asignados',
    children: [
      {
        id: 'my-courses',
        label: 'Mis Cursos',
        href: '/mi-aprendizaje?tab=cursos',
        icon: BookOpenIcon,
        description: 'Cursos en los que estoy inscrito'
      },
      {
        id: 'my-assignments',
        label: 'Mis Tareas',
        href: '/mi-aprendizaje/tareas',
        icon: ClipboardDocumentCheckIcon,
        description: 'Tareas de todas mis comunidades'
      }
    ]
  },
  {
    id: 'docente-assessments',
    label: 'Feedback',
    icon: AcademicCapIcon,
    href: '/docente/assessments',
    description: 'Evaluaciones de tareas asignadas',
    restrictedRoles: ['docente', 'admin', 'consultor', 'community_manager']
  },
  {
    id: 'quiz-reviews',
    label: 'Revisión de Quizzes',
    icon: PencilAltIcon,
    href: '/quiz-reviews',
    description: 'Calificar preguntas abiertas',
    consultantOnly: true
  },
  {
    id: 'mis-sesiones',
    label: 'Mis Sesiones',
    icon: CalendarIcon,
    href: '/consultor/sessions',
    description: 'Sesiones de consultoría asignadas',
    consultantOnly: true
  },
  {
    id: 'courses',
    label: 'Cursos',
    icon: BookOpenIcon,
    description: 'Gestión de cursos',
    adminOnly: true,
    children: [
      {
        id: 'course-builder',
        label: 'Constructor de Cursos',
        href: '/admin/course-builder',
        description: 'Crear y editar cursos',
        icon: BookOpenIcon
      },
      {
        id: 'upcoming-courses',
        label: 'Próximos Cursos',
        href: '/admin/upcoming-courses',
        description: 'Cursos próximamente disponibles',
        adminOnly: true
      }
    ]
  },
  {
    id: 'assessment-builder',
    label: 'Procesos de Cambio',
    icon: ClipboardDocumentListIcon,
    description: 'Constructor de evaluaciones y rúbricas',
    consultantOnly: true,
    children: [
      {
        id: 'assessment-builder-main',
        label: 'Constructor de Evaluaciones',
        href: '/admin/assessment-builder',
        description: 'Crear evaluaciones y rúbricas',
        icon: ClipboardDocumentListIcon
      },
      {
        id: 'transversal-context-admin',
        label: 'Contexto Transversal',
        href: '/school/transversal-context',
        description: 'Configuración de contexto por escuela',
        icon: OfficeBuildingIcon
      },
      {
        id: 'migration-plan',
        label: 'Plan de Migración',
        href: '/school/migration-plan',
        description: 'Definir generaciones GT/GI por año',
        icon: MapIcon
      }
    ]
  },
  {
    id: 'news',
    label: 'Noticias',
    icon: NewspaperIcon,
    href: '/admin/news',
    description: 'Gestión de noticias y artículos',
    restrictedRoles: ['admin', 'community_manager']
  },
  {
    id: 'events',
    label: 'Eventos',
    icon: CalendarIcon,
    href: '/admin/events',
    description: 'Gestión de eventos y línea de tiempo',
    restrictedRoles: ['admin', 'community_manager']
  },
  {
    id: 'learning-paths',
    label: 'Rutas de Aprendizaje',
    icon: MapIcon,
    href: '/admin/learning-paths',
    description: 'Gestión de rutas de aprendizaje',
    adminOnly: true
  },
  {
    id: 'assignment-matrix',
    label: 'Matriz de Asignaciones',
    icon: ViewGridIcon,
    href: '/admin/assignment-matrix',
    description: 'Asignaciones por usuario',
    adminOnly: true
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
    consultantOnly: true,
    children: [
      {
        id: 'consultant-assignments',
        label: 'Asignación de Consultores',
        href: '/admin/consultant-assignments',
        description: 'Gestionar asignaciones',
        adminOnly: true,
        permission: 'assign_consultants_all'
      },
      {
        id: 'assignment-overview',
        label: 'Vista de Tareas',
        href: '/admin/assignment-overview',
        description: 'Monitoreo de tareas grupales',
        icon: ClipboardDocumentCheckIcon
      },
      {
        id: 'consultant-sessions',
        label: 'Sesiones',
        href: '/admin/sessions',
        description: 'Gestión de sesiones de consultoría',
        icon: CalendarIcon,
        adminOnly: true
      },
      {
        id: 'session-approvals',
        label: 'Aprobaciones',
        href: '/admin/sessions/approvals',
        description: 'Solicitudes de cambio pendientes',
        icon: ClipboardDocumentCheckIcon,
        adminOnly: true
      }
    ]
  },
  {
    id: 'gestion',
    label: 'Gestión',
    icon: BriefcaseIcon,
    description: 'Gestión empresarial',
    restrictedRoles: ['admin', 'community_manager'],
    children: [
      {
        id: 'clients',
        label: 'Clientes',
        href: '/admin/clients',
        description: 'Gestión de clientes',
        icon: OfficeBuildingIcon,
        permission: ['view_contracts_all', 'view_contracts_school']
      },
      {
        id: 'contracts',
        label: 'Contratos',
        href: '/contracts',
        description: 'Gestión de contratos',
        icon: DocumentTextIcon,
        permission: ['view_contracts_all', 'view_contracts_school', 'view_contracts_own']
      },
      {
        id: 'quotes',
        label: 'Propuestas Pasantías',
        href: '/admin/quotes',
        description: 'Cotizaciones Barcelona',
        icon: DocumentTextIcon,
        permission: [
          'view_internship_proposals_all',
          'view_internship_proposals_school',
          'view_internship_proposals_own'
        ]
      },
      {
        id: 'expense-reports',
        label: 'Rendición de Gastos',
        href: '/expense-reports',
        description: 'Reportes de gastos',
        icon: CurrencyDollarIcon,
        permission: [
          'view_expense_reports_all',
          'view_expense_reports_school',
          'view_expense_reports_own'
        ]
      },
      {
        id: 'feedback',
        label: 'Soporte Técnico',
        href: '/admin/feedback',
        description: 'Gestión de errores y solicitudes',
        icon: BugIcon,
        permission: 'manage_system_settings'
      }
    ]
  },
  {
    id: 'reports',
    label: 'Reportes',
    icon: ChartBarIcon,
    href: '/detailed-reports',
    description: 'Análisis y reportes',
    restrictedRoles: ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red']
  },
  {
    id: 'qa-testing',
    label: 'QA Testing',
    icon: ClipboardDocumentCheckIcon,
    description: 'Pruebas de calidad',
    adminOnly: true,
    children: [
      {
        id: 'qa-run-tests',
        label: 'Ejecutar Pruebas',
        href: '/qa',
        description: 'Ejecutar escenarios de prueba',
        icon: ClipboardDocumentCheckIcon
      },
      {
        id: 'qa-admin',
        label: 'Panel de QA',
        href: '/admin/qa',
        description: 'Dashboard y gestión',
        adminOnly: true
      },
      {
        id: 'qa-scenarios',
        label: 'Escenarios',
        href: '/admin/qa/scenarios',
        description: 'Gestionar escenarios',
        adminOnly: true
      },
      {
        id: 'qa-import',
        label: 'Importar',
        href: '/admin/qa/import',
        description: 'Importar escenarios',
        adminOnly: true
      },
      {
        id: 'qa-time-tracking',
        label: 'Registro de Horas',
        href: '/admin/qa/time-tracking',
        description: 'Tiempo activo para facturación',
        adminOnly: true
      },
      {
        id: 'qa-generator',
        label: 'Generador',
        href: '/admin/qa/generate',
        description: 'Generar escenarios con IA',
        adminOnly: true
      }
    ]
  },
  {
    id: 'vias-transformacion',
    label: 'Vías de Transformación',
    icon: LightningBoltIcon,
    href: '/vias-transformacion',
    description: 'Evaluaciones de transformación escolar',
    adminOnly: true,
    // Note: Visible to all users with a school - access checked on the page
    children: [
      {
        id: 'vias-mis-evaluaciones',
        label: 'Mis Evaluaciones',
        href: '/vias-transformacion',
        description: 'Ver mis evaluaciones'
      },
      {
        id: 'vias-contexto-transversal',
        label: 'Contexto Transversal',
        href: '/school/transversal-context',
        description: 'Configuración de contexto escolar',
        icon: OfficeBuildingIcon
      },
      {
        id: 'vias-resultados-escuela',
        label: 'Panel de Resultados',
        href: '/directivo/assessments/dashboard',
        description: 'Resultados de evaluaciones de la escuela',
        icon: ChartBarIcon
      },
      {
        id: 'vias-admin-todas',
        label: 'Todas las Evaluaciones',
        href: '/admin/transformation/assessments',
        description: 'Ver evaluaciones por escuela',
        adminOnly: true
      }
    ]
  },
  {
    id: 'workspace',
    label: 'Espacio Colaborativo',
    icon: UserGroupIcon,
    description: 'Comunidades de crecimiento',
    requiresCommunity: true, // Only show for users with community_id or admins
    children: [
      {
        id: 'workspace-overview',
        label: 'Vista General',
        href: '/community/workspace?section=overview',
        description: 'Resumen del espacio'
      },
      {
        id: 'workspace-sessions',
        label: 'Sesiones',
        href: '/community/workspace?section=sessions'
      },
      {
        id: 'workspace-communities',
        label: 'Gestión Comunidades',
        href: '/community/workspace?section=communities',
        description: 'Administrar comunidades',
        permission: 'manage_communities_all'
      }
    ]
  },
  {
    id: 'admin',
    label: 'Configuración',
    icon: CogIcon,
    href: '/admin/configuration',
    description: 'Configuración del sistema',
    permission: 'manage_system_settings'
  },
  {
    id: 'rbac',
    label: 'Roles y Permisos',
    icon: UserGroupIcon,
    href: '/admin/role-management',
    description: 'Gestión de roles y permisos',
    superadminOnly: true,
    permission: 'manage_permissions'
  }
];

interface SidebarItemProps {
  item: NavigationItem;
  isCollapsed: boolean;
  expandedItems: Set<string>;
  isAdmin: boolean;
  userRole?: string;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  newFeedbackCount: number;
  isItemActive: (href: string, currentPath: string) => boolean;
  toggleExpanded: (itemId: string) => void;
  routerAsPath: string;
}

const SidebarItem: React.FC<SidebarItemProps> = React.memo(({
  item,
  isCollapsed,
  expandedItems,
  isAdmin,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  newFeedbackCount,
  isItemActive,
  toggleExpanded,
  routerAsPath
}) => {
  const router = useRouter();
  const [showCollapsedMenu, setShowCollapsedMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Filter children based on admin status and permissions
  const filteredChildren = useMemo(() => item.children?.filter(child => {
    if (child.adminOnly && !isAdmin) {
      return false;
    }
    if (child.permission && !isAdmin) {
      if (Array.isArray(child.permission)) {
        if (child.requireAllPermissions) {
          return hasAllPermissions(child.permission);
        } else {
          return hasAnyPermission(child.permission);
        }
      } else {
        return hasPermission(child.permission);
      }
    }
    return true;
  }) || [], [item.children, isAdmin, hasPermission, hasAnyPermission, hasAllPermissions]);

  const hasChildren = filteredChildren.length > 0;
  const isActive = item.href ? isItemActive(item.href, routerAsPath) : false;

  const handleClick = useCallback(async () => {
    if (isCollapsed && hasChildren) {
      setShowCollapsedMenu(prev => !prev);
    } else if (hasChildren) {
      toggleExpanded(item.id);
    } else if (item.href) {
      try {
        router.push(item.href);
      } catch (err) {
        console.error('Navigation error in sidebar:', err);
      }
    }
  }, [isCollapsed, hasChildren, item.id, item.href, toggleExpanded, router]);

  // Don't render parent items that have children but all children are filtered out
  if (item.children && !hasChildren && !item.href) {
    return null;
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (isCollapsed) {
          hoverTimeoutRef.current = setTimeout(() => {
            setIsHovered(true);
            if (hasChildren) setShowCollapsedMenu(true);
          }, 150);
        }
      }}
      onMouseLeave={() => {
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
        }
        setIsHovered(false);
        if (hasChildren) {
          setShowCollapsedMenu(false);
        }
      }}
    >
      <button
        onClick={handleClick}
        className={`
          group flex items-center w-full text-left transition-all duration-200 rounded-lg relative
          ${isCollapsed ? 'px-3 py-3 justify-center' : 'px-3 py-3'}
          ${isActive && !hasChildren
            ? 'bg-[#0a0a0a] text-white shadow-lg'
            : 'text-gray-700 hover:bg-gray-100 hover:text-[#0a0a0a]'
          }
          ${isCollapsed && hasChildren && showCollapsedMenu ? 'bg-gray-100 text-[#0a0a0a]' : ''}
        `}
        title={isCollapsed ? item.label : undefined}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      >
        {/* Active indicator */}
        {isActive && !hasChildren && !isCollapsed && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fbbf24] rounded-r-lg"></div>
        )}

        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} flex-1`}>
          <item.icon className={`flex-shrink-0 ${isCollapsed ? 'h-6 w-6' : 'h-5 w-5'} ${isActive && !hasChildren ? 'text-white' : 'text-gray-500 group-hover:text-[#0a0a0a]'
            }`} />

          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium truncate">
                  {item.label}
                </div>
                {item.id === 'feedback' && newFeedbackCount > 0 && (
                  <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                    {newFeedbackCount}
                  </span>
                )}
              </div>
              {item.description && (
                <div className={`text-xs truncate mt-0.5 ${isActive && !hasChildren ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                  {item.description}
                </div>
              )}
            </div>
          )}

          {!isCollapsed && hasChildren && (
            <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''
              } ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#0a0a0a]'}`} />
          )}

          {isCollapsed && hasChildren && filteredChildren.length > 0 && (
            <div className="absolute -top-1 -right-1 bg-[#fbbf24] text-[#0a0a0a] text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm pointer-events-none">
              {filteredChildren.length}
            </div>
          )}
        </div>
      </button>

      {/* Tooltip for collapsed items WITHOUT children */}
      {isCollapsed && !hasChildren && isHovered && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 pointer-events-none">
          <div className="bg-[#0a0a0a] text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap shadow-lg relative">
            {item.label}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full">
              <div className="border-8 border-transparent border-r-[#0a0a0a]"></div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed state floating menu */}
      {isCollapsed && hasChildren && showCollapsedMenu && (
          <div
            ref={menuRef}
            className="absolute left-full top-0 pl-2 z-50"
          >
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 min-w-48 overflow-hidden">
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
                  ${isItemActive(child.href, routerAsPath)
                    ? 'bg-[#0a0a0a] text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-[#0a0a0a]'
                  }
                `}
              >
                {child.icon ? (
                  <child.icon className={`h-4 w-4 mr-3 ${isItemActive(child.href, routerAsPath)
                    ? 'text-white'
                    : 'text-gray-400 group-hover:text-[#0a0a0a]'
                    }`} />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 mr-3 text-gray-400 group-hover:text-[#0a0a0a]" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{child.label}</span>
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
                ${isItemActive(child.href, routerAsPath)
                  ? 'bg-[#0a0a0a]/10 text-[#0a0a0a] font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-[#0a0a0a]'
                }
              `}
            >
              {child.icon ? (
                <child.icon className={`h-4 w-4 mr-2 ${isItemActive(child.href, routerAsPath)
                  ? 'text-[#0a0a0a]'
                  : 'text-gray-400 group-hover:text-[#0a0a0a]'
                  }`} />
              ) : (
                <ChevronRightIcon className="h-4 w-4 mr-2 text-gray-400 group-hover:text-[#0a0a0a]" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate">{child.label}</div>
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
});

SidebarItem.displayName = 'SidebarItem';

const Sidebar: React.FC<SidebarProps> = React.memo(({
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
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading: permissionsLoading } = usePermissions();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [superadminCheckDone, setSuperadminCheckDone] = useState(false);
  const [hasCommunity, setHasCommunity] = useState(false);
  const [communityCheckDone, setCommunityCheckDone] = useState(false);

  const fetchNewFeedbackCount = useCallback(async () => {
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
  }, [supabase]);

  const userId = user?.id;

  // Check if user is superadmin
  useEffect(() => {
    if (!userId || !isAdmin) {
      setIsSuperadmin(prev => prev === false ? prev : false);
      setSuperadminCheckDone(prev => prev === true ? prev : true);
      return;
    }

    let cancelled = false;
    const checkSuperadmin = async () => {
      try {
        const { data, error } = await supabase
          .from('superadmins')
          .select('is_active')
          .eq('user_id', userId)
          .eq('is_active', true)
          .single();

        if (!cancelled) {
          setIsSuperadmin(!error && !!data);
        }
      } catch (error) {
        if (!cancelled) setIsSuperadmin(false);
      } finally {
        if (!cancelled) setSuperadminCheckDone(true);
      }
    };

    checkSuperadmin();
    return () => { cancelled = true; };
  }, [userId, isAdmin, supabase]);

  // Check if user has community membership
  useEffect(() => {
    if (!userId) {
      setHasCommunity(prev => prev === false ? prev : false);
      setCommunityCheckDone(prev => prev === true ? prev : true);
      return;
    }

    // Admins always have access to workspace
    if (isAdmin) {
      setHasCommunity(prev => prev === true ? prev : true);
      setCommunityCheckDone(prev => prev === true ? prev : true);
      return;
    }

    let cancelled = false;
    const checkCommunity = async () => {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('community_id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .not('community_id', 'is', null)
          .limit(1);

        if (!cancelled) {
          setHasCommunity(!error && data && data.length > 0);
        }
      } catch (error) {
        if (!cancelled) setHasCommunity(false);
      } finally {
        if (!cancelled) setCommunityCheckDone(true);
      }
    };

    checkCommunity();
    return () => { cancelled = true; };
  }, [userId, isAdmin, supabase]);

  // Fetch new feedback count for admins
  useEffect(() => {
    if (isAdmin) {
      fetchNewFeedbackCount();
      // Refresh count every 30 seconds
      const interval = setInterval(fetchNewFeedbackCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, fetchNewFeedbackCount]);

  // Auto-expand parent items based on current page
  useEffect(() => {
    const newExpanded = new Set<string>();

    NAVIGATION_ITEMS.forEach(item => {
      if (item.children) {
        const hasActiveChild = item.children.some(child =>
          isItemActive(child.href, router.asPath)
        );
        if (hasActiveChild) {
          newExpanded.add(item.id);
        }
      }
    });

    // Only update if the set has actually changed
    setExpandedItems(prev => {
      const prevArray = Array.from(prev).sort();
      const newArray = Array.from(newExpanded).sort();
      if (prevArray.join(',') !== newArray.join(',')) {
        return newExpanded;
      }
      return prev;
    });
  }, [router.asPath]);

  const isItemActive = useCallback((href: string, currentPath: string): boolean => {
    // Exact match
    if (href === currentPath) return true;

    // Special handling for workspace sections
    if (href.includes('/community/workspace') && currentPath.includes('/community/workspace')) {
      const urlParams = new URLSearchParams(href.split('?')[1] || '');
      const currentParams = new URLSearchParams(currentPath.split('?')[1] || '');
      return urlParams.get('section') === currentParams.get('section');
    }

    // Base path comparison (ignoring query params)
    const hrefBase = href.split('?')[0];
    const currentPathBase = currentPath.split('?')[0];

    if (hrefBase === currentPathBase) {
      // If href has query params, we require them to match exactly
      if (href.includes('?')) {
        return href === currentPath;
      }
      return true; // Match for items without query params (parent)
    }

    // If href has query params, do not match nested routes based on base path
    if (href.includes('?')) return false;

    // Check if currentPath starts with href for nested routes
    return currentPathBase.startsWith(hrefBase + '/');
  }, []);

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(itemId)) {
        newExpanded.delete(itemId);
      } else {
        newExpanded.add(itemId);
      }
      return newExpanded;
    });
  }, []);

  const filteredNavigationItems = useMemo(() => {
    return NAVIGATION_ITEMS.filter(item => {
      if (item.superadminOnly) {
        if (!isFeatureEnabled('FEATURE_SUPERADMIN_RBAC')) return false;
        if (!superadminCheckDone) return false;
        if (!isSuperadmin) return false;
      }

      if (item.adminOnly && !isAdmin) return false;

      if (item.consultantOnly && !isAdmin && !['admin', 'consultor'].includes(userRole || '')) {
        return false;
      }

      if (item.requiresCommunity) {
        if (!communityCheckDone) return false;
        if (!hasCommunity && userRole !== 'consultor') return false;
      }

      if (item.restrictedRoles && item.restrictedRoles.length > 0) {
        // restrictedRoles is the definitive access list — if your role is in
        // the list you see the item, if not you don't.  No further permission
        // check needed (children still have their own permission gates).
        return item.restrictedRoles.includes(userRole || '') || (isAdmin && item.restrictedRoles.includes('admin'));
      }

      const isConsultor = userRole === 'consultor';
      const consultorBypassesPermission = item.consultantOnly && isConsultor;

      if (item.permission && !isAdmin && !consultorBypassesPermission) {
        if (permissionsLoading) return false;

        if (Array.isArray(item.permission)) {
          if (item.requireAllPermissions) {
            if (!hasAllPermissions(item.permission)) return false;
          } else {
            if (!hasAnyPermission(item.permission)) return false;
          }
        } else {
          if (!hasPermission(item.permission)) return false;
        }
      }

      return true;
    });
  }, [isAdmin, userRole, hasPermission, hasAnyPermission, hasAllPermissions, permissionsLoading, isSuperadmin, superadminCheckDone, hasCommunity, communityCheckDone]);

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
        fixed left-0 top-0 h-full bg-white shadow-xl transition-all duration-300
        lg:fixed lg:z-30
        ${isCollapsed
          ? 'w-20 -translate-x-full lg:translate-x-0'
          : 'w-80 translate-x-0'
        }
        z-50 lg:z-30
        ${className}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between h-20 px-4 bg-[#0a0a0a] relative z-10 -mr-[1px] pr-[calc(1rem+1px)]">
          {!isCollapsed ? (
            <div className="flex items-center space-x-3">
              {/* Genera Logo */}
              <img
                src="/genera/icon-transparent.svg"
                alt="Genera"
                className="w-10 h-10"
              />
              <div>
                <h2 className="text-white font-light tracking-[0.1em] text-sm">
                  GENERA
                </h2>
                <p className="text-white/50 text-xs">
                  Hub de Transformación
                </p>
                <p className="text-white/30 text-[10px] italic">
                  by FNE
                </p>
              </div>
            </div>
          ) : (
            /* Genera Logo - Collapsed state */
            <img
              src="/genera/icon-transparent.svg"
              alt="Genera"
              className="w-8 h-8 mx-auto"
            />
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
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 max-h-[calc(100vh-8rem)] border-r border-gray-200">
          {filteredNavigationItems.map(item => (
            <SidebarItem
              key={item.id}
              item={item}
              isCollapsed={isCollapsed}
              expandedItems={expandedItems}
              isAdmin={isAdmin}
              userRole={userRole}
              hasPermission={hasPermission}
              hasAnyPermission={hasAnyPermission}
              hasAllPermissions={hasAllPermissions}
              newFeedbackCount={newFeedbackCount}
              isItemActive={isItemActive}
              toggleExpanded={toggleExpanded}
              routerAsPath={router.asPath}
            />
          ))}
        </div>

        {/* Empty Footer for spacing */}
        <div className="p-2">
        </div>
      </div>
    </>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
