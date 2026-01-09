import { useEffect, useRef } from 'react';
import CommentThread from './CommentThread';
import type { CommunityPost } from '@/types/feed';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: CommunityPost;
}

export default function CommentModal({ isOpen, onClose, post }: CommentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Handle ESC key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    // Handle click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent scrolling
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:items-center sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        
        {/* Modal */}
        <div 
          ref={modalRef}
          className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg lg:max-w-2xl"
        >
          <div className="h-[600px] flex flex-col">
            <CommentThread postId={post.id} onClose={onClose} />
          </div>
        </div>
      </div>
    </div>
  );
}