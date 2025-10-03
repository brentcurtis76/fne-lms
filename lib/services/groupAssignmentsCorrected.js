import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

export const groupAssignmentService = {
  // Get all group assignments for a community (for students/docentes)
  async getGroupAssignments(communityId) {
    const { data, error } = await supabase
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
        ),
        creator:profiles!created_by (
          id,
          name
        )
      `)
      .eq('assignment_for', 'group')
      .eq('assigned_to_community_id', communityId)
      .eq('is_published', true)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Get user's groups for assignments (for students/docentes)
  async getUserGroups(userId, assignmentIds) {
    const { data, error } = await supabase
      .from('group_assignment_members')
      .select(`
        *,
        assignment:lesson_assignments (
          id,
          title
        ),
        user:profiles!user_id (
          id,
          name,
          email,
          avatar_url
        )
      `)
      .eq('user_id', userId)
      .in('assignment_id', assignmentIds);

    if (error) throw error;
    return data || [];
  },

  // Get all groups for an assignment (for consultores to manage)
  async getAssignmentGroups(assignmentId) {
    const { data, error } = await supabase
      .from('group_assignment_members')
      .select(`
        *,
        user:profiles!user_id (
          id,
          name,
          email,
          avatar_url,
          role
        )
      `)
      .eq('assignment_id', assignmentId)
      .order('group_id, joined_at');

    if (error) throw error;

    // Group members by group_id
    const groups = {};
    data?.forEach(member => {
      if (!groups[member.group_id]) {
        groups[member.group_id] = {
          id: member.group_id,
          assignment_id: member.assignment_id,
          members: []
        };
      }
      groups[member.group_id].members.push(member);
    });

    return Object.values(groups);
  },

  // CONSULTOR ONLY: Create groups and assign students
  async createGroupWithMembers(assignmentId, communityId, groupName, memberIds, consultorId) {
    // Verify user is consultor/admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', consultorId)
      .single();

    if (!profile || !['admin', 'consultor'].includes(profile.role)) {
      throw new Error('Solo consultores pueden crear grupos');
    }

    const groupId = crypto.randomUUID();
    
    // Create group members entries
    const members = memberIds.map((userId, index) => ({
      assignment_id: assignmentId,
      community_id: communityId,
      group_id: groupId,
      user_id: userId,
      role: index === 0 ? 'leader' : 'member' // First member is leader
    }));

    const { error } = await supabase
      .from('group_assignment_members')
      .insert(members);

    if (error) throw error;
    return { groupId, members: members.length };
  },

  // CONSULTOR ONLY: Add member to existing group
  async addMemberToGroup(assignmentId, communityId, groupId, userId, consultorId) {
    // Verify user is consultor/admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', consultorId)
      .single();

    if (!profile || !['admin', 'consultor'].includes(profile.role)) {
      throw new Error('Solo consultores pueden gestionar grupos');
    }

    const { data, error } = await supabase
      .from('group_assignment_members')
      .insert({
        assignment_id: assignmentId,
        community_id: communityId,
        group_id: groupId,
        user_id: userId,
        role: 'member'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // CONSULTOR ONLY: Remove member from group
  async removeMemberFromGroup(assignmentId, userId, consultorId) {
    // Verify user is consultor/admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', consultorId)
      .single();

    if (!profile || !['admin', 'consultor'].includes(profile.role)) {
      throw new Error('Solo consultores pueden gestionar grupos');
    }

    const { error } = await supabase
      .from('group_assignment_members')
      .delete()
      .eq('assignment_id', assignmentId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  // Get students not in any group for an assignment (for consultores)
  async getUnassignedStudents(assignmentId, communityId) {
    // Get all students in the community
    const { data: communityMembers } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url')
      .eq('growth_community_id', communityId)
      .in('role', ['docente', 'lider_comunidad', 'lider_generacion', 'equipo_directivo']);

    if (!communityMembers) return [];

    // Get students already in groups
    const { data: assignedMembers } = await supabase
      .from('group_assignment_members')
      .select('user_id')
      .eq('assignment_id', assignmentId);

    const assignedUserIds = assignedMembers?.map(m => m.user_id) || [];
    
    // Filter out assigned students
    return communityMembers.filter(member => !assignedUserIds.includes(member.id));
  },

  // Get group submission (for students and consultores)
  async getGroupSubmission(assignmentId, groupId) {
    const { data, error } = await supabase
      .from('group_assignment_submissions')
      .select(`
        *,
        submitter:profiles!submitted_by (
          id,
          name,
          email
        ),
        grader:profiles!graded_by (
          id,
          name
        )
      `)
      .eq('assignment_id', assignmentId)
      .eq('group_id', groupId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  // STUDENTS ONLY: Submit group work
  async submitGroupWork(assignmentId, groupId, communityId, userId, submissionData) {
    // Verify user is in the group
    const { data: membership } = await supabase
      .from('group_assignment_members')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      throw new Error('No eres miembro de este grupo');
    }

    // Check if submission already exists
    const existing = await this.getGroupSubmission(assignmentId, groupId);
    
    if (existing) {
      // Update existing submission
      const { data, error } = await supabase
        .from('group_assignment_submissions')
        .update({
          ...submissionData,
          submitted_by: userId,
          submitted_at: new Date().toISOString(),
          status: 'submitted'
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Create new submission
      const { data, error } = await supabase
        .from('group_assignment_submissions')
        .insert({
          assignment_id: assignmentId,
          group_id: groupId,
          community_id: communityId,
          submitted_by: userId,
          ...submissionData,
          submitted_at: new Date().toISOString(),
          status: 'submitted'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Get or create discussion thread for a group
  async getOrCreateDiscussion(assignmentId, groupId, workspaceId, userId) {
    // Check if discussion exists
    const { data: existing } = await supabase
      .from('group_assignment_discussions')
      .select('*, thread:message_threads(*)')
      .eq('assignment_id', assignmentId)
      .eq('group_id', groupId)
      .single();

    if (existing) return existing.thread;

    // Get assignment details
    const { data: assignment } = await supabase
      .from('lesson_assignments')
      .select('title')
      .eq('id', assignmentId)
      .single();

    // Create new thread
    const { data: thread, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        workspace_id: workspaceId,
        thread_title: `Discusión: ${assignment?.title || 'Tarea Grupal'}`,
        description: 'Hilo de discusión para coordinar el trabajo grupal',
        category: 'task',
        created_by: userId,
        is_private: true
      })
      .select()
      .single();

    if (threadError) throw threadError;

    // Create discussion link
    const { data: discussion, error: discussionError } = await supabase
      .from('group_assignment_discussions')
      .insert({
        assignment_id: assignmentId,
        group_id: groupId,
        thread_id: thread.id
      })
      .select()
      .single();

    if (discussionError) throw discussionError;

    return thread;
  },

  // CONSULTOR ONLY: Grade group submission
  async gradeGroupSubmission(submissionId, score, feedback, graderId) {
    // Verify user is consultor/admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', graderId)
      .single();

    if (!profile || !['admin', 'consultor'].includes(profile.role)) {
      throw new Error('Solo consultores pueden calificar');
    }

    const { data, error } = await supabase
      .from('group_assignment_submissions')
      .update({
        score,
        feedback,
        graded_by: graderId,
        graded_at: new Date().toISOString(),
        status: 'graded'
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};