'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import TipTapEditor from '../../src/components/TipTapEditor';
import { emptyDoc, isEmptyDoc, type TipTapDoc } from '../../lib/tiptap/helpers';
import { AUDIENCE_PICKER_LABELS } from '../../lib/meetings/audience-labels';

type Audience = 'community' | 'attended';

// Keep all user-visible 409 strings in one place so adding a new meeting-
// conflict code is a one-line patch.
const CONFLICT_MESSAGES: Record<string, string> = {
  meeting_not_draft: 'La reunión ya no está en borrador',
  meeting_already_finalized: 'La reunión ya fue finalizada por otro usuario',
};

interface FinalizeMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingTitle: string;
  onFinalized?: () => void;
}

type RecipientState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; count: number }
  | { kind: 'error' };

export function FinalizeMeetingDialog({
  open,
  onOpenChange,
  meetingId,
  meetingTitle,
  onFinalized,
}: FinalizeMeetingDialogProps) {
  const [audience, setAudience] = useState<Audience>('community');
  const [facilitatorDoc, setFacilitatorDoc] = useState<TipTapDoc>(() => emptyDoc());
  const [recipients, setRecipients] = useState<RecipientState>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setAudience('community');
      setFacilitatorDoc(emptyDoc());
      setRecipients({ kind: 'idle' });
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setRecipients({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch(
          `/api/meetings/${meetingId}/recipients?audience=${audience}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const count = payload?.data?.count ?? payload?.count;
        if (cancelled) return;
        if (typeof count === 'number') {
          setRecipients({ kind: 'ready', count });
        } else {
          setRecipients({ kind: 'error' });
        }
      } catch {
        if (!cancelled) setRecipients({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, audience, meetingId]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const docIsEmpty = isEmptyDoc(facilitatorDoc);
      const body = {
        audience,
        facilitator_message_doc: docIsEmpty ? undefined : facilitatorDoc,
      };

      const res = await fetch(`/api/meetings/${meetingId}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => ({} as any));

      if (res.status === 409) {
        const code = payload?.code as string | undefined;
        toast.error(
          (code && CONFLICT_MESSAGES[code]) ||
            payload?.error ||
            'No se pudo finalizar la reunión',
        );
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        toast.error(payload?.error || 'Error al finalizar la reunión');
        setSubmitting(false);
        return;
      }

      const data = payload?.data ?? payload;
      const count = data?.recipients_count ?? 0;
      toast.success(`Reunión finalizada y enviada a ${count} destinatarios`);
      onFinalized?.();
      onOpenChange(false);
    } catch {
      toast.error('Error al finalizar la reunión');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Finalizar reunión</DialogTitle>
          <DialogDescription>
            Al finalizar “{meetingTitle}”, se enviará un resumen por correo y la reunión pasará a completada. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-800">Destinatarios</legend>
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name="audience"
                value="community"
                checked={audience === 'community'}
                onChange={() => setAudience('community')}
                disabled={submitting}
                className="mt-1"
              />
              <span>{AUDIENCE_PICKER_LABELS.community}</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name="audience"
                value="attended"
                checked={audience === 'attended'}
                onChange={() => setAudience('attended')}
                disabled={submitting}
                className="mt-1"
              />
              <span>{AUDIENCE_PICKER_LABELS.attended}</span>
            </label>

            <div className="text-xs text-gray-600 min-h-[1rem]" aria-live="polite">
              {recipients.kind === 'loading' && <span>Calculando…</span>}
              {recipients.kind === 'ready' && (
                <span>Se enviará a {recipients.count} destinatarios</span>
              )}
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">
              Mensaje del facilitador (opcional)
            </label>
            <TipTapEditor
              initialContent={facilitatorDoc}
              onChange={(json) => setFacilitatorDoc(json)}
              minHeight={140}
              placeholder="Agrega un mensaje para los destinatarios…"
              editable={!submitting}
            />
          </div>
        </div>

        <DialogFooter className="mt-4 flex gap-3 sm:gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-brand_accent hover:bg-brand_accent_hover rounded-md disabled:opacity-50"
          >
            {submitting ? 'Enviando…' : 'Finalizar y enviar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FinalizeMeetingDialog;
