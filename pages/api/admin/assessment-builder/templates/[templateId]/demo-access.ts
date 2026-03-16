import { NextApiRequest, NextApiResponse } from 'next';
import { getApiUser, createApiSupabaseClient, sendAuthError, handleMethodNotAllowed } from '@/lib/api-auth';
import { hasAssessmentWritePermission } from '@/lib/assessment-permissions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { templateId } = req.query;

  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'ID de template inválido' });
  }

  const { user, error: authError } = await getApiUser(req, res);
  if (authError || !user) {
    return sendAuthError(res, 'Autenticación requerida');
  }

  const supabaseClient = await createApiSupabaseClient(req, res);

  // Only admins can manage demo access
  const canWrite = await hasAssessmentWritePermission(supabaseClient, user.id);
  if (!canWrite) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar acceso demo' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, supabaseClient, templateId);
    case 'POST':
      return handlePost(req, res, supabaseClient, templateId, user.id);
    case 'DELETE':
      return handleDelete(req, res, supabaseClient, templateId);
    default:
      return handleMethodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  }
}

async function handleGet(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string
) {
  try {
    const { data, error } = await supabaseClient
      .from('assessment_demo_access')
      .select('id, user_id, granted_at, granted_by')
      .eq('template_id', templateId)
      .order('granted_at', { ascending: false });

    if (error) {
      console.error('Error fetching demo access:', error);
      return res.status(500).json({ error: 'Error al obtener acceso demo' });
    }

    // Enrich with user profile info
    const userIds = [...new Set((data || []).map((d: any) => d.user_id))];
    let profiles: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profileData } = await supabaseClient
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', userIds);

      if (profileData) {
        profiles = profileData.reduce((acc: Record<string, any>, p: any) => {
          acc[p.id] = p;
          return acc;
        }, {});
      }
    }

    const enriched = (data || []).map((d: any) => ({
      id: d.id,
      user_id: d.user_id,
      granted_at: d.granted_at,
      email: profiles[d.user_id]?.email || '',
      full_name: [profiles[d.user_id]?.first_name, profiles[d.user_id]?.last_name]
        .filter(Boolean)
        .join(' ') || '',
    }));

    return res.status(200).json({ success: true, demo_access: enriched });
  } catch (err: any) {
    console.error('Unexpected error fetching demo access:', err);
    return res.status(500).json({ error: err.message || 'Error al obtener acceso demo' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string,
  grantedBy: string
) {
  try {
    const { user_ids } = req.body;

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un usuario' });
    }

    // Verify template exists and is published
    const { data: template, error: templateError } = await supabaseClient
      .from('assessment_templates')
      .select('id, status')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Template no encontrado' });
    }

    if (template.status !== 'published') {
      return res.status(400).json({ error: 'Solo templates publicados pueden tener acceso demo' });
    }

    // Insert demo access rows (upsert to avoid duplicates)
    const rows = user_ids.map((uid: string) => ({
      template_id: templateId,
      user_id: uid,
      granted_by: grantedBy,
    }));

    const { data, error } = await supabaseClient
      .from('assessment_demo_access')
      .upsert(rows, { onConflict: 'template_id,user_id' })
      .select('id, user_id, granted_at');

    if (error) {
      console.error('Error granting demo access:', error);
      return res.status(500).json({ error: 'Error al otorgar acceso demo' });
    }

    return res.status(200).json({ success: true, granted: data });
  } catch (err: any) {
    console.error('Unexpected error granting demo access:', err);
    return res.status(500).json({ error: err.message || 'Error al otorgar acceso demo' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  supabaseClient: any,
  templateId: string
) {
  try {
    const { user_ids } = req.body;

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un usuario' });
    }

    const { error } = await supabaseClient
      .from('assessment_demo_access')
      .delete()
      .eq('template_id', templateId)
      .in('user_id', user_ids);

    if (error) {
      console.error('Error revoking demo access:', error);
      return res.status(500).json({ error: 'Error al revocar acceso demo' });
    }

    return res.status(200).json({ success: true, revoked: user_ids });
  } catch (err: any) {
    console.error('Unexpected error revoking demo access:', err);
    return res.status(500).json({ error: err.message || 'Error al revocar acceso demo' });
  }
}
