import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, Loader2, FileAudio, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SessionReport } from '../../lib/types/consultor-sessions.types';
import { ReportSummary } from '../../lib/services/audio-transcription';

interface AudioReportUploaderProps {
  sessionId: string;
  onReportCreated: (report: SessionReport, transcript: string, summary: ReportSummary) => void;
  disabled?: boolean;
}

type ProcessingState = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

const AudioReportUploader: React.FC<AudioReportUploaderProps> = ({
  sessionId,
  onReportCreated,
  disabled = false,
}) => {
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MediaRecorder support check
  const [canRecord, setCanRecord] = useState(false);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      setCanRecord(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    };
  }, [mediaRecorder]);

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled || processingState !== 'idle') {
      return;
    }

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || processingState !== 'idle') {
      return;
    }

    const files = e.target.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      toast.error('El archivo debe ser de tipo audio (MP3, WAV, M4A, OGG, WEBM, AAC)');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error(`El archivo excede el tamaño máximo de 25 MB (tamaño: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      return;
    }

    await uploadAudio(file);
  };

  const uploadAudio = async (audioFile: File) => {
    setProcessingState('uploading');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('visibility', 'facilitators_only');

      const response = await fetch(`/api/sessions/${sessionId}/audio-report`, {
        method: 'POST',
        body: formData,
      });

      // Server received the file — now processing (transcription + summary)
      setProcessingState('processing');

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al procesar el audio');
      }

      setProcessingState('complete');
      toast.success('Informe de audio creado exitosamente');

      onReportCreated(result.data.report, result.data.transcript, result.data.summary);
    } catch (error: unknown) {
      console.error('Error uploading audio:', error);
      setProcessingState('error');
      const errorMsg = error instanceof Error ? error.message : 'Error al procesar el audio';
      setErrorMessage(errorMsg);
      toast.error(errorMsg);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });

        stream.getTracks().forEach(track => track.stop());

        await uploadAudio(audioFile);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      toast.success('Grabación iniciada');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Error al acceder al micrófono. Verifica los permisos.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      // Set isRecording false immediately for instant UI feedback (ID-3 fix)
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      mediaRecorder.stop();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const retry = () => {
    setProcessingState('idle');
    setErrorMessage(null);
    setRecordingTime(0);
  };

  if (disabled) {
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Informe por Audio</h3>

      {processingState === 'idle' && (
        <div className="space-y-4">
          {/* Upload drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 sm:p-6 md:p-8 text-center transition-colors ${
              dragActive
                ? 'border-brand_accent bg-brand_accent_light'
                : 'border-gray-300 hover:border-brand_accent hover:bg-gray-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <FileAudio className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Arrastra un archivo de audio aquí o haz clic para seleccionar
            </p>
            <p className="text-xs text-gray-500 mb-4">
              MP3, WAV, M4A, OGG, WEBM, AAC (máx. 25 MB)
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <Upload className="h-4 w-4 mr-2" />
              Seleccionar Archivo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Seleccionar archivo de audio"
            />
          </div>

          {/* Recording option */}
          {canRecord && !isRecording && (
            <div className="flex items-center justify-center">
              <div className="text-sm text-gray-500 mr-3">o</div>
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center whitespace-nowrap px-4 py-2 border border-brand_accent rounded-md shadow-sm text-sm font-medium text-brand_accent bg-white hover:bg-brand_accent_light transition-colors"
              >
                <Mic className="h-4 w-4 mr-2" />
                Grabar Audio
              </button>
            </div>
          )}

          {/* Recording in progress */}
          {isRecording && (
            <div className="flex items-center justify-center space-x-4 p-4 bg-red-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-red-700">Grabando</span>
              </div>
              <span className="text-sm text-red-600 font-mono">{formatTime(recordingTime)}</span>
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center px-4 py-2 border border-red-600 rounded-md text-sm font-medium text-red-600 bg-white hover:bg-red-50 transition-colors"
              >
                <Square className="h-4 w-4 mr-1.5" />
                Detener
              </button>
            </div>
          )}
        </div>
      )}

      {/* Processing states — announced to screen readers */}
      <div role="status" aria-live="polite">
        {processingState === 'uploading' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-brand_accent animate-spin mr-3" />
            <span className="text-sm text-gray-700">Subiendo audio...</span>
          </div>
        )}

        {processingState === 'processing' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="flex items-center mb-2">
              <Loader2 className="h-8 w-8 text-brand_accent animate-spin mr-3" />
              <span className="text-sm text-gray-700">Procesando audio (transcripción y resumen con IA)...</span>
            </div>
            <span className="text-xs text-gray-500">Esto puede tomar hasta 1 minuto</span>
          </div>
        )}

        {processingState === 'complete' && (
          <div className="flex items-center justify-center py-8 text-green-600">
            <CheckCircle className="h-8 w-8 mr-3" />
            <span className="text-sm font-medium">Informe creado exitosamente</span>
          </div>
        )}
      </div>

      {processingState === 'error' && (
        <div className="space-y-3">
          <div className="flex items-center text-red-600">
            <AlertCircle className="h-6 w-6 mr-2" />
            <span className="text-sm font-medium">Error al procesar el audio</span>
          </div>
          {errorMessage && (
            <p className="text-sm text-gray-600 ml-8">{errorMessage}</p>
          )}
          <button
            type="button"
            onClick={retry}
            className="ml-8 inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
};

export default AudioReportUploader;
