// Base Block Payloads
export interface TextBlockPayload {
  content: string;
}

export interface VideoBlockPayload {
  url: string;
  caption?: string;
}

// Add other payload types as needed, e.g., QuizBlockPayload

// Base Block Structure
export interface BaseBlock {
  id: string; // UUID
  course_id?: string; // UUID, optional if block is not yet saved
  position?: number; // Order of the block in the course
  title?: string; // Optional title for the block to identify it in the timeline
  // Timestamps that Supabase typically adds
  created_at?: string;
  updated_at?: string;
}

// Specific Block Types
export interface TextBlock extends BaseBlock {
  type: 'text';
  payload: TextBlockPayload;
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  payload: VideoBlockPayload;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  payload: {
    src: string;        // image URL (e.g. from Supabase Storage)
    caption?: string;
    alt?: string;
  };
};

export interface DownloadBlock extends BaseBlock {
  type: 'download';
  payload: {
    files: {
      name: string;
      url: string;
    }[];
  };
};

export interface ExternalLinksBlock extends BaseBlock {
  type: 'external-links';
  payload: {
    links: {
      label: string;
      url: string;
    }[];
  };
};

// Quiz Block Type
export interface QuizBlock extends BaseBlock {
  type: 'quiz';
  payload: {
    questions: Array<{
      question: string;
      options: string[];
      correctAnswerIndex: number;
    }>;
  };
}

// Union type for all possible blocks
export type Block = TextBlock | VideoBlock | ImageBlock | DownloadBlock | ExternalLinksBlock | QuizBlock;