import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import FeedbackModal from './FeedbackModal';

interface FeedbackButtonProps {
  className?: string;
}

export default function FeedbackButton({ className = '' }: FeedbackButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleClick = () => {
    setHasInteracted(true);
    setIsModalOpen(true);
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleClick}
        className={`
          fixed bottom-6 right-6 z-40
          bg-[#fbbf24] hover:bg-[#fca311] text-[#0a0a0a]
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
        <div className="fixed bottom-24 right-6 z-40 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 pointer-events-none animate-[fadeIn_0.3s_ease-out]">
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
    </>
  );
}