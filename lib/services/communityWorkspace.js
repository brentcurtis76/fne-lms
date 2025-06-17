import { supabase } from '../supabase';

export const communityWorkspaceService = {
  /**
   * Update community workspace settings (name and/or image)
   */
  async updateWorkspaceSettings(workspaceId, updates) {
    try {
      const { data, error } = await supabase
        .from('community_workspaces')
        .update({
          custom_name: updates.customName,
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

      // Check if user is community leader or admin
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', userId)
        .eq('is_active', true)
        .or(`community_id.eq.${workspace.community_id},role_type.eq.admin`);

      if (rolesError) throw rolesError;

      // User can edit if they are admin or community leader
      const canEdit = roles.some(role => 
        role.role_type === 'admin' || 
        (role.role_type === 'lider_comunidad' && role.community_id === workspace.community_id)
      );

      return { canEdit, error: null };
    } catch (error) {
      console.error('Error checking edit permissions:', error);
      return { canEdit: false, error };
    }
  }
};