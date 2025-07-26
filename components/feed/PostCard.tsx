import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  HeartIcon, 
  ChatAlt2Icon, 
  BookmarkIcon,
  DotsHorizontalIcon,
  ShareIcon,
  LinkIcon,
  DocumentIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/outline';
import {
  HeartIcon as HeartSolidIcon,
  BookmarkIcon as BookmarkSolidIcon
} from '@heroicons/react/solid';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import type { CommunityPost, ReactionType } from '@/types/feed';
import { FeedService } from '@/lib/services/feedService';
import ConfirmationModal from './ConfirmationModal';

interface PostCardProps {
  post: CommunityPost;
  onUpdate?: (post: CommunityPost) => void;
  onDelete?: (postId: string) => void;
  onComment?: (postId: string) => void;
}

export default function PostCard({ post, onUpdate, onDelete, onComment }: PostCardProps) {
  const supabase = useSupabaseClient();
  const [isLiked, setIsLiked] = useState(!!post.user_reaction);
  const [isSaved, setIsSaved] = useState(post.is_saved || false);
  const [reactionCount, setReactionCount] = useState(post.reaction_count || 0);
  const [showFullText, setShowFullText] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [isOwnPost, setIsOwnPost] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Function to render text with mentions
  const renderTextWithMentions = (text: string) => {
    // Simple regex to find @mentions
    const mentionRegex = /@(\w+\s?\w*)/g;
    const parts = text.split(mentionRegex);
    
    return parts.map((part, index) => {
      // Even indices are regular text, odd indices are captured mention names
      if (index % 2 === 0) {
        return <span key={index}>{part}</span>;
      } else {
        return (
          <span
            key={index}
            className="text-blue-600 font-medium hover:underline cursor-pointer"
          >
            @{part}
          </span>
        );
      }
    });
  };

  // Check if own post
  useEffect(() => {
    // Removed automatic view counting - it was creating fake inflated numbers
    
    // Check if this is the current user's post
    const checkOwnPost = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && post.author_id === user.id) {
          setIsOwnPost(true);
        }
      } catch (error) {
        console.error('Error checking post ownership:', error);
      }
    };
    
    checkOwnPost();
  }, [post.id, post.author_id]);

  const handleReaction = async () => {
    try {
      const { added } = await FeedService.toggleReaction(post.id);
      setIsLiked(added);
      setReactionCount(prev => added ? prev + 1 : prev - 1);
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  const handleSave = async () => {
    try {
      const { saved } = await FeedService.toggleSavePost(post.id);
      setIsSaved(saved);
    } catch (error) {
      console.error('Error toggling save:', error);
    }
  };

  const handleEdit = () => {
    // TODO: Implement edit functionality
    alert('Editar publicación - Próximamente');
    setShowMenu(false);
  };

  const handleDelete = async () => {
    setShowMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      await FeedService.deletePost(post.id);
      onDelete?.(post.id);
    } catch (error) {
      console.error('Error deleting post:', error);
      // TODO: Replace with toast notification
      alert('Error al eliminar la publicación');
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showMenu && !(event.target as Element).closest('.post-menu')) {
        setShowMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMenu]);

  const renderContent = () => {
    switch (post.type) {
      case 'text':
        return (
          <div className="mt-3">
            <p className={`text-gray-800 whitespace-pre-wrap ${!showFullText ? 'line-clamp-3' : ''}`}>
              {post.content.text ? renderTextWithMentions(post.content.text) : ''}
            </p>
            {post.content.text && post.content.text.length > 150 && (
              <button
                onClick={() => setShowFullText(!showFullText)}
                className="text-[#00365b] text-sm mt-1 hover:underline"
              >
                {showFullText ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        );

      case 'image':
        return (
          <div className="mt-3">
            {post.content.text && (
              <p className="text-gray-800 mb-3">{renderTextWithMentions(post.content.text)}</p>
            )}
            {post.media && post.media.length > 0 && (
              <div className="relative">
                <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={post.media[currentImageIndex].url}
                    alt={post.media[currentImageIndex].caption || 'Imagen'}
                    className="w-full h-full object-cover"
                  />
                </div>
                {post.media.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex space-x-1">
                    {post.media.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-2 h-2 rounded-full ${
                          index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'document':
        return (
          <div className="mt-3">
            {post.content.text && (
              <p className="text-gray-800 mb-3">{renderTextWithMentions(post.content.text)}</p>
            )}
            {/* Handle documents from media array */}
            {post.media && post.media.length > 0 && (
              <div className="space-y-2">
                {post.media.map((media, index) => (
                  <a
                    key={index}
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <DocumentIcon className="h-10 w-10 text-[#00365b] mr-3" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {media.metadata?.name || 'Documento'}
                      </p>
                      {media.metadata?.size && (
                        <p className="text-xs text-gray-500">
                          {(media.metadata.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
            {/* Legacy support for content.document */}
            {post.content.document && (
              <a
                href={post.content.document.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <DocumentIcon className="h-10 w-10 text-[#00365b] mr-3" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {post.content.document.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(post.content.document.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </a>
            )}
          </div>
        );

      case 'link':
        return (
          <div className="mt-3">
            {post.content.text && (
              <p className="text-gray-800 mb-3">{renderTextWithMentions(post.content.text)}</p>
            )}
            {post.content.link && (
              <a
                href={post.content.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
              >
                {post.content.link.image && (
                  <div className="relative h-48 bg-gray-100">
                    <img
                      src={post.content.link.image}
                      alt={post.content.link.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-3">
                  <p className="font-medium text-gray-900 line-clamp-1">
                    {post.content.link.title}
                  </p>
                  {post.content.link.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {post.content.link.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2 flex items-center">
                    <LinkIcon className="h-3 w-3 mr-1" />
                    {post.content.link.domain}
                  </p>
                </div>
              </a>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="relative h-10 w-10">
            {post.author?.avatar_url && post.author.avatar_url.startsWith('http') ? (
              <img
                src={post.author.avatar_url}
                alt={`${post.author.first_name} ${post.author.last_name}`}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <div className="h-full w-full rounded-full bg-[#00365b] flex items-center justify-center text-white font-medium">
                {post.author?.first_name?.[0]}{post.author?.last_name?.[0]}
              </div>
            )}
          </div>
          <div>
            <p className="font-medium text-gray-900">
              {post.author?.first_name} {post.author?.last_name}
            </p>
            <p className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(post.created_at), { 
                addSuffix: true, 
                locale: es 
              })}
            </p>
          </div>
        </div>
        <div className="relative post-menu">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <DotsHorizontalIcon className="h-5 w-5" />
          </button>
          
          {showMenu && isOwnPost && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              <button
                onClick={handleEdit}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
              >
                <PencilIcon className="h-4 w-4" />
                <span>Editar publicación</span>
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50 flex items-center space-x-2"
              >
                <TrashIcon className="h-4 w-4" />
                <span>Eliminar publicación</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        {renderContent()}
      </div>

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {post.hashtags.map((tag, index) => (
            <span
              key={index}
              className="text-sm text-[#00365b] hover:underline cursor-pointer"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="px-4 pb-2 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center space-x-4">
          {reactionCount > 0 && (
            <span>{reactionCount} Me gusta</span>
          )}
          {post.comment_count && post.comment_count > 0 && (
            <span>{post.comment_count} comentarios</span>
          )}
        </div>
        {/* View count removed - it was showing fake inflated numbers */}
      </div>

      {/* Actions */}
      <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between">
        <button
          onClick={handleReaction}
          className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
            isLiked 
              ? 'text-red-600 bg-red-50' 
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {isLiked ? (
            <HeartSolidIcon className="h-5 w-5" />
          ) : (
            <HeartIcon className="h-5 w-5" />
          )}
          <span className="text-sm font-medium">Me gusta</span>
        </button>

        <button
          onClick={() => onComment?.(post.id)}
          className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ChatAlt2Icon className="h-5 w-5" />
          <span className="text-sm font-medium">Comentar</span>
        </button>

        <button
          className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <ShareIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Compartir</span>
        </button>

        <button
          onClick={handleSave}
          className={`p-2 rounded-lg transition-colors ${
            isSaved 
              ? 'text-[#fdb933]' 
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {isSaved ? (
            <BookmarkSolidIcon className="h-5 w-5" />
          ) : (
            <BookmarkIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Eliminar publicación"
        message="¿Estás seguro de que deseas eliminar esta publicación? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </div>
  );
}