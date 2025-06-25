// Base Block Payloads
export interface TextBlockPayload {
  title?: string;
  content: string;
}

export interface CarouselImage {
  id: string;
  src: string;
  alt?: string;
  caption?: string;
}

export interface ImageBlockPayload {
  title?: string;
  images: CarouselImage[];
  // Backward compatibility for single image
  src?: string;
  alt?: string;
  caption?: string;
}

export interface VideoBlockPayload {
  title?: string;
  url: string;
  caption?: string;
}

export interface DownloadFile {
  id: string;
  name: string;
  originalName: string;
  url: string;
  size: number;
  type: string;
  description?: string;
  uploadedAt: string;
}

export interface DownloadBlockPayload {
  title: string;
  description?: string;
  files: DownloadFile[];
  allowBulkDownload: boolean;
  requireAuth: boolean;
}

export interface ExternalLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  category?: string;
  thumbnail?: string;
  openInNewTab: boolean;
  isActive: boolean;
}

export interface ExternalLinksBlockPayload {
  title: string;
  description?: string;
  links: ExternalLink[];
  groupByCategory: boolean;
  showThumbnails: boolean;
  showDescriptions: boolean;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'multiple-choice' | 'true-false' | 'open-ended';
  options: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
  points: number;
  explanation?: string;
  timeLimit?: number; // seconds
  // Open-ended specific fields
  characterLimit?: number;
  gradingGuidelines?: string; // Instructions for the consultant on how to grade
  expectedAnswer?: string; // Reference answer for consultants
}

export interface QuizBlockPayload {
  title: string;
  description?: string;
  instructions?: string;
  questions: QuizQuestion[];
  totalPoints: number;
  timeLimit?: number; // Total time limit in minutes
  allowRetries: boolean;
  showResults: boolean;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
}

export interface GroupAssignmentResource {
  id: string;
  type: 'link' | 'document';
  title: string;
  url: string;
  description?: string;
}

export interface GroupAssignmentBlockPayload {
  title: string;
  description?: string;
  instructions?: string;
  resources?: GroupAssignmentResource[];
}

export interface BibliographyItem {
  id: string;
  type: 'pdf' | 'link' | 'image';
  title: string;
  description?: string;
  url: string;
  author?: string;
  year?: string;
  category?: string;
}

export interface BibliographyBlockPayload {
  title: string;
  description?: string;
  items: BibliographyItem[];
  showCategories: boolean;
  sortBy: 'manual' | 'title' | 'author' | 'year' | 'type';
}

// Base Block Structure
export type BlockType = 'text' | 'image' | 'video' | 'quiz' | 'download' | 'external-links' | 'group-assignment' | 'bibliography';

export interface BaseBlock {
  id: string; // UUID
  type: BlockType;
  position?: number; // Order of the block in the course
  course_id?: string; // UUID, optional if block is not yet saved
  lesson_id?: string; // UUID, optional if block is not yet saved
  payload?: any; // Block content - structure depends on block type
  is_visible?: boolean; // Controls whether the block is visible or collapsed
}

// Specific Block Types
export interface TextBlock extends BaseBlock {
  type: 'text';
  payload: TextBlockPayload;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  payload: ImageBlockPayload;
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  payload: VideoBlockPayload;
}

export interface DownloadBlock extends BaseBlock {
  type: 'download';
  payload: DownloadBlockPayload;
}

export interface ExternalLinksBlock extends BaseBlock {
  type: 'external-links'; // Consistent with BlockType
  payload: ExternalLinksBlockPayload;
}

export interface QuizBlock extends BaseBlock {
  type: 'quiz';
  payload: QuizBlockPayload;
}

export interface GroupAssignmentBlock extends BaseBlock {
  type: 'group-assignment';
  payload: GroupAssignmentBlockPayload;
}

export interface BibliographyBlock extends BaseBlock {
  type: 'bibliography';
  payload: BibliographyBlockPayload;
}

// Union type for all possible blocks
export type Block = TextBlock | ImageBlock | VideoBlock | DownloadBlock | ExternalLinksBlock | QuizBlock | GroupAssignmentBlock | BibliographyBlock;