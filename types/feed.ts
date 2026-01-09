// Instagram-style feed types for Collaborative Space

export type PostType = 'text' | 'image' | 'document' | 'link' | 'poll' | 'question';
export type ReactionType = 'like' | 'love' | 'celebrate' | 'support' | 'insightful';
export type PostVisibility = 'community' | 'school' | 'private';

export interface PostAuthor {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  role: string;
}

export interface PostMedia {
  id: string;
  type: 'image' | 'video' | 'document';
  url: string;
  thumbnail_url?: string;
  caption?: string;
  order_index: number;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    size?: number;
    type?: string;
    name?: string;
  };
}

export interface PostReaction {
  id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
  user?: {
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  parent_comment_id?: string;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  author?: PostAuthor;
  replies?: PostComment[];
  reaction_count?: number;
}

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
  domain: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters?: string[]; // User IDs who voted
}

export interface PollData {
  question: string;
  options: PollOption[];
  allow_multiple: boolean;
  ends_at?: string;
  total_votes: number;
  user_voted?: boolean;
  user_votes?: string[]; // Option IDs user voted for
}

export interface PostContent {
  text?: string;
  richText?: any; // TipTap JSON content for rich text rendering
  images?: string[]; // URLs for quick access
  document?: {
    id: string;
    name: string;
    url: string;
    size: number;
    type: string;
  };
  link?: LinkPreview;
  poll?: PollData;
}

export interface CommunityPost {
  id: string;
  workspace_id: string;
  author_id: string;
  type: PostType;
  content: PostContent;
  visibility: PostVisibility;
  is_pinned: boolean;
  is_archived: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  
  // Joined data
  author?: PostAuthor;
  media?: PostMedia[];
  reactions?: PostReaction[];
  comments?: PostComment[];
  mentions?: string[]; // User IDs
  hashtags?: string[];
  
  // Computed fields
  reaction_count?: number;
  comment_count?: number;
  is_saved?: boolean;
  user_reaction?: ReactionType;
}

export interface CreatePostInput {
  type: PostType;
  content: PostContent;
  visibility?: PostVisibility;
  media?: File[];
  mentions?: string[];
  hashtags?: string[];
}

export interface UpdatePostInput {
  content?: PostContent;
  visibility?: PostVisibility;
  is_pinned?: boolean;
  is_archived?: boolean;
}

export interface FeedFilters {
  type?: PostType;
  author_id?: string;
  hashtag?: string;
  saved_only?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface FeedPagination {
  limit: number;
  offset: number;
  has_more: boolean;
  total_count?: number;
}