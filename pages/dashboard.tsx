import React from 'react';
import { supabase } from '../lib/supabase';
import MainLayout from '../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import WorkspaceSettingsModal from '../components/community/WorkspaceSettingsModal';
import { MemberProfileModal } from '../components/community/MemberProfileModal';
import PanelClasico from '../components/panel/PanelClasico';
import PanelNuevo from '../components/panel/PanelNuevo';
import PanelSkeleton from '../components/panel/PanelSkeleton';
import { usePanel } from '../hooks/usePanel';
import { useLook } from '../contexts/LookContext';

// The new look's breadcrumb in the top bar (redesign 6B); today's look keeps `[]`.
const BREADCRUMBS_NUEVO = [{ label: 'Mi Panel' }];

export default function Dashboard() {
  const panel = usePanel();
  const {
    loading,
    user,
    avatarUrl,
    isAdmin,
    userRole,
    showWorkspaceSettings,
    selectedWorkspace,
    closeWorkspaceSettings,
    updateWorkspace,
    selectedMember,
    showMemberProfile,
    closeMemberProfile,
    handleLogout,
  } = panel;
  // Redesign 6B: which view draws the panel. Only what is inside the frame changes with the look.
  const isNuevo = useLook().look === 'nuevo';

  if (loading) {
    return (
      <MainLayout
        user={user}
        currentPage="dashboard"
        pageTitle=""
        breadcrumbs={isNuevo ? BREADCRUMBS_NUEVO : []}
        isAdmin={isAdmin}
        userRole={userRole}
        onLogout={handleLogout}
        avatarUrl={avatarUrl || undefined}
      >
        {isNuevo ? (
          <PanelSkeleton />
        ) : (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_primary mx-auto"></div>
            <p className="mt-4 text-brand_primary font-medium">Cargando...</p>
          </div>
        </div>
        )}
      </MainLayout>
    );
  }

  // Where the body began before 6A: the decisions are worked out from here on, never while loading.
  const decisions = panel.decide();

  return (
    <MainLayout
      user={user}
      currentPage="dashboard"
      pageTitle=""
      breadcrumbs={isNuevo ? BREADCRUMBS_NUEVO : []}
      isAdmin={isAdmin}
      userRole={userRole}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      {isNuevo ? <PanelNuevo panel={panel} decisions={decisions} /> : <PanelClasico panel={panel} decisions={decisions} />}

      {/* Workspace Settings Modal */}
      {selectedWorkspace && (
        <WorkspaceSettingsModal
          isOpen={showWorkspaceSettings}
          onClose={closeWorkspaceSettings}
          workspaceId={selectedWorkspace.id}
          currentName={selectedWorkspace.custom_name || selectedWorkspace.name}
          currentImageUrl={selectedWorkspace.image_url}
          onUpdate={updateWorkspace}
        />
      )}

      {/* Member Profile Modal */}
      <MemberProfileModal
        isOpen={showMemberProfile}
        onClose={closeMemberProfile}
        member={selectedMember}
        isCurrentUser={decisions.isSelectedMemberCurrentUser()}
      />
    </MainLayout>
  );
}
