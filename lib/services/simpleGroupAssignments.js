import { supabase } from '../supabase';

/**
 * Create a group assignment from a lesson block
 * This saves the assignment to lesson_assignments table with group data
 */
export const createGroupAssignmentFromBlock = async (block, lessonId, courseId) => {
  try {
    const { payload } = block;
    
    // Create the assignment in lesson_assignments table
    const { data, error } = await supabase
      .from('lesson_assignments')
      .insert({
        title: payload.title,
        description: payload.description,
        instructions: payload.instructions,
        lesson_id: lessonId,
        course_id: courseId,
        due_date: payload.due_date || null,
        points: 0, // Default to 0 for group assignments
        assignment_type: 'group',
        group_assignments: payload.groups || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error creating group assignment:', error);
    return { data: null, error };
  }
};

/**
 * Update a group assignment
 */
export const updateGroupAssignment = async (assignmentId, updates) => {
  try {
    const { data, error } = await supabase
      .from('lesson_assignments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error('Error updating group assignment:', error);
    return { data: null, error };
  }
};

/**
 * Get group assignments for a student
 */
export const getStudentGroupAssignments = async (studentId) => {
  try {
    // First get all group assignments
    const { data: assignments, error } = await supabase
      .from('lesson_assignments')
      .select(`
        *,
        courses (
          id,
          title
        ),
        lessons (
          id,
          title
        )
      `)
      .eq('assignment_type', 'group')
      .order('due_date', { ascending: true });

    if (error) throw error;

    // Filter assignments where the student is a member
    const studentAssignments = assignments.filter(assignment => {
      return assignment.group_assignments.some(group => 
        group.members.some(member => member.user_id === studentId)
      );
    });

    // Add the student's group info to each assignment
    const assignmentsWithGroupInfo = studentAssignments.map(assignment => {
      const studentGroup = assignment.group_assignments.find(group =>
        group.members.some(member => member.user_id === studentId)
      );
      
      return {
        ...assignment,
        student_group: studentGroup
      };
    });

    return { data: assignmentsWithGroupInfo, error: null };
  } catch (error) {
    console.error('Error fetching student group assignments:', error);
    return { data: null, error };
  }
};

/**
 * Submit a group assignment
 */
export const submitGroupAssignment = async (assignmentId, groupId, fileUrl, userId) => {
  try {
    // Get the current assignment
    const { data: assignment, error: fetchError } = await supabase
      .from('lesson_assignments')
      .select('group_assignments')
      .eq('id', assignmentId)
      .single();

    if (fetchError) throw fetchError;

    // Update the specific group's submission
    const updatedGroups = assignment.group_assignments.map(group => {
      if (group.group_id === groupId) {
        return {
          ...group,
          submission: {
            file_url: fileUrl,
            submitted_at: new Date().toISOString(),
            submitted_by: userId
          }
        };
      }
      return group;
    });

    // Update the assignment
    const { data, error } = await supabase
      .from('lesson_assignments')
      .update({
        group_assignments: updatedGroups,
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting group assignment:', error);
    return { data: null, error };
  }
};

/**
 * Check if user can submit for a group
 */
export const canUserSubmitForGroup = async (userId, assignmentId, groupId) => {
  try {
    const { data: assignment, error } = await supabase
      .from('lesson_assignments')
      .select('group_assignments')
      .eq('id', assignmentId)
      .single();

    if (error) throw error;

    const group = assignment.group_assignments.find(g => g.group_id === groupId);
    if (!group) return false;

    return group.members.some(member => member.user_id === userId);
  } catch (error) {
    console.error('Error checking submission permission:', error);
    return false;
  }
};