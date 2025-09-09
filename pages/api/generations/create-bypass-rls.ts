import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Use service role key to bypass RLS completely
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  });

  const { school_id, name, grade_range } = req.body;

  if (!school_id || !name) {
    return res.status(400).json({ error: 'school_id y name son requeridos' });
  }

  try {
    console.log('BYPASS RLS: Creating generation with:', { school_id, name, grade_range });
    
    // The problem is that schools.id might be UUID in production!
    // Let's get the school by name instead to avoid the ID type issue
    const { data: schoolByName, error: nameError } = await supabase
      .from('schools')
      .select('*')
      .eq('name', 'Santa Marta de Talca')
      .single();
    
    if (!nameError && schoolByName) {
      console.log('School found by name:', schoolByName);
      console.log('School ID is:', schoolByName.id, 'Type:', typeof schoolByName.id);
    }
    
    // Try to get school with string ID "25"
    const { data: schoolCheck, error: schoolError } = await supabase
      .from('schools')
      .select('*')
      .eq('id', school_id.toString())
      .single();
    
    if (schoolError || !schoolCheck) {
      return res.status(400).json({ 
        error: `School ${school_id} not found or error`,
        schoolError,
        schoolCheck
      });
    }
    
    console.log('School found:', schoolCheck);
    console.log('School ID type:', typeof schoolCheck.id, 'value:', schoolCheck.id);
    
    // Now try insert with the actual school.id value
    const { data, error } = await supabase
      .from('generations')
      .insert([{
        name: name,
        school_id: schoolCheck.id,  // Use the actual ID from the database
        grade_range: grade_range || null
      }])
      .select()
      .single();

    if (error) {
      console.error('BYPASS RLS: Error:', error);
      return res.status(400).json({ 
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    }

    console.log('BYPASS RLS: Success:', data);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('BYPASS RLS: Unexpected error:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
}