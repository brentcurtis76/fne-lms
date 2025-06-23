import { useState, useEffect, useCallback } from 'react';
import { PlusIcon } from '@heroicons/react/outline';
import PostCard from './PostCard';
import CreatePostModal from './CreatePostModal';
import CommentModal from './CommentModal';
import FeedSkeleton from './FeedSkeleton';
import { FeedService } from '@/lib/services/feedService';
import type { CommunityPost, CreatePostInput } from '@/types/feed';

interface FeedContainerProps {
  workspaceId: string;
  userName: string;
  userAvatar?: string;
}

export default function FeedContainer({ workspaceId, userName, userAvatar }: FeedContainerProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const limit = 10;

  const loadPosts = useCallback(async (reset = false) => {
    if (!reset && !hasMore) return;

    try {
      setLoading(true);
      const currentOffset = reset ? 0 : offset;
      const { posts: newPosts, hasMore: more } = await FeedService.getPosts(workspaceId, {
        limit,
        offset: currentOffset,
      });

      if (reset) {
        setPosts(newPosts);
        setOffset(limit);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
        setOffset(prev => prev + limit);
      }
      
      setHasMore(more);
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, offset, hasMore]);

  useEffect(() => {
    loadPosts(true);
  }, [workspaceId]);

  const handleCreatePost = async (postData: CreatePostInput) => {
    try {
      const newPost = await FeedService.createPost(workspaceId, postData);
      setPosts(prev => [newPost, ...prev]);
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  };

  const handleScroll = useCallback(() => {
    if (loading || !hasMore) return;

    const scrolledToBottom = 
      window.innerHeight + window.scrollY >= document.documentElement.offsetHeight - 100;

    if (scrolledToBottom) {
      loadPosts();
    }
  }, [loading, hasMore, loadPosts]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts(true);
  };

  const handleComment = (postId: string) => {
    const post = posts.find(p => p.id === postId);
    if (post) {
      setSelectedPost(post);
      setShowCommentModal(true);
    }
  };

  const handlePostUpdate = (updatedPost: CommunityPost) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
  };

  const handlePostDelete = (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Create post prompt */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full flex items-center space-x-3 text-left hover:bg-gray-50 rounded-lg p-3 transition-colors"
        >
          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={userName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="text-gray-500 font-medium">
                {userName.split(' ').map(n => n[0]).join('')}
              </span>
            )}
          </div>
          <span className="text-gray-500">¿Qué quieres compartir?</span>
        </button>
      </div>

      {/* Pull to refresh indicator */}
      {refreshing && (
        <div className="text-center py-4">
          <div className="inline-flex items-center space-x-2 text-gray-500">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Actualizando...</span>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="space-y-4">
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onUpdate={handlePostUpdate}
            onDelete={handlePostDelete}
            onComment={handleComment}
          />
        ))}
      </div>

      {/* Loading skeleton */}
      {loading && posts.length === 0 && (
        <div className="space-y-4">
          <FeedSkeleton />
          <FeedSkeleton />
          <FeedSkeleton />
        </div>
      )}

      {/* Load more indicator */}
      {loading && posts.length > 0 && (
        <div className="text-center py-8">
          <div className="inline-flex items-center space-x-2 text-gray-500">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Cargando más publicaciones...</span>
          </div>
        </div>
      )}

      {/* No more posts */}
      {!hasMore && posts.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No hay más publicaciones</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && posts.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex flex-col items-center">
            <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              No hay publicaciones aún
            </h3>
            <p className="text-gray-500 mb-4">
              Sé el primero en compartir algo con tu comunidad
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#00365b]/90 transition-colors"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Crear publicación
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Button for mobile */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-20 right-4 lg:hidden h-14 w-14 bg-[#fdb933] text-white rounded-full shadow-lg flex items-center justify-center hover:bg-[#fdb933]/90 transition-colors"
      >
        <PlusIcon className="h-6 w-6" />
      </button>

      {/* Create Post Modal */}
      <CreatePostModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreatePost}
        authorName={userName}
        authorAvatar={userAvatar}
      />

      {/* Comment Modal */}
      {selectedPost && (
        <CommentModal
          isOpen={showCommentModal}
          onClose={() => {
            setShowCommentModal(false);
            setSelectedPost(null);
            // Reload posts to update comment count
            loadPosts(true);
          }}
          post={selectedPost}
        />
      )}
    </div>
  );
}