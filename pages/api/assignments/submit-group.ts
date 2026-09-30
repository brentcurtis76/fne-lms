import { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createApiSupabaseClient, requireVerifiedCaller } from '@/lib/api-auth';
import { deliverRecordBells, loggableError } from '../quiz-reviews/notify-pending';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = await createApiSupabaseClient(req, res);
  // Identity comes from the auth server; the cookie's stored `user` is
  // client-controlled (SM-B015).
  const caller = await requireVerifiedCaller(req, res);
  if (!caller.user) {
    return res.status(caller.status).json(caller.body);
  }

  const { assignmentId, groupId, submission } = req.body || {};

  if (!assignmentId || !groupId || !submission) {
    return res.status(400).json({ error: 'assignmentId, groupId y submission son requeridos' });
  }

  try {
    const userId = caller.user.id;

    const { data: membership, error: membershipError } = await supabase
      .from('group_assignment_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('assignment_id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      console.error('[submit-group] Error checking membership:', loggableError(membershipError));
      return res.status(500).json({ error: 'Error al verificar permisos' });
    }

    if (!membership) {
      return res.status(403).json({ error: 'No eres miembro de este grupo' });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: members, error: membersError } = await supabaseAdmin
      .from('group_assignment_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('assignment_id', assignmentId);

    if (membersError) {
      console.error('[submit-group] Error fetching members:', loggableError(membersError));
      return res.status(500).json({ error: 'Error al obtener miembros del grupo' });
    }

    if (!members || members.length === 0) {
      return res.status(400).json({ error: 'El grupo no tiene miembros' });
    }

    const content = submission.content || '';
    const fileUrl = submission.file_url || null;

    // An identical retry of the saved submission keeps its submitted_at and is the
    // same notification occurrence; any change, a grading since, or a member
    // without a saved row makes it a new submission with a new submitted_at.
    // Rows of the group and the members' rows for this assignment (one per member).
    const memberIds = members.map((member) => member.user_id);
    const { data: saved, error: savedError } = await supabaseAdmin
      .from('group_assignment_submissions')
      .select('user_id, group_id, content, file_url, status, submitted_at')
      .eq('assignment_id', assignmentId)
      .or(`group_id.eq.${membership.group_id},user_id.in.(${memberIds.join(',')})`);

    if (savedError) {
      console.error('[submit-group] saved submission lookup failed');
      return res.status(500).json({ error: 'Error al guardar la entrega' });
    }

    const rows = saved ?? [];
    const memberRows = memberIds.map((id) => rows.find((r) => r.user_id === id));
    const savedAt = new Set(
      memberRows.map((row) => {
        const same =
          row && row.group_id === membership.group_id && row.status === 'submitted' && row.content === content && row.file_url === fileUrl && row.submitted_at;
        return same ? new Date(row.submitted_at).toISOString() : null;
      })
    );
    const retriedAt = savedAt.size === 1 ? [...savedAt][0] : null;
    let submittedAt = retriedAt;

    if (!submittedAt) {
      // Later than every saved submitted_at of the group, even with a frozen or
      // backward clock, so no two saved versions share an occurrence.
      const latest = Math.max(0, ...rows.map((r) => (r.submitted_at ? Date.parse(r.submitted_at) : 0)));

      // One transaction for every member: it updates the saved rows and inserts the
      // missing ones only while they are still as read above (an overlapping save
      // or claim is a conflict), and on any failure it writes nothing.
      const expected = Object.fromEntries(memberRows.flatMap((row) => (row ? [[row.user_id, row.submitted_at]] : [])));
      const { data: saveResult, error: saveError } = await supabaseAdmin.rpc('save_group_submission', {
        p_assignment_id: assignmentId,
        p_group_id: groupId,
        p_actor_id: userId,
        p_content: content,
        p_file_url: fileUrl,
        p_submitted_at: new Date(Math.max(Date.now(), latest + 1)).toISOString(),
        p_expected: expected,
      });

      if (saveError?.code === '23505' || saveResult?.outcome === 'conflict') {
        return res.status(409).json({ error: 'La entrega cambió mientras se guardaba; vuelve a intentarlo' });
      }
      if (saveResult?.outcome === 'forbidden') {
        return res.status(403).json({ error: 'No eres miembro de este grupo' });
      }
      if (saveError) {
        console.error('[submit-group] submission save failed');
        return res.status(500).json({ error: 'Error al guardar la entrega' });
      }
      submittedAt = new Date(saveResult.submitted_at).toISOString();
    }

    // Nonfatal: the submission is saved; submitting it again fills a missing bell.
    const notificationsDelivered = await notifyConsultants(supabaseAdmin as SupabaseClient, groupId, submittedAt, userId);

    return res.status(200).json({ success: true, notificationsDelivered });
  } catch (error) {
    console.error('[submit-group] Unexpected error:', loggableError(error));
    return res.status(500).json({ error: 'Error al enviar el trabajo' });
  }
}

/**
 * Submission bells for the consultants of the group's community: an active
 * consultant assignment to that community held by an active consultor or
 * admin. False when a lookup failed (nobody is notified) or a bell is missing.
 */
async function notifyConsultants(
  supabaseAdmin: SupabaseClient,
  groupId: string,
  submittedAt: string,
  actorId: string
): Promise<boolean> {
  const { data: group, error: groupError } = await supabaseAdmin
    .from('group_assignment_groups')
    .select('assignment_id, community_id')
    .eq('id', groupId)
    .maybeSingle();
  if (groupError || !group) {
    console.error('[submit-group] group lookup for notifications failed');
    return false;
  }

  // School-only groups (community_id null) have no community-scoped consultants today,
  // so there is nobody to notify here.
  if (!group.community_id) return true;

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from('consultant_assignments')
    .select('consultant_id')
    .eq('community_id', group.community_id)
    .eq('is_active', true);
  if (assignmentError) {
    console.error('[submit-group] consultant lookup failed');
    return false;
  }

  const candidates = [...new Set((assignments ?? []).map((a: { consultant_id: string }) => a.consultant_id))].filter(
    (id) => id !== actorId
  );
  if (candidates.length === 0) return true;

  const { data: roles, error: roleError } = await supabaseAdmin
    .from('user_roles')
    .select('user_id, role_type')
    .in('user_id', candidates)
    .eq('is_active', true);
  if (roleError) {
    console.error('[submit-group] consultant role lookup failed');
    return false;
  }

  const recipients = candidates.flatMap((id) => {
    const types = (roles ?? []).filter((r: { user_id: string }) => r.user_id === id).map((r: { role_type: string }) => r.role_type);
    if (types.includes('admin')) return [{ id, role: 'admin' }];
    return types.includes('consultor') ? [{ id, role: 'consultor' }] : [];
  });

  const failed = await deliverRecordBells(
    'group_assignment_submitted',
    { group_id: groupId, assignment_id: group.assignment_id, submitted_at: submittedAt },
    recipients
  );
  if (failed > 0) console.error('[submit-group] submission notifications not created', { failed });
  return failed === 0;
}
