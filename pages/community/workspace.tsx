/**
 * Community Workspace Page - FNE LMS
 * Collaborative workspace for growth communities with role-based access
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import Header from '../../components/layout/Header';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import MeetingFilters from '../../components/meetings/MeetingFilters';
import MeetingCard from '../../components/meetings/MeetingCard';
import MeetingDocumentationModal from '../../components/meetings/MeetingDocumentationModal';
import { useAuth } from '../../hooks/useAuth';
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
  CommunityMeeting,
  MeetingFilters as MeetingFiltersType,
  MeetingSortOptions
} from '../../types/meetings';
import { 
  UsersIcon, 
  DocumentTextIcon, 
  ChatBubbleLeftRightIcon, 
  RssIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  PlusIcon,
  ArrowsUpDownIcon
} from '@heroicons/react/24/outline';

type TabType = 'meetings' | 'documents' | 'messaging' | 'feed';

interface TabConfig {
  id: TabType;
  label: string;
  icon: React.ComponentType<any>;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'meetings',
    label: 'Reuniones',
    icon: CalendarDaysIcon,
    description: 'Programar y gestionar reuniones de la comunidad'
  },
  {
    id: 'documents',
    label: 'Documentos',
    icon: DocumentTextIcon,
    description: 'Compartir y organizar documentos del equipo'
  },
  {
    id: 'messaging',
    label: 'Mensajería',
    icon: ChatBubbleLeftRightIcon,
    description: 'Comunicación en tiempo real con los miembros'
  },
  {
    id: 'feed',
    label: 'Feed',
    icon: RssIcon,
    description: 'Actividades y actualizaciones de la comunidad'
  }
];

const CommunityWorkspacePage: React.FC = () => {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  
  // Workspace state
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccess | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<CommunityWorkspace | null>(null);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('meetings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  
  // UI state
  const [showCommunitySelector, setShowCommunitySelector] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      initializeWorkspace();
    } else if (!authLoading && !user) {
      router.push('/login');
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
        
        // Log workspace access
        await logWorkspaceActivity(
          workspace.id,
          user.id,
          'workspace_accessed',
          { tab: activeTab }
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

  const handleTabChange = async (tab: TabType) => {
    setActiveTab(tab);
    
    // Log tab change activity
    if (currentWorkspace && user) {
      await logWorkspaceActivity(
        currentWorkspace.id,
        user.id,
        'tab_changed',
        { tab, previous_tab: activeTab }
      );
    }
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
            <BuildingOfficeIcon className="h-5 w-5 text-[#00365b] flex-shrink-0" />
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

  const renderTabContent = () => {
    if (activeTab === 'meetings') {
      return <MeetingsTabContent 
        workspace={currentWorkspace} 
        workspaceAccess={workspaceAccess} 
        user={user} 
      />;
    }

    // Other tabs - show coming soon message
    const currentTab = TABS.find(tab => tab.id === activeTab);
    
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-8">
        <div className="text-center py-8 sm:py-12">
          <div className="mx-auto w-12 h-12 sm:w-16 sm:h-16 bg-[#fdb933]/10 rounded-full flex items-center justify-center mb-4">
            {currentTab && <currentTab.icon className="w-6 h-6 sm:w-8 sm:h-8 text-[#fdb933]" />}
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
            {currentTab?.label}
          </h3>
          <p className="text-sm sm:text-base text-gray-500 mb-4 sm:mb-6 max-w-md mx-auto px-4">
            {currentTab?.description}
          </p>
          <div className="bg-[#00365b]/5 border border-[#00365b]/10 rounded-lg p-3 sm:p-4 max-w-lg mx-auto">
            <p className="text-xs sm:text-sm text-[#00365b]">
              🚧 Esta funcionalidad está en desarrollo. Próximamente podrás acceder a todas las herramientas colaborativas.
            </p>
          </div>
        </div>
      </div>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} onLogout={logout} />
        <div className="pt-20 pb-12">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header user={user} onLogout={logout} />
        <div className="pt-20 pb-12">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
        </div>
      </div>
    );
  }

  const selectedCommunity = workspaceAccess?.availableCommunities.find(
    c => c.id === selectedCommunityId
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} onLogout={logout} />
      
      <div className="pt-20 pb-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#00365b] mb-2">
                  Espacio Colaborativo
                </h1>
                <p className="text-sm sm:text-base text-gray-600">
                  {workspaceAccess?.accessType === 'admin' && 'Gestión de espacios colaborativos (Vista Administrador)'}
                  {workspaceAccess?.accessType === 'consultant' && 'Espacios colaborativos asignados (Vista Consultor)'}
                  {workspaceAccess?.accessType === 'community_member' && 'Tu espacio colaborativo de comunidad'}
                </p>
              </div>
              
              {/* Community Selector */}
              <div className="lg:flex-shrink-0">
                {renderCommunitySelector()}
              </div>
            </div>
          </div>

          {/* Workspace Info */}
          {currentWorkspace && selectedCommunity && (
            <div className="mb-4 sm:mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#fdb933]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <UsersIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#fdb933]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold text-[#00365b] truncate">
                    {currentWorkspace.name}
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 truncate">
                    {selectedCommunity.school_name} • {selectedCommunity.generation_name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tabs Navigation */}
          {currentWorkspace && (
            <>
              <div className="mb-4 sm:mb-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-1">
                  <div className="flex space-x-1 overflow-x-auto scrollbar-hide">
                    {TABS.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                          activeTab === tab.id
                            ? 'bg-[#fdb933] text-[#00365b] shadow-sm'
                            : 'text-gray-600 hover:text-[#00365b] hover:bg-gray-50'
                        }`}
                      >
                        <tab.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.label.slice(0, 8)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tab Content */}
              {renderTabContent()}
            </>
          )}

          {/* No Community Selected State */}
          {!currentWorkspace && workspaceAccess && workspaceAccess.availableCommunities.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <div className="w-16 h-16 bg-[#fdb933]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <UsersIcon className="w-8 h-8 text-[#fdb933]" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Selecciona una Comunidad
              </h3>
              <p className="text-gray-500">
                Elige una comunidad de crecimiento para acceder a su espacio colaborativo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Meetings Tab Content Component
interface MeetingsTabContentProps {
  workspace: CommunityWorkspace | null;
  workspaceAccess: WorkspaceAccess | null;
  user: any;
}

const MeetingsTabContent: React.FC<MeetingsTabContentProps> = ({ workspace, workspaceAccess, user }) => {
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
        <CalendarDaysIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
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
                <ArrowsUpDownIcon className="h-3 w-3 ml-1" />
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
          {meetings.map(meeting => (
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
          <CalendarDaysIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
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

export default CommunityWorkspacePage;