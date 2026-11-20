import React from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Edit, FileText, Save } from 'lucide-react';
import AudioReportUploader from '../AudioReportUploader';
import AudioPlayer from '../AudioPlayer';
import { Badge, Button, Card, CardBody, CardHeader, Field, Select, Textarea } from '../../ui/kit';
import type { SessionWithRelations } from '../../../lib/types/consultor-sessions.types';
import type { SessionDetail, SessionDetailDecisions } from '../../../hooks/useSessionDetail';

/**
 * «Informe» in the new look: today's branches in today's order, each asked where today's view asks it
 * (`onlyFacilitatorsReport`, `showAudioUploader`, `showCreateReportButton`, `showEditReportButton`,
 * `showReportEditor`). The audio uploader and the player are today's pieces, unchanged. Approved:
 * «Crear» / «Actualizar» black.
 */
export default function ReportNuevo({
  detail,
  decisions,
  session,
}: {
  detail: SessionDetail;
  decisions: SessionDetailDecisions;
  session: SessionWithRelations;
}) {
  const {
    reportContent,
    reportVisibility,
    editingReport,
    savingReport,
    existingReport,
    reportTranscript,
    signedAudioUrl,
    handleAudioReportCreated,
    handleSaveReport,
    startEditingReport,
    cancelEditingReport,
    changeReportContent,
    changeReportVisibility,
  } = detail;
  const {
    onlyFacilitatorsReport,
    showAudioUploader,
    audioUploaderDisabled,
    showCreateReportButton,
    showEditReportButton,
    showReportEditor,
    isForAllParticipants,
  } = decisions;

  if (onlyFacilitatorsReport()) {
    return (
      <div className="grid justify-items-center gap-3 py-12 text-center text-gray-600">
        <FileText className="h-10 w-10 text-gray-400" aria-hidden="true" />
        <p>Solo los facilitadores pueden crear informes</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {showAudioUploader() && (
        <AudioReportUploader sessionId={session.id} onReportCreated={handleAudioReportCreated} disabled={audioUploaderDisabled()} />
      )}

      {showCreateReportButton() && (
        <Button variant="default" onClick={startEditingReport} className="justify-self-start">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Crear Informe
        </Button>
      )}

      {showEditReportButton() && (
        <Button variant="outline" onClick={startEditingReport} className="justify-self-start">
          <Edit className="h-4 w-4" aria-hidden="true" />
          Editar Informe
        </Button>
      )}

      {showReportEditor() ? (
        <Card>
          <CardBody className="grid gap-4">
            <Field label="Contenido del informe">
              <Textarea
                value={reportContent}
                onChange={changeReportContent}
                rows={10}
                placeholder="Escriba el informe de la sesión..."
              />
            </Field>
            <Field label="Visibilidad" className="max-w-xs">
              <Select value={reportVisibility} onChange={changeReportVisibility}>
                <option value="facilitators_only">Solo facilitadores</option>
                <option value="all_participants">Todos los participantes</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="default" onClick={handleSaveReport} disabled={savingReport || !reportContent.trim()}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {savingReport ? 'Guardando...' : existingReport ? 'Actualizar' : 'Crear'}
              </Button>
              {editingReport && (
                <Button variant="outline" onClick={cancelEditingReport}>
                  Cancelar
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      ) : existingReport ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {signedAudioUrl && <AudioPlayer audioUrl={signedAudioUrl} transcript={reportTranscript || undefined} />}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600">
                  {format(parseISO(existingReport.created_at), 'dd MMM yyyy HH:mm', { locale: es })}
                </span>
                <Badge tone={isForAllParticipants(existingReport) ? 'success' : 'neutral'} plain>
                  {isForAllParticipants(existingReport) ? 'Todos los participantes' : 'Solo facilitadores'}
                </Badge>
              </div>
            </CardHeader>
            <CardBody className="whitespace-pre-wrap break-words text-sm text-gray-700">{existingReport.content}</CardBody>
          </Card>
        </div>
      ) : (
        <div className="grid justify-items-center gap-3 py-12 text-center text-gray-600">
          <FileText className="h-10 w-10 text-gray-400" aria-hidden="true" />
          <p>No hay informe creado</p>
        </div>
      )}
    </div>
  );
}
