// =============================================================================
// Genera - Document Repository Utilities
// =============================================================================
// Utility functions for document management following established patterns

import { supabase } from '../lib/supabase-wrapper';
import { formatFileSize } from '../lib/utils/file-format';
import { getUserWorkspaceAccess } from './workspaceUtils';
import { fetchProfileCards, cardName } from '../lib/profile-cards';

// F12d (EC-S3): a community's documents are stored in the private store
// `community-documents`, whatever NEXT_PUBLIC_STORAGE_BUCKET says, and are
// opened only through links signed by /api/community/documents/<id>/link.
const DOCUMENTS_BUCKET = 'community-documents';
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
      .select('*')
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
    const SORT_COLUMNS: Record<string, string> = {
      created_at: 'created_at',
      name: 'title',
      size: 'file_size',
      downloads: 'download_count',
      views: 'view_count',
    };
    const sortBy =
      filters.sort_by && Object.prototype.hasOwnProperty.call(SORT_COLUMNS, filters.sort_by)
        ? SORT_COLUMNS[filters.sort_by]
        : 'created_at';
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

    // The uploader's name comes from profile cards (other people's `profiles`
    // rows are not readable; N163): one call for the page's uploaders.
    const uploaderCards = await fetchProfileCards(
      supabase,
      documentsResult.data.map((doc: { uploaded_by?: string | null }) => doc.uploaded_by)
    );

    // Enhance documents with additional information
    const enhancedDocuments: DocumentWithDetails[] = documentsResult.data.map((doc: any) => ({
      ...doc,
      uploader_name: cardName(doc.uploaded_by ? uploaderCards.get(doc.uploaded_by) : undefined),
      uploader_email: '',
      folder_name: '',
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

// F18e (EC-D7, EC-D8): the lengths of the record's columns
// (baseline: title varchar(200), file_name varchar(255), mime_type varchar(100)).
export const DOCUMENT_TITLE_MAX = 200;
export const DOCUMENT_FILE_NAME_MAX = 255;
export const DOCUMENT_MIME_TYPE_MAX = 100;

export const UPLOAD_FAILED_MESSAGE = 'No se pudo subir el archivo. Inténtalo de nuevo.';
export const RECORD_FAILED_MESSAGE =
  'El archivo se subió, pero el documento no se pudo guardar. Inténtalo de nuevo.';
export const VERSION_WARNING_MESSAGE = 'El documento se guardó, pero no su historial de versiones.';

export interface DocumentUploadFileOutcome {
  fileName: string;
  message: string;
}

export interface DocumentUploadResult {
  uploaded: CommunityDocument[];
  failed: DocumentUploadFileOutcome[];
  warnings: DocumentUploadFileOutcome[];
}

/**
 * F18e send-back 1: the identity a file keeps across tries, so that a retry
 * after an unknown outcome reaches the same stored object and the same record.
 */
export interface DocumentUploadIdentity {
  documentId?: string;
  storagePath?: string;
}

/** documents/<workspace>/<root|folder-<id>>/<timestamp>-<sanitized name> */
export function buildDocumentStoragePath(
  workspaceId: string,
  folderId: string | null | undefined,
  fileName: string,
  timestamp: number
): string {
  const folderPath = folderId ? `folder-${folderId}` : 'root';
  return `documents/${workspaceId}/${folderPath}/${timestamp}-${sanitizeFileName(fileName)}`;
}

/**
 * The storage client answers an existing object (upsert off) with a
 * StorageApiError { message, status, statusCode }
 * (@supabase/storage-js src/lib/errors.ts:14-23, src/lib/fetch.ts:31-37);
 * the store's duplicate answer is statusCode '409', «The resource already exists».
 */
function isStoreDuplicate(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  return (
    e.status === 409 ||
    String(e.statusCode ?? '') === '409' ||
    (typeof e.message === 'string' && /already exists/i.test(e.message))
  );
}

/** PostgREST answers a unique violation with code 23505. */
function isDuplicateKey(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === '23505';
}

/** What can be known before uploading: the lengths, the type and the size. */
function checkFileBeforeUpload(title: string, file: File): string | null {
  if (file.name.length > DOCUMENT_FILE_NAME_MAX) {
    return `El nombre del archivo es demasiado largo (máximo ${DOCUMENT_FILE_NAME_MAX} caracteres). Cámbiale el nombre e inténtalo de nuevo.`;
  }
  if (title.length > DOCUMENT_TITLE_MAX) {
    return `El título no puede tener más de ${DOCUMENT_TITLE_MAX} caracteres.`;
  }
  if (file.type.length > DOCUMENT_MIME_TYPE_MAX) {
    return `No se reconoce el tipo del archivo (máximo ${DOCUMENT_MIME_TYPE_MAX} caracteres).`;
  }
  const fileTypeConfig = getFileTypeConfig(file.type);
  if (!fileTypeConfig) {
    return `Tipo de archivo no soportado: ${file.type}`;
  }
  if (file.size > fileTypeConfig.max_size) {
    return `Archivo demasiado grande: ${file.name}. Máximo permitido: ${formatFileSize(
      fileTypeConfig.max_size
    )}`;
  }
  return null;
}

/**
 * Upload documents to the repository. Each file succeeds or fails for itself
 * (F18e): a failure is reported in `failed` and the next file is still tried;
 * nothing is thrown for one file's failure. A file stored whose record could
 * not be written stays in the store (the person may only add files there).
 */
export async function uploadDocument(
  workspaceId: string,
  uploadData: DocumentUploadData,
  userId: string,
  identities?: Array<DocumentUploadIdentity | undefined>
): Promise<DocumentUploadResult> {
  const result: DocumentUploadResult = { uploaded: [], failed: [], warnings: [] };

  for (const [index, file] of uploadData.files.entries()) {
    const identity = identities?.[index];
    const title = uploadData.title || file.name.split('.')[0];

    const refusal = checkFileBeforeUpload(title, file);
    if (refusal) {
      result.failed.push({ fileName: file.name, message: refusal });
      continue;
    }

    // Storage path: the caller's stable one, or a new one as before
    const storagePath =
      identity?.storagePath ??
      buildDocumentStoragePath(workspaceId, uploadData.folder_id, file.name, Date.now());
    const documentId = identity?.documentId;

    // Upload file to Supabase Storage; an object already at this path is the
    // one an earlier try of the same file stored (the path is unique to it).
    try {
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storagePath, file);
      if (uploadError && !isStoreDuplicate(uploadError)) throw uploadError;
    } catch (error) {
      console.error('Error uploading document file:', error);
      result.failed.push({ fileName: file.name, message: UPLOAD_FAILED_MESSAGE });
      continue;
    }

    // Keep canonical object keys for documents and versions; readers resolve their URL.
    // Create document record
    let documentData: CommunityDocument;
    let versionAlreadyWritten = false;
    let versionUnknown = false;
    try {
      const { data, error: documentError } = await supabase
        .from('community_documents')
        .insert({
          ...(documentId ? { id: documentId } : {}),
          workspace_id: workspaceId,
          folder_id: uploadData.folder_id || null,
          title,
          description: uploadData.description || null,
          tags: uploadData.tags || [],
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          storage_path: storagePath,
          storage_bucket: DOCUMENTS_BUCKET,
          uploaded_by: userId,
        })
        .select()
        .single();
      if (documentError && documentId && isDuplicateKey(documentError)) {
        // The record of this id is already there (an earlier try's answer was
        // lost): it counts only if it is this person's upload in this workspace.
        const { data: existing, error: readError } = await supabase
          .from('community_documents')
          .select('*')
          .eq('id', documentId)
          .maybeSingle();
        if (readError || !existing || existing.uploaded_by !== userId || existing.workspace_id !== workspaceId) {
          throw readError ?? new Error('existing record is not this upload');
        }
        documentData = existing as CommunityDocument;
        const { data: versions, error: versionsError } = await supabase
          .from('document_versions')
          .select('id')
          .eq('document_id', documentId)
          .limit(1);
        if (versionsError) {
          // Cannot tell whether its first version exists: do not write a second one.
          console.error('Error reading first document version:', versionsError);
          versionUnknown = true;
        } else {
          versionAlreadyWritten = Array.isArray(versions) && versions.length > 0;
        }
      } else {
        if (documentError || !data) throw documentError ?? new Error('no record returned');
        documentData = data as CommunityDocument;
      }
    } catch (error) {
      console.error('Error saving document record:', error);
      result.failed.push({ fileName: file.name, message: RECORD_FAILED_MESSAGE });
      continue;
    }

    // Create initial version record (only if none exists for a record found again)
    if (versionUnknown) {
      result.warnings.push({ fileName: file.name, message: VERSION_WARNING_MESSAGE });
    } else if (!versionAlreadyWritten) {
      try {
        const { error: versionError } = await supabase.from('document_versions').insert({
          document_id: documentData.id,
          version_number: 1,
          storage_path: documentData.storage_path || storagePath,
          storage_bucket: DOCUMENTS_BUCKET,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by: userId,
        });
        if (versionError) throw versionError;
      } catch (error) {
        console.error('Error saving first document version:', error);
        result.warnings.push({ fileName: file.name, message: VERSION_WARNING_MESSAGE });
      }
    }

    // Log upload activity (a failure here is ignored, but logged)
    try {
      const { error: logError } = await supabase.from('document_access_log').insert({
        document_id: documentData.id,
        user_id: userId,
        workspace_id: workspaceId,
        action_type: 'upload',
      });
      if (logError) console.warn('Could not log document upload:', logError);
    } catch (error) {
      console.warn('Could not log document upload:', error);
    }

    result.uploaded.push(documentData);
  }

  return result;
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

// Rename, move and hide go through database functions that decide who may act
// (the community's leader, the uploader while still in the community, or an
// admin) and change only the named column. A refusal arrives as one of the
// functions' own messages and is turned into the screen's text here.
export const DOCUMENT_ACTION_MESSAGES = {
  not_allowed: 'Solo quien subió el documento o el líder de la comunidad puede hacerlo.',
  invalid_title: 'El nombre debe tener entre 1 y 200 caracteres.',
  invalid_folder: 'La carpeta ya no existe en este espacio.',
  other: 'No se pudo completar la acción. Inténtalo de nuevo.',
} as const;

function documentActionMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  if (message === 'not_allowed') return DOCUMENT_ACTION_MESSAGES.not_allowed;
  if (message === 'invalid_title') return DOCUMENT_ACTION_MESSAGES.invalid_title;
  if (message === 'invalid_folder') return DOCUMENT_ACTION_MESSAGES.invalid_folder;
  return DOCUMENT_ACTION_MESSAGES.other;
}

function documentActionFailed(name: string, error: unknown): never {
  console.error(`Error in ${name}:`, error);
  throw new Error(documentActionMessage(error));
}

/**
 * Rename a document (title only)
 */
export async function renameDocument(documentId: string, title: string): Promise<void> {
  let result: { error: unknown };
  try {
    result = await supabase.rpc('rename_community_document', { p_document_id: documentId, p_title: title });
  } catch (error) {
    return documentActionFailed('rename_community_document', error);
  }
  if (result.error) documentActionFailed('rename_community_document', result.error);
}

/**
 * Move a document to a folder of its workspace, or out of any folder (null)
 */
export async function moveDocument(documentId: string, folderId: string | null): Promise<void> {
  let result: { error: unknown };
  try {
    result = await supabase.rpc('move_community_document', { p_document_id: documentId, p_folder_id: folderId });
  } catch (error) {
    return documentActionFailed('move_community_document', error);
  }
  if (result.error) documentActionFailed('move_community_document', result.error);
}

/**
 * Hide a document (the screen's «Eliminar»); the record and the file stay
 */
export async function hideDocument(documentId: string): Promise<void> {
  let result: { error: unknown };
  try {
    result = await supabase.rpc('hide_community_document', { p_document_id: documentId });
  } catch (error) {
    return documentActionFailed('hide_community_document', error);
  }
  if (result.error) documentActionFailed('hide_community_document', result.error);
}

/**
 * May the signed-in person manage every document of this workspace
 * (the community's leader or an admin)? False on any error.
 */
export async function canManageWorkspaceDocuments(workspaceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('can_manage_workspace_documents', { p_workspace_id: workspaceId });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error('Error checking document management rights:', error);
    return false;
  }
}

/**
 * Every folder of a workspace (for the «Mover documento» window)
 */
export async function getWorkspaceFolders(workspaceId: string): Promise<DocumentFolder[]> {
  const { data, error } = await supabase
    .from('document_folders')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('folder_name', { ascending: true });
  if (error) throw error;
  return data || [];
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
// DOCUMENT LINKS (F12d)
// =============================================================================

/** Why no link came: no session in the browser, or anything else. */
export class DocumentLinkError extends Error {
  reason: 'session' | 'failed';
  constructor(reason: 'session' | 'failed') {
    super(reason === 'session' ? 'No session' : 'Document link failed');
    this.name = 'DocumentLinkError';
    this.reason = reason;
  }
}

/**
 * A five-minute signed link to a community document's file (or one of its
 * versions), from /api/community/documents/<id>/link. Throws
 * DocumentLinkError: 'session' when there is no session (the route is not
 * asked), 'failed' for any refusal or failure. The link is never logged.
 */
export async function getDocumentLink(
  documentId: string,
  options: { download?: boolean; versionId?: string } = {}
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new DocumentLinkError('session');

  const query = new URLSearchParams();
  if (options.download) query.set('download', '1');
  if (options.versionId) query.set('version', options.versionId);
  const address =
    `/api/community/documents/${encodeURIComponent(documentId)}/link` + (query.toString() ? `?${query}` : '');

  let response: Response;
  try {
    response = await fetch(address, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      credentials: 'same-origin',
    });
  } catch (error) {
    console.error('Error requesting document link:', error instanceof Error ? error.name : 'unknown');
    throw new DocumentLinkError('failed');
  }
  if (response.status === 401) throw new DocumentLinkError('session');
  if (!response.ok) throw new DocumentLinkError('failed');
  const body = await response.json().catch(() => null);
  if (typeof body?.url !== 'string' || !body.url) throw new DocumentLinkError('failed');
  return body.url;
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
        // Editing and removing are per document: the uploader, the community's
        // leader or an admin (can_manage_community_document in the database).
        return {
          can_view: true,
          can_download: true,
          can_edit: false,
          can_delete: false,
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