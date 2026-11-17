import React from 'react';
import { supabase } from '../lib/supabase';
import MainLayout from '../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import WorkspaceSettingsModal from '../components/community/WorkspaceSettingsModal';
import { MemberProfileModal } from '../components/community/MemberProfileModal';
import PanelClasico from '../components/panel/PanelClasico';
import { usePanel } from '../hooks/usePanel';

export default function Dashboard() {
  const panel = usePanel();
  const {
    loading,
    user,
    avatarUrl,
    isAdmin,
    userRole,
    communityWorkspaces,
    setCommunityWorkspaces,
    showWorkspaceSettings,
    setShowWorkspaceSettings,
    selectedWorkspace,
    setSelectedWorkspace,
    selectedMember,
    setSelectedMember,
    showMemberProfile,
    setShowMemberProfile,
    handleLogout,
  } = panel;

  if (loading) {
    return (
      <MainLayout
        user={user}
        currentPage="dashboard"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        userRole={userRole}
        onLogout={handleLogout}
        avatarUrl={avatarUrl || undefined}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_primary mx-auto"></div>
            <p className="mt-4 text-brand_primary font-medium">Cargando...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="dashboard"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      userRole={userRole}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <PanelClasico panel={panel} />

      {/* Workspace Settings Modal */}
      {selectedWorkspace && (
        <WorkspaceSettingsModal
          isOpen={showWorkspaceSettings}
          onClose={() => {
            setShowWorkspaceSettings(false);
            setSelectedWorkspace(null);
          }}
          workspaceId={selectedWorkspace.id}
          currentName={selectedWorkspace.custom_name || selectedWorkspace.name}
          currentImageUrl={selectedWorkspace.image_url}
          onUpdate={async (updates) => {
            const updatedWorkspaces = { ...communityWorkspaces };
            updatedWorkspaces[selectedWorkspace.community_id] = {
              ...selectedWorkspace,
              custom_name: updates.customName,
              image_url: updates.imageUrl
            };
            setCommunityWorkspaces(updatedWorkspaces);
          }}
        />
      )}

      {/* Member Profile Modal */}
      <MemberProfileModal
        isOpen={showMemberProfile}
        onClose={() => {
          setShowMemberProfile(false);
          setSelectedMember(null);
        }}
        member={selectedMember}
        isCurrentUser={selectedMember?.id === user?.id}
      />
    </MainLayout>
  );
}
