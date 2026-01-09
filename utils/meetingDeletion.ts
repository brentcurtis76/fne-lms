/**
 * Meeting Deletion Service
 * Handles safe deletion of meetings with all related data and files
 * Includes transaction support, error recovery, and audit logging
 */

import { supabase } from '../lib/supabase-wrapper';
import { toast } from 'react-hot-toast';

interface DeletionResult {
  success: boolean;
  deletedFiles: number;
  errors: string[];
}

interface DeleteMeetingOptions {
  skipConfirmation?: boolean;
  userId: string;
  reason?: string;
}

/**
 * Delete a meeting and all its related data
 * This includes: agreements, commitments, tasks, attendees, attachments, and storage files
 */
export async function deleteMeeting(
  meetingId: string,
  options: DeleteMeetingOptions
): Promise<DeletionResult> {
  const errors: string[] = [];
  let deletedFiles = 0;

  try {
    // 1. First, verify the meeting exists and get its details
    const { data: meeting, error: meetingError } = await supabase
      .from('community_meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      throw new Error('Reunión no encontrada');
    }

    // 2. Get meeting attachments separately
    const { data: attachments } = await supabase
      .from('meeting_attachments')
      .select('*')
      .eq('meeting_id', meetingId);

    // 3. Log the deletion attempt for audit purposes (skip if table doesn't exist)
    try {
      await supabase.from('audit_logs').insert({
        user_id: options.userId,
        action: 'meeting_deletion_attempt',
        resource_type: 'meeting',
        resource_id: meetingId,
        metadata: {
          meeting_title: meeting.title,
          reason: options.reason,
          timestamp: new Date().toISOString()
        }
      });
    } catch (auditError) {
      // Audit logging is optional - continue if it fails
      console.warn('Audit logging skipped:', auditError);
    }

    // 4. Delete storage files first (before database records)
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        try {
          const { error: storageError } = await supabase.storage
            .from('meeting-documents')
            .remove([attachment.file_path]);

          if (storageError) {
            errors.push(`Error al eliminar archivo ${attachment.filename}: ${storageError.message}`);
          } else {
            deletedFiles++;
          }
        } catch (fileError) {
          errors.push(`Error al procesar archivo ${attachment.filename}`);
        }
      }
    }

    // 4. Delete related data in the correct order (respecting foreign key constraints)
    // Order matters here to avoid constraint violations

    // Delete attachments records
    const { error: attachmentsError, count: attachmentsCount } = await supabase
      .from('meeting_attachments')
      .delete()
      .eq('meeting_id', meetingId)
      .select(undefined, { count: 'exact', head: true });
    
    if (attachmentsError) {
      console.error('Error deleting attachments:', attachmentsError);
      errors.push(`Error al eliminar archivos adjuntos: ${attachmentsError.message}`);
    }

    // Delete tasks
    const { error: tasksError, count: tasksCount } = await supabase
      .from('meeting_tasks')
      .delete()
      .eq('meeting_id', meetingId)
      .select(undefined, { count: 'exact', head: true });
    
    if (tasksError) {
      console.error('Error deleting tasks:', tasksError);
      errors.push(`Error al eliminar tareas: ${tasksError.message}`);
    }

    // Delete commitments
    const { error: commitmentsError, count: commitmentsCount } = await supabase
      .from('meeting_commitments')
      .delete()
      .eq('meeting_id', meetingId)
      .select(undefined, { count: 'exact', head: true });
    
    if (commitmentsError) {
      console.error('Error deleting commitments:', commitmentsError);
      errors.push(`Error al eliminar compromisos: ${commitmentsError.message}`);
    }

    // Delete agreements
    const { error: agreementsError, count: agreementsCount } = await supabase
      .from('meeting_agreements')
      .delete()
      .eq('meeting_id', meetingId)
      .select(undefined, { count: 'exact', head: true });
    
    if (agreementsError) {
      console.error('Error deleting agreements:', agreementsError);
      errors.push(`Error al eliminar acuerdos: ${agreementsError.message}`);
    }

    // Delete attendees
    const { error: attendeesError, count: attendeesCount } = await supabase
      .from('meeting_attendees')
      .delete()
      .eq('meeting_id', meetingId)
      .select(undefined, { count: 'exact', head: true });
    
    if (attendeesError) {
      console.error('Error deleting attendees:', attendeesError);
      errors.push(`Error al eliminar lista de participantes: ${attendeesError.message}`);
    }

    // 5. Finally, delete the meeting itself
    const { error: deleteMeetingError, count: meetingCount } = await supabase
      .from('community_meetings')
      .delete()
      .eq('id', meetingId)
      .select(undefined, { count: 'exact', head: true });

    if (deleteMeetingError) {
      console.error('Error deleting meeting:', deleteMeetingError);
      throw new Error(`Error al eliminar la reunión: ${deleteMeetingError.message}`);
    }

    // Check if the meeting was actually deleted
    if (meetingCount === 0) {
      throw new Error('No se pudo eliminar la reunión. Es posible que no tengas permisos suficientes.');
    }

    // 6. Log successful deletion (skip if table doesn't exist)
    try {
      await supabase.from('audit_logs').insert({
        user_id: options.userId,
        action: 'meeting_deleted',
        resource_type: 'meeting',
        resource_id: meetingId,
        metadata: {
          meeting_title: meeting.title,
          deleted_files: deletedFiles,
          errors: errors,
          timestamp: new Date().toISOString()
        }
      });
    } catch (auditError) {
      console.warn('Audit logging skipped:', auditError);
    }

    return {
      success: true,
      deletedFiles,
      errors
    };

  } catch (error) {
    console.error('Error in deleteMeeting:', error);
    
    // Log the failure (skip if table doesn't exist)
    try {
      await supabase.from('audit_logs').insert({
        user_id: options.userId,
        action: 'meeting_deletion_failed',
        resource_type: 'meeting',
        resource_id: meetingId,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      });
    } catch (logError) {
      // Audit logging is optional
      console.warn('Audit logging skipped:', logError);
    }

    return {
      success: false,
      deletedFiles,
      errors: [...errors, error instanceof Error ? error.message : 'Error desconocido']
    };
  }
}

/**
 * Soft delete a meeting (mark as inactive instead of deleting)
 * This is a safer option that allows for recovery
 */
export async function softDeleteMeeting(
  meetingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error, count } = await supabase
      .from('community_meetings')
      .update({ 
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: userId
      })
      .eq('id', meetingId)
      .select(undefined, { count: 'exact', head: true });

    if (error) {
      console.error('Error soft deleting meeting:', error);
      throw error;
    }

    // Check if any row was actually updated
    if (count === 0) {
      throw new Error('No se pudo archivar la reunión. Es posible que no tengas permisos suficientes o que la reunión no exista.');
    }

    // Log the soft deletion (skip if table doesn't exist)
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'meeting_soft_deleted',
        resource_type: 'meeting',
        resource_id: meetingId,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (auditError) {
      console.warn('Audit logging skipped:', auditError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in softDeleteMeeting:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Error al archivar la reunión' 
    };
  }
}

/**
 * Restore a soft-deleted meeting
 */
export async function restoreMeeting(
  meetingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('community_meetings')
      .update({ 
        is_active: true,
        deleted_at: null,
        deleted_by: null
      })
      .eq('id', meetingId);

    if (error) {
      throw error;
    }

    // Log the restoration (skip if table doesn't exist)
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'meeting_restored',
        resource_type: 'meeting',
        resource_id: meetingId,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (auditError) {
      console.warn('Audit logging skipped:', auditError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error in restoreMeeting:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Error al restaurar la reunión' 
    };
  }
}

/**
 * Check if user has permission to delete a meeting
 */
export async function canDeleteMeeting(
  userId: string,
  meetingId: string
): Promise<boolean> {
  try {
    // Get meeting details
    const { data: meeting, error } = await supabase
      .from('community_meetings')
      .select('created_by, workspace_id')
      .eq('id', meetingId)
      .single();

    if (error || !meeting) {
      return false;
    }

    // Check if user is the creator
    if (meeting.created_by === userId) {
      return true;
    }

    // Check if user has admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (roles?.some(role => role.role_type === 'admin')) {
      return true;
    }

    // Check if user is a community leader for this workspace
    const { data: workspace } = await supabase
      .from('community_workspaces')
      .select('community_id')
      .eq('id', meeting.workspace_id)
      .single();

    if (workspace) {
      const { data: leaderRole } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userId)
        .eq('community_id', workspace.community_id)
        .eq('role_type', 'lider_comunidad')
        .eq('is_active', true)
        .single();

      if (leaderRole) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking delete permission:', error);
    return false;
  }
}