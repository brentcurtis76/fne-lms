import { supabase } from '../supabase';

/**
 * Assignment Instances Service
 * Manages the creation and management of assignment instances from templates
 */

/**
 * Get available assignment templates for a course
 */
export async function getAssignmentTemplates(courseId) {
  try {
    const { data, error } = await supabase
      .rpc('get_available_assignment_templates', { p_course_id: courseId });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching assignment templates:', error);
    return { data: null, error };
  }
}

/**
 * Get assignment template details
 */
export async function getAssignmentTemplate(templateId) {
  try {
    const { data, error } = await supabase
      .from('assignment_templates')
      .select(`
        *,
        lessons!inner (
          id,
          title,
          modules!inner (
            id,
            title,
            course_id
          )
        )
      `)
      .eq('id', templateId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching assignment template:', error);
    return { data: null, error };
  }
}

/**
 * Create an assignment instance from a template
 */
export async function createAssignmentInstance({
  templateId,
  courseId,
  title,
  description,
  instructions,
  schoolId,
  communityId,
  cohortName,
  startDate,
  dueDate,
  status = 'draft',
  createdBy
}) {
  try {
    const { data, error } = await supabase
      .from('assignment_instances')
      .insert({
        template_id: templateId,
        course_id: courseId,
        title,
        description,
        instructions,
        school_id: schoolId ? parseInt(schoolId) : null,
        community_id: communityId,
        cohort_name: cohortName,
        start_date: startDate,
        due_date: dueDate,
        status,
        created_by: createdBy,
        groups: []
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error creating assignment instance:', error);
    return { data: null, error };
  }
}

/**
 * Get assignment instances for a course
 */
export async function getAssignmentInstances(courseId, filters = {}) {
  try {
    let query = supabase
      .from('assignment_instances')
      .select(`
        *,
        assignment_templates!inner (
          title as template_title,
          assignment_type,
          lessons!inner (
            title as lesson_title,
            modules!inner (
              title as module_title
            )
          )
        ),
        profiles!created_by (
          full_name
        )
      `)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.schoolId) {
      query = query.eq('school_id', filters.schoolId);
    }
    if (filters.communityId) {
      query = query.eq('community_id', filters.communityId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching assignment instances:', error);
    return { data: null, error };
  }
}

/**
 * Get a single assignment instance with full details
 */
export async function getAssignmentInstance(instanceId) {
  try {
    const { data, error } = await supabase
      .from('assignment_instances')
      .select(`
        *,
        assignment_templates!inner (
          *,
          lessons!inner (
            id,
            title,
            modules!inner (
              id,
              title,
              course_id,
              courses!inner (
                id,
                title
              )
            )
          )
        ),
        profiles!created_by (
          id,
          full_name,
          email
        )
      `)
      .eq('id', instanceId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching assignment instance:', error);
    return { data: null, error };
  }
}

/**
 * Update assignment instance
 */
export async function updateAssignmentInstance(instanceId, updates) {
  try {
    const { data, error } = await supabase
      .from('assignment_instances')
      .update(updates)
      .eq('id', instanceId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating assignment instance:', error);
    return { data: null, error };
  }
}

/**
 * Update assignment instance groups
 */
export async function updateAssignmentGroups(instanceId, groups) {
  try {
    const { data, error } = await supabase
      .from('assignment_instances')
      .update({ groups })
      .eq('id', instanceId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating assignment groups:', error);
    return { data: null, error };
  }
}

/**
 * Activate an assignment instance
 */
export async function activateAssignmentInstance(instanceId) {
  return updateAssignmentInstance(instanceId, { status: 'active' });
}

/**
 * Archive an assignment instance
 */
export async function archiveAssignmentInstance(instanceId) {
  return updateAssignmentInstance(instanceId, { status: 'archived' });
}

/**
 * Get enrolled students for group assignment
 */
export async function getEnrolledStudentsForInstance(instanceId) {
  try {
    // First get the course ID from the instance
    const { data: instance, error: instanceError } = await supabase
      .from('assignment_instances')
      .select('course_id')
      .eq('id', instanceId)
      .single();

    if (instanceError) throw instanceError;

    // Get all students enrolled in the course
    // This includes all user roles that participate in growth communities
    const { data, error } = await supabase
      .from('course_enrollments')
      .select(`
        user_id,
        profiles!inner (
          id,
          full_name,
          email,
          role
        )
      `)
      .eq('course_id', instance.course_id);

    if (error) throw error;

    // Transform the data - include all enrolled users regardless of role
    // The consultants/admins will decide who to include in groups
    const students = data?.map(enrollment => ({
      id: enrollment.profiles.id,
      full_name: enrollment.profiles.full_name,
      email: enrollment.profiles.email,
      role: enrollment.profiles.role
    })) || [];

    return { data: students, error: null };
  } catch (error) {
    console.error('Error fetching enrolled students:', error);
    return { data: null, error };
  }
}

/**
 * Get active assignment instances for a student
 */
export async function getStudentAssignmentInstances(userId) {
  try {
    const { data, error } = await supabase
      .from('assignment_instances')
      .select(`
        *,
        assignment_templates!inner (
          title as template_title,
          assignment_type,
          lessons!inner (
            title as lesson_title
          )
        ),
        assignment_submissions!left (
          id,
          status,
          submitted_at,
          grade
        )
      `)
      .eq('status', 'active')
      .eq('assignment_submissions.user_id', userId)
      .order('due_date', { ascending: true });

    if (error) throw error;

    // Process to determine submission status
    const processedData = data?.map(instance => ({
      ...instance,
      submission: instance.assignment_submissions?.[0] || null,
      assignment_submissions: undefined
    }));

    return { data: processedData, error: null };
  } catch (error) {
    console.error('Error fetching student assignments:', error);
    return { data: null, error };
  }
}

/**
 * Check if user is assigned to a group in an instance
 */
export async function getUserGroupInInstance(instanceId, userId) {
  try {
    const { data: instance, error } = await supabase
      .from('assignment_instances')
      .select('groups')
      .eq('id', instanceId)
      .single();

    if (error) throw error;

    // Find the group containing the user
    const userGroup = instance.groups?.find(group => 
      group.members?.some(member => member.id === userId)
    );

    return { data: userGroup || null, error: null };
  } catch (error) {
    console.error('Error checking user group:', error);
    return { data: null, error };
  }
}

/**
 * Submit assignment (individual or group)
 */
export async function submitAssignment({
  instanceId,
  userId,
  groupId = null,
  content = {},
  fileUrl = null,
  submissionType = 'file',
  status = 'submitted'
}) {
  try {
    const submissionData = {
      instance_id: instanceId,
      user_id: userId,
      group_id: groupId,
      content,
      file_url: fileUrl,
      submission_type: submissionType,
      status
    };

    if (status === 'submitted') {
      submissionData.submitted_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('assignment_submissions')
      .upsert(submissionData, {
        onConflict: 'instance_id,user_id,group_id'
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error submitting assignment:', error);
    return { data: null, error };
  }
}

/**
 * Get submissions for an assignment instance
 */
export async function getInstanceSubmissions(instanceId) {
  try {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .select(`
        *,
        profiles!user_id (
          id,
          full_name,
          email
        )
      `)
      .eq('instance_id', instanceId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return { data: null, error };
  }
}

/**
 * Grade a submission
 */
export async function gradeSubmission(submissionId, grade, feedback, gradedBy) {
  try {
    const { data, error } = await supabase
      .from('assignment_submissions')
      .update({
        grade,
        feedback,
        graded_by: gradedBy,
        graded_at: new Date().toISOString(),
        status: 'graded'
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error grading submission:', error);
    return { data: null, error };
  }
}