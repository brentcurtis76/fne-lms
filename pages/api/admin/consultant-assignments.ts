import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../../lib/notificationService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.error('No authorization header provided');
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      console.error('No token in authorization header');
      return res.status(401).json({ error: 'No token provided' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError) {
      console.error('Auth error:', authError.message);
      return res.status(401).json({ error: 'Invalid authentication', details: authError.message });
    }
    
    if (!user) {
      console.error('No user found for token');
      return res.status(401).json({ error: 'User not found' });
    }

    // Verify admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError.message);
      return res.status(500).json({ error: 'Failed to fetch user profile', details: profileError.message });
    }

    if (profile?.role !== 'admin') {
      console.error('User is not admin:', profile?.role);
      return res.status(403).json({ error: 'Admin access required' });
    }

    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res, user.id);
      case 'PUT':
        return await handlePut(req, res);
      case 'DELETE':
        return await handleDelete(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Consultant assignments API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { consultant_id, student_id, include_inactive } = req.query;

  try {
    // First, get the basic assignments
    let query = supabase
      .from('consultant_assignments')
      .select('*');

    // Filter by consultant if specified
    if (consultant_id) {
      query = query.eq('consultant_id', consultant_id);
    }

    // Filter by student if specified
    if (student_id) {
      query = query.eq('student_id', student_id);
    }

    // Filter by active status unless explicitly including inactive
    if (include_inactive !== 'true') {
      query = query.eq('is_active', true);
    }

    const { data: assignments, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
    }

    // If no assignments, return empty array
    if (!assignments || assignments.length === 0) {
      return res.status(200).json({ assignments: [] });
    }

    // Get user details for consultants and students
    const consultantIds = Array.from(new Set(assignments.map(a => a.consultant_id)));
    const studentIds = Array.from(new Set(assignments.map(a => a.student_id)));

    const { data: users } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', consultantIds.concat(studentIds));

    // Enrich assignments with user data
    const enrichedAssignments = assignments.map(assignment => {
      const consultant = users?.find(u => u.id === assignment.consultant_id);
      const student = users?.find(u => u.id === assignment.student_id);
      
      return {
        ...assignment,
        consultant,
        student
      };
    });

    return res.status(200).json({ assignments: enrichedAssignments });
  } catch (error) {
    console.error('Get assignments error:', error);
    return res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const {
    consultant_id,
    student_id,
    assignment_scope = 'individual',
    assignment_type = 'comprehensive',
    can_view_progress = true,
    can_assign_courses = false,
    can_message_student = true,
    school_id,
    generation_id,
    community_id,
    starts_at,
    ends_at,
    assignment_data = {}
  } = req.body;

  // Validation
  if (!consultant_id) {
    return res.status(400).json({ error: 'consultant_id is required' });
  }

  // For individual assignments, student_id is required
  if (assignment_scope === 'individual' && !student_id) {
    return res.status(400).json({ error: 'student_id is required for individual assignments' });
  }

  // Validate assignment scope
  const validScopes = ['individual', 'school', 'generation', 'community'];
  if (!validScopes.includes(assignment_scope)) {
    return res.status(400).json({ error: 'Invalid assignment_scope' });
  }

  // Validate scope-specific requirements
  if (assignment_scope === 'school' && !school_id) {
    return res.status(400).json({ error: 'school_id is required for school-wide assignments' });
  }
  if (assignment_scope === 'generation' && (!school_id || !generation_id)) {
    return res.status(400).json({ error: 'school_id and generation_id are required for generation assignments' });
  }
  if (assignment_scope === 'community' && (!school_id || !community_id)) {
    return res.status(400).json({ error: 'school_id and community_id are required for community assignments' });
  }
  
  // Validate community_id exists if provided
  if (community_id) {
    console.log('Validating community_id:', community_id);
    const { data: community, error: communityError } = await supabase
      .from('growth_communities')
      .select('id')
      .eq('id', community_id)
      .single();
    
    if (communityError || !community) {
      console.error('Invalid community_id:', community_id, communityError);
      return res.status(400).json({ 
        error: 'Invalid community_id', 
        details: `Community with ID ${community_id} not found` 
      });
    }
  }

  if (assignment_scope === 'individual' && consultant_id === student_id) {
    return res.status(400).json({ error: 'Consultant cannot be assigned to themselves' });
  }

  try {
    console.log('Creating assignment with data:', {
      consultant_id,
      student_id,
      assignment_scope,
      school_id,
      generation_id,
      community_id,
      user_id: userId
    });

    // Verify consultant exists (no role restriction - any user can be a consultant)
    const { data: consultantProfile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('id', consultant_id)
      .single();

    if (!consultantProfile) {
      return res.status(400).json({ error: 'Consultant not found' });
    }

    // For individual assignments, verify student exists (no role restriction)
    let studentProfile = null;
    if (assignment_scope === 'individual' && student_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('id', student_id)
        .single();

      if (!profile) {
        return res.status(400).json({ error: 'User not found' });
      }
      studentProfile = profile;
    }

    // Check for existing active assignment
    if (assignment_scope === 'individual') {
      const { data: existingAssignment } = await supabase
        .from('consultant_assignments')
        .select('id')
        .eq('consultant_id', consultant_id)
        .eq('student_id', student_id)
        .eq('is_active', true)
        .single();

      if (existingAssignment) {
        return res.status(400).json({ error: 'Active assignment already exists between this consultant and user' });
      }
    } else {
      // For group assignments, check for existing assignment with same scope
      let query = supabase
        .from('consultant_assignments')
        .select('id')
        .eq('consultant_id', consultant_id)
        .eq('is_active', true)
        .is('student_id', null); // Group assignments have null student_id

      if (assignment_scope === 'school') {
        query = query.eq('school_id', school_id)
          .is('generation_id', null)
          .is('community_id', null);
      } else if (assignment_scope === 'generation') {
        query = query.eq('school_id', school_id)
          .eq('generation_id', generation_id)
          .is('community_id', null);
      } else if (assignment_scope === 'community') {
        query = query.eq('school_id', school_id)
          .eq('generation_id', generation_id)
          .eq('community_id', community_id);
      }

      const { data: existingAssignment } = await query.single();

      if (existingAssignment) {
        return res.status(400).json({ error: 'Active assignment already exists for this scope' });
      }
    }

    // Create the assignment
    const assignmentData: any = {
      consultant_id,
      assignment_type,
      can_view_progress,
      can_assign_courses,
      can_message_student,
      starts_at: starts_at || new Date().toISOString(),
      ends_at: ends_at || null,
      is_active: true,
      assigned_by: userId, // Use the actual admin user's ID
      assignment_data: {
        ...assignment_data,
        assignment_scope
      }
    };

    // Set scope-specific fields
    if (assignment_scope === 'individual') {
      assignmentData.student_id = student_id;
    } else {
      assignmentData.student_id = null; // Group assignments don't have individual student
      assignmentData.school_id = school_id || null;
      assignmentData.generation_id = generation_id || null;
      assignmentData.community_id = community_id || null;
    }

    console.log('Final assignment data to insert:', JSON.stringify(assignmentData, null, 2));

    const { data: newAssignment, error } = await supabase
      .from('consultant_assignments')
      .insert(assignmentData)
      .select('*')
      .single();

    if (error) {
      console.error('Database error:', error);
      console.error('Database error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        assignmentData: assignmentData
      });
      
      // Check for specific foreign key violations
      if (error.code === '23503') {
        if (error.message.includes('community_id')) {
          return res.status(400).json({ 
            error: 'Invalid community reference',
            details: `The community ID ${assignmentData.community_id} does not exist in the database`
          });
        } else if (error.message.includes('school_id')) {
          return res.status(400).json({ 
            error: 'Invalid school reference',
            details: `The school ID ${assignmentData.school_id} does not exist in the database`
          });
        } else if (error.message.includes('generation_id')) {
          return res.status(400).json({ 
            error: 'Invalid generation reference',
            details: `The generation ID ${assignmentData.generation_id} does not exist in the database`
          });
        }
      }
      
      return res.status(500).json({ 
        error: 'Failed to create assignment',
        details: error.message,
        hint: error.hint,
        code: error.code
      });
    }

    // Trigger consultant assignment notification for individual assignments
    if (assignment_scope === 'individual' && student_id) {
      try {
        const consultantName = consultantProfile ? 
          `${consultantProfile.first_name} ${consultantProfile.last_name}`.trim() : 
          'Un consultor';

        await NotificationService.triggerNotification('consultant_assigned', {
          assignment_id: newAssignment.id,
          consultant_id,
          student_id,
          consultant_name: consultantName,
          assignment_type,
          starts_at: newAssignment.starts_at
        });

        // Mark notification as sent
        await supabase
          .from('consultant_assignments')
          .update({ notification_sent: true })
          .eq('id', newAssignment.id);

        console.log(`✅ Consultant assignment notification triggered for user ${student_id}`);
      } catch (notificationError) {
        console.error('❌ Failed to trigger consultant assignment notification:', notificationError);
        // Don't fail the API call if notifications fail
      }
    }

    return res.status(201).json({ assignment: newAssignment });
  } catch (error) {
    console.error('Create assignment error:', error);
    return res.status(500).json({ error: 'Failed to create assignment' });
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const {
    id,
    assignment_type,
    can_view_progress,
    can_assign_courses,
    can_message_student,
    school_id,
    generation_id,
    community_id,
    starts_at,
    ends_at,
    is_active,
    assignment_data
  } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Assignment ID is required' });
  }

  try {
    // Verify assignment exists
    const { data: existingAssignment } = await supabase
      .from('consultant_assignments')
      .select('id, consultant_id, student_id')
      .eq('id', id)
      .single();

    if (!existingAssignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Build update object with only provided fields
    const updateData: any = { updated_at: new Date().toISOString() };
    
    if (assignment_type !== undefined) updateData.assignment_type = assignment_type;
    if (can_view_progress !== undefined) updateData.can_view_progress = can_view_progress;
    if (can_assign_courses !== undefined) updateData.can_assign_courses = can_assign_courses;
    if (can_message_student !== undefined) updateData.can_message_student = can_message_student;
    if (school_id !== undefined) updateData.school_id = school_id;
    if (generation_id !== undefined) updateData.generation_id = generation_id;
    if (community_id !== undefined) updateData.community_id = community_id;
    if (starts_at !== undefined) updateData.starts_at = starts_at;
    if (ends_at !== undefined) updateData.ends_at = ends_at;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (assignment_data !== undefined) updateData.assignment_data = assignment_data;

    const { data: updatedAssignment, error } = await supabase
      .from('consultant_assignments')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        consultant:consultant_id(id, first_name, last_name, email),
        student:student_id(id, first_name, last_name, email)
      `)
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to update assignment' });
    }

    return res.status(200).json({ assignment: updatedAssignment });
  } catch (error) {
    console.error('Update assignment error:', error);
    return res.status(500).json({ error: 'Failed to update assignment' });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Assignment ID is required' });
  }

  try {
    // Verify assignment exists
    const { data: existingAssignment } = await supabase
      .from('consultant_assignments')
      .select('id, consultant_id, student_id')
      .eq('id', id)
      .single();

    if (!existingAssignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Soft delete by setting is_active to false
    const { error } = await supabase
      .from('consultant_assignments')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to delete assignment' });
    }

    return res.status(200).json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    return res.status(500).json({ error: 'Failed to delete assignment' });
  }
}