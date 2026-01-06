// =============================================================================
// Genera - Document Repository Types
// =============================================================================
// TypeScript definitions for the document repository system

// Document folder interface
export interface DocumentFolder {
  id: string;
  workspace_id: string;
  folder_name: string;
  parent_folder_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Community document interface
export interface CommunityDocument {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  tags: string[];
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  thumbnail_url: string | null;
  current_version: number;
  is_active: boolean;
  download_count: number;
  view_count: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

// Document version interface
export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  storage_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
}

// Document access log interface
export interface DocumentAccessLog {
  id: string;
  document_id: string;
  user_id: string;
  workspace_id: string;
  action_type: 'view' | 'download' | 'upload' | 'delete';
  ip_address: string | null;
  user_agent: string | null;
  accessed_at: string;
}

// Enhanced document interface with user and folder information
export interface DocumentWithDetails extends CommunityDocument {
  uploader_name?: string;
  uploader_email?: string;
  folder_name?: string;
  folder_path?: string;
  file_type_icon?: string;
  formatted_size?: string;
  relative_time?: string;
  can_edit?: boolean;
  can_delete?: boolean;
}

// Folder with breadcrumb information
export interface FolderWithBreadcrumb extends DocumentFolder {
  breadcrumb?: BreadcrumbItem[];
  document_count?: number;
  subfolder_count?: number;
}

// Breadcrumb item interface
export interface BreadcrumbItem {
  id: string;
  name: string;
}

// Document upload form data
export interface DocumentUploadData {
  title: string;
  description?: string;
  tags: string[];
  folder_id?: string;
  files: File[];
}

// Document filter options
export interface DocumentFilterOptions {
  search?: string;
  folder_id?: string;
  tags?: string[];
  mime_types?: string[];
  uploaded_by?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: 'name' | 'date' | 'created_at' | 'size' | 'downloads' | 'views';
  sort_order?: 'asc' | 'desc';
  view_mode?: 'grid' | 'list';
}

// Document statistics interface
export interface DocumentStatistics {
  total_documents: number;
  total_folders: number;
  total_storage_bytes: number;
  total_downloads: number;
  recent_uploads: number;
  file_types: Array<{
    mime_type: string;
    count: number;
  }>;
  top_uploaders: Array<{
    user_id: string;
    count: number;
  }>;
}

// Recent activity interface
export interface RecentDocumentActivity {
  document_id: string;
  document_title: string;
  action_type: string;
  user_id: string;
  accessed_at: string;
}

// File type configuration
export interface FileTypeConfig {
  extension: string;
  mime_type: string;
  icon: string;
  color: string;
  max_size: number; // in bytes
  preview_supported: boolean;
  thumbnail_supported: boolean;
}

// Document view mode
export type DocumentViewMode = 'grid' | 'list';

// Document sort options
export type DocumentSortBy = 'name' | 'date' | 'size' | 'downloads' | 'views';
export type DocumentSortOrder = 'asc' | 'desc';

// Action types for document operations
export type DocumentAction = 
  | 'view'
  | 'download'
  | 'edit'
  | 'delete'
  | 'move'
  | 'share'
  | 'version'
  | 'preview';

// Document permission levels
export type DocumentPermission = {
  can_view: boolean;
  can_download: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_share: boolean;
  can_create_folder: boolean;
  can_manage_folders: boolean;
};

// File upload progress
export interface FileUploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  document_id?: string;
}

// Folder creation form data
export interface FolderCreateData {
  folder_name: string;
  parent_folder_id?: string;
}

// Document bulk operation
export interface DocumentBulkOperation {
  action: 'move' | 'delete' | 'download';
  document_ids: string[];
  target_folder_id?: string;
}

// API response types
export interface DocumentApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

export interface DocumentListResponse extends DocumentApiResponse {
  data?: {
    documents: DocumentWithDetails[];
    folders: FolderWithBreadcrumb[];
    statistics?: DocumentStatistics;
    pagination?: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
    };
  };
}

export interface DocumentUploadResponse extends DocumentApiResponse {
  data?: {
    document: CommunityDocument;
    storage_path: string;
  };
}

// Component props interfaces
export interface DocumentGridProps {
  documents: DocumentWithDetails[];
  folders: FolderWithBreadcrumb[];
  viewMode: DocumentViewMode;
  onDocumentClick: (document: DocumentWithDetails) => void;
  onFolderClick: (folder: FolderWithBreadcrumb) => void;
  onDocumentAction: (action: DocumentAction, document: DocumentWithDetails) => void;
  selectedDocuments: string[];
  onSelectionChange: (documentIds: string[]) => void;
  permissions: DocumentPermission;
  loading?: boolean;
}

export interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  currentFolderId?: string;
  folders: DocumentFolder[];
  onUploadComplete: (documents: CommunityDocument[]) => void;
}

export interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentWithDetails | null;
  onDownload: (document: DocumentWithDetails) => void;
}

export interface FolderNavigationProps {
  currentFolder: FolderWithBreadcrumb | null;
  breadcrumb: BreadcrumbItem[];
  onFolderNavigate: (folderId: string | null) => void;
  onCreateFolder: (folderData: FolderCreateData) => void;
  permissions: DocumentPermission;
}

export interface DocumentFiltersProps {
  filters: DocumentFilterOptions;
  onFiltersChange: (filters: DocumentFilterOptions) => void;
  availableTags: string[];
  availableUploaders: Array<{ id: string; name: string }>;
  fileTypes: FileTypeConfig[];
}

// Error types
export interface DocumentError {
  code: string;
  message: string;
  details?: any;
}

// Constants
export const SUPPORTED_FILE_TYPES: FileTypeConfig[] = [
  {
    extension: '.pdf',
    mime_type: 'application/pdf',
    icon: 'FileText',
    color: '#ef4044',
    max_size: 50 * 1024 * 1024, // 50MB
    preview_supported: true,
    thumbnail_supported: true,
  },
  {
    extension: '.doc',
    mime_type: 'application/msword',
    icon: 'FileText',
    color: '#2563eb',
    max_size: 25 * 1024 * 1024, // 25MB
    preview_supported: false,
    thumbnail_supported: false,
  },
  {
    extension: '.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    icon: 'FileText',
    color: '#2563eb',
    max_size: 25 * 1024 * 1024, // 25MB
    preview_supported: false,
    thumbnail_supported: false,
  },
  {
    extension: '.xls',
    mime_type: 'application/vnd.ms-excel',
    icon: 'FileSpreadsheet',
    color: '#16a34a',
    max_size: 25 * 1024 * 1024, // 25MB
    preview_supported: false,
    thumbnail_supported: false,
  },
  {
    extension: '.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    icon: 'FileSpreadsheet',
    color: '#16a34a',
    max_size: 25 * 1024 * 1024, // 25MB
    preview_supported: false,
    thumbnail_supported: false,
  },
  {
    extension: '.ppt',
    mime_type: 'application/vnd.ms-powerpoint',
    icon: 'Presentation',
    color: '#ea580c',
    max_size: 50 * 1024 * 1024, // 50MB
    preview_supported: false,
    thumbnail_supported: false,
  },
  {
    extension: '.pptx',
    mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    icon: 'Presentation',
    color: '#ea580c',
    max_size: 50 * 1024 * 1024, // 50MB
    preview_supported: false,
    thumbnail_supported: false,
  },
  {
    extension: '.jpg',
    mime_type: 'image/jpeg',
    icon: 'Image',
    color: '#8b5cf6',
    max_size: 10 * 1024 * 1024, // 10MB
    preview_supported: true,
    thumbnail_supported: true,
  },
  {
    extension: '.jpeg',
    mime_type: 'image/jpeg',
    icon: 'Image',
    color: '#8b5cf6',
    max_size: 10 * 1024 * 1024, // 10MB
    preview_supported: true,
    thumbnail_supported: true,
  },
  {
    extension: '.png',
    mime_type: 'image/png',
    icon: 'Image',
    color: '#8b5cf6',
    max_size: 10 * 1024 * 1024, // 10MB
    preview_supported: true,
    thumbnail_supported: true,
  },
  {
    extension: '.mp4',
    mime_type: 'video/mp4',
    icon: 'Video',
    color: '#dc2626',
    max_size: 100 * 1024 * 1024, // 100MB
    preview_supported: true,
    thumbnail_supported: true,
  },
];

export const DEFAULT_FOLDER_STRUCTURE = [
  'Presentaciones',
  'Plantillas',
  'Evaluaciones',
  'Recursos',
  'Planificación',
  'Informes',
  'Guías',
  'Formularios',
];