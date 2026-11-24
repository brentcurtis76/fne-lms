import React from 'react';
import { Eye, MessageSquare, PenLine, Users } from 'lucide-react';
import AttendanceSuggestionsPanel from './AttendanceSuggestionsPanel';
import { Badge, Button, Card, Notice, Tab, TabList, TabPanel, Tabs } from '../ui/kit';
import type { SessionWithRelations } from '../../lib/types/consultor-sessions.types';
import type { SessionDetail, SessionDetailDecisions } from '../../hooks/useSessionDetail';
import type { TabId } from './SessionDetail.types';
import HeaderNuevo, { H3 } from './detail-nuevo/HeaderNuevo';
import AttendanceNuevo from './detail-nuevo/AttendanceNuevo';
import MaterialsNuevo from './detail-nuevo/MaterialsNuevo';
import ReportNuevo from './detail-nuevo/ReportNuevo';
import ActivityNuevo from './detail-nuevo/ActivityNuevo';
import { revealTabInRow, rowOf } from './detail-nuevo/revealTab';

/**
 * One session in the new look (redesign 6S, release SB), drawn only for an account that chose it. It
 * draws what `useSessionDetail()` gives it and the decisions the page worked out with `detail.decide()`,
 * as today's view (`SessionDetailClasico`) does; the frame, the loading and refusal returns and the two
 * pop-ups («Finalizar Sesión», «Solicitar Cambios») stay in the page. The Zoom suggestions panel, the
 * audio uploader and the player are today's pieces, unchanged; the panel is mounted for every viewer,
 * as today (it hides itself for those the server refuses).
 *
 * Approved differences (inventory, the session page): the breadcrumb (in the page's frame), the finalize
 * card with its visible checklist (also at «En Progreso»), the pending-request sentence as visible text,
 * the Spain line in its short form, «Híbrida», the arrival words and activity actions in Spanish, the
 * change-request history at the top of «Actividad» with formatted values, black save buttons, named icon
 * buttons, the materials stacking on a phone, the material deletion asked in a pop-up.
 */
export default function SessionDetailNuevo({ detail, decisions }: { detail: SessionDetail; decisions: SessionDetailDecisions }) {
  const { conflictVisible, activeTab, canEdit, reload, onSuggestionsApplied, selectTab } = detail;
  const { tabs, showReadOnlyBand } = decisions;
  // Drawn only after the page's refusal returns, where `session` is set.
  const session = detail.session as SessionWithRelations;

  // Send-back B9: on a phone the tab row scrolls sideways; the tab that gets the focus or becomes the
  // chosen one is brought fully into view inside the row (detail-nuevo/revealTab).
  const tabRowBoxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const chosen = tabRowBoxRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const row = chosen ? rowOf(chosen) : null;
    if (chosen && row) revealTabInRow(row, chosen);
  }, [activeTab]);
  const revealFocusedTab = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const row = target.getAttribute('role') === 'tab' ? rowOf(target) : null;
    if (row) revealTabInRow(row, target);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'details':
        return (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            <section className="grid gap-1.5">
              <h3 className={H3}>Descripción</h3>
              <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{session.description || 'Sin descripción'}</p>
            </section>
            <section className="grid gap-1.5">
              <h3 className={H3}>Objetivos</h3>
              <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{session.objectives || 'Sin objetivos definidos'}</p>
            </section>
            <section className="grid gap-2">
              <h3 className={H3}>Facilitadores</h3>
              <ul className="grid gap-2">
                {session.facilitators.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Users className="h-4 w-4 flex-none text-gray-500" aria-hidden="true" />
                    <span className="font-medium text-brand_primary">
                      {f.profiles?.first_name} {f.profiles?.last_name}
                    </span>
                    {f.is_lead && (
                      <Badge tone="accent" plain>
                        Líder
                      </Badge>
                    )}
                    <span className="capitalize text-gray-600">({f.facilitator_role.replace(/_/g, ' ')})</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Z7-5: the Zoom suggestions, for every viewer as today (the panel removes itself for anyone
                the server refuses). */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <AttendanceSuggestionsPanel sessionId={session.id} onApplied={onSuggestionsApplied} />
              <AttendanceNuevo detail={detail} decisions={decisions} session={session} />
            </div>
          </div>
        );

      case 'planning':
        if (!canEdit) return null;
        return (
          <div className="grid justify-items-center gap-3 py-12 text-center text-gray-600">
            <PenLine className="h-10 w-10 text-gray-400" aria-hidden="true" />
            <p>Notas de planificación disponibles próximamente</p>
          </div>
        );

      case 'materials':
        return <MaterialsNuevo detail={detail} decisions={decisions} />;

      case 'report':
        return <ReportNuevo detail={detail} decisions={decisions} session={session} />;

      case 'communications':
        return (
          <div className="grid justify-items-center gap-3 py-12 text-center text-gray-600">
            <MessageSquare className="h-10 w-10 text-gray-400" aria-hidden="true" />
            <p>Comunicaciones disponibles próximamente</p>
          </div>
        );

      case 'activity':
        return <ActivityNuevo decisions={decisions} session={session} />;

      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" data-testid="session-detail-nuevo">
      {conflictVisible && (
        <Notice tone="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Otra persona editó esta sesión mientras trabajabas en ella. Recarga para ver los últimos cambios.</span>
            <Button variant="outline" size="sm" onClick={reload}>
              Recargar
            </Button>
          </div>
        </Notice>
      )}

      {showReadOnlyBand && (
        <Notice tone="warning" icon={<Eye />} role="note">
          Está viendo esta sesión en modo lectura. No está asignado como facilitador.
        </Notice>
      )}

      <HeaderNuevo detail={detail} decisions={decisions} session={session} />

      <Card>
        <Tabs value={activeTab} onValueChange={(value) => selectTab(value as TabId)}>
          <div ref={tabRowBoxRef} className="px-2 pt-1 sm:px-4">
            <TabList label="Secciones de la sesión" onFocus={revealFocusedTab}>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Tab key={tab.id} value={tab.id}>
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </Tab>
                );
              })}
            </TabList>
          </div>
          <TabPanel value={activeTab} className="p-4 sm:p-6">
            {renderTabContent()}
          </TabPanel>
        </Tabs>
      </Card>
    </div>
  );
}
