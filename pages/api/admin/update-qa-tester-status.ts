import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { hasAdminPrivileges } from '../../../utils/roleUtils';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET: List all QA testers
  if (req.method === 'GET') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const { data: { user: requestingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !requestingUser) {
        return res.status(401).json({ error: 'Token inválido' });
      }

      const isAdmin = await hasAdminPrivileges(supabaseAdmin, requestingUser.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Solo los administradores pueden ver testers QA' });
      }

      // Get all users with can_run_qa_tests = true
      const { data: testers, error: testersError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name, can_run_qa_tests')
        .eq('can_run_qa_tests', true)
        .order('email');

      if (testersError) {
        console.error('Error fetching QA testers:', testersError);
        return res.status(500).json({ error: 'Error al obtener testers QA' });
      }

      return res.status(200).json({ testers: testers || [] });

    } catch (error) {
      console.error('Error in get QA testers:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // POST: Update QA tester status
  if (req.method === 'POST') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const { data: { user: requestingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (userError || !requestingUser) {
        return res.status(401).json({ error: 'Token inválido' });
      }

      const isAdmin = await hasAdminPrivileges(supabaseAdmin, requestingUser.id);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Solo los administradores pueden modificar testers QA' });
      }

      const { userId, canRunQATests } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'ID de usuario requerido' });
      }

      if (typeof canRunQATests !== 'boolean') {
        return res.status(400).json({ error: 'canRunQATests debe ser true o false' });
      }

      // Update the can_run_qa_tests flag
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ can_run_qa_tests: canRunQATests })
        .eq('id', userId)
        .select('id, email, first_name, last_name, can_run_qa_tests')
        .single();

      if (updateError) {
        console.error('Error updating QA tester status:', updateError);
        return res.status(500).json({ error: 'Error al actualizar estado de tester QA' });
      }

      // Log the update in audit_logs
      await supabaseAdmin
        .from('audit_logs')
        .insert({
          user_id: requestingUser.id,
          action: canRunQATests ? 'enable_qa_tester' : 'disable_qa_tester',
          table_name: 'profiles',
          record_id: userId,
          details: {
            can_run_qa_tests: canRunQATests,
            target_email: updatedProfile?.email
          }
        });

      return res.status(200).json({
        success: true,
        message: canRunQATests ? 'Usuario habilitado como tester QA' : 'Usuario deshabilitado como tester QA',
        profile: updatedProfile
      });

    } catch (error) {
      console.error('Error in update-qa-tester-status:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
