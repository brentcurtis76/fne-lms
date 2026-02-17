import { NextApiRequest, NextApiResponse } from 'next';
import { 
  checkIsAdmin, 
  createServiceRoleClient, 
  sendAuthError, 
  sendApiResponse,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';
import NotificationService from '../../../lib/notificationService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log the request for debugging
  logApiRequest(req, 'consultant-assignments');
  
  try {
    // Check admin authentication using our standardized function
    const { isAdmin, user, error } = await checkIsAdmin(req, res);
    
    if (!isAdmin) {
      return sendAuthError(res, 'Only admins can manage consultant assignments', 403);
    }

    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res, user!.id);
      case 'PUT':
        return await handlePut(req, res);
      case 'DELETE':
        return await handleDelete(req, res);
      default:
        return sendAuthError(res, 'Method not allowed', 405);
    }
  } catch (error) {
    console.error('Consultant assignments API error:', error);
    return sendAuthError(res, 'Internal server error', 500);
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { consultant_id, student_id, include_inactive } = req.query;
  const supabase = createServiceRoleClient();

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
      return sendAuthError(res, 'Failed to fetch assignments', 500, error.message);
    }

    // If no assignments, return empty array
    if (!assignments || assignments.length === 0) {
      return sendApiResponse(res, { assignments: [] });
    }

    // Get user details for consultants and students
    const consultantIds = Array.from(new Set(assignments.map(a => a.consultant_id).filter(id => id !== null)));
    const studentIds = Array.from(new Set(assignments.map(a => a.student_id).filter(id => id !== null)));

    // Combine all user IDs and filter out nulls
    const allUserIds = [...consultantIds, ...studentIds].filter(id => id !== null);

    // Handle case where there are no user IDs to fetch
    let users = [];
    if (allUserIds.length > 0) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', allUserIds);
      
      if (error) {
        console.error('Error fetching user profiles:', error);
      } else {
        users = data || [];
      }
    }

    // Enrich assignments with user data
    const enrichedAssignments = assignments.map(assignment => {
      const consultant = users?.find(u => u.id === assignment.consultant_id);
      const student = assignment.student_id ? users?.find(u => u.id === assignment.student_id) : null;

      return {
        ...assignment,
        consultant: consultant || null,
        student: student || null
      };
    });

    return sendApiResponse(res, { assignments: enrichedAssignments });
  } catch (error: any) {
    console.error('Get assignments error:', error);
    return sendAuthError(res, 'Failed to fetch assignments', 500, error.message);
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const supabase = createServiceRoleClient();
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
    return sendAuthError(res, 'consultant_id is required', 400);
  }

  // For individual assignments, student_id is required
  if (assignment_scope === 'individual' && !student_id) {
    return sendAuthError(res, 'student_id is required for individual assignments', 400);
  }

  // Validate assignment scope
  const validScopes = ['individual', 'school', 'generation', 'community'];
  if (!validScopes.includes(assignment_scope)) {
    return sendAuthError(res, 'Invalid assignment_scope', 400);
  }

  // Validate scope-specific requirements
  if (assignment_scope === 'school' && !school_id) {
    return sendAuthError(res, 'school_id is required for school-wide assignments', 400);
  }
  if (assignment_scope === 'generation' && (!school_id || !generation_id)) {
    return sendAuthError(res, 'school_id and generation_id are required for generation assignments', 400);
  }
  if (assignment_scope === 'community' && (!school_id || !community_id)) {
    return sendAuthError(res, 'school_id and community_id are required for community assignments', 400);
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
      return sendAuthError(res, 'Invalid community_id', 400, `Community with ID ${community_id} not found`);
    }
  }

  if (assignment_scope === 'individual' && consultant_id === student_id) {
    return sendAuthError(res, 'Consultant cannot be assigned to themselves', 400);
  }

  try {
    // Verify consultant exists (no role restriction - any user can be a consultant)
    const { data: consultantProfile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('id', consultant_id)
      .single();

    if (!consultantProfile) {
      return sendAuthError(res, 'Consultant not found', 404);
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
        return sendAuthError(res, 'User not found', 404);
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
        return sendAuthError(res, 'Active assignment already exists between this consultant and user', 409);
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
        return sendAuthError(res, 'Active assignment already exists for this scope', 409);
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

    const { data: newAssignment, error } = await supabase
      .from('consultant_assignments')
      .insert(assignmentData)
      .select('*')
      .single();

    if (error) {
      console.error('Database error:', error);
      
      // Check for specific foreign key violations
      if (error.code === '23503') {
        if (error.message.includes('community_id')) {
          return sendAuthError(res, 'Invalid community reference', 400, `The community ID ${assignmentData.community_id} does not exist in the database`);
        } else if (error.message.includes('school_id')) {
          return sendAuthError(res, 'Invalid school reference', 400, `The school ID ${assignmentData.school_id} does not exist in the database`);
        } else if (error.message.includes('generation_id')) {
          return sendAuthError(res, 'Invalid generation reference', 400, `The generation ID ${assignmentData.generation_id} does not exist in the database`);
        }
      }
      
      return sendAuthError(res, 'Failed to create assignment', 500, error.message);
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

    return sendApiResponse(res, { assignment: newAssignment }, 201);
  } catch (error: any) {
    console.error('Create assignment error:', error);
    return sendAuthError(res, 'Failed to create assignment', 500);
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServiceRoleClient();
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
    return sendAuthError(res, 'Assignment ID is required', 400);
  }

  try {
    // Verify assignment exists
    const { data: existingAssignment } = await supabase
      .from('consultant_assignments')
      .select('id, consultant_id, student_id')
      .eq('id', id)
      .single();

    if (!existingAssignment) {
      return sendAuthError(res, 'Assignment not found', 404);
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
      return sendAuthError(res, 'Failed to update assignment', 500);
    }

    return sendApiResponse(res, { assignment: updatedAssignment });
  } catch (error) {
    console.error('Update assignment error:', error);
    return res.status(500).json({ error: 'Failed to update assignment' });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServiceRoleClient();
  const { id } = req.query;

  if (!id) {
    return sendAuthError(res, 'Assignment ID is required', 400);
  }

  try {
    // Verify assignment exists
    const { data: existingAssignment } = await supabase
      .from('consultant_assignments')
      .select('id, consultant_id, student_id')
      .eq('id', id)
      .single();

    if (!existingAssignment) {
      return sendAuthError(res, 'Assignment not found', 404);
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
      return sendAuthError(res, 'Failed to delete assignment', 500);
    }

    return sendApiResponse(res, { message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    return sendAuthError(res, 'Failed to delete assignment', 500);
  }
}