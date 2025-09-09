/**
 * API endpoint for learning paths - TYPED VERSION
 * Handles CRUD operations for learning paths
 * 
 * TYPES: Using types/database.generated.ts for type safety
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { LearningPathsService } from '../../../lib/services/learningPathsService';
import { getApiUser, createApiSupabaseClient, sendAuthError } from '../../../lib/api-auth';
import type { Database } from '../../../types/database.generated';

// Type definitions from generated database types
type LearningPaths = Database['public']['Tables']['learning_paths']['Row'];
type LearningPathCourses = Database['public']['Tables']['learning_path_courses']['Row'];
type Courses = Database['public']['Tables']['courses']['Row'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authenticate user using the standard api-auth pattern
  const { user, error } = await getApiUser(req, res);
  
  if (error || !user) {
    return sendAuthError(res, 'Authentication required');
  }

  const userId = user.id;
  
  // Create authenticated Supabase client
  const supabaseClient = await createApiSupabaseClient(req, res);

  try {
    switch (req.method) {
      case 'GET':
        // Get all learning paths with explicit column selection
        const { data: paths, error: pathsError } = await supabaseClient
          .from('learning_paths')
          .select(`
            id,
            name,
            description,
            created_by,
            created_at,
            updated_at,
            learning_path_courses (
              id,
              learning_path_id,
              course_id,
              order_index,
              courses (
                id,
                title,
                description,
                is_published,
                image_url
              )
            )
          `)
          .order('created_at', { ascending: false })
          .returns<(Pick<LearningPaths, 'id' | 'name' | 'description' | 'created_by' | 'created_at' | 'updated_at'> & {
            learning_path_courses: (Pick<LearningPathCourses, 'id' | 'learning_path_id' | 'course_id' | 'order_index'> & {
              courses: Pick<Courses, 'id' | 'title' | 'description' | 'is_published' | 'image_url'> | null
            })[]
          })[]>();

        if (pathsError) {
          console.error('Error fetching learning paths:', pathsError);
          return res.status(500).json({ 
            error: 'Error al obtener rutas de aprendizaje',
            details: pathsError.message 
          });
        }

        // Transform data for response
        const formattedPaths = (paths || []).map(path => ({
          id: path.id,
          name: path.name,
          description: path.description,
          created_by: path.created_by,
          created_at: path.created_at,
          updated_at: path.updated_at,
          courses: path.learning_path_courses
            .sort((a, b) => a.order_index - b.order_index)
            .map(lpc => lpc.courses)
            .filter(course => course !== null),
          course_count: path.learning_path_courses.length
        }));

        return res.status(200).json(formattedPaths);

      case 'POST':
        // Create a new learning path with proper typing
        console.log('[Learning Paths API] Creating learning path with user:', userId);
        
        // First check if user has permission
        const hasPermission = await LearningPathsService.hasManagePermission(supabaseClient, userId);
        
        if (!hasPermission) {
          return res.status(403).json({ error: 'No tienes permiso para crear rutas de aprendizaje' });
        }

        const { name, description, courseIds } = req.body;
        console.log('[Learning Paths API] Request body:', { name, description, courseIds });

        // Validate required fields
        if (!name || !description) {
          return res.status(400).json({ error: 'Nombre y descripción son requeridos' });
        }

        if (!Array.isArray(courseIds)) {
          return res.status(400).json({ error: 'courseIds debe ser un array' });
        }

        // Validate courseIds are numbers (course.id is INTEGER)
        if (!courseIds.every(id => typeof id === 'number')) {
          return res.status(400).json({ error: 'Todos los courseIds deben ser números' });
        }

        // Create the learning path with proper type
        const insertData: Database['public']['Tables']['learning_paths']['Insert'] = {
          name: name.trim(),
          description: description.trim(),
          created_by: userId
        };

        const { data: newPath, error: createError } = await supabaseClient
          .from('learning_paths')
          .insert(insertData)
          .select('id, name, description, created_by, created_at, updated_at')
          .single()
          .returns<LearningPaths>();

        if (createError) {
          console.error('Error creating learning path:', createError);
          return res.status(500).json({ 
            error: 'Error al crear ruta de aprendizaje',
            details: createError.message 
          });
        }

        // Add courses to the learning path if provided
        if (courseIds.length > 0) {
          const courseInserts: Database['public']['Tables']['learning_path_courses']['Insert'][] = 
            courseIds.map((courseId, index) => ({
              learning_path_id: newPath.id,
              course_id: courseId,
              order_index: index
            }));

          const { error: coursesError } = await supabaseClient
            .from('learning_path_courses')
            .insert(courseInserts);

          if (coursesError) {
            console.error('Error adding courses to learning path:', coursesError);
            // Rollback by deleting the learning path
            await supabaseClient
              .from('learning_paths')
              .delete()
              .eq('id', newPath.id);
            
            return res.status(500).json({ 
              error: 'Error al agregar cursos a la ruta de aprendizaje',
              details: coursesError.message 
            });
          }
        }

        // Fetch the complete learning path with courses
        const { data: completePath, error: fetchError } = await supabaseClient
          .from('learning_paths')
          .select(`
            id,
            name,
            description,
            created_by,
            created_at,
            updated_at,
            learning_path_courses (
              id,
              learning_path_id,
              course_id,
              order_index,
              courses (
                id,
                title,
                description,
                is_published,
                image_url
              )
            )
          `)
          .eq('id', newPath.id)
          .single()
          .returns<Pick<LearningPaths, 'id' | 'name' | 'description' | 'created_by' | 'created_at' | 'updated_at'> & {
            learning_path_courses: (Pick<LearningPathCourses, 'id' | 'learning_path_id' | 'course_id' | 'order_index'> & {
              courses: Pick<Courses, 'id' | 'title' | 'description' | 'is_published' | 'image_url'> | null
            })[]
          }>();

        if (fetchError || !completePath) {
          console.error('Error fetching created learning path:', fetchError);
          return res.status(201).json(newPath); // Return basic path if fetch fails
        }

        // Format response
        const formattedPath = {
          id: completePath.id,
          name: completePath.name,
          description: completePath.description,
          created_by: completePath.created_by,
          created_at: completePath.created_at,
          updated_at: completePath.updated_at,
          courses: completePath.learning_path_courses
            .sort((a, b) => a.order_index - b.order_index)
            .map(lpc => lpc.courses)
            .filter(course => course !== null),
          course_count: completePath.learning_path_courses.length
        };

        return res.status(201).json(formattedPath);

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: `Método ${req.method} no permitido` });
    }
  } catch (error: any) {
    console.error('Learning paths API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Error interno del servidor' 
    });
  }
}