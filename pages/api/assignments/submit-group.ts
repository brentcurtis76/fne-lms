import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { assignmentId, groupId, submission } = req.body || {};

  if (!assignmentId || !groupId || !submission) {
    return res.status(400).json({ error: 'assignmentId, groupId y submission son requeridos' });
  }

  try {
    const userId = session.user.id;

    const { data: membership, error: membershipError } = await supabase
      .from('group_assignment_members')
      .select('group_id')
      .eq('group_id', groupId)
      .eq('assignment_id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      console.error('[submit-group] Error checking membership:', membershipError);
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
      console.error('[submit-group] Error fetching members:', membersError);
      return res.status(500).json({ error: 'Error al obtener miembros del grupo' });
    }

    if (!members || members.length === 0) {
      return res.status(400).json({ error: 'El grupo no tiene miembros' });
    }

    const submissions = members.map((member) => ({
      assignment_id: assignmentId,
      group_id: groupId,
      user_id: member.user_id,
      content: submission.content || '',
      file_url: submission.file_url || null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }));

    const { error: submissionError } = await supabaseAdmin
      .from('group_assignment_submissions')
      .upsert(submissions, { onConflict: 'assignment_id,user_id' });

    if (submissionError) {
      console.error('[submit-group] Error inserting submissions:', submissionError);
      return res.status(500).json({ error: 'Error al guardar la entrega' });
    }

    await notifyConsultants(supabaseAdmin, assignmentId, groupId);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[submit-group] Unexpected error:', error);
    return res.status(500).json({ error: 'Error al enviar el trabajo' });
  }
}

async function notifyConsultants(
  supabaseAdmin: ReturnType<typeof createClient>,
  assignmentId: string,
  groupId: string
) {
  try {
    const { data: assignmentBlock } = await supabaseAdmin
      .from('blocks')
      .select('payload')
      .eq('id', assignmentId)
      .single();

    const assignmentTitle =
      assignmentBlock?.payload?.title || 'Tarea grupal entregada';

    const { data: group } = await supabaseAdmin
      .from('group_assignment_groups')
      .select('community_id, name')
      .eq('id', groupId)
      .single();

    if (!group) return;

    const { data: consultantAssignments } = await supabaseAdmin
      .from('consultant_assignments')
      .select('consultant_id')
      .eq('assigned_entity_id', group.community_id)
      .eq('assigned_entity_type', 'community')
      .eq('is_active', true);

    if (!consultantAssignments || consultantAssignments.length === 0) return;

    const notifications = consultantAssignments.map((ca) => ({
      user_id: ca.consultant_id,
      type: 'group_assignment_submitted',
      title: 'Nueva tarea grupal entregada',
      message: `El ${group.name} ha entregado la tarea "${assignmentTitle}"`,
      data: {
        assignment_id: assignmentId,
        group_id: groupId,
      },
    }));

    await supabaseAdmin.from('notifications').insert(notifications);
  } catch (error) {
    console.error('[submit-group] Error notifying consultants:', error);
  }
}
