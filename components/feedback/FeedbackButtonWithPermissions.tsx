import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import FeedbackModal from './FeedbackModal';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';

interface FeedbackButtonProps {
  className?: string;
}

export default function FeedbackButtonWithPermissions({ className = '' }: FeedbackButtonProps) {
  const supabase = useSupabaseClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const user = useUser();

  useEffect(() => {
    checkPermission();
  }, [user]);

  const checkPermission = async () => {
    if (!user) {
      setHasPermission(false);
      setLoading(false);
      return;
    }

    try {
      // Check if user has feedback permission using the database function
      const { data, error } = await supabase
        .rpc('has_feedback_permission', { check_user_id: user.id });
      
      if (error) {
        console.error('Error checking feedback permission:', error);
        setHasPermission(false);
      } else {
        setHasPermission(data === true);
      }
    } catch (error) {
      console.error('Error checking feedback permission:', error);
      setHasPermission(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    setHasInteracted(true);
    setIsModalOpen(true);
  };

  // Don't render if loading or no permission
  if (loading || !hasPermission) {
    return null;
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleClick}
        className={`
          fixed bottom-6 right-6 z-40
          bg-[#fdb933] hover:bg-[#fca311] text-[#00365b]
          rounded-full p-4 shadow-lg hover:shadow-xl
          transition-all duration-300 transform hover:scale-110
          flex items-center justify-center
          ${!hasInteracted ? 'animate-pulse' : ''}
          ${className}
        `}
        title="¿Encontraste un problema? ¡Cuéntanos!"
        aria-label="Enviar feedback"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Tooltip on first load */}
      {!hasInteracted && (
        <div className="fixed bottom-24 right-6 z-40 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 pointer-events-none animate-fade-in">
          <div className="relative">
            ¿Encontraste un problema? ¡Cuéntanos!
            <div className="absolute -bottom-2 right-4 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-gray-800"></div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}