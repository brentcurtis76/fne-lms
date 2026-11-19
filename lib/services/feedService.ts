// Instagram-style feed service for Collaborative Space

import { toast } from 'react-hot-toast';
import { supabase } from '../supabase-wrapper';
import { fetchProfileCards, type ProfileCard } from '../profile-cards';
import type { 
  CommunityPost, 
  CreatePostInput, 
  UpdatePostInput,
  FeedFilters,
  PostReaction,
  PostComment,
  ReactionType
} from '@/types/feed';

const MENTION_NOTIFICATION_FAILED =
  'Tu publicación se guardó, pero no pudimos enviar la notificación de mención.';

const NO_PERMISSION =
  'No tienes permisos para publicar en esta comunidad. Verifica que estés asignado a la comunidad.';
const PUBLISH_FAILED = 'No se pudo publicar. Inténtalo de nuevo.';

/** An error of createPost whose message is a Spanish sentence for the person (EC-V7). */
export class FeedPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedPublishError';
  }
}

/**
 * The store's answer to an upload of a path that already holds a file: a
 * StorageApiError with status / statusCode 409 and "The resource already
 * exists" (@supabase/storage-js src/lib/errors.ts:14-23, src/lib/fetch.ts:35-37).
 * Only exactly that counts as uploaded; any other refusal is a failure.
 */
function isAlreadyStored(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown } | null;
  if (!e) return false;
  const conflict = e.status === 409 || String(e.statusCode ?? '') === '409';
  return conflict && /already exists/i.test(String(e.message ?? ''));
}

/** Whatever createPost throws reaches the person as a Spanish sentence. */
function asPublishError(error: unknown): FeedPublishError {
  if (error instanceof FeedPublishError) return error;
  const message = String((error as { message?: unknown } | null)?.message ?? '');
  if (message.includes('row-level security')) return new FeedPublishError(NO_PERMISSION);
  return new FeedPublishError(PUBLISH_FAILED);
}

/** A profile card in the author shape the feed components read (author.first_name, …). */
function cardAsAuthor(card: ProfileCard | undefined): PostComment['author'] {
  return (card ?? null) as PostComment['author'];
}

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
        .select('*', { count: 'exact' })
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
            .select('*')
            .eq('post_id', post.id);

          // Get user's reaction (use maybeSingle to avoid 406 error when no reaction exists)
          const { data: userReaction } = await supabase
            .from('post_reactions')
            .select('reaction_type')
            .eq('post_id', post.id)
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
            .maybeSingle();

          // Get hashtags
          const { data: hashtags } = await supabase
            .from('post_hashtags')
            .select('hashtag')
            .eq('post_id', post.id);

          // Check if saved (use maybeSingle to avoid 406 error when not saved)
          const { data: savedPost } = await supabase
            .from('saved_posts')
            .select('id')
            .eq('post_id', post.id)
            .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
            .maybeSingle();

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

      // Authors' and reactors' names through the profile cards (EC-S5), in one call
      const cards = await fetchProfileCards(supabase, enrichedPosts.flatMap((post) => [
        post.author_id,
        ...(post.reactions || []).map((reaction) => reaction.user_id),
      ]));
      const postsWithNames = enrichedPosts.map((post) => ({
        ...post,
        author: (cards.get(post.author_id) ?? null) as CommunityPost['author'],
        reactions: (post.reactions || []).map((reaction) => ({
          ...reaction,
          user: (cards.get(reaction.user_id) ?? undefined) as PostReaction['user'],
        })),
      }));

      return {
        posts: postsWithNames,
        hasMore: (count || 0) > offset + limit,
        total: count || 0,
      };
    } catch (error) {
      console.error('Error fetching posts:', error);
      throw error;
    }
  }

  /**
   * Create a new post (EC-V7: files first, one post per composition).
   *
   * `postId`: the id the composing window gave this composition. It is kept
   * across retries, so the post can exist only once. Every file is put in the
   * `post-media` store BEFORE the post is written: if an upload fails, no post
   * exists. A person cannot delete from that store (its delete rule needs the
   * path to start with their own id), so files from a failed try stay, and on
   * the retry the store's "already exists" answer counts as uploaded.
   */
  static async createPost(
    workspaceId: string,
    input: CreatePostInput,
    postId?: string
  ): Promise<CommunityPost> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new FeedPublishError('Usuario no autenticado');

      // Check if user can access workspace before creating post
      const canAccess = await supabase.rpc('can_access_workspace', {
        p_user_id: user.id,
        p_workspace_id: workspaceId
      });
      
      if (!canAccess.data) {
        throw new FeedPublishError(NO_PERMISSION);
      }

      const id = postId || crypto.randomUUID();

      // 1. Every file into the store first; nothing is written if one fails.
      const files = input.media ?? [];
      const uploads = await Promise.all(
        files.map(async (file, index) => {
          const fileExt = file.name.split('.').pop();
          const fileName = `${id}/${index}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from('post-media')
            .upload(fileName, file);
          return { file, index, fileName, failed: Boolean(uploadError) && !isAlreadyStored(uploadError) };
        })
      );
      const failedUpload = uploads.find((upload) => upload.failed);
      if (failedUpload) {
        throw new FeedPublishError(
          `No se pudo subir «${failedUpload.file.name}». La publicación no se guardó; inténtalo de nuevo.`
        );
      }

      // 2. The post, with the composition's id.
      const { data: inserted, error: postError } = await supabase
        .from('community_posts')
        .insert({
          id,
          workspace_id: workspaceId,
          author_id: user.id,
          type: input.type,
          content: input.content,
          visibility: input.visibility || 'community',
        })
        .select()
        .single();

      let post = inserted;
      let alreadyThere = false;
      if (postError) {
        if ((postError as { code?: string }).code === '23505') {
          // A retry after a lost answer: the post is there if it is the
          // caller's own post in this workspace.
          const { data: existing } = await supabase
            .from('community_posts')
            .select('*')
            .eq('id', id)
            .eq('author_id', user.id)
            .eq('workspace_id', workspaceId)
            .maybeSingle();
          if (!existing) throw new FeedPublishError(PUBLISH_FAILED);
          post = existing;
          alreadyThere = true;
        } else if (postError.message?.includes('relation "community_posts" does not exist')) {
          throw new FeedPublishError('Las tablas del feed no están configuradas. Por favor, contacta al administrador.');
        } else {
          throw postError;
        }
      }

      // 3. The post_media rows that do not exist yet.
      if (uploads.length > 0) {
        const existingIndexes = new Set<number>();
        if (alreadyThere) {
          const { data: existingMedia, error: existingError } = await supabase
            .from('post_media')
            .select('order_index')
            .eq('post_id', post.id);
          if (existingError) throw new FeedPublishError(PUBLISH_FAILED);
          for (const row of (existingMedia ?? []) as Array<{ order_index: number }>) {
            existingIndexes.add(row.order_index);
          }
        }

        const mediaData = uploads
          .filter((upload) => !existingIndexes.has(upload.index))
          .map(({ file, index, fileName }) => {
            const { data: { publicUrl } } = supabase.storage
              .from('post-media')
              .getPublicUrl(fileName);

            // Determine media type
            let mediaType: 'image' | 'video' | 'document' = 'document';
            if (file.type.startsWith('image/')) {
              mediaType = 'image';
            } else if (file.type.startsWith('video/')) {
              mediaType = 'video';
            }

            return {
              post_id: post.id,
              type: mediaType,
              url: publicUrl,
              storage_path: fileName,
              order_index: index,
              metadata: {
                size: file.size,
                type: file.type,
                name: file.name,
              },
            };
          });

        if (mediaData.length > 0) {
          const { error: mediaError } = await supabase.from('post_media').insert(mediaData);
          if (mediaError) {
            console.error('Error inserting media:', mediaError);
            // Whole or nothing: the author's own delete rule removes the post again.
            await supabase.from('community_posts').delete().eq('id', post.id).eq('author_id', user.id);
            throw new FeedPublishError('No se pudo guardar la publicación con sus archivos. Inténtalo de nuevo.');
          }
        }
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

        // Trigger notifications for each mentioned user via API endpoint
        let mentionNotificationFailed = false;
        for (const mentionedUserId of input.mentions) {
          try {
            // Get auth token for API call
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const response = await fetch('/api/messaging/mention', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`
                },
                // The server derives the notification from the saved post and mention.
                body: JSON.stringify({
                  mentioned_user_id: mentionedUserId,
                  context: 'community_post',
                  discussion_id: post.id,
                })
              });
              
              if (!response.ok) {
                mentionNotificationFailed = true;
                console.error('❌ Mention notification rejected with status', response.status);
              }
            } else {
              mentionNotificationFailed = true;
              console.error('❌ No auth session found for mention notification');
            }
          } catch {
            mentionNotificationFailed = true;
            console.error('❌ Error triggering mention notification');
            // Don't fail the whole operation if notification fails
          }
        }
        // The post is already saved: tell the author only the notification failed.
        if (mentionNotificationFailed) {
          toast.error(MENTION_NOTIFICATION_FAILED, { duration: 8000 });
        }
      }

      // Return the created post with basic data
      // We'll let the UI refresh to get the full enriched data
      return {
        ...post,
        media: [],
        reactions: [],
        user_reaction: null,
        hashtags: [],
        is_saved: false,
        reaction_count: 0,
        comment_count: 0,
        view_count: 0,
        author: null, // Will be populated by UI refresh
      } as CommunityPost;
    } catch (error) {
      console.error('Error creating post:', error);
      throw asPublishError(error);
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
        .maybeSingle();

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
        .select('*')
        .single();

      if (error) throw error;

      const cards = await fetchProfileCards(supabase, [comment.author_id]);
      return { ...comment, author: cardAsAuthor(cards.get(comment.author_id)) } as PostComment;
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
        .select('*', { count: 'exact' })
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
            .select('*')
            .eq('parent_comment_id', comment.id)
            .order('created_at', { ascending: true });

          return {
            ...comment,
            replies: replies || [],
          } as PostComment;
        })
      );

      // Commenters' names through the profile cards (EC-S5), in one call
      const cards = await fetchProfileCards(supabase, enrichedComments.flatMap((comment) => [
        comment.author_id,
        ...(comment.replies || []).map((reply) => reply.author_id),
      ]));
      const commentsWithNames = enrichedComments.map((comment) => ({
        ...comment,
        author: cardAsAuthor(cards.get(comment.author_id)),
        replies: (comment.replies || []).map((reply) => ({ ...reply, author: cardAsAuthor(cards.get(reply.author_id)) })),
      }));

      return {
        comments: commentsWithNames,
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
        .maybeSingle();

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