import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  ChatAlt2Icon,
  ReplyIcon,
  PencilIcon,
  TrashIcon,
  DotsHorizontalIcon
} from '@heroicons/react/outline';
import { FeedService } from '@/lib/services/feedService';
import { supabase } from '@/lib/supabase';
import type { PostComment } from '@/types/feed';
import ConfirmationModal from './ConfirmationModal';

interface CommentThreadProps {
  postId: string;
  onClose?: () => void;
}

interface CommentItemProps {
  comment: PostComment;
  onReply: (comment: PostComment) => void;
  onDelete: (commentId: string) => void;
  currentUserId: string;
  isReply?: boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({ 
  comment, 
  onReply, 
  onDelete, 
  currentUserId,
  isReply = false 
}) => {
  const supabase = useSupabaseClient();
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isOwnComment = comment.author_id === currentUserId;

  const handleDelete = () => {
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete(comment.id);
    setShowDeleteConfirm(false);
  };

  return (
    <div className={`flex space-x-3 ${isReply ? 'ml-12' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        {comment.author?.avatar_url ? (
          <img
            src={comment.author.avatar_url}
            alt={`${comment.author.first_name} ${comment.author.last_name}`}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-[#00365b] flex items-center justify-center text-white text-sm font-medium">
            {comment.author?.first_name?.[0]}{comment.author?.last_name?.[0]}
          </div>
        )}
      </div>

      {/* Comment content */}
      <div className="flex-1 min-w-0">
        <div className="bg-gray-100 rounded-lg px-4 py-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-900">
              {comment.author?.first_name} {comment.author?.last_name}
            </p>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(comment.created_at), { 
                  addSuffix: true, 
                  locale: es 
                })}
              </span>
              {isOwnComment && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <DotsHorizontalIcon className="h-4 w-4" />
                  </button>
                  {showMenu && (
                    <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                      <button
                        onClick={handleDelete}
                        className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-gray-50 flex items-center space-x-2"
                      >
                        <TrashIcon className="h-3 w-3" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{comment.content}</p>
          {comment.is_edited && (
            <p className="text-xs text-gray-500 mt-1">(editado)</p>
          )}
        </div>
        
        {/* Reply button */}
        {!isReply && (
          <button
            onClick={() => onReply(comment)}
            className="mt-1 text-xs text-[#00365b] hover:underline flex items-center space-x-1"
          >
            <ReplyIcon className="h-3 w-3" />
            <span>Responder</span>
          </button>
        )}

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                onReply={onReply}
                onDelete={onDelete}
                currentUserId={currentUserId}
                isReply={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Eliminar comentario"
        message="¿Estás seguro de que deseas eliminar este comentario? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </div>
  );
};

export default function CommentThread({ postId, onClose }: CommentThreadProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const limit = 20;

  useEffect(() => {
    loadComments(true);
    getCurrentUser();
  }, [postId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const loadComments = async (reset = false) => {
    try {
      setLoading(true);
      const currentOffset = reset ? 0 : offset;
      const { comments: newComments, hasMore: more } = await FeedService.getComments(
        postId,
        limit,
        currentOffset
      );

      if (reset) {
        setComments(newComments);
        setOffset(limit);
      } else {
        setComments(prev => [...prev, ...newComments]);
        setOffset(prev => prev + limit);
      }
      
      setHasMore(more);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || posting) return;

    try {
      setPosting(true);
      const comment = await FeedService.addComment(
        postId,
        newComment.trim(),
        replyingTo?.id
      );

      if (replyingTo) {
        // Add reply to the parent comment
        setComments(prevComments => 
          prevComments.map(c => {
            if (c.id === replyingTo.id) {
              return {
                ...c,
                replies: [...(c.replies || []), comment]
              };
            }
            return c;
          })
        );
      } else {
        // Add new top-level comment
        setComments(prev => [comment, ...prev]);
      }

      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Error posting comment:', error);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      // Delete from Supabase
      const { error } = await supabase
        .from('post_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      // Remove from local state
      setComments(prevComments => {
        const removeComment = (comments: PostComment[]): PostComment[] => {
          return comments.reduce((acc, comment) => {
            if (comment.id === commentId) {
              return acc;
            }
            if (comment.replies) {
              comment.replies = removeComment(comment.replies);
            }
            return [...acc, comment];
          }, [] as PostComment[]);
        };
        return removeComment(prevComments);
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Error al eliminar el comentario');
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadComments();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Comentarios</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && comments.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex space-x-3">
                <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                  <div className="h-16 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onReply={setReplyingTo}
                onDelete={handleDelete}
                currentUserId={currentUserId}
              />
            ))}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="w-full py-2 text-sm text-[#00365b] hover:text-[#00365b]/80 font-medium"
              >
                {loading ? 'Cargando...' : 'Cargar más comentarios'}
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <ChatAlt2Icon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
            <p className="text-gray-500">
              Sé el primero en comentar
            </p>
          </div>
        )}
      </div>

      {/* Comment input */}
      <div className="border-t border-gray-200 px-4 py-3">
        {replyingTo && (
          <div className="mb-2 px-3 py-2 bg-gray-50 rounded-lg flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Respondiendo a <span className="font-medium">{replyingTo.author?.first_name} {replyingTo.author?.last_name}</span>
            </p>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex space-x-3">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={replyingTo ? 'Escribe tu respuesta...' : 'Escribe un comentario...'}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
            disabled={posting}
          />
          <button
            type="submit"
            disabled={!newComment.trim() || posting}
            className="px-4 py-2 bg-[#00365b] text-white rounded-full hover:bg-[#00365b]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {posting ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  );
}