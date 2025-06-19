import { supabase } from '../supabase';

class GroupAssignmentsV2Service {
  /**
   * Get all group assignments for a user's enrolled courses
   * This fetches group assignment blocks directly from lessons in assigned courses
   */
  async getGroupAssignmentsForUser(userId) {
    try {
      // First get the user's profile to determine their community
      const { data: profile, error: profileError } = await supabase
        .from('user_roles')
        .select('community_id')
        .eq('id', userId)
        .single();

      if (profileError) {
        // Try getting from profiles table instead
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
      }

      // Get all courses through different methods:
      // 1. Direct course assignments (if exists)
      // 2. Through consultant assignments to the user
      // 3. For testing: get all courses (remove this in production)
      
      let courseIds = [];
      
      // Method 1: Check for direct course assignments (teacher assignments)
      const { data: courseAssignments } = await supabase
        .from('course_assignments')
        .select('course_id')
        .eq('teacher_id', userId);
      
      if (courseAssignments && courseAssignments.length > 0) {
        courseIds = courseAssignments.map(ca => ca.course_id);
      }
      
      // Method 2: Check consultant assignments
      if (courseIds.length === 0) {
        const { data: studentAssignments } = await supabase
          .from('consultant_assignments')
          .select('consultant_id')
          .eq('student_id', userId)
          .eq('is_active', true);
        
        // If user has consultant assignments, they might have access to courses
        // For now, we'll need to implement proper course access logic
      }
      
      // Method 3: For testing - get all courses (REMOVE IN PRODUCTION)
      if (courseIds.length === 0) {
        const { data: allCourses } = await supabase
          .from('courses')
          .select('id')
          .limit(10);
        
        if (allCourses && allCourses.length > 0) {
          courseIds = allCourses.map(c => c.id);
        }
      }
      
      if (courseIds.length === 0) {
        return { assignments: [], error: null };
      }

      // Get all lessons from assigned courses
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_number,
          content,
          created_at,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .in('course_id', courseIds)
        .order('course_id', { ascending: true })
        .order('order_number', { ascending: true });

      if (lessonsError) throw lessonsError;

      // Extract group assignment blocks from lesson content
      const groupAssignments = [];
      
      lessons?.forEach(lesson => {
        if (lesson.content?.blocks) {
          lesson.content.blocks.forEach((block, blockIndex) => {
            if (block.type === 'group-assignment' || block.type === 'group_assignment') {
              groupAssignments.push({
                id: `${lesson.id}_block_${blockIndex}`,
                lesson_id: lesson.id,
                lesson_title: lesson.title,
                course_id: lesson.course.id,
                course_title: lesson.course.title,
                block_index: blockIndex,
                title: block.payload?.title || 'Tarea Grupal Sin Título',
                description: block.payload?.description || '',
                instructions: block.payload?.instructions || '',
                resources: block.payload?.resources || [],
                community_id: profile?.community_id || null,
                created_at: lesson.created_at
              });
            }
          });
        }
      });

      // Get existing submissions for these assignments
      const assignmentIds = groupAssignments.map(a => a.id);
      const { data: submissions } = await supabase
        .from('group_assignment_submissions')
        .select('assignment_id, status, grade')
        .eq('user_id', userId)
        .in('assignment_id', assignmentIds);

      // Merge submission data with assignments
      const assignmentsWithStatus = groupAssignments.map(assignment => {
        const submission = submissions?.find(s => s.assignment_id === assignment.id);
        return {
          ...assignment,
          status: submission?.status || 'pending',
          grade: submission?.grade || null
        };
      });
      
      return { assignments: assignmentsWithStatus, error: null };
    } catch (error) {
      console.error('Error fetching group assignments:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      return { assignments: [], error };
    }
  }

  /**
   * Get a specific group assignment by ID
   */
  async getGroupAssignment(assignmentId) {
    try {
      // Parse the assignment ID to get lesson ID and block index
      const [lessonId, , blockIndex] = assignmentId.split('_');
      
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          content,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .eq('id', lessonId)
        .single();

      if (lessonError) throw lessonError;

      const block = lesson.content?.blocks?.[parseInt(blockIndex)];
      if (!block || (block.type !== 'group-assignment' && block.type !== 'group_assignment')) {
        throw new Error('Group assignment block not found');
      }

      return {
        assignment: {
          id: assignmentId,
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          course_id: lesson.course.id,
          course_title: lesson.course.title,
          block_index: parseInt(blockIndex),
          title: block.payload?.title || 'Tarea Grupal Sin Título',
          description: block.payload?.description || '',
          instructions: block.payload?.instructions || '',
          created_at: lesson.created_at
        },
        error: null
      };
    } catch (error) {
      console.error('Error fetching group assignment:', error);
      return { assignment: null, error };
    }
  }

  /**
   * Get or create a group for an assignment
   */
  async getOrCreateGroup(assignmentId, userId) {
    try {
      // First check if user already belongs to a group for this assignment
      const { data: existingMember } = await supabase
        .from('group_assignment_members')
        .select(`
          group_id,
          group:group_assignment_groups!inner(*)
        `)
        .eq('assignment_id', assignmentId)
        .eq('user_id', userId)
        .single();

      if (existingMember?.group) {
        return { group: existingMember.group, error: null };
      }

      // Get user's community
      const { data: profile } = await supabase
        .from('user_roles')
        .select('community_id')
        .eq('id', userId)
        .single();

      if (!profile?.community_id) {
        throw new Error('User community not found');
      }

      // Create a new group
      const { data: newGroup, error: groupError } = await supabase
        .from('group_assignment_groups')
        .insert({
          assignment_id: assignmentId,
          community_id: profile.community_id,
          name: `Grupo ${Date.now()}`
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // Add user as member
      const { error: memberError } = await supabase
        .from('group_assignment_members')
        .insert({
          group_id: newGroup.id,
          assignment_id: assignmentId,
          user_id: userId,
          role: 'member'
        });

      if (memberError) throw memberError;

      return { group: newGroup, error: null };
    } catch (error) {
      console.error('Error getting/creating group:', error);
      return { group: null, error };
    }
  }

  /**
   * Get group members for an assignment
   */
  async getGroupMembers(groupId) {
    try {
      const { data: members, error } = await supabase
        .from('group_assignment_members')
        .select('*')
        .eq('group_id', groupId);
      
      // Get user details separately to avoid join errors
      if (members && members.length > 0) {
        const userIds = members.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);
        
        // Merge profile data with members
        if (profiles) {
          members.forEach(member => {
            const profile = profiles.find(p => p.id === member.user_id);
            if (profile) {
              member.profile = profile;
            }
          });
        }
      }

      if (error) throw error;

      return { members: members || [], error: null };
    } catch (error) {
      console.error('Error fetching group members:', error);
      return { members: [], error };
    }
  }

  /**
   * Submit group assignment
   */
  async submitGroupAssignment(assignmentId, groupId, submissionData) {
    try {
      // Get all group members
      const { data: members } = await supabase
        .from('group_assignment_members')
        .select('user_id')
        .eq('group_id', groupId);

      if (!members || members.length === 0) {
        throw new Error('No group members found');
      }

      // Create submission records for all group members
      const submissions = members.map(member => ({
        assignment_id: assignmentId,
        group_id: groupId,
        user_id: member.user_id,
        content: submissionData.content || '',
        file_url: submissionData.file_url || null,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }));

      const { error: submissionError } = await supabase
        .from('group_assignment_submissions')
        .upsert(submissions, {
          onConflict: 'assignment_id,user_id'
        });

      if (submissionError) throw submissionError;

      // Notify consultants assigned to the community
      await this.notifyConsultants(assignmentId, groupId);

      return { success: true, error: null };
    } catch (error) {
      console.error('Error submitting group assignment:', error);
      return { success: false, error };
    }
  }

  /**
   * Notify consultants about assignment submission
   */
  async notifyConsultants(assignmentId, groupId) {
    try {
      // Get assignment details
      const { assignment } = await this.getGroupAssignment(assignmentId);
      if (!assignment) return;

      // Get group details
      const { data: group } = await supabase
        .from('group_assignment_groups')
        .select('community_id, name')
        .eq('id', groupId)
        .single();

      if (!group) return;

      // Get consultants assigned to this community
      const { data: consultantAssignments } = await supabase
        .from('consultant_assignments')
        .select('consultant_id')
        .eq('assigned_entity_id', group.community_id)
        .eq('assigned_entity_type', 'community');

      if (!consultantAssignments || consultantAssignments.length === 0) return;

      // Create notifications for each consultant
      const notifications = consultantAssignments.map(ca => ({
        user_id: ca.consultant_id,
        type: 'group_assignment_submitted',
        title: 'Nueva tarea grupal entregada',
        message: `El ${group.name} ha entregado la tarea "${assignment.title}" del curso ${assignment.course_title}`,
        data: {
          assignment_id: assignmentId,
          group_id: groupId,
          course_id: assignment.course_id
        }
      }));

      await supabase
        .from('notifications')
        .insert(notifications);

    } catch (error) {
      console.error('Error notifying consultants:', error);
    }
  }

  /**
   * Get submission status for a user and assignment
   */
  async getSubmissionStatus(assignmentId, userId) {
    try {
      const { data: submission, error } = await supabase
        .from('group_assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return { submission, error: null };
    } catch (error) {
      console.error('Error fetching submission status:', error);
      return { submission: null, error };
    }
  }

  /**
   * Get group assignments for students that a consultant is monitoring
   * This allows consultants to see assignments their students are working on
   */
  async getGroupAssignmentsForConsultant(consultantId) {
    try {
      // First check if user is a consultant
      const { data: consultantProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', consultantId)
        .single();

      if (!consultantProfile || consultantProfile.role !== 'consultor') {
        return { assignments: [], students: [], error: null };
      }

      // Get all students assigned to this consultant
      const { data: studentAssignments, error: assignmentError } = await supabase
        .from('consultant_assignments')
        .select(`
          student_id,
          assignment_type,
          community_id,
          school_id,
          generation_id,
          profiles!consultant_assignments_student_id_fkey(
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('consultant_id', consultantId)
        .eq('is_active', true);

      if (assignmentError) throw assignmentError;

      if (!studentAssignments || studentAssignments.length === 0) {
        return { assignments: [], students: [], error: null };
      }

      // Get unique student IDs
      const studentIds = [...new Set(studentAssignments.map(sa => sa.student_id))];
      
      // Get all course assignments for these students
      const { data: courseAssignments } = await supabase
        .from('course_assignments')
        .select('course_id, teacher_id')
        .in('teacher_id', studentIds);

      if (!courseAssignments || courseAssignments.length === 0) {
        return { assignments: [], students: studentAssignments, error: null };
      }

      // Get unique course IDs
      const courseIds = [...new Set(courseAssignments.map(ca => ca.course_id))];

      // Get all lessons from these courses
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_number,
          content,
          created_at,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .in('course_id', courseIds)
        .order('course_id', { ascending: true })
        .order('order_number', { ascending: true });

      if (lessonsError) throw lessonsError;

      // Extract group assignment blocks
      const groupAssignments = [];
      
      lessons?.forEach(lesson => {
        if (lesson.content?.blocks) {
          lesson.content.blocks.forEach((block, blockIndex) => {
            if (block.type === 'group-assignment' || block.type === 'group_assignment') {
              // For each assignment, track which students have access
              const studentsWithAccess = courseAssignments
                .filter(ca => ca.course_id === lesson.course.id)
                .map(ca => {
                  const studentInfo = studentAssignments.find(sa => sa.student_id === ca.teacher_id);
                  return studentInfo?.profiles;
                })
                .filter(Boolean);

              groupAssignments.push({
                id: `${lesson.id}_block_${blockIndex}`,
                lesson_id: lesson.id,
                lesson_title: lesson.title,
                course_id: lesson.course.id,
                course_title: lesson.course.title,
                block_index: blockIndex,
                title: block.payload?.title || 'Tarea Grupal Sin Título',
                description: block.payload?.description || '',
                instructions: block.payload?.instructions || '',
                resources: block.payload?.resources || [],
                created_at: lesson.created_at,
                students_with_access: studentsWithAccess
              });
            }
          });
        }
      });

      // Get submission status for all assignments and students
      const assignmentIds = groupAssignments.map(a => a.id);
      const { data: submissions } = await supabase
        .from('group_assignment_submissions')
        .select(`
          assignment_id, 
          user_id, 
          status, 
          grade, 
          submitted_at,
          group_id
        `)
        .in('assignment_id', assignmentIds)
        .in('user_id', studentIds);

      // Add submission data to assignments
      const assignmentsWithSubmissions = groupAssignments.map(assignment => {
        const assignmentSubmissions = submissions?.filter(s => s.assignment_id === assignment.id) || [];
        
        // Group submissions by group_id
        const groupedSubmissions = {};
        assignmentSubmissions.forEach(submission => {
          if (!groupedSubmissions[submission.group_id]) {
            groupedSubmissions[submission.group_id] = [];
          }
          groupedSubmissions[submission.group_id].push(submission);
        });

        return {
          ...assignment,
          submissions: assignmentSubmissions,
          groups_count: Object.keys(groupedSubmissions).length,
          submitted_count: assignmentSubmissions.filter(s => s.status === 'submitted' || s.status === 'graded').length,
          students_count: assignment.students_with_access.length
        };
      });

      return { 
        assignments: assignmentsWithSubmissions, 
        students: studentAssignments,
        error: null 
      };
    } catch (error) {
      console.error('Error fetching consultant assignments:', error);
      return { assignments: [], students: [], error };
    }
  }
}

export const groupAssignmentsV2Service = new GroupAssignmentsV2Service();