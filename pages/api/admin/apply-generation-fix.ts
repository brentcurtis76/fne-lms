import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Use service role key for admin operations
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Step 1: Check current generations table structure
    const { data: checkGen, error: checkError } = await supabase
      .from('generations')
      .select('*')
      .limit(1);
    
    console.log('Current generations check:', { checkGen, checkError });

    // Step 2: Try a simple insert without any foreign key
    const testId = crypto.randomUUID();
    const { data: testInsert, error: insertError } = await supabase
      .from('generations')
      .insert([{
        id: testId,
        school_id: 25,  // Try with integer
        name: 'Test Generation',
        grade_range: 'Test'
      }])
      .select()
      .single();

    if (!insertError) {
      // If it worked, delete the test record
      await supabase
        .from('generations')
        .delete()
        .eq('id', testId);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Generation insert works with integer school_id!',
        test_result: testInsert
      });
    }

    // If integer failed, try with UUID string
    const { data: testInsert2, error: insertError2 } = await supabase
      .from('generations')
      .insert([{
        school_id: '25',  // Try with string
        name: 'Test Generation',
        grade_range: 'Test'
      }])
      .select()
      .single();

    if (!insertError2) {
      // Clean up
      await supabase
        .from('generations')
        .delete()
        .eq('id', testInsert2.id);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Generation insert works with string school_id!',
        test_result: testInsert2
      });
    }

    // Both failed
    return res.status(400).json({
      error: 'Both insert attempts failed',
      integer_error: insertError?.message,
      string_error: insertError2?.message
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: error.message });
  }
}