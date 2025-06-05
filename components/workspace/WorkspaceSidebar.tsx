/**
 * WorkspaceSidebar Component - Professional navigation sidebar for FNE Workspace
 * Replaces tab-based navigation with hierarchical sidebar structure
 */

import React from 'react';
import { useRouter } from 'next/router';
import { 
  CalendarDaysIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  RssIcon,
  ChartBarIcon,
  UsersIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronRightIcon,
  HomeIcon,
  BuildingOfficeIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
import { CommunityWorkspace, WorkspaceAccess, CommunityInfo } from '../../utils/workspaceUtils';

interface WorkspaceSidebarProps {
  currentWorkspace: CommunityWorkspace | null;
  workspaceAccess: WorkspaceAccess | null;
  communities: CommunityInfo[];
  activeSection: 'overview' | 'communities' | 'meetings' | 'documents' | 'messaging' | 'feed';
  onSectionChange: (section: string) => void;
  onWorkspaceChange: (workspaceId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  section: string;
  description?: string;
  indent?: boolean;
  isActive?: boolean;
  isHeader?: boolean;
  onClick?: () => void;
  badge?: string;
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  currentWorkspace,
  workspaceAccess,
  communities,
  activeSection,
  onSectionChange,
  onWorkspaceChange,
  isCollapsed,
  onToggleCollapse
}) => {
  const router = useRouter();

  // Build sidebar navigation structure
  const buildSidebarItems = (): SidebarItem[] => {
    const items: SidebarItem[] = [];

    // Overview section (always visible)
    items.push({
      id: 'overview',
      label: 'Vista General',
      icon: HomeIcon,
      section: 'overview',
      description: 'Dashboard principal',
      isActive: activeSection === 'overview',
      onClick: () => onSectionChange('overview')
    });

    // Communities management (admin/consultant only)
    if (workspaceAccess?.accessType === 'admin' || workspaceAccess?.accessType === 'consultant') {
      items.push({
        id: 'communities',
        label: 'Gestión de Comunidades',
        icon: UsersIcon,
        section: 'communities',
        description: 'Administrar comunidades',
        isActive: activeSection === 'communities',
        onClick: () => onSectionChange('communities'),
        badge: communities.length.toString()
      });
    }

    // Current workspace sections (if workspace selected)
    if (currentWorkspace) {
      // Workspace header
      const workspaceName = currentWorkspace.name || 'Espacio Colaborativo';
      const schoolName = currentWorkspace.community?.school?.name || '';
      const generationName = currentWorkspace.community?.generation?.name || '';
      
      let workspaceDescription = '';
      if (schoolName && generationName) {
        workspaceDescription = `${schoolName} - ${generationName}`;
      } else if (schoolName) {
        workspaceDescription = schoolName;
      } else if (generationName) {
        workspaceDescription = generationName;
      } else {
        workspaceDescription = 'Comunidad de Crecimiento';
      }

      items.push({
        id: 'workspace-divider',
        label: '',
        icon: BuildingOfficeIcon,
        section: 'divider',
        isHeader: true
      });

      items.push({
        id: 'workspace-header',
        label: workspaceName,
        icon: BuildingOfficeIcon,
        section: 'workspace-header',
        description: workspaceDescription,
        isHeader: true
      });

      // Workspace features
      const workspaceFeatures = [
        {
          id: 'meetings',
          label: 'Reuniones',
          icon: CalendarDaysIcon,
          section: 'meetings',
          description: 'Gestión de reuniones'
        },
        {
          id: 'documents',
          label: 'Documentos',
          icon: DocumentTextIcon,
          section: 'documents',
          description: 'Repositorio compartido'
        },
        {
          id: 'messaging',
          label: 'Mensajería',
          icon: ChatBubbleLeftRightIcon,
          section: 'messaging',
          description: 'Comunicación en tiempo real'
        },
        {
          id: 'feed',
          label: 'Feed',
          icon: RssIcon,
          section: 'feed',
          description: 'Actividades recientes'
        }
      ];

      workspaceFeatures.forEach(feature => {
        items.push({
          ...feature,
          indent: true,
          isActive: activeSection === feature.section,
          onClick: () => onSectionChange(feature.section)
        });
      });
    }

    return items;
  };

  const sidebarItems = buildSidebarItems();

  const handleBackToMain = () => {
    router.push('/dashboard');
  };

  const SidebarItemComponent: React.FC<{ item: SidebarItem }> = ({ item }) => {
    // Divider
    if (item.id === 'workspace-divider') {
      return (
        <div className="my-4">
          <div className="border-t border-gray-200"></div>
        </div>
      );
    }

    // Header items
    if (item.isHeader) {
      return (
        <div className={`px-3 py-3 ${isCollapsed ? 'text-center' : ''}`}>
          {!isCollapsed && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[#fdb933]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <item.icon className="h-5 w-5 text-[#fdb933]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[#00365b] truncate">
                  {item.label}
                </div>
                {item.description && (
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {item.description}
                  </div>
                )}
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 bg-[#fdb933]/20 rounded-lg flex items-center justify-center mx-auto">
              <item.icon className="h-5 w-5 text-[#fdb933]" />
            </div>
          )}
        </div>
      );
    }

    const isActive = item.isActive;
    const baseClasses = `
      group flex items-center w-full text-left transition-all duration-200 rounded-lg relative
      ${isCollapsed ? 'px-3 py-3 justify-center' : 'px-3 py-3'}
      ${item.indent && !isCollapsed ? 'ml-3 mr-1' : ''}
    `;

    const stateClasses = isActive
      ? 'bg-[#00365b] text-white shadow-lg'
      : 'text-gray-700 hover:bg-gray-100 hover:text-[#00365b]';

    return (
      <button
        onClick={item.onClick}
        className={`${baseClasses} ${stateClasses}`}
        title={isCollapsed ? item.label : undefined}
      >
        {/* Active indicator */}
        {isActive && !isCollapsed && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#fdb933] rounded-r-lg"></div>
        )}
        
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} flex-1`}>
          <item.icon className={`flex-shrink-0 ${isCollapsed ? 'h-6 w-6' : 'h-5 w-5'} ${
            isActive ? 'text-white' : 'text-gray-500 group-hover:text-[#00365b]'
          }`} />
          
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {item.label}
              </div>
              {item.description && !item.indent && (
                <div className={`text-xs truncate mt-0.5 ${
                  isActive ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {item.description}
                </div>
              )}
            </div>
          )}
          
          {!isCollapsed && item.badge && (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              isActive 
                ? 'bg-white/20 text-white' 
                : 'bg-gray-100 text-gray-600 group-hover:bg-[#00365b]/10 group-hover:text-[#00365b]'
            }`}>
              {item.badge}
            </span>
          )}
          
          {!isCollapsed && item.onClick && !item.badge && (
            <ChevronRightIcon className={`h-4 w-4 flex-shrink-0 transition-colors ${
              isActive ? 'text-white' : 'text-gray-400 group-hover:text-[#00365b]'
            }`} />
          )}
        </div>
      </button>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggleCollapse}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed left-0 top-0 h-full bg-white border-r border-gray-200 shadow-xl z-50 transition-all duration-300
        lg:relative lg:translate-x-0
        ${isCollapsed 
          ? 'w-16 -translate-x-full lg:translate-x-0' 
          : 'w-80 translate-x-0'
        }
      `}>
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 bg-gradient-to-r from-[#00365b] to-[#004a7a]">
          {!isCollapsed && (
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-[#fdb933] rounded-lg flex items-center justify-center">
                <UsersIcon className="h-5 w-5 text-[#00365b]" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">
                  Espacio Colaborativo
                </h2>
                <p className="text-blue-200 text-xs">
                  {workspaceAccess?.accessType === 'admin' && 'Vista Administrador'}
                  {workspaceAccess?.accessType === 'consultant' && 'Vista Consultor'}
                  {workspaceAccess?.accessType === 'community_member' && 'Miembro Comunidad'}
                </p>
              </div>
            </div>
          )}
          
          <button
            onClick={onToggleCollapse}
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

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 max-h-[calc(100vh-8rem)]">
          {sidebarItems.map(item => (
            <SidebarItemComponent key={item.id} item={item} />
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-2">
          <button
            onClick={handleBackToMain}
            className={`
              group flex items-center w-full text-left transition-all duration-200 rounded-lg
              ${isCollapsed ? 'px-3 py-3 justify-center' : 'px-3 py-3'}
              text-gray-600 hover:bg-gray-100 hover:text-[#00365b]
            `}
            title={isCollapsed ? 'Volver al Panel Principal' : undefined}
          >
            <ArrowLeftIcon className={`flex-shrink-0 ${isCollapsed ? 'h-6 w-6' : 'h-5 w-5'} text-gray-500 group-hover:text-[#00365b]`} />
            {!isCollapsed && (
              <span className="text-sm font-medium ml-3">
                Volver al Panel Principal
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default WorkspaceSidebar;