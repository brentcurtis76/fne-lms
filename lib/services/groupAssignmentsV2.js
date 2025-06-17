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
        .from('user_profiles')
        .select('community_id')
        .eq('user_id', userId)
        .single();

      if (profileError) throw profileError;

      if (!profile?.community_id) {
        return { assignments: [], error: null };
      }

      // Get all courses assigned to the user's community
      const { data: courseAssignments, error: courseError } = await supabase
        .from('course_community_assignments')
        .select('course_id')
        .eq('community_id', profile.community_id);

      if (courseError) throw courseError;

      if (!courseAssignments || courseAssignments.length === 0) {
        return { assignments: [], error: null };
      }

      const courseIds = courseAssignments.map(ca => ca.course_id);

      // Get all lessons from assigned courses
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select(`
          id,
          title,
          order_index,
          content,
          course:courses!inner(
            id,
            title,
            description
          )
        `)
        .in('course_id', courseIds)
        .order('course_id', { ascending: true })
        .order('order_index', { ascending: true });

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
                community_id: profile.community_id,
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
        .from('user_profiles')
        .select('community_id')
        .eq('user_id', userId)
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
        .select(`
          *,
          user:user_profiles!inner(
            user_id,
            full_name,
            email,
            avatar_url
          )
        `)
        .eq('group_id', groupId);

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
}

export const groupAssignmentsV2Service = new GroupAssignmentsV2Service();