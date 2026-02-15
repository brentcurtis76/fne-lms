import React, { useState } from 'react';
import { Volume2, ChevronDown, ChevronUp, FileText } from 'lucide-react';

interface AudioPlayerProps {
  audioUrl: string;
  transcript?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, transcript }) => {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Audio player */}
      <div className="flex items-center space-x-3">
        <Volume2 className="h-5 w-5 text-brand_accent" />
        <audio controls className="flex-1 h-10" aria-label="Reproducir audio del informe">
          <source src={audioUrl} type="audio/mpeg" />
          <source src={audioUrl} type="audio/wav" />
          <source src={audioUrl} type="audio/webm" />
          Tu navegador no soporta la reproducción de audio.
        </audio>
      </div>

      {/* Transcript section */}
      {transcript && (
        <div className="border-t border-gray-200 pt-3">
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            aria-expanded={showTranscript}
            className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-brand_accent transition-colors"
          >
            <FileText className="h-4 w-4" />
            <span>Transcripción</span>
            {showTranscript ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {showTranscript && (
            <div className="mt-3 p-3 bg-gray-50 rounded-md max-h-64 overflow-y-auto" tabIndex={0}>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{transcript}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioPlayer;
