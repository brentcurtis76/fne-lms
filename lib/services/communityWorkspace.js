import { supabase } from '../supabase-wrapper';

/**
 * Whether these active roles may save the settings of a community's workspace:
 * exactly the people the database lets write community_workspaces — an admin
 * (rule "admins_modify_all_workspaces") or an active community manager of that
 * community ("community_managers_modify_their_workspace"). Being any other
 * member is not enough (N87). A role served from the offline cache
 * (`from_cache`) never counts.
 */
export function canEditWorkspaceWithRoles(roles, communityId) {
  return (roles || []).some(role =>
    role &&
    !role.from_cache &&
    role.is_active !== false &&
    (role.role_type === 'admin' ||
      (role.role_type === 'community_manager' && Boolean(communityId) && role.community_id === communityId))
  );
}

/**
 * The messages a rename shows (EC-V1b). The database's own text never reaches
 * the screen.
 */
export const WORKSPACE_RENAME_MESSAGES = {
  not_allowed: 'Solo los miembros de la comunidad pueden cambiar su nombre.',
  invalid_name: 'El nombre debe tener entre 1 y 100 caracteres, con al menos una letra o un número, sin caracteres invisibles.',
  other: 'No se pudo guardar. Inténtalo de nuevo.',
};

export const communityWorkspaceService = {
  /**
   * Rename a community's workspace (EC-V1b). Any member of the community, or
   * an admin, may: the database function rename_community_workspace decides
   * and stores the trimmed name. Answers { error: null } or { error: <message
   * for the screen> }.
   */
  async renameWorkspace(workspaceId, name) {
    try {
      const { error } = await supabase.rpc('rename_community_workspace', {
        p_workspace_id: workspaceId,
        p_name: name,
      });
      if (!error) return { error: null };
      console.error('Error renaming workspace:', error);
      if (error.message === 'not_allowed') return { error: WORKSPACE_RENAME_MESSAGES.not_allowed };
      if (error.message === 'invalid_name') return { error: WORKSPACE_RENAME_MESSAGES.invalid_name };
      return { error: WORKSPACE_RENAME_MESSAGES.other };
    } catch (error) {
      console.error('Error renaming workspace:', error);
      return { error: WORKSPACE_RENAME_MESSAGES.other };
    }
  },

  /**
   * Read back the stored name and picture of one workspace (send-back 1 of
   * F12c): after a save the screen shows what is really stored. A member, the
   * community's manager and an admin can all read their workspace's row.
   * Answers { data: { custom_name, image_url }, error: null }, or
   * { data: null, error } when the read fails or finds no row.
   */
  async getWorkspaceSettings(workspaceId) {
    try {
      const { data, error } = await supabase
        .from('community_workspaces')
        .select('custom_name, image_url')
        .eq('id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('workspace not found');
      return { data: { custom_name: data.custom_name, image_url: data.image_url }, error: null };
    } catch (error) {
      console.error('Error reading workspace settings:', error);
      return { data: null, error };
    }
  },

  /**
   * Update the workspace's picture. The name is never written here: it goes
   * through renameWorkspace (N92). Called without a picture change, the table
   * is not touched.
   */
  async updateWorkspaceSettings(workspaceId, updates) {
    if (updates.imageUrl === undefined && updates.imageStoragePath === undefined) {
      return { data: null, error: null };
    }
    try {
      const { data, error } = await supabase
        .from('community_workspaces')
        .update({
          image_url: updates.imageUrl,
          image_storage_path: updates.imageStoragePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', workspaceId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error updating workspace settings:', error);
      return { data: null, error };
    }
  },

  /**
   * Upload community image to Supabase storage
   */
  async uploadCommunityImage(workspaceId, file) {
    try {
      // Validate file
      if (!file) {
        throw new Error('No se proporcionó ningún archivo');
      }

      // Check file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        throw new Error('El archivo debe ser menor a 5MB');
      }

      // Check file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Solo se permiten imágenes (JPEG, PNG, WebP)');
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${workspaceId}-${Date.now()}.${fileExt}`;
      const filePath = `community-images/${fileName}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('community-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('community-images')
        .getPublicUrl(filePath);

      return {
        url: publicUrl,
        path: filePath,
        error: null
      };
    } catch (error) {
      console.error('Error uploading community image:', error);
      return {
        url: null,
        path: null,
        error: error.message || 'Error al subir la imagen'
      };
    }
  },

  /**
   * Delete old community image from storage
   */
  async deleteOldImage(storagePath) {
    if (!storagePath) return;

    try {
      const { error } = await supabase.storage
        .from('community-images')
        .remove([storagePath]);

      if (error) {
        console.error('Error deleting old image:', error);
      }
    } catch (error) {
      console.error('Error in deleteOldImage:', error);
    }
  },

  /**
   * Get workspace details with community info
   */
  async getWorkspaceWithCommunity(workspaceId) {
    try {
      const { data, error } = await supabase
        .from('community_workspaces')
        .select(`
          *,
          growth_communities (
            id,
            name,
            description
          )
        `)
        .eq('id', workspaceId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching workspace details:', error);
      return { data: null, error };
    }
  },

  /**
   * Check if user can edit workspace settings
   */
  async canEditWorkspace(userId, workspaceId) {
    try {
      // First get the community_id from the workspace
      const { data: workspace, error: workspaceError } = await supabase
        .from('community_workspaces')
        .select('community_id')
        .eq('id', workspaceId)
        .single();

      if (workspaceError) throw workspaceError;

      // The user's active roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_type, community_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (rolesError) throw rolesError;

      // Admin, or community manager of this community (N87)
      const canEdit = canEditWorkspaceWithRoles(roles, workspace.community_id);

      return { canEdit, error: null };
    } catch (error) {
      console.error('Error checking edit permissions:', error);
      return { canEdit: false, error };
    }
  }
};