import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import type { Message } from '@/hooks/useTransformationChat';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const assessmentId = String(req.query.assessmentId ?? '');
  const rubricId = String(req.query.rubricId ?? '');

  if (!assessmentId || !rubricId) {
    return res.status(400).json({ error: 'assessmentId y rubricId son obligatorios.' });
  }

  const [{ data: assessment, error: assessmentError }, { data: messages, error: messagesError }] =
    await Promise.all([
      supabase
        .from('transformation_assessments')
        .select('context_metadata, status')
        .eq('id', assessmentId)
        .single(),
      supabase
        .from('transformation_conversation_messages')
        .select('role, content, created_at')
        .eq('assessment_id', assessmentId)
        .eq('rubric_item_id', rubricId)
        .order('created_at', { ascending: true })
        .limit(200),
    ]);

  if (assessmentError) {
    return res.status(400).json({ error: assessmentError.message });
  }

  if (messagesError) {
    return res.status(400).json({ error: messagesError.message });
  }

  const metadata = assessment?.context_metadata as
    | {
        conversation_summaries?: Record<string, any>;
      }
    | undefined;

  const summary = metadata?.conversation_summaries?.[rubricId];

  return res.status(200).json({
    assessmentStatus: assessment?.status ?? 'in_progress',
    summary: summary ?? null,
    messages: (messages ?? []).map((row) => ({
      role: row.role as Message['role'],
      content: row.content,
      created_at: row.created_at,
    })),
  });
}
