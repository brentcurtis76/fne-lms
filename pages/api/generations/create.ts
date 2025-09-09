import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { isGlobalAdmin } from '../../../utils/roleUtils';
import { randomUUID } from 'crypto';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createPagesServerClient({ req, res });

  // Check if user is authenticated
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  // Check if user is admin using the scalable role checking function
  const hasAdminAccess = await isGlobalAdmin(supabase, session.user.id);
  
  if (!hasAdminAccess) {
    return res.status(403).json({ error: 'Solo administradores pueden crear generaciones' });
  }

  const { school_id, name, grade_range } = req.body;

  if (!school_id || !name) {
    return res.status(400).json({ error: 'school_id y name son requeridos' });
  }

  try {
    console.log('API: Creating generation with data:', { 
      school_id, 
      school_id_type: typeof school_id,
      name, 
      grade_range 
    });
    
    // Ensure school_id is a number
    const numericSchoolId = Number(school_id);
    if (isNaN(numericSchoolId)) {
      return res.status(400).json({ error: 'school_id debe ser un número válido' });
    }
    
    // First, verify the school exists
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id, name')
      .eq('id', numericSchoolId)
      .single();
    
    if (schoolError || !school) {
      console.error('API: School not found:', schoolError);
      return res.status(400).json({ error: `Escuela con ID ${numericSchoolId} no encontrada` });
    }
    
    console.log('API: School verified:', school);
    
    // Create the generation
    const insertPayload = {
      school_id: numericSchoolId,
      name: name.trim(),
      grade_range: grade_range?.trim() || null
    };
    
    console.log('API: Insert payload:', insertPayload);
    
    // The issue might be that PostgREST is confused about column types
    // Let's generate a UUID explicitly for the ID
    const generationId = randomUUID();
    
    console.log('API: Generated UUID:', generationId);
    console.log('API: Attempting insert with explicit columns and UUID');
    
    // Try insert with explicit ID
    const { data, error } = await supabase
      .from('generations')
      .insert([{
        id: generationId,
        school_id: numericSchoolId,
        name: name.trim(),
        grade_range: grade_range?.trim() || null
      }])
      .select()
      .single();

    if (error) {
      console.error('API: Error creating generation:', error);
      console.error('API: Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return res.status(400).json({ 
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    }

    console.log('API: Generation created successfully:', data);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('API: Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
}