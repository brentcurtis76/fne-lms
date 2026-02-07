import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Play, Pause, Download, ExternalLink, BookOpen, FileText, Image } from 'lucide-react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import LearningQuizTaker from '@/components/quiz/LearningQuizTaker';
import { sanitizeHtml } from '@/lib/sanitize';
import { isSafeForIframe, isExternalUrl } from '@/utils/urlValidator';

interface StudentBlockRendererProps {
  block: {
    id: string;
    type: string;
    payload: any;
  };
  isCompleted: boolean;
  onComplete: (completionData?: any) => void;
  onProgressUpdate?: (data: any) => void;
  isAdmin?: boolean;
  lessonId?: string;
  courseId?: string;
  studentId?: string;
}

// TipTap JSON to HTML conversion function
const convertTipTapToHTML = (doc: any): string => {
  if (!doc || !doc.content) return '';
  
  const convertNode = (node: any): string => {
    if (!node) return '';
    
    switch (node.type) {
      case 'paragraph':
        const pContent = node.content ? node.content.map(convertNode).join('') : '';
        return `<p>${pContent}</p>`;
      
      case 'text':
        let text = node.text || '';
        if (node.marks) {
          node.marks.forEach((mark: any) => {
            switch (mark.type) {
              case 'bold':
                text = `<strong>${text}</strong>`;
                break;
              case 'italic':
                text = `<em>${text}</em>`;
                break;
              case 'underline':
                text = `<u>${text}</u>`;
                break;
              case 'code':
                text = `<code>${text}</code>`;
                break;
            }
          });
        }
        return text;
      
      case 'heading':
        const level = node.attrs?.level || 1;
        const hContent = node.content ? node.content.map(convertNode).join('') : '';
        return `<h${level}>${hContent}</h${level}>`;
      
      case 'bulletList':
        const ulContent = node.content ? node.content.map(convertNode).join('') : '';
        return `<ul>${ulContent}</ul>`;
      
      case 'orderedList':
        const olContent = node.content ? node.content.map(convertNode).join('') : '';
        return `<ol>${olContent}</ol>`;
      
      case 'listItem':
        const liContent = node.content ? node.content.map(convertNode).join('') : '';
        return `<li>${liContent}</li>`;
      
      default:
        return node.content ? node.content.map(convertNode).join('') : '';
    }
  };
  
  return doc.content.map(convertNode).join('');
};

export default function StudentBlockRenderer({ 
  block, 
  isCompleted, 
  onComplete, 
  onProgressUpdate,
  isAdmin = false,
  lessonId,
  courseId,
  studentId
}: StudentBlockRendererProps) {
  const supabase = useSupabaseClient();
  const [hasRead, setHasRead] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);
  const [startTime] = useState(Date.now());
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoWatched, setVideoWatched] = useState(false);
  
  // Image block state
  const [hasViewed, setHasViewed] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // External links state
  const [hasVisited, setHasVisited] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Download block state
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // Track time spent on block
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimeSpent = Math.floor((Date.now() - startTime) / 1000);
      setTimeSpent(newTimeSpent);
      onProgressUpdate?.({ timeSpent: newTimeSpent });
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, onProgressUpdate]);

  const renderTextBlock = () => {
    // Handle different content formats
    let content = block.payload?.content || 'No hay contenido disponible';
    
    // If content is an object (TipTap JSON), convert to HTML
    if (typeof content === 'object' && content !== null) {
      // Check if it's TipTap JSON format
      if (content.type === 'doc' && content.content) {
        content = convertTipTapToHTML(content);
      } else {
        // Try common object properties that might contain the text
        content = content.html || content.text || content.value || JSON.stringify(content);
      }
    }
    
    // Ensure content is a string
    if (typeof content !== 'string') {
      content = String(content);
    }
    
    return (
      <div className="space-y-6">
        <div className="prose prose-lg max-w-none prose-headings:text-[#0a0a0a] prose-p:text-gray-700 prose-strong:text-gray-900 prose-ul:text-gray-700 prose-ol:text-gray-700">
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
        </div>
        
        {!isCompleted && (
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            {!isAdmin && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasRead}
                  onChange={(e) => setHasRead(e.target.checked)}
                  className="w-4 h-4 text-[#0a0a0a] focus:ring-[#0a0a0a] border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">He leído este contenido</span>
              </label>
            )}
            
            <button
              onClick={() => onComplete({ timeSpent, hasRead: isAdmin || hasRead })}
              disabled={!isAdmin && !hasRead}
              className={`px-4 py-2 rounded-md transition ${
                (isAdmin || hasRead)
                  ? 'bg-[#0a0a0a] text-white hover:bg-[#fbbf24] hover:text-[#0a0a0a]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle className="inline w-4 h-4 mr-2" />
              {isAdmin ? 'Continuar (Admin)' : 'Continuar'}
            </button>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-brand_accent_hover p-3 bg-brand_accent/10 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Contenido leído</span>
          </div>
        )}
      </div>
    );
  };

  // Convert video URL to embed format  
  const getEmbedUrl = (url: string): string => {
    if (!url) return '';
    let videoId;
    // YouTube
    if (url.includes('youtube.com/watch')) {
      videoId = url.split('v=')[1]?.split('&')[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    }
    // Vimeo
    if (url.includes('vimeo.com/')) {
      const parts = url.split('/');
      videoId = parts.pop()?.split('?')[0];
      return videoId ? `https://player.vimeo.com/video/${videoId}` : url;
    }
    return url;
  };

  const renderVideoBlock = () => {
    const videoUrl = block.payload?.url || '';
    const embedUrl = getEmbedUrl(videoUrl);
    const isEmbedVideo = embedUrl !== videoUrl; // If URL was converted, it's a YouTube/Vimeo video
    
    const handleVideoProgress = () => {
      if (videoRef.current) {
        const current = videoRef.current.currentTime;
        const duration = videoRef.current.duration;
        const progress = (current / duration) * 100;
        setVideoProgress(progress);
        
        // Consider watched if 100% viewed
        if (progress >= 99) {
          setVideoWatched(true);
        }
        
        onProgressUpdate?.({ 
          currentTime: current, 
          duration, 
          progress,
          timeSpent 
        });
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {block.payload?.title || 'Video de la lección'}
          </h3>
          
          {videoUrl && videoUrl !== '' ? (
            <div className="space-y-4">
              {isEmbedVideo ? (
                // YouTube/Vimeo iframe
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-md">
                  <iframe
                    src={embedUrl}
                    title={block.payload?.title || 'Video de la lección'}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                    onLoad={() => {
                      // Admins can bypass immediately for testing
                      if (isAdmin) {
                        setVideoWatched(true);
                      }
                      // For students with embedded videos, we'll require manual confirmation
                      // since we can't track actual progress through iframe
                    }}
                  ></iframe>
                </div>
              ) : (
                // Direct video file
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  onTimeUpdate={handleVideoProgress}
                  onEnded={() => setVideoWatched(true)}
                  className="w-full rounded-lg shadow-md"
                  controlsList="nodownload"
                >
                  Tu navegador no soporta el elemento de video.
                </video>
              )}
              
              {/* Show different progress indicators based on video type */}
              {isEmbedVideo ? (
                // For embedded videos, require manual confirmation since we can't track progress
                !isAdmin && (
                  <div className="bg-brand_accent/10 p-4 rounded-lg border border-brand_accent/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${videoWatched ? 'bg-brand_accent' : 'bg-brand_gray_medium'}`}></div>
                        <span className="text-sm text-brand_gray_dark">
                          {videoWatched ? 'Video marcado como completado' : 'Confirma cuando hayas visto todo el video'}
                        </span>
                      </div>
                      {!videoWatched && (
                        <button
                          onClick={() => setVideoWatched(true)}
                          className="px-3 py-1 bg-brand_primary text-white text-xs rounded hover:bg-brand_gray_dark transition-colors"
                        >
                          Marcar como visto
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : (
                // Show detailed progress bar for direct video files
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Progreso del video</span>
                    <span>{Math.round(videoProgress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-[#0a0a0a] h-2 rounded-full transition-all"
                      style={{ width: `${videoProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-100 p-8 rounded-lg text-center">
              <p className="text-gray-600">No hay URL de video configurada</p>
            </div>
          )}
        </div>

        {!isCompleted && (videoWatched || isAdmin) && (
          <button
            onClick={() => onComplete({ 
              videoProgress, 
              watchedComplete: isAdmin || videoWatched, 
              timeSpent 
            })}
            className="w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {isAdmin ? 'Continuar (Admin)' : 'Video Completado - Continuar'}
          </button>
        )}

        {!isCompleted && !videoWatched && !isAdmin && (
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <p className="text-yellow-800 text-sm">
              <strong>Instrucción:</strong> Debes ver el video completo para continuar con la siguiente parte de la lección.
            </p>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-brand_accent_hover p-3 bg-brand_accent/10 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Video completado</span>
          </div>
        )}
      </div>
    );
  };

  const renderImageBlock = () => {
    // Handle both new format (images array) and old format (single src)
    const images = block.payload?.images || [];
    const legacyImage = block.payload?.src ? [{
      id: 'legacy',
      src: block.payload.src,
      alt: block.payload.alt || '',
      caption: block.payload.caption || ''
    }] : [];
    
    const allImages = images.length > 0 ? images : legacyImage;

    const nextImage = () => {
      setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
    };

    const prevImage = () => {
      setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
    };

    const goToImage = (index: number) => {
      setCurrentImageIndex(index);
    };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {block.payload?.title || 'Galería de Imágenes'}
            {allImages.length > 1 && (
              <span className="text-sm text-gray-500 ml-2">
                ({currentImageIndex + 1} de {allImages.length})
              </span>
            )}
          </h3>
          
          {allImages.length > 0 ? (
            <div className="relative bg-gray-50 rounded-lg overflow-hidden">
              {/* Main Image Display */}
              <div className="relative aspect-video bg-gray-100">
                <img
                  src={allImages[currentImageIndex].src}
                  alt={allImages[currentImageIndex].alt || `Imagen ${currentImageIndex + 1}`}
                  className="w-full h-full object-contain"
                  onLoad={() => setHasViewed(true)}
                />
                
                {/* Navigation Arrows (only show if multiple images) */}
                {allImages.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* Image Caption */}
              {allImages[currentImageIndex].caption && (
                <div className="p-4 bg-white border-t">
                  <p className="text-sm text-gray-700 text-center">
                    {allImages[currentImageIndex].caption}
                  </p>
                </div>
              )}

              {/* Thumbnail Navigation (only show if multiple images) */}
              {allImages.length > 1 && (
                <div className="p-4 bg-white border-t">
                  <div className="flex gap-2 justify-center overflow-x-auto">
                    {allImages.map((image, index) => (
                      <button
                        key={image.id || index}
                        onClick={() => goToImage(index)}
                        className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                          index === currentImageIndex 
                            ? 'border-[#0a0a0a] shadow-md' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <img
                          src={image.src}
                          alt={image.alt || `Miniatura ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dots Navigation */}
              {allImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                  <div className="flex gap-2">
                    {allImages.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => goToImage(index)}
                        className={`w-3 h-3 rounded-full transition ${
                          index === currentImageIndex 
                            ? 'bg-white shadow-lg' 
                            : 'bg-white bg-opacity-50 hover:bg-opacity-75'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-100 p-8 rounded-lg text-center">
              <p className="text-gray-600">No hay imágenes configuradas</p>
            </div>
          )}
        </div>

        {!isCompleted && (hasViewed || isAdmin) && (
          <button
            onClick={() => onComplete({ 
              hasViewed: true, 
              timeSpent,
              totalImages: allImages.length,
              currentImage: currentImageIndex + 1
            })}
            className="w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {isAdmin ? 'Continuar (Admin)' : allImages.length > 1 ? 'He revisado las imágenes - Continuar' : 'He revisado esta imagen - Continuar'}
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-brand_accent_hover p-3 bg-brand_accent/10 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">
              {allImages.length > 1 ? 'Galería revisada' : 'Imagen revisada'}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderQuizBlock = () => {
    // Check if we have the required props for the new quiz system
    if (!lessonId || !courseId || !studentId) {
      // Fallback message for missing data
      return (
        <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-yellow-900">
            {block.payload?.title || 'Quiz Interactivo'}
          </h3>
          <p className="text-yellow-800">
            El sistema de quiz está siendo actualizado. Por favor, contacta a tu profesor si necesitas completar este quiz.
          </p>
        </div>
      );
    }

    // Check if quiz is already completed
    if (isCompleted) {
      return (
        <div className="p-6 bg-brand_accent/10 border border-brand_accent/30 rounded-lg">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-6 h-6 text-brand_accent mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-2 text-brand_primary">
                {block.payload?.title || 'Quiz Interactivo'} - Completado
              </h3>
              <p className="text-brand_gray_dark">
                ¡Has completado este quiz exitosamente!
              </p>
              {block.payload?.totalPoints && (
                <p className="text-sm text-brand_gray_medium mt-2">
                  Puntos totales del quiz: {block.payload.totalPoints}
                </p>
              )}
              <p className="text-sm text-brand_gray_medium mt-2">
                Puedes continuar con el siguiente contenido de la lección.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <LearningQuizTaker
        quiz={block.payload}
        blockId={block.id}
        lessonId={lessonId}
        courseId={courseId}
        studentId={studentId}
        onComplete={(submission) => {
          // Mark block as completed without passing score data
          onComplete({
            quizCompleted: true,
            submissionId: submission.id,
            hasOpenEndedQuestions: submission.manual_gradable_points > 0
          });
        }}
      />
    );
  };

  const renderExternalLinkBlock = () => {
    const links = block.payload?.links || [];
    const title = block.payload?.title || 'Enlaces Externos';
    const description = block.payload?.description || '';

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">{title}</h3>
          {description && (
            <div className="text-gray-600 mb-4 whitespace-pre-wrap">{description}</div>
          )}
          
          {links.length > 0 ? (
            <div className="space-y-3">
              {links.map((link: any, index: number) => (
                <div key={link.id || index} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                  {/* Link Preview - Only show iframe for safe domains */}
                  <div className="aspect-video bg-gray-100 relative">
                    {isSafeForIframe(link.url) ? (
                      <iframe
                        src={link.url}
                        className="w-full h-full"
                        frameBorder="0"
                        title="Vista previa del enlace"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                        onLoad={() => setHasVisited(true)}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                        <ExternalLink className="w-12 h-12 text-gray-400 mb-3" />
                        <p className="text-gray-600 text-sm">
                          Vista previa no disponible para este enlace.
                        </p>
                        <p className="text-gray-500 text-xs mt-1">
                          Haz clic en &quot;Visitar enlace&quot; para ver el contenido.
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Link Content */}
                  <div className="p-4">
                    <h4 className="font-medium text-[#0a0a0a] mb-2">{link.title || 'Enlace'}</h4>
                    {link.description && (
                      <p className="text-gray-600 text-sm mb-3">{link.description}</p>
                    )}
                    
                    {/* URL Display */}
                    <p className="text-xs text-gray-500 mb-3 truncate">{link.url}</p>
                    
                    {/* Only Visit Button - No Preview Button */}
                    {isExternalUrl(link.url) ? (
                      <a
                        href={link.url}
                        target={link.openInNewTab !== false ? '_blank' : '_self'}
                        rel="noopener noreferrer"
                        onClick={() => setHasVisited(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Visitar enlace
                      </a>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed">
                        <ExternalLink className="w-4 h-4" />
                        Enlace no válido
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-100 p-8 rounded-lg text-center">
              <ExternalLink className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No hay enlaces disponibles</p>
            </div>
          )}
        </div>

        {!isCompleted && (hasVisited || isAdmin) && (
          <button
            onClick={() => onComplete({ hasVisited: true, timeSpent })}
            className="w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {isAdmin ? 'Continuar (Admin)' : 'He visitado los enlaces - Continuar'}
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-brand_accent_hover p-3 bg-brand_accent/10 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Enlaces visitados</span>
          </div>
        )}
      </div>
    );
  };

  const renderDefaultBlock = () => {
    // Special handling for group-assignment blocks that might have different type strings
    if (block.type && block.type.toLowerCase().includes('group') && block.type.toLowerCase().includes('assignment')) {
      return renderGroupAssignmentBlock();
    }
    
    return (
      <div className="space-y-6">
        <div className="bg-gray-100 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">Bloque {block.type}</h3>
          <p className="text-gray-600 mb-4">Tipo de bloque no implementado en vista de estudiante</p>
          <pre className="text-xs bg-white p-3 rounded overflow-x-auto">
            {JSON.stringify(block.payload, null, 2)}
          </pre>
        </div>
        
        {!isCompleted && (
          <button
            onClick={() => onComplete({ timeSpent })}
            className="w-full px-4 py-3 bg-brand_primary text-white rounded-md hover:bg-brand_gray_dark transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Marcar como completado
          </button>
        )}
      </div>
    );
  };

  const renderDownloadBlock = () => {
    const files = block.payload?.files || [];
    const title = block.payload?.title || 'Archivos para descargar';
    const description = block.payload?.description || '';

    const handleDownload = async (file: any) => {
      setDownloadingFile(file.id || file.url);
      const filename = file.name || file.originalName || 'archivo';

      try {
        // Get session for authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          // Fallback to direct URL if no session
          window.open(file.url, '_blank');
          return;
        }

        // Use the download API that streams the file directly
        const downloadUrl = `/api/storage/download?url=${encodeURIComponent(file.url)}&filename=${encodeURIComponent(filename)}`;

        // Fetch the file with authentication
        const response = await fetch(downloadUrl, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (!response.ok) {
          console.error('Download failed:', response.status, response.statusText);
          // Fallback to direct URL if API fails
          window.open(file.url, '_blank');
          return;
        }

        // Get the blob and create download link
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob URL
        window.URL.revokeObjectURL(blobUrl);

      } catch (error) {
        console.error('Download error:', error);
        // Fallback to direct URL
        window.open(file.url, '_blank');
      } finally {
        setDownloadingFile(null);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">{title}</h3>
          {description && (
            <div className="text-gray-600 mb-4 whitespace-pre-wrap">{description}</div>
          )}

          {files.length > 0 ? (
            <div className="space-y-3">
              {files.map((file: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Download className="w-5 h-5 text-[#0a0a0a]" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name || file.originalName || 'Archivo'}</p>
                      <p className="text-sm text-gray-500">
                        {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''} {file.type ? `• ${file.type}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingFile === (file.id || file.url)}
                    className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Download className={`w-4 h-4 ${downloadingFile === (file.id || file.url) ? 'animate-pulse' : ''}`} />
                    {downloadingFile === (file.id || file.url) ? 'Descargando...' : 'Descargar'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-100 p-8 rounded-lg text-center">
              <Download className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No hay archivos disponibles para descargar</p>
            </div>
          )}
        </div>

        {!isCompleted && (
          <button
            onClick={() => onComplete({
              filesAccessed: files.length > 0,
              timeSpent
            })}
            className="w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {isAdmin ? 'Continuar (Admin)' : 'Marcar como Completado'}
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-brand_accent_hover p-3 bg-brand_accent/10 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Archivos revisados</span>
          </div>
        )}
      </div>
    );
  };

  const renderGroupAssignmentBlock = () => {
    // Handle both possible payload structures
    let title = '';
    let description = '';
    let instructions = '';
    
    if (block.payload) {
      title = block.payload.title || '';
      description = block.payload.description || '';
      instructions = block.payload.instructions || '';
    }
    
    return (
      <div className="space-y-6">
        <div className="bg-brand_accent/10 border-2 border-brand_accent/30 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-[#0a0a0a] mb-3">
            {title ? `Tarea Grupal: ${title}` : 'Tarea Grupal'}
          </h3>

          {description && (
            <p className="text-gray-700 mb-4">{description}</p>
          )}

          {instructions && (
            <div className="bg-white p-4 rounded-md border border-brand_accent/20 mb-4">
              <h4 className="font-medium text-gray-800 mb-2">Instrucciones:</h4>
              <p className="text-gray-700 whitespace-pre-wrap">{instructions}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-brand_accent_hover mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <div>
                <p className="text-gray-700 font-medium">
                  Esta es una tarea grupal que debes completar con tu equipo.
                </p>
                <p className="text-gray-600 mt-2">
                  Para trabajar en esta tarea, dirígete a tu <span className="font-semibold">Espacio Colaborativo</span> donde encontrarás:
                </p>
                <ul className="mt-2 space-y-1 text-gray-600 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="text-brand_accent_hover">•</span>
                    Los detalles completos de la tarea
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-brand_accent_hover">•</span>
                    Tu grupo asignado y compañeros de equipo
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-brand_accent_hover">•</span>
                    El espacio de discusión grupal
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-brand_accent_hover">•</span>
                    La opción para entregar el trabajo
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-md border border-brand_accent/20">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-700">Nota:</span> Completar esta tarea grupal no es requisito para continuar con la siguiente lección.
                Sin embargo, es importante realizarla para tu aprendizaje y evaluación del curso.
              </p>
            </div>
          </div>
        </div>

        {!isCompleted && (
          <button
            onClick={() => onComplete({ acknowledged: true, timeSpent })}
            className="w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Entendido - Continuar con la lección
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-brand_accent_hover p-3 bg-brand_accent/10 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Información de tarea grupal revisada</span>
          </div>
        )}
      </div>
    );
  };

  const renderBibliographyBlock = () => {
    const title = block.payload?.title || 'Bibliografía & Recursos';
    const description = block.payload?.description || '';
    const items = block.payload?.items || [];
    const showCategories = block.payload?.showCategories || false;
    const sortBy = block.payload?.sortBy || 'manual';

    // Sort items if needed
    let sortedItems = [...items];
    if (sortBy !== 'manual') {
      sortedItems.sort((a, b) => {
        switch (sortBy) {
          case 'title':
            return (a.title || '').localeCompare(b.title || '');
          case 'author':
            return (a.author || '').localeCompare(b.author || '');
          case 'year':
            return (b.year || '').localeCompare(a.year || '');
          case 'type':
            return a.type.localeCompare(b.type);
          default:
            return 0;
        }
      });
    }

    // Group by category if needed
    let groupedItems: { category: string; items: typeof sortedItems }[] = [];
    if (showCategories) {
      const categories = new Map<string, typeof sortedItems>();
      sortedItems.forEach(item => {
        const category = item.category || 'Sin categoría';
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(item);
      });
      groupedItems = Array.from(categories).map(([category, items]) => ({ category, items }));
    } else {
      groupedItems = [{ category: '', items: sortedItems }];
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-[#0a0a0a] mb-2">{title}</h2>
          {description && (
            <p className="text-gray-700 mb-4">{description}</p>
          )}
        </div>

        {groupedItems.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-4">
            {group.category && (
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">
                {group.category}
              </h3>
            )}
            
            <div className="space-y-3">
              {group.items.map((item) => (
                <div key={item.id} className="border rounded-lg hover:shadow-md transition-shadow">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 hover:bg-gray-50"
                    onClick={(e) => {
                      // For PDFs, ensure they open properly
                      if (item.type === 'pdf' && item.url) {
                        e.preventDefault();
                        console.log('Opening PDF URL:', item.url);
                        window.open(item.url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <div className="flex items-start gap-4">
                      {item.type === 'pdf' ? (
                        <FileText className="w-6 h-6 text-brand_accent flex-shrink-0 mt-1" />
                      ) : item.type === 'image' ? (
                        /* eslint-disable-next-line jsx-a11y/alt-text */
                        <Image className="w-6 h-6 text-brand_accent flex-shrink-0 mt-1" />
                      ) : (
                        <ExternalLink className="w-6 h-6 text-brand_primary flex-shrink-0 mt-1" />
                      )}
                      
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 hover:text-[#0a0a0a]">
                          {item.title || 'Sin título'}
                        </h4>
                        
                        {(item.author || item.year) && (
                          <p className="text-sm text-gray-600 mt-1">
                            {item.author && <span>{item.author}</span>}
                            {item.author && item.year && <span> • </span>}
                            {item.year && <span>{item.year}</span>}
                          </p>
                        )}
                        
                        {item.description && (
                          <p className="text-sm text-gray-700 mt-2">
                            {item.description}
                          </p>
                        )}
                        
                        {/* File information for PDFs and documents */}
                        {item.type !== 'link' && item.url && (
                          <div className="mt-2">
                            <span className="text-xs text-gray-500">
                              📎 {(() => {
                                // Use filename if available, otherwise extract from URL
                                if (item.filename) {
                                  return item.filename;
                                }
                                // Extract filename from URL for legacy files
                                try {
                                  const urlParts = item.url.split('/');
                                  const lastPart = urlParts[urlParts.length - 1];
                                  const filename = lastPart.split('?')[0]; // Remove query params
                                  // Decode and clean up filename
                                  const decodedName = decodeURIComponent(filename);
                                  // Remove timestamp prefix if present (e.g., "1234567890_filename.pdf")
                                  const cleanName = decodedName.replace(/^\d+_/, '');
                                  return cleanName || 'Archivo cargado';
                                } catch {
                                  return 'Archivo cargado';
                                }
                              })()}
                              {item.filesize && ` • ${(item.filesize / 1024 / 1024).toFixed(2)} MB`}
                            </span>
                          </div>
                        )}
                        
                        {item.type === 'image' && item.url && (
                          <div className="mt-3">
                            <img 
                              src={item.url} 
                              alt={item.title || 'Imagen de bibliografía'} 
                              className="max-h-64 rounded-lg object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement?.insertAdjacentHTML(
                                  'afterbegin',
                                  '<div class="text-sm text-gray-600 bg-gray-100 p-2 rounded">Error al cargar la imagen</div>'
                                );
                              }}
                            />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-shrink-0">
                        {item.type === 'pdf' ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand_accent/20 text-brand_accent_hover">
                              PDF
                            </span>
                            <a
                              href={item.url}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-brand_accent_hover bg-brand_accent/10 rounded hover:bg-brand_accent/20 transition-colors"
                              title="Descargar PDF"
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Descargar
                            </a>
                          </div>
                        ) : item.type === 'image' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand_accent/20 text-brand_accent_hover">
                            Imagen
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand_primary/10 text-brand_primary">
                            Enlace
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No hay recursos disponibles</p>
          </div>
        )}

        {!isCompleted && (
          <button
            onClick={() => onComplete({ timeSpent, resourcesViewed: items.length })}
            className="w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            He revisado los recursos - Continuar
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-brand_accent_hover p-3 bg-brand_accent/10 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Recursos bibliográficos revisados</span>
          </div>
        )}
      </div>
    );
  };

  // Route to appropriate renderer based on block type
  switch (block.type) {
    case 'text':
      return renderTextBlock();
    case 'video':
      return renderVideoBlock();
    case 'image':
      return renderImageBlock();
    case 'quiz':
      return renderQuizBlock();
    case 'download':
      return renderDownloadBlock();
    case 'external_links':
    case 'external-links':
      return renderExternalLinkBlock();
    case 'group-assignment':
    case 'group_assignment':
      return renderGroupAssignmentBlock();
    case 'bibliography':
      return renderBibliographyBlock();
    default:
      return renderDefaultBlock();
  }
}