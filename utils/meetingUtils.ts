/**
 * Meeting System Utilities for FNE LMS
 * Integrates with existing workspace access control and provides meeting management functions
 */

import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { 
  CommunityMeeting, 
  MeetingWithDetails, 
  MeetingInput, 
  MeetingDocumentationInput,
  MeetingTask,
  MeetingCommitment,
  MeetingAgreement,
  OverdueItem,
  MeetingStats,
  MeetingFilters,
  MeetingSortOptions,
  AssignmentUser,
  TaskStatus,
  MeetingStatus
} from '../types/meetings';
import { logWorkspaceActivity } from './workspaceUtils';

/**
 * Get meetings for a workspace with filtering and sorting
 */
export async function getMeetings(
  workspaceId: string,
  filters: Partial<MeetingFilters> = {},
  sort: MeetingSortOptions = { field: 'meeting_date', direction: 'desc' }
): Promise<CommunityMeeting[]> {
  try {
    let query = supabase
      .from('community_meetings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters.dateRange?.start) {
      query = query.gte('meeting_date', filters.dateRange.start);
    }

    if (filters.dateRange?.end) {
      query = query.lte('meeting_date', filters.dateRange.end);
    }

    if (filters.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    // Apply sorting
    query = query.order(sort.field, { ascending: sort.direction === 'asc' });

    const { data, error } = await query;

    if (error) {
      // Gracefully handle missing tables - try simple_meetings table
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        console.warn('Meetings table not found - trying simple_meetings table');
        
        // Try to fetch from simple_meetings table
        let simpleQuery = supabase
          .from('simple_meetings')
          .select('*')
          .eq('workspace_id', workspaceId);
          
        // Apply filters to simple meetings
        if (filters.status && filters.status.length > 0) {
          simpleQuery = simpleQuery.in('status', filters.status);
        }
        if (filters.dateRange?.start) {
          simpleQuery = simpleQuery.gte('meeting_date', filters.dateRange.start);
        }
        if (filters.dateRange?.end) {
          simpleQuery = simpleQuery.lte('meeting_date', filters.dateRange.end);
        }
        if (filters.search) {
          simpleQuery = simpleQuery.or(`title.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
        }
        
        simpleQuery = simpleQuery.order(sort.field, { ascending: sort.direction === 'asc' });
        
        const { data: simpleData, error: simpleError } = await simpleQuery;
        
        if (simpleError) {
          console.error('Error fetching simple meetings:', simpleError);
          return [];
        }
        
        // Transform simple meetings to match CommunityMeeting interface
        return (simpleData || []).map(meeting => ({
          ...meeting,
          description: meeting.notes,
          is_active: true
        })) as CommunityMeeting[];
      } else {
        console.error('Error fetching meetings:', error);
      }
      return [];
    }

    return data || [];

  } catch (error) {
    console.error('Error in getMeetings:', error);
    return [];
  }
}

/**
 * Get a single meeting with all details
 */
export async function getMeetingWithDetails(meetingId: string): Promise<MeetingWithDetails | null> {
  try {
    // Get meeting basic info
    const { data: meeting, error: meetingError } = await supabase
      .from('community_meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      // Gracefully handle missing tables - try simple_meetings
      if (meetingError?.code === '42P01' || meetingError?.message?.includes('does not exist')) {
        console.warn('Meetings table not found - trying simple_meetings');
        
        // Try to fetch from simple_meetings table
        const { data: simpleMeeting, error: simpleError } = await supabase
          .from('simple_meetings')
          .select('*')
          .eq('id', meetingId)
          .single();
          
        if (simpleError || !simpleMeeting) {
          console.error('Error fetching simple meeting:', simpleError);
          return null;
        }
        
        // Transform simple meeting to MeetingWithDetails
        const meetingData = simpleMeeting.meeting_data || {};
        return {
          ...simpleMeeting,
          description: simpleMeeting.notes,
          is_active: true,
          agreements: meetingData.agreements || [],
          commitments: meetingData.commitments || [],
          tasks: meetingData.tasks || [],
          attendees: (meetingData.attendees || []).map((userId: string) => ({
            id: `attendee-${userId}`,
            meeting_id: simpleMeeting.id,
            user_id: userId,
            attendance_status: 'attended',
            role: 'participant'
          }))
        } as MeetingWithDetails;
      } else {
        console.error('Error fetching meeting:', meetingError);
      }
      return null;
    }

    // Get agreements
    const { data: agreements, error: agreementsError } = await supabase
      .from('meeting_agreements')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('order_index');

    // Get commitments
    const { data: commitments, error: commitmentsError } = await supabase
      .from('meeting_commitments')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('due_date');

    // Get tasks
    const { data: tasks, error: tasksError } = await supabase
      .from('meeting_tasks')
      .select('*')
      .eq('meeting_id', meetingId)
      .order('priority', { ascending: false })
      .order('due_date');

    // Get attendees
    const { data: attendees, error: attendeesError } = await supabase
      .from('meeting_attendees')
      .select('*')
      .eq('meeting_id', meetingId);

    if (agreementsError || commitmentsError || tasksError || attendeesError) {
      // Gracefully handle missing tables - meetings system not fully implemented
      const errors = [agreementsError, commitmentsError, tasksError, attendeesError].filter(Boolean);
      const missingTableErrors = errors.filter(err => err?.code === '42P01' || err?.message?.includes('does not exist'));
      
      if (missingTableErrors.length > 0) {
        console.warn('Meeting detail tables not found - feature not yet implemented');
      } else {
        console.error('Error fetching meeting details:', {
          agreementsError,
          commitmentsError,
          tasksError,
          attendeesError
        });
      }
    }

    return {
      ...meeting,
      agreements: agreements || [],
      commitments: commitments || [],
      tasks: tasks || [],
      attendees: attendees || []
    };

  } catch (error) {
    console.error('Error in getMeetingWithDetails:', error);
    return null;
  }
}

/**
 * Create a new meeting with documentation
 */
export async function createMeetingWithDocumentation(
  workspaceId: string,
  userId: string,
  documentation: MeetingDocumentationInput
): Promise<{ success: boolean; meetingId?: string; error?: string }> {
  try {
    // Start transaction
    const { data: meeting, error: meetingError } = await supabase
      .from('community_meetings')
      .insert({
        workspace_id: workspaceId,
        title: documentation.meeting_info.title,
        meeting_date: documentation.meeting_info.meeting_date,
        duration_minutes: documentation.meeting_info.duration_minutes,
        location: documentation.meeting_info.location,
        facilitator_id: documentation.meeting_info.facilitator_id,
        secretary_id: documentation.meeting_info.secretary_id,
        summary: documentation.summary_info.summary,
        notes: documentation.summary_info.notes,
        status: documentation.summary_info.status,
        created_by: userId
      })
      .select('id')
      .single();

    if (meetingError || !meeting) {
      console.error('Error creating meeting:', meetingError);
      
      // Check if it's a missing table error
      if (meetingError?.code === '42P01' || meetingError?.message?.includes('does not exist')) {
        // Try to create a simplified meeting record in a basic table
        console.warn('Meeting tables not found - trying simple_meetings table');
        
        // Create a simplified meeting in the simple_meetings table as a fallback
        const { data: simpleMeeting, error: simpleError } = await supabase
          .from('simple_meetings')
          .insert({
            workspace_id: workspaceId,
            title: documentation.meeting_info.title,
            meeting_date: documentation.meeting_info.meeting_date,
            duration_minutes: documentation.meeting_info.duration_minutes,
            location: documentation.meeting_info.location,
            facilitator_id: documentation.meeting_info.facilitator_id,
            secretary_id: documentation.meeting_info.secretary_id,
            summary: documentation.summary_info.summary,
            notes: documentation.summary_info.notes,
            status: documentation.summary_info.status,
            created_by: userId,
            meeting_data: {
              agreements: documentation.agreements,
              commitments: documentation.commitments,
              tasks: documentation.tasks,
              attendees: documentation.meeting_info.attendee_ids
            }
          })
          .select('id')
          .single();
          
        if (simpleError) {
          console.error('Error creating simple meeting:', simpleError);
          return { 
            success: false, 
            error: 'Las tablas de reuniones no están configuradas. Por favor, ejecute el script SQL: database/simple-meetings.sql en Supabase.' 
          };
        }
        
        if (simpleMeeting) {
          toast.success('Reunión guardada exitosamente.');
          return { success: true, meetingId: simpleMeeting.id };
        }
      }
      
      return { success: false, error: meetingError?.message || 'Error al crear la reunión' };
    }

    const meetingId = meeting.id;

    // Create agreements
    if (documentation.agreements.length > 0) {
      const agreementsToInsert = documentation.agreements.map((agreement, index) => ({
        meeting_id: meetingId,
        agreement_text: agreement.agreement_text,
        category: agreement.category,
        order_index: index
      }));

      const { error: agreementsError } = await supabase
        .from('meeting_agreements')
        .insert(agreementsToInsert);

      if (agreementsError) {
        console.error('Error creating agreements:', agreementsError);
      }
    }

    // Create commitments
    if (documentation.commitments.length > 0) {
      const commitmentsToInsert = documentation.commitments.map(commitment => ({
        meeting_id: meetingId,
        commitment_text: commitment.commitment_text,
        assigned_to: commitment.assigned_to,
        due_date: commitment.due_date
      }));

      const { error: commitmentsError } = await supabase
        .from('meeting_commitments')
        .insert(commitmentsToInsert);

      if (commitmentsError) {
        console.error('Error creating commitments:', commitmentsError);
      }
    }

    // Create tasks
    if (documentation.tasks.length > 0) {
      const tasksToInsert = documentation.tasks.map(task => ({
        meeting_id: meetingId,
        task_title: task.task_title,
        task_description: task.task_description,
        assigned_to: task.assigned_to,
        due_date: task.due_date,
        priority: task.priority,
        category: task.category,
        estimated_hours: task.estimated_hours
      }));

      const { error: tasksError } = await supabase
        .from('meeting_tasks')
        .insert(tasksToInsert);

      if (tasksError) {
        console.error('Error creating tasks:', tasksError);
      }
    }

    // Create attendees
    if (documentation.meeting_info.attendee_ids.length > 0) {
      const attendeesToInsert = documentation.meeting_info.attendee_ids.map(attendeeId => ({
        meeting_id: meetingId,
        user_id: attendeeId,
        attendance_status: 'invited' as const,
        role: 'participant' as const
      }));

      const { error: attendeesError } = await supabase
        .from('meeting_attendees')
        .insert(attendeesToInsert);

      if (attendeesError) {
        console.error('Error creating attendees:', attendeesError);
      }
    }

    // Log activity
    await logWorkspaceActivity(
      workspaceId,
      userId,
      'meeting_created',
      { 
        meeting_id: meetingId,
        title: documentation.meeting_info.title,
        agreements_count: documentation.agreements.length,
        commitments_count: documentation.commitments.length,
        tasks_count: documentation.tasks.length
      }
    );

    return { success: true, meetingId };

  } catch (error) {
    console.error('Error in createMeetingWithDocumentation:', error);
    return { success: false, error: 'Error inesperado al crear la reunión' };
  }
}

/**
 * Update task or commitment status
 */
export async function updateTaskStatus(
  itemType: 'task' | 'commitment',
  itemId: string,
  status: TaskStatus,
  progressPercentage: number = 0,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tableName = itemType === 'task' ? 'meeting_tasks' : 'meeting_commitments';
    const updateData: any = {
      status,
      progress_percentage: progressPercentage,
      updated_at: new Date().toISOString()
    };

    if (notes) {
      updateData.notes = notes;
    }

    if (status === 'completado') {
      updateData.completed_at = new Date().toISOString();
      updateData.progress_percentage = 100;
    }

    const { error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', itemId);

    if (error) {
      console.error(`Error updating ${itemType} status:`, error);
      return { success: false, error: `Error al actualizar ${itemType === 'task' ? 'tarea' : 'compromiso'}` };
    }

    return { success: true };

  } catch (error) {
    console.error(`Error in updateTaskStatus for ${itemType}:`, error);
    return { success: false, error: 'Error inesperado al actualizar estado' };
  }
}

/**
 * Get community members for task assignment
 */
export async function getCommunityMembersForAssignment(communityId: string): Promise<AssignmentUser[]> {
  try {
    const { data: members, error } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .eq('community_id', communityId)
      .eq('is_active', true);

    if (error) {
      // Gracefully handle missing tables
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('User roles table not found - feature not yet implemented');
      } else {
        console.error('Error fetching community members:', error);
      }
      return [];
    }

    return members?.map(member => ({
      id: member.user_id,
      first_name: 'Usuario',
      last_name: '',
      email: '',
      avatar_url: null,
      role_type: member.role_type
    })) || [];

  } catch (error) {
    console.error('Error in getCommunityMembersForAssignment:', error);
    return [];
  }
}

/**
 * Get overdue items for a user or workspace
 */
export async function getOverdueItems(
  workspaceId?: string,
  userId?: string
): Promise<OverdueItem[]> {
  try {
    const { data, error } = await supabase
      .rpc('get_overdue_items', {
        p_workspace_id: workspaceId,
        p_user_id: userId
      });

    if (error) {
      console.error('Error fetching overdue items:', error);
      return [];
    }

    return data || [];

  } catch (error) {
    console.error('Error in getOverdueItems:', error);
    return [];
  }
}

/**
 * Get meeting statistics for a workspace
 */
export async function getMeetingStats(workspaceId: string): Promise<MeetingStats | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_meeting_stats', {
        p_workspace_id: workspaceId
      });

    if (error) {
      console.error('Error fetching meeting stats:', error);
      return null;
    }

    return data?.[0] || null;

  } catch (error) {
    console.error('Error in getMeetingStats:', error);
    return null;
  }
}

/**
 * Get user's tasks and commitments
 */
export async function getUserTasksAndCommitments(
  userId: string,
  workspaceId?: string
): Promise<{
  tasks: MeetingTask[];
  commitments: MeetingCommitment[];
}> {
  try {
    // Build tasks query
    let tasksQuery = supabase
      .from('meeting_tasks')
      .select(`
        *,
        meeting:community_meetings(
          id,
          title,
          meeting_date,
          workspace_id
        )
      `)
      .eq('assigned_to', userId);

    // Build commitments query
    let commitmentsQuery = supabase
      .from('meeting_commitments')
      .select(`
        *,
        meeting:community_meetings(
          id,
          title,
          meeting_date,
          workspace_id
        )
      `)
      .eq('assigned_to', userId);

    // Filter by workspace if provided
    if (workspaceId) {
      tasksQuery = tasksQuery.eq('meeting.workspace_id', workspaceId);
      commitmentsQuery = commitmentsQuery.eq('meeting.workspace_id', workspaceId);
    }

    const [tasksResult, commitmentsResult] = await Promise.all([
      tasksQuery.order('due_date'),
      commitmentsQuery.order('due_date')
    ]);

    if (tasksResult.error) {
      console.error('Error fetching user tasks:', tasksResult.error);
    }

    if (commitmentsResult.error) {
      console.error('Error fetching user commitments:', commitmentsResult.error);
    }

    return {
      tasks: tasksResult.data || [],
      commitments: commitmentsResult.data || []
    };

  } catch (error) {
    console.error('Error in getUserTasksAndCommitments:', error);
    return {
      tasks: [],
      commitments: []
    };
  }
}

/**
 * Check if user can manage meetings in workspace
 */
export async function canUserManageMeetings(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('community_workspaces')
      .select('community_id')
      .eq('id', workspaceId)
      .single();

    if (error || !data) {
      // Gracefully handle missing tables or workspace not found
      if (error?.code === '42P01' || error?.message?.includes('does not exist')) {
        console.warn('Workspace table not found - feature not yet implemented');
      } else if (error) {
        console.error('Error checking user permissions:', error);
      }
      return false;
    }

    // Check if user has appropriate role (simplified for now)
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (rolesError) {
      // Gracefully handle missing tables
      if (rolesError?.code === '42P01' || rolesError?.message?.includes('does not exist')) {
        console.warn('User roles table not found - feature not yet implemented');
      } else {
        console.error('Error checking user roles:', rolesError);
      }
      return false;
    }

    return userRoles && userRoles.length > 0;

  } catch (error) {
    console.error('Error in canUserManageMeetings:', error);
    return false;
  }
}

/**
 * Send email notifications for new task assignments
 */
export async function sendTaskAssignmentNotifications(
  meetingId: string,
  assignedUserIds: string[]
): Promise<void> {
  try {
    // Get meeting details
    const meeting = await getMeetingWithDetails(meetingId);
    if (!meeting) return;

    // Get assigned users' email addresses
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .in('id', assignedUserIds);

    if (error || !users) {
      console.error('Error fetching user emails:', error);
      return;
    }

    // Send notifications (integrate with existing email infrastructure)
    for (const user of users) {
      try {
        const { error: emailError } = await supabase.functions.invoke('send-email', {
          body: {
            to: user.email,
            subject: `Nueva asignación de reunión: ${meeting.title}`,
            html: `
              <h2>Nueva asignación de reunión</h2>
              <p>Hola ${user.first_name},</p>
              <p>Se te han asignado nuevas tareas o compromisos en la reunión "<strong>${meeting.title}</strong>".</p>
              <p><strong>Fecha de reunión:</strong> ${new Date(meeting.meeting_date).toLocaleDateString('es-CL')}</p>
              <p>Por favor, revisa los detalles en el espacio colaborativo de tu comunidad.</p>
              <p>Saludos,<br>Equipo FNE</p>
            `
          }
        });

        if (emailError) {
          console.error('Error sending email to', user.email, emailError);
        }
      } catch (emailError) {
        console.error('Error sending notification email:', emailError);
      }
    }

  } catch (error) {
    console.error('Error in sendTaskAssignmentNotifications:', error);
  }
}

/**
 * Update overdue statuses (utility function to be called periodically)
 */
export async function updateOverdueStatuses(): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_overdue_status');
    
    if (error) {
      console.error('Error updating overdue statuses:', error);
    }

  } catch (error) {
    console.error('Error in updateOverdueStatuses:', error);
  }
}

/**
 * Format date for display
 */
export function formatMeetingDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Calculate days until due date
 */
export function getDaysUntilDue(dueDateString: string): number {
  const dueDate = new Date(dueDateString);
  const today = new Date();
  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if date is overdue
 */
export function isOverdue(dueDateString: string): boolean {
  return getDaysUntilDue(dueDateString) < 0;
}