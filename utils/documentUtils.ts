// =============================================================================
// FNE LMS - Document Repository Utilities
// =============================================================================
// Utility functions for document management following established patterns

import { supabase } from '../lib/supabase';
import { getUserWorkspaceAccess } from './workspaceUtils';

// Storage bucket configuration
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'resources';
import {
  CommunityDocument,
  DocumentWithDetails,
  DocumentFolder,
  FolderWithBreadcrumb,
  DocumentStatistics,
  RecentDocumentActivity,
  DocumentFilterOptions,
  FileTypeConfig,
  SUPPORTED_FILE_TYPES,
  DocumentPermission,
  DocumentUploadData,
  FolderCreateData,
  DocumentVersion,
} from '../types/documents';

// =============================================================================
// DOCUMENT RETRIEVAL FUNCTIONS
// =============================================================================

/**
 * Get documents and folders for a workspace with filtering
 */
export async function getWorkspaceDocuments(
  workspaceId: string,
  folderId: string | null = null,
  filters: DocumentFilterOptions = {}
): Promise<{
  documents: DocumentWithDetails[];
  folders: FolderWithBreadcrumb[];
  statistics?: DocumentStatistics;
}> {
  try {
    let documentsQuery = supabase
      .from('community_documents')
      .select(`
        *,
        profiles:uploaded_by (
          full_name,
          email
        ),
        document_folders:folder_id (
          folder_name
        )
      `)
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);

    // Apply folder filter
    if (folderId) {
      documentsQuery = documentsQuery.eq('folder_id', folderId);
    } else {
      documentsQuery = documentsQuery.is('folder_id', null);
    }

    // Apply search filter
    if (filters.search) {
      documentsQuery = documentsQuery.or(
        `title.ilike.%${filters.search}%,file_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    // Apply tags filter
    if (filters.tags && filters.tags.length > 0) {
      documentsQuery = documentsQuery.overlaps('tags', filters.tags);
    }

    // Apply mime type filter
    if (filters.mime_types && filters.mime_types.length > 0) {
      documentsQuery = documentsQuery.in('mime_type', filters.mime_types);
    }

    // Apply uploader filter
    if (filters.uploaded_by) {
      documentsQuery = documentsQuery.eq('uploaded_by', filters.uploaded_by);
    }

    // Apply date filters
    if (filters.date_from) {
      documentsQuery = documentsQuery.gte('created_at', filters.date_from);
    }
    if (filters.date_to) {
      documentsQuery = documentsQuery.lte('created_at', filters.date_to);
    }

    // Apply sorting
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    documentsQuery = documentsQuery.order(sortBy, { ascending: sortOrder === 'asc' });

    // Get folders for current level
    let foldersQuery = supabase
      .from('document_folders')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (folderId) {
      foldersQuery = foldersQuery.eq('parent_folder_id', folderId);
    } else {
      foldersQuery = foldersQuery.is('parent_folder_id', null);
    }

    const [documentsResult, foldersResult] = await Promise.all([
      documentsQuery,
      foldersQuery,
    ]);

    if (documentsResult.error) throw documentsResult.error;
    if (foldersResult.error) throw foldersResult.error;

    // Enhance documents with additional information
    const enhancedDocuments: DocumentWithDetails[] = documentsResult.data.map((doc: any) => ({
      ...doc,
      uploader_name: doc.profiles?.full_name || 'Usuario desconocido',
      uploader_email: doc.profiles?.email,
      folder_name: doc.document_folders?.folder_name,
      file_type_icon: getFileTypeIcon(doc.mime_type),
      formatted_size: formatFileSize(doc.file_size),
      relative_time: formatRelativeTime(doc.created_at),
    }));

    // Enhance folders with document counts
    const enhancedFolders: FolderWithBreadcrumb[] = await Promise.all(
      foldersResult.data.map(async (folder: DocumentFolder) => {
        const { count: documentCount } = await supabase
          .from('community_documents')
          .select('*', { count: 'exact', head: true })
          .eq('folder_id', folder.id)
          .eq('is_active', true);

        const { count: subfolderCount } = await supabase
          .from('document_folders')
          .select('*', { count: 'exact', head: true })
          .eq('parent_folder_id', folder.id);

        return {
          ...folder,
          document_count: documentCount || 0,
          subfolder_count: subfolderCount || 0,
        };
      })
    );

    return {
      documents: enhancedDocuments,
      folders: enhancedFolders,
    };
  } catch (error) {
    console.error('Error getting workspace documents:', error);
    throw error;
  }
}

/**
 * Get document statistics for a workspace
 */
export async function getDocumentStatistics(workspaceId: string): Promise<DocumentStatistics> {
  try {
    const { data, error } = await supabase.rpc('get_document_statistics', {
      workspace_uuid: workspaceId,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting document statistics:', error);
    throw error;
  }
}

/**
 * Get recent document activity for a workspace
 */
export async function getRecentDocumentActivity(
  workspaceId: string,
  limit: number = 20
): Promise<RecentDocumentActivity[]> {
  try {
    const { data, error } = await supabase.rpc('get_recent_document_activity', {
      workspace_uuid: workspaceId,
      limit_count: limit,
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting recent document activity:', error);
    throw error;
  }
}

/**
 * Get folder breadcrumb path
 */
export async function getFolderBreadcrumb(folderId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('get_folder_breadcrumb', {
      folder_uuid: folderId,
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting folder breadcrumb:', error);
    throw error;
  }
}

// =============================================================================
// DOCUMENT UPLOAD FUNCTIONS
// =============================================================================

/**
 * Upload a document to the repository
 */
export async function uploadDocument(
  workspaceId: string,
  uploadData: DocumentUploadData,
  userId: string
): Promise<CommunityDocument[]> {
  try {
    const uploadedDocuments: CommunityDocument[] = [];

    for (const file of uploadData.files) {
      // Validate file type and size
      const fileTypeConfig = getFileTypeConfig(file.type);
      if (!fileTypeConfig) {
        throw new Error(`Tipo de archivo no soportado: ${file.type}`);
      }

      if (file.size > fileTypeConfig.max_size) {
        throw new Error(
          `Archivo demasiado grande: ${file.name}. Máximo permitido: ${formatFileSize(
            fileTypeConfig.max_size
          )}`
        );
      }

      // Generate storage path
      const timestamp = Date.now();
      const sanitizedFileName = sanitizeFileName(file.name);
      const folderPath = uploadData.folder_id ? `folder-${uploadData.folder_id}` : 'root';
      const storagePath = `documents/${workspaceId}/${folderPath}/${timestamp}-${sanitizedFileName}`;

      // Upload file to Supabase Storage
      const { data: uploadResult, error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      // Create document record
      const { data: documentData, error: documentError } = await supabase
        .from('community_documents')
        .insert({
          workspace_id: workspaceId,
          folder_id: uploadData.folder_id || null,
          title: uploadData.title || file.name.split('.')[0],
          description: uploadData.description || null,
          tags: uploadData.tags || [],
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          storage_path: storagePath,
          uploaded_by: userId,
        })
        .select()
        .single();

      if (documentError) throw documentError;

      // Create initial version record
      await supabase.from('document_versions').insert({
        document_id: documentData.id,
        version_number: 1,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: userId,
      });

      // Log upload activity
      await supabase.from('document_access_log').insert({
        document_id: documentData.id,
        user_id: userId,
        workspace_id: workspaceId,
        action_type: 'upload',
      });

      uploadedDocuments.push(documentData);
    }

    return uploadedDocuments;
  } catch (error) {
    console.error('Error uploading documents:', error);
    throw error;
  }
}

/**
 * Create a new folder
 */
export async function createFolder(
  workspaceId: string,
  folderData: FolderCreateData,
  userId: string
): Promise<DocumentFolder> {
  try {
    const { data, error } = await supabase
      .from('document_folders')
      .insert({
        workspace_id: workspaceId,
        folder_name: folderData.folder_name,
        parent_folder_id: folderData.parent_folder_id || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

// =============================================================================
// DOCUMENT MANAGEMENT FUNCTIONS
// =============================================================================

/**
 * Update document metadata
 */
export async function updateDocument(
  documentId: string,
  updates: Partial<CommunityDocument>
): Promise<CommunityDocument> {
  try {
    const { data, error } = await supabase
      .from('community_documents')
      .update(updates)
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
}

/**
 * Soft delete a document
 */
export async function deleteDocument(documentId: string, userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('community_documents')
      .update({ is_active: false })
      .eq('id', documentId);

    if (error) throw error;

    // Log deletion activity
    const document = await getDocumentById(documentId);
    if (document) {
      await supabase.from('document_access_log').insert({
        document_id: documentId,
        user_id: userId,
        workspace_id: document.workspace_id,
        action_type: 'delete',
      });
    }
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

/**
 * Move documents to a different folder
 */
export async function moveDocuments(
  documentIds: string[],
  targetFolderId: string | null
): Promise<void> {
  try {
    const { error } = await supabase
      .from('community_documents')
      .update({ folder_id: targetFolderId })
      .in('id', documentIds);

    if (error) throw error;
  } catch (error) {
    console.error('Error moving documents:', error);
    throw error;
  }
}

/**
 * Increment document counter and log access
 */
export async function incrementDocumentCounter(
  documentId: string,
  counterType: 'view' | 'download',
  userId: string
): Promise<void> {
  try {
    await supabase.rpc('increment_document_counter', {
      document_uuid: documentId,
      counter_type: counterType,
      user_uuid: userId,
    });
  } catch (error) {
    console.error('Error incrementing document counter:', error);
    throw error;
  }
}

// =============================================================================
// PERMISSION FUNCTIONS
// =============================================================================

/**
 * Get user permissions for document operations in a workspace
 */
export async function getUserDocumentPermissions(
  userId: string,
  workspaceId: string
): Promise<DocumentPermission> {
  try {
    const { accessType: userRole } = await getUserWorkspaceAccess(userId);

    switch (userRole) {
      case 'admin':
        return {
          can_view: true,
          can_download: true,
          can_edit: true,
          can_delete: true,
          can_share: true,
          can_create_folder: true,
          can_manage_folders: true,
        };

      case 'community_member':
        return {
          can_view: true,
          can_download: true,
          can_edit: true,
          can_delete: true,
          can_share: true,
          can_create_folder: true,
          can_manage_folders: true,
        };

      case 'consultant':
        return {
          can_view: true,
          can_download: true,
          can_edit: false,
          can_delete: false,
          can_share: true,
          can_create_folder: true,
          can_manage_folders: false,
        };

      case 'none':
        return {
          can_view: false,
          can_download: false,
          can_edit: false,
          can_delete: false,
          can_share: false,
          can_create_folder: false,
          can_manage_folders: false,
        };

      default:
        return {
          can_view: false,
          can_download: false,
          can_edit: false,
          can_delete: false,
          can_share: false,
          can_create_folder: false,
          can_manage_folders: false,
        };
    }
  } catch (error) {
    console.error('Error getting user document permissions:', error);
    return {
      can_view: false,
      can_download: false,
      can_edit: false,
      can_delete: false,
      can_share: false,
      can_create_folder: false,
      can_manage_folders: false,
    };
  }
}

/**
 * Check if user can edit a specific document
 */
export function canUserEditDocument(
  document: CommunityDocument,
  userId: string,
  permissions: DocumentPermission
): boolean {
  return permissions.can_edit || document.uploaded_by === userId;
}

/**
 * Check if user can delete a specific document
 */
export function canUserDeleteDocument(
  document: CommunityDocument,
  userId: string,
  permissions: DocumentPermission
): boolean {
  return permissions.can_delete || document.uploaded_by === userId;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format relative time
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Hace un momento';
  if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} minutos`;
  if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} horas`;
  if (diffInSeconds < 604800) return `Hace ${Math.floor(diffInSeconds / 86400)} días`;
  
  return date.toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get file type configuration
 */
export function getFileTypeConfig(mimeType: string): FileTypeConfig | null {
  return SUPPORTED_FILE_TYPES.find(type => type.mime_type === mimeType) || null;
}

/**
 * Get file type icon
 */
export function getFileTypeIcon(mimeType: string): string {
  const config = getFileTypeConfig(mimeType);
  return config?.icon || 'File';
}

/**
 * Get file type color
 */
export function getFileTypeColor(mimeType: string): string {
  const config = getFileTypeConfig(mimeType);
  return config?.color || '#6b7280';
}

/**
 * Check if file type supports preview
 */
export function isPreviewSupported(mimeType: string): boolean {
  const config = getFileTypeConfig(mimeType);
  return config?.preview_supported || false;
}

/**
 * Check if file type supports thumbnail
 */
export function isThumbnailSupported(mimeType: string): boolean {
  const config = getFileTypeConfig(mimeType);
  return config?.thumbnail_supported || false;
}

/**
 * Sanitize file name for storage
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Extract unique tags from documents
 */
export function extractUniqueTags(documents: CommunityDocument[]): string[] {
  const tagSet = new Set<string>();
  documents.forEach(doc => {
    doc.tags.forEach(tag => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

/**
 * Get available mime types from documents
 */
export function getAvailableMimeTypes(documents: CommunityDocument[]): string[] {
  const mimeTypeSet = new Set<string>();
  documents.forEach(doc => {
    mimeTypeSet.add(doc.mime_type);
  });
  return Array.from(mimeTypeSet).sort();
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get document by ID
 */
async function getDocumentById(documentId: string): Promise<CommunityDocument | null> {
  try {
    const { data, error } = await supabase
      .from('community_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting document by ID:', error);
    return null;
  }
}