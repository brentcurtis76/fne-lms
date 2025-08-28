import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createPagesServerClient({ req, res });

  switch (req.method) {
    case 'GET':
      return handleGet(supabase, req, res);
    case 'POST':
      return handleCreate(supabase, req, res);
    case 'PUT':
      return handleUpdate(supabase, req, res);
    case 'DELETE':
      return handleDelete(supabase, req, res);
    default:
      return res.status(405).json({ error: 'Método no permitido' });
  }
}

async function handleGet(supabase: any, req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data: programs, error } = await supabase
      .from('pasantias_programs')
      .select('*')
      .eq('is_active', true)
      .order('display_order');

    if (error) {
      console.error('Error fetching programs:', error);
      return res.status(500).json({ 
        error: 'Error al obtener los programas',
        details: error.message 
      });
    }

    return res.status(200).json({ programs });

  } catch (error) {
    console.error('Error in get programs:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleCreate(supabase: any, req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .eq('role_type', 'admin')
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'Solo los administradores pueden crear programas' });
    }

    const { name, description, price, pdf_url, display_order } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos',
        details: 'El nombre y precio del programa son obligatorios'
      });
    }

    const { data: program, error } = await supabase
      .from('pasantias_programs')
      .insert({
        name,
        description,
        price,
        pdf_url,
        display_order: display_order || 999
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating program:', error);
      return res.status(500).json({ 
        error: 'Error al crear el programa',
        details: error.message 
      });
    }

    return res.status(200).json({ 
      success: true,
      program 
    });

  } catch (error) {
    console.error('Error creating program:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleUpdate(supabase: any, req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .eq('role_type', 'admin')
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'Solo los administradores pueden editar programas' });
    }

    const { id, ...updateData } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID del programa es requerido' });
    }

    const { data: program, error } = await supabase
      .from('pasantias_programs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating program:', error);
      return res.status(500).json({ 
        error: 'Error al actualizar el programa',
        details: error.message 
      });
    }

    return res.status(200).json({ 
      success: true,
      program 
    });

  } catch (error) {
    console.error('Error updating program:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function handleDelete(supabase: any, req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .eq('role_type', 'admin')
      .single();

    if (!userRole) {
      return res.status(403).json({ error: 'Solo los administradores pueden eliminar programas' });
    }

    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID del programa es requerido' });
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('pasantias_programs')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting program:', error);
      return res.status(500).json({ 
        error: 'Error al eliminar el programa',
        details: error.message 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: 'Programa eliminado correctamente'
    });

  } catch (error) {
    console.error('Error deleting program:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}