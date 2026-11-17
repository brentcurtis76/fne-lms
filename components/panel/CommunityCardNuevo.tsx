import React from 'react';
import { ChevronDown, Settings, Users } from 'lucide-react';
import { Button, Card } from '../ui/kit';
import type { Panel, PanelDecisions } from '../../hooks/usePanel';
import { memberInitial, memberTile } from './memberText';

/**
 * The new look's «Mi Comunidad de Crecimiento» card (redesign 6B), drawn when `decisions.community`
 * is not null. Everything comes from the hook as today's markup has it: the bar's line, the members,
 * the picker (`showCommunityPicker`), the gear (`canEditWorkspace()`, asked only inside the opened
 * block, where today's markup asks it), the handlers. The member tiles' texts come from
 * `./memberText`, which today's markup calls too.
 */
export function CommunityCardNuevo({
  panel,
  community,
}: {
  panel: Panel;
  community: NonNullable<PanelDecisions['community']>;
}) {
  const { user, communityExpanded, toggleCommunity, chooseCommunity, openWorkspaceSettings, openMember } = panel;
  const { userCommunities, effectiveCommunityId, selectedRole, members, workspace, showCommunityPicker, canEditWorkspace } = community;
  const placeName = selectedRole.school?.name || selectedRole.community!.name;

  return (
    <Card className="overflow-hidden" data-testid="panel-community">
      <div key={selectedRole.id}>
        <button
          type="button"
          onClick={toggleCommunity}
          aria-expanded={communityExpanded}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-50 motion-reduce:transition-none"
          data-testid="panel-community-bar"
        >
          {workspace?.image_url ? (
            <img
              src={workspace.image_url}
              alt={workspace.custom_name || selectedRole.community!.name}
              className="h-14 w-14 flex-none rounded object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded bg-brand_accent/20">
              <Users aria-hidden="true" className="h-7 w-7 text-brand_accent_text" />
            </span>
          )}
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2 className="font-mont text-[0.8125rem] font-bold uppercase leading-[1.5] tracking-[0.1em] text-brand_primary">
              Mi Comunidad de Crecimiento
            </h2>
            <span className="text-[0.8125rem] text-gray-600" data-testid="panel-community-line">
              {placeName} • {members.length} miembros
            </span>
            <span className="mt-1 flex items-center">
              {members.slice(0, 4).map((member, idx) => (
                <span key={member.id} className={idx > 0 ? '-ml-1.5' : undefined}>
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="h-[30px] w-[30px] rounded-full border-2 border-white object-cover" />
                  ) : (
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white bg-brand_primary text-[0.5625rem] font-bold text-white">
                      {memberInitial(member)}
                    </span>
                  )}
                </span>
              ))}
              {members.length > 4 && (
                <span className="-ml-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[0.5625rem] font-bold text-gray-600">
                  +{members.length - 4}
                </span>
              )}
            </span>
          </div>
          <ChevronDown aria-hidden="true" className={`h-[18px] w-[18px] flex-none ${communityExpanded ? 'rotate-180' : ''}`} />
        </button>

        {communityExpanded && (
          <div className="grid gap-3 border-t border-brand_primary/[0.12] px-4 pb-4 pt-1" data-testid="panel-community-open">
            {showCommunityPicker && (
              <div className="grid gap-1.5 pt-3">
                <p className="text-xs text-gray-600">Seleccionar comunidad:</p>
                <div className="flex flex-wrap gap-1.5">
                  {userCommunities.map((comm) => (
                    <Button
                      key={comm.community_id}
                      size="sm"
                      variant={comm.community_id === effectiveCommunityId ? 'default' : 'outline'}
                      aria-pressed={comm.community_id === effectiveCommunityId}
                      onClick={(e) => chooseCommunity(e, comm.community_id!)}
                    >
                      {comm.school?.name || comm.community?.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3">
              <h3 className="font-mont text-[0.6875rem] font-medium uppercase leading-[1.6] tracking-[0.26em] text-gray-600">
                {placeName}
              </h3>
              <span className="inline-flex items-center gap-2">
                {canEditWorkspace() && (
                  <Button
                    variant="quiet"
                    iconOnly
                    aria-label="Configuración"
                    title="Configuración"
                    onClick={(e) => openWorkspaceSettings(e, workspace)}
                    data-testid="panel-community-settings"
                  >
                    <Settings aria-hidden="true" />
                  </Button>
                )}
                <Button variant="quiet" size="sm" href="/community/workspace">
                  Ver Espacio Completo →
                </Button>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 min-[380px]:grid-cols-3">
              {members.map((member) => {
                const { roleLabel, fullName, showsExternalSchool, externalSchoolLabel, isViewer } = memberTile(member, user?.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => openMember(member)}
                    className="grid justify-items-center gap-1 rounded px-1.5 py-2.5 text-center transition-colors duration-150 hover:bg-gray-50 motion-reduce:transition-none"
                    data-testid={`panel-member-${member.id}`}
                  >
                    {member.avatar_url ? (
                      <img src={member.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-[0.6875rem] font-bold ${
                          isViewer ? 'bg-brand_accent text-brand_primary' : 'bg-brand_primary text-white'
                        }`}
                      >
                        {memberInitial(member)}
                      </span>
                    )}
                    <span className="w-full truncate text-xs font-semibold leading-tight text-brand_primary">{fullName}</span>
                    {roleLabel && <span className="w-full truncate text-[0.6875rem] leading-tight text-gray-600">{roleLabel}</span>}
                    {showsExternalSchool && (
                      <span className="w-full truncate text-[0.6875rem] leading-tight text-brand_accent_text">{externalSchoolLabel}</span>
                    )}
                    {isViewer && <span className="text-[0.6875rem] font-bold text-brand_accent_text">Tú</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default CommunityCardNuevo;
