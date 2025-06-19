// Instagram-style feed service for Collaborative Space

import { supabase } from '../supabase';
import type { 
  CommunityPost, 
  CreatePostInput, 
  UpdatePostInput,
  FeedFilters,
  PostReaction,
  PostComment,
  ReactionType
} from '@/types/feed';

export class FeedService {
  /**
   * Get posts for a workspace with pagination and filters
   */
  static async getPosts(
    workspaceId: string,
    options: {
      limit?: number;
      offset?: number;
      filters?: FeedFilters;
    } = {}
  ): Promise<{ posts: CommunityPost[]; hasMore: boolean; total: number }> {
    const { limit = 10, offset = 0, filters = {} } = options;

    try {
      let query = supabase
        .from('posts_with_engagement')
        .select('*, author:profiles!author_id(*)', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply filters
      if (filters.type) {
        query = query.eq('type', filters.type);
      }
      if (filters.author_id) {
        query = query.eq('author_id', filters.author_id);
      }
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      const { data: posts, error, count } = await query;

      if (error) {
        // Check if it's a table not found error
        if (error.message.includes('relation "posts_with_engagement" does not exist')) {
          console.warn('Feed tables not configured yet');
          return { posts: [], hasMore: false, total: 0 };
        }
        throw error;
      }

      // Fetch additional data for each post
      const enrichedPosts = await Promise.all(
        (posts || []).map(async (post) => {
          // Get media
          const { data: media } = await supabase
            .from('post_media')
            .select('*')
            .eq('post_id', post.id)
            .order('order_index');

          // Get reactions
          const { data: reactions } = await supabase
            .from('post_reactions')
            .select('*, user:profiles!user_id(first_name, last_name, avatar_url)')
            .eq('post_id', post.id);

          // Get user's reaction
          const { data: userReaction } = await supabase
            .from('post_reactions')
            .select('reaction_type')
            .eq('post_id', post.id)
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
            .single();

          // Get hashtags
          const { data: hashtags } = await supabase
            .from('post_hashtags')
            .select('hashtag')
            .eq('post_id', post.id);

          // Check if saved
          const { data: savedPost } = await supabase
            .from('saved_posts')
            .select('id')
            .eq('post_id', post.id)
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
            .single();

          return {
            ...post,
            media: media || [],
            reactions: reactions || [],
            user_reaction: userReaction?.reaction_type,
            hashtags: hashtags?.map(h => h.hashtag) || [],
            is_saved: !!savedPost,
          } as CommunityPost;
        })
      );

      return {
        posts: enrichedPosts,
        hasMore: (count || 0) > offset + limit,
        total: count || 0,
      };
    } catch (error) {
      console.error('Error fetching posts:', error);
      throw error;
    }
  }

  /**
   * Create a new post
   */
  static async createPost(
    workspaceId: string,
    input: CreatePostInput
  ): Promise<CommunityPost> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Start a transaction
      const { data: post, error: postError } = await supabase
        .from('community_posts')
        .insert({
          workspace_id: workspaceId,
          author_id: user.id,
          type: input.type,
          content: input.content,
          visibility: input.visibility || 'community',
        })
        .select()
        .single();

      if (postError) {
        // Check if it's a table not found error
        if (postError.message.includes('relation "community_posts" does not exist')) {
          throw new Error('Las tablas del feed no están configuradas. Por favor, contacta al administrador.');
        }
        throw postError;
      }

      // Handle media uploads
      if (input.media && input.media.length > 0) {
        const mediaPromises = input.media.map(async (file, index) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${post.id}/${index}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('post-media')
            .upload(fileName, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('post-media')
            .getPublicUrl(fileName);

          return {
            post_id: post.id,
            type: file.type.startsWith('image/') ? 'image' : 'video',
            url: publicUrl,
            storage_path: uploadData.path,
            order_index: index,
            metadata: {
              size: file.size,
              type: file.type,
            },
          };
        });

        const mediaData = await Promise.all(mediaPromises);
        await supabase.from('post_media').insert(mediaData);
      }

      // Handle hashtags
      if (input.hashtags && input.hashtags.length > 0) {
        const hashtagData = input.hashtags.map(tag => ({
          post_id: post.id,
          hashtag: tag.toLowerCase().replace('#', ''),
        }));
        await supabase.from('post_hashtags').insert(hashtagData);
      }

      // Handle mentions
      if (input.mentions && input.mentions.length > 0) {
        const mentionData = input.mentions.map(userId => ({
          post_id: post.id,
          mentioned_user_id: userId,
        }));
        await supabase.from('post_mentions').insert(mentionData);
      }

      // Return the created post with all data
      const { posts } = await this.getPosts(workspaceId, { 
        limit: 1, 
        filters: { author_id: user.id } 
      });
      
      return posts[0];
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  }

  /**
   * Update a post
   */
  static async updatePost(
    postId: string,
    updates: UpdatePostInput
  ): Promise<CommunityPost> {
    try {
      const { data: post, error } = await supabase
        .from('community_posts')
        .update(updates)
        .eq('id', postId)
        .select()
        .single();

      if (error) throw error;

      return post as CommunityPost;
    } catch (error) {
      console.error('Error updating post:', error);
      throw error;
    }
  }

  /**
   * Delete a post
   */
  static async deletePost(postId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('community_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting post:', error);
      throw error;
    }
  }

  /**
   * Toggle reaction on a post
   */
  static async toggleReaction(
    postId: string,
    reactionType: ReactionType = 'like'
  ): Promise<{ added: boolean }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      // Check if reaction exists
      const { data: existing } = await supabase
        .from('post_reactions')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Remove reaction
        await supabase
          .from('post_reactions')
          .delete()
          .eq('id', existing.id);
        return { added: false };
      } else {
        // Add reaction
        await supabase
          .from('post_reactions')
          .insert({
            post_id: postId,
            user_id: user.id,
            reaction_type: reactionType,
          });
        return { added: true };
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      throw error;
    }
  }

  /**
   * Add a comment to a post
   */
  static async addComment(
    postId: string,
    content: string,
    parentCommentId?: string
  ): Promise<PostComment> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const { data: comment, error } = await supabase
        .from('post_comments')
        .insert({
          post_id: postId,
          author_id: user.id,
          content,
          parent_comment_id: parentCommentId,
        })
        .select('*, author:profiles!author_id(*)')
        .single();

      if (error) throw error;

      return comment as PostComment;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Get comments for a post
   */
  static async getComments(
    postId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ comments: PostComment[]; hasMore: boolean }> {
    try {
      const { data: comments, error, count } = await supabase
        .from('post_comments')
        .select('*, author:profiles!author_id(*)', { count: 'exact' })
        .eq('post_id', postId)
        .is('parent_comment_id', null) // Get top-level comments only
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Fetch replies for each comment
      const enrichedComments = await Promise.all(
        (comments || []).map(async (comment) => {
          const { data: replies } = await supabase
            .from('post_comments')
            .select('*, author:profiles!author_id(*)')
            .eq('parent_comment_id', comment.id)
            .order('created_at', { ascending: true });

          return {
            ...comment,
            replies: replies || [],
          } as PostComment;
        })
      );

      return {
        comments: enrichedComments,
        hasMore: (count || 0) > offset + limit,
      };
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw error;
    }
  }

  /**
   * Save/unsave a post
   */
  static async toggleSavePost(postId: string): Promise<{ saved: boolean }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const { data: existing } = await supabase
        .from('saved_posts')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        await supabase
          .from('saved_posts')
          .delete()
          .eq('id', existing.id);
        return { saved: false };
      } else {
        await supabase
          .from('saved_posts')
          .insert({
            post_id: postId,
            user_id: user.id,
          });
        return { saved: true };
      }
    } catch (error) {
      console.error('Error toggling save:', error);
      throw error;
    }
  }

  /**
   * Increment view count
   */
  static async incrementViewCount(postId: string): Promise<void> {
    try {
      await supabase.rpc('increment_post_view_count', { post_id: postId });
    } catch (error) {
      console.error('Error incrementing view count:', error);
      // Non-critical error, don't throw
    }
  }
}