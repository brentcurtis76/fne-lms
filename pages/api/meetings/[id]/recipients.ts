import { NextApiRequest, NextApiResponse } from 'next';
import {
  sendApiError,
  sendApiResponse,
  logApiRequest,
  handleMethodNotAllowed,
} from '../../../../lib/api-auth';
import { getCommunityRecipients } from '../../../../lib/notificationService';
import {
  loadMeetingAuthContext,
  MEETING_POLICY_COLUMNS,
} from '../../../../lib/api/meetings/load-context';

/**
 * GET /api/meetings/[id]/recipients?audience=with_access|attended
 * Lightweight recipient-count preview for the finalize dialog. Returns only
 * the count — not the list — to avoid leaking emails through a UI-preview
 * endpoint.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  logApiRequest(req, 'meetings-recipients');

  if (req.method !== 'GET') {
    return handleMethodNotAllowed(res, ['GET']);
  }

  const { audience } = req.query;
  // SM-H8: 'with_access' replaced 'community' (whole community) — decision 4.
  if (audience !== 'with_access' && audience !== 'attended') {
    return sendApiError(res, 'audience inválida', 400);
  }

  try {
    const ctx = await loadMeetingAuthContext<{ id: string }>(req, res, {
      meetingSelect: MEETING_POLICY_COLUMNS,
      require: 'finalize',
    });
    if (!ctx) return;

    const { meeting, serviceClient } = ctx;

    const recipients = await getCommunityRecipients(serviceClient, meeting.id, {
      onlyAttended: audience === 'attended',
    });

    // EC-R7: how many attendee rows are marked 'attended' (a number only), so
    // the dialog can refuse «Solo los asistentes» while nobody attended. A
    // failed read leaves the number out, and the dialog then disables nothing.
    const { data: attendanceRows, error: attendanceError } = await serviceClient
      .from('meeting_attendees')
      .select('attendance_status')
      .eq('meeting_id', meeting.id);
    if (attendanceError) {
      console.error('Recipients preview attendance read failed:', attendanceError.message);
      return sendApiResponse(res, { count: recipients.length });
    }
    const attendedCount = (attendanceRows || []).filter(
      (row: { attendance_status: string | null }) => row.attendance_status === 'attended',
    ).length;

    return sendApiResponse(res, { count: recipients.length, attended_count: attendedCount });
  } catch (error: any) {
    console.error('Recipients preview error:', error);
    return sendApiError(res, 'Error inesperado al previsualizar destinatarios', 500, error.message);
  }
}
