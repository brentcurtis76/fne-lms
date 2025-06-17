/**
 * Community Workspace Page - FNE LMS
 * Collaborative workspace for growth communities with role-based access
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import MainLayout from '../../components/layout/MainLayout';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import { ResponsiveFunctionalPageHeader } from '../../components/layout/FunctionalPageHeader';
import MeetingFilters from '../../components/meetings/MeetingFilters';
import MeetingCard from '../../components/meetings/MeetingCard';
import MeetingDocumentationModal from '../../components/meetings/MeetingDocumentationModal';
import DocumentUploadModal from '../../components/documents/DocumentUploadModal';
import DocumentGrid from '../../components/documents/DocumentGrid';
import FolderNavigation from '../../components/documents/FolderNavigation';
import DocumentPreview from '../../components/documents/DocumentPreview';
import DocumentFilters from '../../components/documents/DocumentFilters';
import MessageFilters from '../../components/messaging/MessageFilters';
import MessageComposer from '../../components/messaging/MessageComposer';
import MessageThread from '../../components/messaging/MessageThread';
import MessageCard from '../../components/messaging/MessageCard';
import AttachmentPreview from '../../components/messaging/AttachmentPreview';
import ThreadCreationModal from '../../components/messaging/ThreadCreationModal';
import ActivityFeed from '../../components/activity/ActivityFeed';
import ActivitySummary from '../../components/activity/ActivitySummary';
import ActivityNotifications from '../../components/activity/ActivityNotifications';
import ActivityFeedPlaceholder from '../../components/activity/ActivityFeedPlaceholder';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import GroupSubmissionModalV2 from '../../components/assignments/GroupSubmissionModalV2';
import WorkspaceSettingsModal from '../../components/community/WorkspaceSettingsModal';
import { useAuth } from '../../hooks/useAuth';
import { groupAssignmentsV2Service } from '../../lib/services/groupAssignmentsV2';
import { communityWorkspaceService } from '../../lib/services/communityWorkspace';
import { 
  getUserWorkspaceAccess, 
  getOrCreateWorkspace, 
  logWorkspaceActivity,
  WorkspaceAccess,
  CommunityInfo,
  CommunityWorkspace 
} from '../../utils/workspaceUtils';
import { 
  getMeetings,
  canUserManageMeetings
} from '../../utils/meetingUtils';
import {
  getWorkspaceDocuments,
  getUserDocumentPermissions,
  uploadDocument,
  createFolder,
  incrementDocumentCounter,
  getFolderBreadcrumb,
  extractUniqueTags,
  formatFileSize
} from '../../utils/documentUtils';
import {
  CommunityMeeting,
  MeetingFilters as MeetingFiltersType,
  MeetingSortOptions
} from '../../types/meetings';
import {
  DocumentWithDetails,
  FolderWithBreadcrumb,
  DocumentFolder,
  CommunityDocument,
  DocumentFilterOptions,
  DocumentViewMode,
  DocumentAction,
  DocumentPermission,
  BreadcrumbItem,
  FolderCreateData
} from '../../types/documents';
import {
  MessageFilters as MessageFiltersType,
  ThreadFilters,
  MessageWithDetails,
  ThreadWithDetails,
  MessageAttachment,
  MessagingPermissions
} from '../../types/messaging';
import {
  getWorkspaceMessages,
  getWorkspaceThreads,
  getUserMessagingPermissions,
  createThread,
  sendMessage,
  subscribeToWorkspaceMessages
} from '../../utils/messagingUtils-simple';
import {
  getActivityFeed,
  getActivitySubscription,
  updateActivitySubscription,
  getActivityPermissions
} from '../../utils/activityUtils';
import {
  ActivityFilters,
  ActivitySubscription,
  ActivityPermissions,
  ActivityWithDetails,
  DEFAULT_ACTIVITY_FILTERS
} from '../../types/activity';
import { 
  UsersIcon, 
  DocumentTextIcon, 
  ChatAlt2Icon, 
  RssIcon,
  CalendarIcon,
  ChevronDownIcon,
  OfficeBuildingIcon,
  AcademicCapIcon,
  PlusIcon,
  SwitchVerticalIcon,
  MenuIcon,
  ClipboardCheckIcon
} from '@heroicons/react/outline';
import { X, Users, CheckCircle, Settings } from 'lucide-react';
import { navigationManager } from '../../utils/navigationManager';

type SectionType = 'overview' | 'communities' | 'meetings' | 'documents' | 'messaging' | 'group-assignments';

// Sidebar state management
interface SidebarState {
  isCollapsed: boolean;
  activeSection: SectionType;
}

const CommunityWorkspacePage: React.FC = () => {
  const router = useRouter();
  const { user, profile, loading: authLoading, logout, isAdmin, avatarUrl } = useAuth();
  
  // Workspace state
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccess | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<CommunityWorkspace | null>(null);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');
  const [activeSection, setActiveSection] = useState<SectionType>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // URL state management
  const { query } = router;
  
  // Initialize sidebar state from localStorage and handle responsive behavior
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('workspace-sidebar-collapsed');
    const isLargeScreen = window.innerWidth >= 1024;
    
    if (savedCollapsed !== null) {
      setSidebarCollapsed(JSON.parse(savedCollapsed));
    } else {
      // Default to collapsed on mobile/tablet, expanded on desktop
      setSidebarCollapsed(!isLargeScreen);
    }
    
    // Check URL for initial section
    const urlSection = query.section as SectionType;
    if (urlSection && ['overview', 'communities', 'meetings', 'documents', 'messaging'].includes(urlSection)) {
      setActiveSection(urlSection);
    }
    
    // Handle window resize
    const handleResize = () => {
      const isLarge = window.innerWidth >= 1024;
      if (!isLarge) {
        // On mobile/tablet, always start collapsed
        setSidebarCollapsed(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [query.section]);
  
  // UI state
  const [showCommunitySelector, setShowCommunitySelector] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [canEditWorkspace, setCanEditWorkspace] = useState(false);
  
  // Activity Feed state
  const [activityPermissions, setActivityPermissions] = useState<ActivityPermissions | null>(null);
  const [activitySubscription, setActivitySubscription] = useState<ActivitySubscription | null>(null);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      initializeWorkspace();
    } else if (!authLoading && !user) {
      // Use navigation manager to prevent concurrent navigation
      navigationManager.navigate(async () => {
        await router.push('/login');
      }).catch((error) => {
        console.warn('Navigation to login failed:', error);
        // Fallback - try redirecting via window.location
        window.location.href = '/login';
      });
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (selectedCommunityId && workspaceAccess) {
      loadWorkspace(selectedCommunityId);
    }
  }, [selectedCommunityId, workspaceAccess]);

  const initializeWorkspace = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError('');

      // Get user's workspace access
      const access = await getUserWorkspaceAccess(user.id);
      setWorkspaceAccess(access);

      if (!access.canAccess) {
        setError('No tienes acceso a ningún espacio colaborativo. Contacta al administrador.');
        setLoading(false);
        return;
      }

      // Set default community
      if (access.defaultCommunityId) {
        setSelectedCommunityId(access.defaultCommunityId);
      } else if (access.availableCommunities.length > 0) {
        setSelectedCommunityId(access.availableCommunities[0].id);
      }

    } catch (error) {
      console.error('Error initializing workspace:', error);
      setError('Error al cargar el espacio colaborativo');
      toast.error('Error al cargar el espacio colaborativo');
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspace = async (communityId: string) => {
    if (!user) return;

    try {
      const workspace = await getOrCreateWorkspace(communityId);
      if (workspace) {
        setCurrentWorkspace(workspace);
        
        // Check if user can edit workspace settings
        const { canEdit } = await communityWorkspaceService.canEditWorkspace(user.id, workspace.id);
        setCanEditWorkspace(canEdit);
        
        // Log workspace access
        await logWorkspaceActivity(
          workspace.id,
          user.id,
          'workspace_accessed',
          { section: activeSection }
        );
      } else {
        setError('No se pudo cargar el espacio de trabajo');
        toast.error('No se pudo cargar el espacio de trabajo');
      }
    } catch (error) {
      console.error('Error loading workspace:', error);
      setError('Error al cargar el espacio de trabajo');
      toast.error('Error al cargar el espacio de trabajo');
    }
  };

  const handleCommunityChange = (communityId: string) => {
    setSelectedCommunityId(communityId);
    setShowCommunitySelector(false);
    
    // Reset workspace when changing communities
    setCurrentWorkspace(null);
  };

  const handleSectionChange = async (section: string) => {
    const newSection = section as SectionType;
    
    // Prevent unnecessary updates if section hasn't changed
    if (newSection === activeSection) {
      return;
    }
    
    setActiveSection(newSection);
    
    // Update URL without page reload - use replace to avoid navigation stack pollution
    try {
      await router.replace(
        {
          pathname: router.pathname,
          query: { ...router.query, section: newSection }
        },
        undefined,
        { shallow: true }
      );
    } catch (error) {
      console.warn('Router navigation throttled, continuing without URL update');
    }
    
    // Log section change activity
    if (currentWorkspace && user) {
      try {
        await logWorkspaceActivity(
          currentWorkspace.id,
          user.id,
          'section_changed',
          { section: newSection, previous_section: activeSection }
        );
      } catch (error) {
        console.warn('Failed to log section change activity:', error);
      }
    }
  };
  
  const handleToggleSidebar = () => {
    const newCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsed);
    localStorage.setItem('workspace-sidebar-collapsed', JSON.stringify(newCollapsed));
  };
  
  const handleWorkspaceChange = (workspaceId: string) => {
    setSelectedCommunityId(workspaceId);
  };

  // Search filtering functions
  const filterMeetingsBySearch = (meetings: CommunityMeeting[]): CommunityMeeting[] => {
    if (!searchQuery.trim()) return meetings;
    
    const query = searchQuery.toLowerCase();
    return meetings.filter(meeting => {
      return (
        meeting.title.toLowerCase().includes(query) ||
        (meeting.description && meeting.description.toLowerCase().includes(query)) ||
        (meeting.location && meeting.location.toLowerCase().includes(query)) ||
        meeting.status.toLowerCase().includes(query)
      );
    });
  };

  const filterDocumentsBySearch = (docs: DocumentWithDetails[]): DocumentWithDetails[] => {
    if (!searchQuery.trim()) return docs;
    
    const query = searchQuery.toLowerCase();
    return docs.filter(doc => {
      return (
        doc.file_name.toLowerCase().includes(query) ||
        (doc.description && doc.description.toLowerCase().includes(query)) ||
        (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(query))) ||
        (doc.uploader_name && doc.uploader_name.toLowerCase().includes(query))
      );
    });
  };

  const filterThreadsBySearch = (threads: ThreadWithDetails[]): ThreadWithDetails[] => {
    if (!searchQuery.trim()) return threads;
    
    const query = searchQuery.toLowerCase();
    return threads.filter(thread => {
      return (
        thread.thread_title.toLowerCase().includes(query) ||
        (thread.description && thread.description.toLowerCase().includes(query)) ||
        thread.creator_name.toLowerCase().includes(query) ||
        thread.category_config.label.toLowerCase().includes(query)
      );
    });
  };

  const filterActivitiesBySearch = (activities: ActivityWithDetails[]): ActivityWithDetails[] => {
    if (!searchQuery.trim()) return activities;
    
    const query = searchQuery.toLowerCase();
    return activities.filter(activity => {
      return (
        (activity.description && activity.description.toLowerCase().includes(query)) ||
        activity.title.toLowerCase().includes(query) ||
        (activity.user_name && activity.user_name.toLowerCase().includes(query)) ||
        activity.activity_type.toLowerCase().includes(query)
      );
    });
  };

  const renderCommunitySelector = () => {
    if (!workspaceAccess || workspaceAccess.accessType === 'community_member') {
      return null; // Community members are auto-directed to their workspace
    }

    const selectedCommunity = workspaceAccess.availableCommunities.find(
      c => c.id === selectedCommunityId
    );

    return (
      <div className="relative">
        <button
          onClick={() => setShowCommunitySelector(!showCommunitySelector)}
          className="flex items-center justify-between w-full sm:w-auto space-x-3 px-4 py-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors duration-200 min-w-0"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <OfficeBuildingIcon className="h-5 w-5 text-[#00365b] flex-shrink-0" />
            <div className="text-left min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {selectedCommunity?.name || 'Seleccionar Comunidad'}
              </div>
              {selectedCommunity && (
                <div className="text-xs text-gray-500 truncate">
                  {selectedCommunity.school_name} - {selectedCommunity.generation_name}
                </div>
              )}
            </div>
          </div>
          <ChevronDownIcon className={`h-4 w-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
            showCommunitySelector ? 'rotate-180' : ''
          }`} />
        </button>

        {showCommunitySelector && (
          <div className="absolute top-full left-0 mt-1 w-full sm:min-w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
            {workspaceAccess.availableCommunities.map(community => (
              <button
                key={community.id}
                onClick={() => handleCommunityChange(community.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors duration-200 ${
                  community.id === selectedCommunityId ? 'bg-[#fdb933]/10' : ''
                }`}
              >
                <div className="flex items-center space-x-3">
                  <AcademicCapIcon className="h-4 w-4 text-[#00365b] flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {community.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {community.school_name} - {community.generation_name}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMainContent = () => {
    // Overview section
    if (activeSection === 'overview') {
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-[#00365b] mb-4">
              Vista General del Espacio Colaborativo
            </h2>
            <p className="text-gray-600 mb-6">
              Bienvenido al espacio colaborativo de tu comunidad. Aquí encontrarás todas las herramientas para trabajar en equipo.
            </p>
            
            {currentWorkspace && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <button
                  onClick={() => handleSectionChange('meetings')}
                  className="bg-blue-50 p-4 rounded-lg hover:bg-blue-100 transition-colors duration-200 text-left"
                >
                  <CalendarIcon className="h-8 w-8 text-blue-600 mb-2" />
                  <h3 className="font-semibold text-blue-900">Reuniones</h3>
                  <p className="text-sm text-blue-700">Gestión de reuniones</p>
                </button>
                <button
                  onClick={() => handleSectionChange('documents')}
                  className="bg-green-50 p-4 rounded-lg hover:bg-green-100 transition-colors duration-200 text-left"
                >
                  <DocumentTextIcon className="h-8 w-8 text-green-600 mb-2" />
                  <h3 className="font-semibold text-green-900">Documentos</h3>
                  <p className="text-sm text-green-700">Repositorio compartido</p>
                </button>
                <button
                  onClick={() => handleSectionChange('messaging')}
                  className="bg-purple-50 p-4 rounded-lg hover:bg-purple-100 transition-colors duration-200 text-left"
                >
                  <ChatAlt2Icon className="h-8 w-8 text-purple-600 mb-2" />
                  <h3 className="font-semibold text-purple-900">Mensajería</h3>
                  <p className="text-sm text-purple-700">Comunicación en tiempo real</p>
                </button>
              </div>
            )}
            
            {!currentWorkspace && workspaceAccess && workspaceAccess.availableCommunities.length > 0 && (
              <div className="text-center py-8">
                <UsersIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Selecciona una Comunidad
                </h3>
                <p className="text-gray-500">
                  Elige una comunidad de crecimiento para acceder a su espacio colaborativo.
                </p>
              </div>
            )}

            {/* Activity Feed Section - Embedded in Overview */}
            {currentWorkspace && (
              <div className="mt-8">
                <h3 className="text-xl font-semibold text-[#00365b] mb-4 flex items-center">
                  <RssIcon className="h-6 w-6 text-orange-600 mr-2" />
                  Feed de Actividades
                </h3>
                <p className="text-gray-600 mb-6">
                  Mantente al día con todas las actividades recientes de tu comunidad
                </p>
                
                {/* Activity Summary */}
                <div className="mb-6">
                  <ErrorBoundary fallback={<div className="text-gray-500">Error cargando resumen de actividades</div>}>
                    <ActivitySummary
                      workspaceId={currentWorkspace.id}
                      period="today"
                      showComparison={true}
                      showTrends={true}
                    />
                  </ErrorBoundary>
                </div>

                {/* Activity Feed */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                  <ErrorBoundary fallback={<div className="p-6 text-center text-gray-500">Error cargando feed de actividades</div>}>
                    <ActivityFeed
                      workspaceId={currentWorkspace.id}
                      userId={user?.id}
                      realTimeEnabled={true}
                      showGrouping={true}
                      showFilters={true}
                      showStats={false}
                      pageSize={20}
                      className="p-6"
                      filters={{ search_query: searchQuery }}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    
    // Communities management section
    if (activeSection === 'communities') {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-2xl font-bold text-[#00365b] mb-4">
            Gestión de Comunidades
          </h2>
          <p className="text-gray-600 mb-6">
            Administra las comunidades de crecimiento bajo tu supervisión.
          </p>
          <div className="bg-[#00365b]/5 border border-[#00365b]/10 rounded-lg p-4">
            <p className="text-sm text-[#00365b]">
              🚧 Gestión de comunidades en desarrollo. Próximamente podrás administrar múltiples comunidades desde aquí.
            </p>
          </div>
        </div>
      );
    }

    // Workspace-specific sections
    if (activeSection === 'meetings') {
      return <MeetingsTabContent 
        workspace={currentWorkspace} 
        workspaceAccess={workspaceAccess} 
        user={user} 
        searchQuery={searchQuery}
        filterMeetingsBySearch={filterMeetingsBySearch}
      />;
    }

    if (activeSection === 'documents') {
      return <DocumentsTabContent 
        workspace={currentWorkspace} 
        workspaceAccess={workspaceAccess} 
        user={user} 
        searchQuery={searchQuery}
        filterDocumentsBySearch={filterDocumentsBySearch}
      />;
    }

    if (activeSection === 'messaging') {
      return <MessagingTabContent 
        workspace={currentWorkspace} 
        workspaceAccess={workspaceAccess} 
        user={user} 
        searchQuery={searchQuery}
        filterThreadsBySearch={filterThreadsBySearch}
      />;
    }

    if (activeSection === 'group-assignments') {
      return <GroupAssignmentsContent 
        workspace={currentWorkspace} 
        workspaceAccess={workspaceAccess} 
        user={user} 
        searchQuery={searchQuery}
      />;
    }

    return null;
  };

  if (authLoading || loading) {
    return (
      <MainLayout 
        user={user} 
        currentPage="workspace"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        userRole={profile?.role}
        onLogout={logout}
        avatarUrl={avatarUrl}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <LoadingSkeleton />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout 
        user={user} 
        currentPage="workspace"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        userRole={profile?.role}
        onLogout={logout}
        avatarUrl={avatarUrl}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <UsersIcon className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Sin Acceso al Espacio Colaborativo
            </h3>
            <p className="text-gray-500 mb-6">
              {error}
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="inline-flex items-center px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#00365b]/90 transition-colors duration-200"
            >
              Volver al Panel Principal
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  const selectedCommunity = workspaceAccess?.availableCommunities.find(
    c => c.id === selectedCommunityId
  );

  // Determine the current page based on active section
  const getCurrentPage = () => {
    if (activeSection === 'overview' || activeSection === 'communities') {
      return 'workspace';
    }
    return 'workspace';
  };

  const getPageTitle = () => {
    switch (activeSection) {
      case 'overview': return 'Vista General - Espacio Colaborativo';
      case 'communities': return 'Gestión de Comunidades';
      case 'meetings': return 'Reuniones';
      case 'documents': return 'Documentos';
      case 'messaging': return 'Mensajería';
      default: return 'Espacio Colaborativo';
    }
  };

  const getBreadcrumbs = (): { label: string; href?: string }[] => {
    const breadcrumbs: { label: string; href?: string }[] = [{ label: 'Espacio Colaborativo', href: '/community/workspace?section=overview' }];
    
    if (activeSection !== 'overview') {
      switch (activeSection) {
        case 'communities':
          breadcrumbs.push({ label: 'Gestión de Comunidades' });
          break;
        case 'meetings':
          breadcrumbs.push({ label: 'Reuniones' });
          break;
        case 'documents':
          breadcrumbs.push({ label: 'Documentos' });
          break;
        case 'messaging':
          breadcrumbs.push({ label: 'Mensajería' });
          break;
      }
    }
    
    return breadcrumbs;
  };

  return (
    <MainLayout 
      user={user} 
      currentPage={getCurrentPage()}
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={logout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Users />}
        title={currentWorkspace?.custom_name || "Espacio Colaborativo"}
        subtitle={selectedCommunity ? `${selectedCommunity.name} • ${selectedCommunity.school_name}` : 'Herramientas de colaboración para comunidades'}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Buscar en documentos, mensajes, reuniones..."
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Prominent Community Header */}
        {currentWorkspace && (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-[#00365b] to-[#00486b] rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {currentWorkspace.image_url ? (
                    <img 
                      src={currentWorkspace.image_url} 
                      alt={currentWorkspace.custom_name || currentWorkspace.name}
                      className="w-20 h-20 rounded-lg object-cover border-2 border-white/20"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-white/10 rounded-lg flex items-center justify-center border-2 border-white/20">
                      <Users className="w-10 h-10 text-white" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-2xl font-bold text-white">
                      {currentWorkspace.custom_name || currentWorkspace.name}
                    </h1>
                    <p className="text-white/80 mt-1">
                      {selectedCommunity?.school_name} • {selectedCommunity?.generation_name}
                    </p>
                    {workspaceAccess && workspaceAccess.availableCommunities.length > 1 && (
                      <div className="mt-2">
                        {renderCommunitySelector()}
                      </div>
                    )}
                  </div>
                </div>
                {canEditWorkspace && (
                  <button
                    onClick={() => setShowWorkspaceSettings(true)}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                    title="Editar nombre e imagen de la comunidad"
                  >
                    <Settings className="w-6 h-6 text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Current Workspace Info (for sections that need it) */}
        {currentWorkspace && activeSection !== 'overview' && activeSection !== 'communities' && false && (
          <div className="mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {currentWorkspace.image_url ? (
                    <img 
                      src={currentWorkspace.image_url} 
                      alt={currentWorkspace.custom_name || currentWorkspace.name}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-[#fdb933]/10 rounded-lg flex items-center justify-center">
                      <UsersIcon className="w-5 h-5 text-[#fdb933]" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      {currentWorkspace.custom_name || currentWorkspace.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {currentWorkspace.community?.school?.name} - {currentWorkspace.community?.generation?.name}
                    </p>
                  </div>
                </div>
                {canEditWorkspace && (
                  <button
                    onClick={() => setShowWorkspaceSettings(true)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Configuración de la comunidad"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="space-y-6">
          {renderMainContent()}
        </div>
      </div>

      {/* Workspace Settings Modal */}
      {currentWorkspace && (
        <WorkspaceSettingsModal
          isOpen={showWorkspaceSettings}
          onClose={() => setShowWorkspaceSettings(false)}
          workspaceId={currentWorkspace.id}
          currentName={currentWorkspace.custom_name || currentWorkspace.name}
          currentImageUrl={currentWorkspace.image_url}
          onUpdate={(updates) => {
            // Update local state
            setCurrentWorkspace({
              ...currentWorkspace,
              custom_name: updates.customName,
              image_url: updates.imageUrl
            });
            toast.success('Configuración actualizada');
          }}
        />
      )}
    </MainLayout>
  );
};

// Meetings Tab Content Component
interface MeetingsTabContentProps {
  workspace: CommunityWorkspace | null;
  workspaceAccess: WorkspaceAccess | null;
  user: any;
  searchQuery: string;
  filterMeetingsBySearch: (meetings: CommunityMeeting[]) => CommunityMeeting[];
}

const MeetingsTabContent: React.FC<MeetingsTabContentProps> = ({ workspace, workspaceAccess, user, searchQuery, filterMeetingsBySearch }) => {
  const [meetings, setMeetings] = useState<CommunityMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filters, setFilters] = useState<MeetingFiltersType>({
    dateRange: {},
    status: [],
    assignedToMe: false,
    createdByMe: false,
    search: '',
    overdueTasks: false
  });
  const [sort, setSort] = useState<MeetingSortOptions>({
    field: 'meeting_date',
    direction: 'desc'
  });

  useEffect(() => {
    if (workspace && user) {
      loadMeetings();
      checkManagementPermissions();
    }
  }, [workspace, user, filters, sort]);

  const loadMeetings = async () => {
    if (!workspace) return;

    try {
      setLoading(true);
      const meetingsData = await getMeetings(workspace.id, filters, sort);
      setMeetings(meetingsData);
    } catch (error) {
      console.error('Error loading meetings:', error);
      toast.error('Error al cargar las reuniones');
    } finally {
      setLoading(false);
    }
  };

  const checkManagementPermissions = async () => {
    if (!workspace || !user) return;

    try {
      const canManageMeetings = await canUserManageMeetings(user.id, workspace.id);
      setCanManage(canManageMeetings);
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  };

  const handleCreateMeeting = () => {
    setShowCreateModal(true);
  };

  const handleMeetingCreated = () => {
    loadMeetings();
    setShowCreateModal(false);
  };

  const handleEditMeeting = (meetingId: string) => {
    // TODO: Open meeting edit modal
    toast(`Edición de reunión ${meetingId} próximamente`, { icon: 'ℹ️' });
  };

  const handleViewMeeting = (meetingId: string) => {
    // TODO: Open meeting details modal
    toast(`Detalles de reunión ${meetingId} próximamente`, { icon: 'ℹ️' });
  };

  const handleClearFilters = () => {
    setFilters({
      dateRange: {},
      status: [],
      assignedToMe: false,
      createdByMe: false,
      search: '',
      overdueTasks: false
    });
  };

  const handleSortChange = (field: MeetingSortOptions['field']) => {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  if (!workspace) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <CalendarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay espacio de trabajo seleccionado
        </h3>
        <p className="text-gray-500">
          Selecciona una comunidad para ver sus reuniones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#00365b]">
            Reuniones de {workspace.community?.name}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Documentación y seguimiento de reuniones
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleCreateMeeting}
            className="inline-flex items-center px-4 py-2 bg-[#fdb933] text-[#00365b] font-medium rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200 shadow-sm"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Nueva Reunión
          </button>
        )}
      </div>

      {/* Filters */}
      <MeetingFilters
        filters={filters}
        onFiltersChange={setFilters}
        onClearFilters={handleClearFilters}
      />

      {/* Sort Controls */}
      <div className="flex items-center space-x-4 bg-white rounded-lg border border-gray-200 p-4">
        <span className="text-sm text-gray-600">Ordenar por:</span>
        <div className="flex flex-wrap gap-2">
          {[
            { field: 'meeting_date' as const, label: 'Fecha' },
            { field: 'title' as const, label: 'Título' },
            { field: 'status' as const, label: 'Estado' },
            { field: 'created_at' as const, label: 'Creación' }
          ].map(({ field, label }) => (
            <button
              key={field}
              onClick={() => handleSortChange(field)}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                sort.field === field
                  ? 'bg-[#fdb933] text-[#00365b]'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {label}
              {sort.field === field && (
                <SwitchVerticalIcon className="h-3 w-3 ml-1" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Meetings List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="flex space-x-4">
                  <div className="h-3 bg-gray-200 rounded w-24"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                  <div className="h-3 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : meetings.length > 0 ? (
        <div className="space-y-4">
          {filterMeetingsBySearch(meetings).map(meeting => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              canEdit={canManage}
              onEdit={handleEditMeeting}
              onView={handleViewMeeting}
              onTaskUpdate={loadMeetings}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <CalendarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay reuniones
          </h3>
          <p className="text-gray-500 mb-6">
            {canManage 
              ? 'Comienza creando la primera reunión de la comunidad.'
              : 'No se han programado reuniones en esta comunidad.'}
          </p>
          {canManage && (
            <button
              onClick={handleCreateMeeting}
              className="inline-flex items-center px-4 py-2 bg-[#fdb933] text-[#00365b] font-medium rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Crear Primera Reunión
            </button>
          )}
        </div>
      )}

      {/* Meeting Documentation Modal */}
      {showCreateModal && workspace && user && (
        <MeetingDocumentationModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          workspaceId={workspace.id}
          userId={user.id}
          onSuccess={handleMeetingCreated}
        />
      )}
    </div>
  );
};

// Documents Tab Content Component
interface DocumentsTabContentProps {
  workspace: CommunityWorkspace | null;
  workspaceAccess: WorkspaceAccess | null;
  user: any;
  searchQuery: string;
  filterDocumentsBySearch: (docs: DocumentWithDetails[]) => DocumentWithDetails[];
}

const DocumentsTabContent: React.FC<DocumentsTabContentProps> = ({ workspace, workspaceAccess, user, searchQuery, filterDocumentsBySearch }) => {
  // Document state
  const [documents, setDocuments] = useState<DocumentWithDetails[]>([]);
  const [folders, setFolders] = useState<FolderWithBreadcrumb[]>([]);
  const [allFolders, setAllFolders] = useState<DocumentFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderWithBreadcrumb | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentWithDetails | null>(null);
  const [viewMode, setViewMode] = useState<DocumentViewMode>('grid');
  const [permissions, setPermissions] = useState<DocumentPermission>({
    can_view: false,
    can_download: false,
    can_edit: false,
    can_delete: false,
    can_share: false,
    can_create_folder: false,
    can_manage_folders: false,
  });
  
  // Filter state
  const [filters, setFilters] = useState<DocumentFilterOptions>({
    search: '',
    tags: [],
    mime_types: [],
    uploaded_by: '',
    date_from: '',
    date_to: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  });

  // Available data for filters
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availableUploaders, setAvailableUploaders] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (workspace && user) {
      loadDocuments();
      loadPermissions();
    }
  }, [workspace, user, currentFolder, filters]);

  const loadDocuments = async () => {
    if (!workspace) return;

    try {
      setLoading(true);
      const { documents: docs, folders: folderList } = await getWorkspaceDocuments(
        workspace.id,
        currentFolder?.id || null,
        filters
      );
      
      setDocuments(docs);
      setFolders(folderList);
      
      // Update available filter options
      setAvailableTags(extractUniqueTags(docs));
      
      // Extract unique uploaders
      const uploaders = Array.from(
        new Map(docs.map(doc => [doc.uploaded_by, { id: doc.uploaded_by, name: doc.uploader_name || 'Usuario desconocido' }]))
          .values()
      );
      setAvailableUploaders(uploaders);
      
      // Load all folders for folder selector
      if (!allFolders.length) {
        loadAllFolders();
      }
      
    } catch (error) {
      console.error('Error loading documents:', error);
      toast.error('Error al cargar los documentos');
    } finally {
      setLoading(false);
    }
  };

  const loadAllFolders = async () => {
    if (!workspace) return;
    
    try {
      // This would need to be implemented in documentUtils
      // For now, we'll use the current folders
      setAllFolders(folders.map(f => ({
        id: f.id,
        workspace_id: f.workspace_id,
        folder_name: f.folder_name,
        parent_folder_id: f.parent_folder_id,
        created_by: f.created_by,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })));
    } catch (error) {
      console.error('Error loading all folders:', error);
    }
  };

  const loadPermissions = async () => {
    if (!workspace || !user) return;

    try {
      const userPermissions = await getUserDocumentPermissions(user.id, workspace.id);
      setPermissions(userPermissions);
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const loadBreadcrumb = async (folderId: string) => {
    try {
      const breadcrumbData = await getFolderBreadcrumb(folderId);
      setBreadcrumb(breadcrumbData);
    } catch (error) {
      console.error('Error loading breadcrumb:', error);
      setBreadcrumb([]);
    }
  };

  const handleFolderNavigate = async (folderId: string | null) => {
    if (folderId) {
      const folder = folders.find(f => f.id === folderId);
      setCurrentFolder(folder || null);
      await loadBreadcrumb(folderId);
    } else {
      setCurrentFolder(null);
      setBreadcrumb([]);
    }
    setSelectedDocuments([]);
  };

  const handleFolderClick = (folder: FolderWithBreadcrumb) => {
    handleFolderNavigate(folder.id);
  };

  const handleCreateFolder = async (folderData: FolderCreateData) => {
    if (!workspace || !user) return;

    try {
      await createFolder(workspace.id, folderData, user.id);
      await loadDocuments();
      toast.success('Carpeta creada exitosamente');
    } catch (error) {
      console.error('Error creating folder:', error);
      toast.error('Error al crear la carpeta');
      throw error;
    }
  };

  const handleDocumentClick = (document: DocumentWithDetails) => {
    if (!user) return;
    
    // Track view
    incrementDocumentCounter(document.id, 'view', user.id).catch(console.error);
    
    // Open preview
    setPreviewDocument(document);
    setShowPreviewModal(true);
  };

  const handleDocumentAction = async (action: DocumentAction, document: DocumentWithDetails) => {
    if (!user) return;

    switch (action) {
      case 'view':
        handleDocumentClick(document);
        break;
        
      case 'download':
        if (document.storage_path) {
          // Track download
          await incrementDocumentCounter(document.id, 'download', user.id);
          
          // Trigger download
          const link = window.document.createElement('a');
          link.href = document.storage_path;
          link.download = document.file_name;
          link.click();
          
          toast.success('Descarga iniciada');
        }
        break;
        
      case 'edit':
        toast('Edición de documentos próximamente', { icon: 'ℹ️' });
        break;
        
      case 'delete':
        if (window.confirm('¿Estás seguro de que quieres eliminar este documento?')) {
          toast('Eliminación de documentos próximamente', { icon: 'ℹ️' });
        }
        break;
        
      case 'move':
        toast('Mover documentos próximamente', { icon: 'ℹ️' });
        break;
        
      case 'share':
        toast('Compartir documentos próximamente', { icon: 'ℹ️' });
        break;
        
      default:
        console.warn('Unknown document action:', action);
    }
  };

  const handleUploadComplete = (uploadedDocuments: CommunityDocument[]) => {
    loadDocuments();
    setShowUploadModal(false);
    toast.success(`${uploadedDocuments.length} documento(s) subido(s) exitosamente`);
  };

  const handleDownload = (document: DocumentWithDetails) => {
    handleDocumentAction('download', document);
  };

  if (!workspace) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay espacio de trabajo seleccionado
        </h3>
        <p className="text-gray-500">
          Selecciona una comunidad para ver sus documentos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Folder Navigation */}
      <FolderNavigation
        currentFolder={currentFolder}
        breadcrumb={breadcrumb}
        onFolderNavigate={handleFolderNavigate}
        onCreateFolder={handleCreateFolder}
        permissions={permissions}
        loading={loading}
      />

      {/* Document Filters */}
      <DocumentFilters
        filters={filters}
        onFiltersChange={setFilters}
        availableTags={availableTags}
        availableUploaders={availableUploaders}
        onViewModeChange={setViewMode}
        viewMode={viewMode}
        loading={loading}
      />

      {/* Header with Upload Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#00365b]">
            {currentFolder ? `Documentos en ${currentFolder.folder_name}` : 'Documentos'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {documents.length} documento(s) • {folders.length} carpeta(s)
          </p>
        </div>

        {permissions.can_view && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center px-4 py-2 bg-[#fdb933] text-[#00365b] font-medium rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200 shadow-sm"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Subir Documento
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedDocuments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-900">
              {selectedDocuments.length} documento(s) seleccionados
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => toast('Mover documentos próximamente', { icon: 'ℹ️' })}
                className="text-sm bg-white border border-blue-300 text-blue-700 px-3 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                Mover
              </button>
              <button
                onClick={() => toast('Descargar múltiples próximamente', { icon: 'ℹ️' })}
                className="text-sm bg-white border border-blue-300 text-blue-700 px-3 py-1 rounded hover:bg-blue-50 transition-colors"
              >
                Descargar
              </button>
              <button
                onClick={() => setSelectedDocuments([])}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Grid */}
      <DocumentGrid
        documents={filterDocumentsBySearch(documents)}
        folders={folders}
        viewMode={viewMode}
        onDocumentClick={handleDocumentClick}
        onFolderClick={handleFolderClick}
        onDocumentAction={handleDocumentAction}
        selectedDocuments={selectedDocuments}
        onSelectionChange={setSelectedDocuments}
        permissions={permissions}
        loading={loading}
        userId={user?.id || ''}
      />

      {/* Document Upload Modal */}
      {showUploadModal && workspace && user && (
        <DocumentUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          workspaceId={workspace.id}
          currentFolderId={currentFolder?.id}
          folders={allFolders}
          onUploadComplete={handleUploadComplete}
          userId={user.id}
        />
      )}

      {/* Document Preview Modal */}
      {showPreviewModal && previewDocument && (
        <DocumentPreview
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setPreviewDocument(null);
          }}
          document={previewDocument}
          onDownload={handleDownload}
          canEdit={permissions.can_edit}
        />
      )}
    </div>
  );
};

// Messaging Tab Content Component
interface MessagingTabContentProps {
  workspace: CommunityWorkspace | null;
  workspaceAccess: WorkspaceAccess | null;
  user: any;
  searchQuery: string;
  filterThreadsBySearch: (threads: ThreadWithDetails[]) => ThreadWithDetails[];
}

const MessagingTabContent: React.FC<MessagingTabContentProps> = ({ workspace, workspaceAccess, user, searchQuery, filterThreadsBySearch }) => {
  // Messaging state
  const [messages, setMessages] = useState<MessageWithDetails[]>([]);
  const [threads, setThreads] = useState<ThreadWithDetails[]>([]);
  const [selectedThread, setSelectedThread] = useState<ThreadWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<MessagingPermissions>({
    can_view_messages: false,
    can_send_messages: false,
    can_create_threads: false,
    can_edit_own_messages: false,
    can_delete_own_messages: false,
    can_moderate_messages: false,
    can_pin_threads: false,
    can_archive_threads: false,
    can_upload_attachments: false,
    can_mention_all: false,
    can_view_analytics: false,
    can_manage_reactions: false,
  });
  
  // Mention state
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [communityMembers, setCommunityMembers] = useState<any[]>([]);
  
  // UI state
  const [activeView, setActiveView] = useState<'messages' | 'threads'>('threads');
  const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const [previewMessage, setPreviewMessage] = useState<MessageWithDetails | null>(null);
  const [showThreadCreationModal, setShowThreadCreationModal] = useState(false);
  
  // Filter state
  const [messageFilters, setMessageFilters] = useState<MessageFiltersType>({
    search: '',
    mention_filter: 'all',
    attachment_filter: 'all',
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  
  const [threadFilters, setThreadFilters] = useState<ThreadFilters>({
    search: '',
    status: 'all',
    participant_filter: 'all',
    sort_by: 'last_message_at',
    sort_order: 'desc',
  });

  // Available data for filters
  const [availableAuthors, setAvailableAuthors] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (workspace && user) {
      loadMessagingData();
      loadPermissions();
      loadCommunityMembers();
      setupRealtimeSubscription();
    }
    
    return () => {
      // Cleanup realtime subscription
    };
  }, [workspace, user]);

  useEffect(() => {
    if (workspace && selectedThread) {
      loadThreadMessages();
    }
  }, [workspace, selectedThread, messageFilters]);

  useEffect(() => {
    if (workspace) {
      loadThreads();
    }
  }, [workspace, threadFilters]);

  const loadMessagingData = async () => {
    await Promise.all([
      loadThreads(),
      loadPermissions()
    ]);
  };

  const loadThreads = async () => {
    if (!workspace) return;

    try {
      setLoading(true);
      const threadsData = await getWorkspaceThreads(workspace.id, threadFilters);
      setThreads(threadsData);
      
      // Extract available authors from threads
      const authors = Array.from(
        new Map(threadsData.map(thread => [thread.created_by, { id: thread.created_by, name: thread.creator_name }]))
          .values()
      );
      setAvailableAuthors(authors);
      
    } catch (error) {
      console.error('Error loading threads:', error);
      toast.error('Error al cargar los hilos de conversación');
    } finally {
      setLoading(false);
    }
  };

  const loadThreadMessages = async () => {
    if (!workspace || !selectedThread) return;

    try {
      const messagesData = await getWorkspaceMessages(workspace.id, {
        ...messageFilters,
        thread_id: selectedThread.id
      });
      setMessages(messagesData);
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Error al cargar los mensajes');
    }
  };

  const loadPermissions = async () => {
    if (!workspace || !user) return;

    try {
      const userPermissions = await getUserMessagingPermissions(user.id, workspace.id);
      setPermissions(userPermissions);
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const loadCommunityMembers = async () => {
    if (!workspace || !workspace.community_id) return;

    try {
      // Load members of the current community
      const { data: members, error } = await supabase
        .from('growth_communities')
        .select(`
          id,
          name,
          members:user_roles(
            user_id,
            role,
            user:profiles(
              id,
              first_name,
              last_name,
              email,
              avatar_url
            )
          )
        `)
        .eq('id', workspace.community_id)
        .single();

      if (error) {
        console.error('Error loading community members:', error);
        return;
      }

      // Transform members into mention suggestions format
      const suggestions = (members?.members || []).map((member: any) => ({
        id: member.user_id,
        type: 'user' as const,
        display_name: member.user?.first_name && member.user?.last_name
          ? `${member.user.first_name} ${member.user.last_name}`
          : member.user?.email || 'Usuario',
        email: member.user?.email || '',
        role: member.role,
        avatar: member.user?.avatar_url || null
      }));

      setCommunityMembers(suggestions);
    } catch (error) {
      console.error('Error loading community members:', error);
    }
  };

  const handleMentionRequest = (query: string) => {
    if (!communityMembers.length) return;

    // Filter members based on query
    const filtered = communityMembers.filter(member => {
      const searchQuery = query.toLowerCase();
      return member.display_name.toLowerCase().includes(searchQuery) ||
             member.email.toLowerCase().includes(searchQuery);
    });

    setMentionSuggestions(filtered.slice(0, 10)); // Limit to 10 suggestions
  };

  const setupRealtimeSubscription = () => {
    if (!workspace) return;

    try {
      const subscription = subscribeToWorkspaceMessages(workspace.id, {
        onMessage: (message) => {
          if (selectedThread && message.thread_id === selectedThread.id) {
            setMessages(prev => [...prev, message]);
          }
          // Update thread last message
          setThreads(prev => prev.map(thread => 
            thread.id === message.thread_id 
              ? { ...thread, latest_message: {
                  id: message.id,
                  content: message.content,
                  author_name: message.author_name,
                  created_at: message.created_at,
                  attachment_count: message.attachments?.length || 0
                }, last_message_at: message.created_at }
              : thread
          ));
        },
        onThread: (thread) => {
          setThreads(prev => [thread, ...prev]);
        },
        onReaction: (reaction) => {
          // Update message reactions
          if (selectedThread && reaction.message_id) {
            setMessages(prev => prev.map(msg => 
              msg.id === reaction.message_id 
                ? { ...msg, reactions: [...(msg.reactions || []), { 
                    reaction_type: reaction.reaction_type,
                    count: 1,
                    users: [{ user_id: reaction.user_id, user_name: user.name }],
                    user_reacted: true
                  }] }
                : msg
            ));
          }
        }
      });
      
      return subscription;
    } catch (error) {
      console.error('Error setting up realtime subscription:', error);
    }
  };

  const handleThreadSelect = (thread: ThreadWithDetails) => {
    setSelectedThread(thread);
    setActiveView('messages');
  };

  const handleThreadCreate = async (threadData: any) => {
    if (!workspace || !user) return;

    try {
      console.log('Creating thread with data:', threadData);
      console.log('Workspace ID:', workspace.id);
      console.log('User ID:', user.id);
      
      const newThread = await createThread(workspace.id, threadData, user.id);
      setThreads(prev => [newThread, ...prev]);
      setSelectedThread(newThread);
      setActiveView('messages');
      setShowThreadCreationModal(false);
      toast.success('Hilo de conversación creado exitosamente');
    } catch (error: any) {
      console.error('Error creating thread:', error);
      console.error('Error details:', error.message);
      toast.error(`Error al crear el hilo: ${error.message || 'Error desconocido'}`);
    }
  };

  const handleMessageSend = async (messageData: any) => {
    if (!workspace || !user || !selectedThread) return;

    try {
      const newMessage = await sendMessage(workspace.id, {
        ...messageData,
        thread_id: selectedThread.id
      }, user.id);
      
      setMessages(prev => [...prev, newMessage]);
      toast.success('Mensaje enviado');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Error al enviar el mensaje');
    }
  };

  const handleAttachmentPreview = (attachment: MessageAttachment, message?: MessageWithDetails) => {
    setPreviewAttachment(attachment);
    setPreviewMessage(message || null);
    setShowAttachmentPreview(true);
  };

  const handleAttachmentDownload = (attachment: MessageAttachment) => {
    if (attachment.storage_path) {
      const link = window.document.createElement('a');
      link.href = attachment.storage_path;
      link.download = attachment.file_name;
      link.click();
      toast.success('Descarga iniciada');
    }
  };

  const handleReplyToMessage = (message: MessageWithDetails) => {
    // Focus on composer with reply context
    toast(`Responder a mensaje de ${message.author_name}`, { icon: '💬' });
  };

  if (!workspace) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <ChatAlt2Icon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay espacio de trabajo seleccionado
        </h3>
        <p className="text-gray-500">
          Selecciona una comunidad para acceder a la mensajería.
        </p>
      </div>
    );
  }

  if (!permissions.can_view_messages) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <ChatAlt2Icon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Sin permisos de acceso
        </h3>
        <p className="text-gray-500">
          No tienes permisos para ver los mensajes de esta comunidad.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#00365b]">
            Mensajería de {workspace.community?.name}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Comunicación en tiempo real con los miembros de la comunidad
          </p>
        </div>

        {permissions.can_create_threads && (
          <button
            onClick={() => setShowThreadCreationModal(true)}
            className="inline-flex items-center px-4 py-2 bg-[#fdb933] text-[#00365b] font-medium rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200 shadow-sm"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Nuevo Hilo
          </button>
        )}
      </div>

      {/* Message Filters */}
      <MessageFilters
        messageFilters={messageFilters}
        threadFilters={threadFilters}
        onMessageFiltersChange={setMessageFilters}
        onThreadFiltersChange={setThreadFilters}
        availableAuthors={availableAuthors}
        activeView={activeView}
        onViewChange={setActiveView}
        loading={loading}
      />

      {/* Content Area */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {activeView === 'threads' || !selectedThread ? (
          // Threads View
          <div className="p-6">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                    <div className="flex space-x-4">
                      <div className="h-3 bg-gray-200 rounded w-24"></div>
                      <div className="h-3 bg-gray-200 rounded w-20"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : threads.length > 0 ? (
              <div className="space-y-4">
                {filterThreadsBySearch(threads).map(thread => (
                  <div
                    key={thread.id}
                    onClick={() => handleThreadSelect(thread)}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{thread.thread_title}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        thread.category_config.color === '#f59e0b' ? 'bg-yellow-100 text-yellow-800' :
                        thread.category_config.color === '#3b82f6' ? 'bg-blue-100 text-blue-800' :
                        thread.category_config.color === '#10b981' ? 'bg-green-100 text-green-800' :
                        thread.category_config.color === '#8b5cf6' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {thread.category_config.label}
                      </span>
                    </div>
                    
                    {thread.description && (
                      <p className="text-sm text-gray-600 mb-2">{thread.description}</p>
                    )}
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Por {thread.creator_name}</span>
                      <div className="flex items-center space-x-3">
                        <span>{thread.message_count} mensaje(s)</span>
                        <span>{thread.participant_count} participante(s)</span>
                        {thread.latest_message && (
                          <span>Último: {new Date(thread.latest_message.created_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    
                    {thread.latest_message && (
                      <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                        <span className="font-medium">{thread.latest_message.author_name}:</span>
                        <span className="ml-2">{thread.latest_message.content.slice(0, 100)}...</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <ChatAlt2Icon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No hay hilos de conversación
                </h3>
                <p className="text-gray-500 mb-6">
                  {permissions.can_create_threads 
                    ? 'Comienza creando el primer hilo de conversación.'
                    : 'No se han creado hilos de conversación en esta comunidad.'}
                </p>
                {permissions.can_create_threads && (
                  <button
                    onClick={() => setShowThreadCreationModal(true)}
                    className="inline-flex items-center px-4 py-2 bg-[#fdb933] text-[#00365b] font-medium rounded-lg hover:bg-[#fdb933]/90 transition-colors duration-200"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Crear Primer Hilo
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          // Messages View
          <div className="h-[600px] flex flex-col">
            {/* Thread Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{selectedThread.thread_title}</h3>
                  <p className="text-sm text-gray-500">{selectedThread.message_count} mensaje(s)</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedThread(null);
                    setActiveView('threads');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length > 0 ? (
                messages.map(message => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    currentUserId={user?.id || ''}
                    onReply={handleReplyToMessage}
                    onReaction={() => {}}
                    onPreviewAttachment={handleAttachmentPreview}
                    permissions={permissions}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <ChatAlt2Icon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-gray-500">No hay mensajes en este hilo</p>
                </div>
              )}
            </div>

            {/* Message Composer */}
            {permissions.can_send_messages && (
              <div className="border-t border-gray-200">
                <MessageComposer
                  workspaceId={workspace.id}
                  threadId={selectedThread.id}
                  onSendMessage={handleMessageSend}
                  mentionSuggestions={mentionSuggestions}
                  onRequestMentions={handleMentionRequest}
                  allowMentions={true}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attachment Preview Modal */}
      {showAttachmentPreview && previewAttachment && (
        <AttachmentPreview
          isOpen={showAttachmentPreview}
          onClose={() => {
            setShowAttachmentPreview(false);
            setPreviewAttachment(null);
            setPreviewMessage(null);
          }}
          attachment={previewAttachment}
          message={previewMessage}
          onDownload={handleAttachmentDownload}
          onReply={previewMessage ? handleReplyToMessage : undefined}
          canReply={permissions.can_send_messages}
        />
      )}

      {/* Thread Creation Modal */}
      {showThreadCreationModal && (
        <ThreadCreationModal
          isOpen={showThreadCreationModal}
          onClose={() => setShowThreadCreationModal(false)}
          onCreateThread={handleThreadCreate}
          loading={loading}
        />
      )}
    </div>
  );
};

// Group Assignments Tab Content Component
interface GroupAssignmentsContentProps {
  workspace: CommunityWorkspace | null;
  workspaceAccess: WorkspaceAccess | null;
  user: any;
  searchQuery: string;
}

const GroupAssignmentsContent: React.FC<GroupAssignmentsContentProps> = ({ 
  workspace, 
  workspaceAccess, 
  user, 
  searchQuery 
}) => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [userGroups, setUserGroups] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (workspace && user) {
      loadGroupAssignments();
    }
  }, [workspace, user]);

  const loadGroupAssignments = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
      // Get all group assignments from enrolled courses
      const { assignments: fetchedAssignments, error } = await groupAssignmentsV2Service.getGroupAssignmentsForUser(user.id);
      
      if (error) {
        console.error('Error loading group assignments:', error);
        toast.error('Error al cargar las tareas grupales');
        return;
      }

      setAssignments(fetchedAssignments || []);

      // Load user's groups for each assignment
      const groupsMap = new Map();
      for (const assignment of fetchedAssignments || []) {
        const { group } = await groupAssignmentsV2Service.getOrCreateGroup(assignment.id, user.id);
        if (group) {
          groupsMap.set(assignment.id, group);
        }
      }
      setUserGroups(groupsMap);
    } catch (error) {
      console.error('Error loading group assignments:', error);
      toast.error('Error al cargar las tareas grupales');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentClick = async (assignment: any) => {
    setSelectedAssignment(assignment);
    setShowSubmissionModal(true);
  };

  const handleSubmitAssignment = async (submissionData: any) => {
    if (!selectedAssignment || !user?.id) return;

    try {
      const group = userGroups.get(selectedAssignment.id);
      if (!group) {
        toast.error('No se encontró tu grupo para esta tarea');
        return;
      }

      const { success, error } = await groupAssignmentsV2Service.submitGroupAssignment(
        selectedAssignment.id,
        group.id,
        submissionData
      );

      if (error) {
        throw error;
      }

      toast.success('Tarea grupal entregada exitosamente');
      setShowSubmissionModal(false);
      loadGroupAssignments(); // Reload to update status
    } catch (error) {
      console.error('Error submitting assignment:', error);
      toast.error('Error al entregar la tarea');
    }
  };

  // Filter assignments by search query
  const filteredAssignments = assignments.filter(assignment => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      assignment.title?.toLowerCase().includes(query) ||
      assignment.course_title?.toLowerCase().includes(query) ||
      assignment.lesson_title?.toLowerCase().includes(query)
    );
  });

  if (!workspace) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <ClipboardCheckIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay espacio de trabajo seleccionado
        </h3>
        <p className="text-gray-500">
          Selecciona una comunidad para ver sus tareas grupales.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#00365b]">
            Tareas Grupales
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredAssignments.length} tarea{filteredAssignments.length !== 1 ? 's' : ''} disponible{filteredAssignments.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </div>
      ) : filteredAssignments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map((assignment) => {
            const group = userGroups.get(assignment.id);
            const isSubmitted = assignment.status === 'submitted' || assignment.status === 'graded';
            
            return (
              <div
                key={assignment.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleAssignmentClick(assignment)}
              >
                <h3 className="text-lg font-semibold text-[#00365b] mb-2">
                  {assignment.title}
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  {assignment.course_title} - {assignment.lesson_title}
                </p>
                
                {assignment.description && (
                  <p className="text-sm text-gray-700 mb-4 line-clamp-2">
                    {assignment.description}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">
                      {group ? `Grupo: ${group.name}` : 'Sin grupo asignado'}
                    </span>
                  </div>
                  
                  {isSubmitted ? (
                    <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Entregado
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-yellow-600">
                      Pendiente
                    </span>
                  )}
                </div>

                {assignment.grade && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className="text-sm text-gray-600">
                      Calificación: <span className="font-medium text-[#00365b]">{assignment.grade}%</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <ClipboardCheckIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay tareas grupales disponibles
          </h3>
          <p className="text-gray-500">
            Las tareas grupales aparecerán aquí cuando sean asignadas en tus cursos.
          </p>
        </div>
      )}

      {/* Submission Modal */}
      {showSubmissionModal && selectedAssignment && (
        <GroupSubmissionModalV2
          assignment={selectedAssignment}
          group={userGroups.get(selectedAssignment.id)}
          onClose={() => setShowSubmissionModal(false)}
          onSubmit={handleSubmitAssignment}
        />
      )}
    </div>
  );
};

export default CommunityWorkspacePage;
