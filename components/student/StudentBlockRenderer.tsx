import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, Play, Pause, Download, ExternalLink } from 'lucide-react';

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
  isAdmin = false
}: StudentBlockRendererProps) {
  const [hasRead, setHasRead] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);
  const [startTime] = useState(Date.now());
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoWatched, setVideoWatched] = useState(false);
  
  // Image block state
  const [hasViewed, setHasViewed] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Quiz block state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  
  // External links state
  const [hasVisited, setHasVisited] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
        <div className="prose prose-lg max-w-none prose-headings:text-[#00365b] prose-p:text-gray-700 prose-strong:text-gray-900 prose-ul:text-gray-700 prose-ol:text-gray-700">
          <div dangerouslySetInnerHTML={{ __html: content }} />
        </div>
        
        {!isCompleted && (
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            {!isAdmin && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasRead}
                  onChange={(e) => setHasRead(e.target.checked)}
                  className="w-4 h-4 text-[#00365b] focus:ring-[#00365b] border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">He leído este contenido</span>
              </label>
            )}
            
            <button
              onClick={() => onComplete({ timeSpent, hasRead: isAdmin || hasRead })}
              disabled={!isAdmin && !hasRead}
              className={`px-4 py-2 rounded-md transition ${
                (isAdmin || hasRead)
                  ? 'bg-[#00365b] text-white hover:bg-[#fdb933] hover:text-[#00365b]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle className="inline w-4 h-4 mr-2" />
              {isAdmin ? 'Continuar (Admin)' : 'Continuar'}
            </button>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
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
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${videoWatched ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                        <span className="text-sm text-blue-700">
                          {videoWatched ? 'Video marcado como completado' : 'Confirma cuando hayas visto todo el video'}
                        </span>
                      </div>
                      {!videoWatched && (
                        <button
                          onClick={() => setVideoWatched(true)}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
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
                      className="bg-[#00365b] h-2 rounded-full transition-all"
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
            className="w-full px-4 py-3 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition flex items-center justify-center gap-2"
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
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
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
                            ? 'border-[#00365b] shadow-md' 
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
            className="w-full px-4 py-3 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {isAdmin ? 'Continuar (Admin)' : allImages.length > 1 ? 'He revisado las imágenes - Continuar' : 'He revisado esta imagen - Continuar'}
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
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
    const questions = block.payload?.questions || [];
    const passingScore = block.payload?.settings?.passingScore || 70;

    const handleSubmitQuiz = () => {
      let correctAnswers = 0;
      
      console.log('=== QUIZ GRADING DEBUG ===');
      console.log('Questions:', questions);
      console.log('User answers:', answers);
      
      questions.forEach((question: any) => {
        const userAnswer = answers[question.id];
        let correctAnswer = question.correctAnswerId;
        
        // If correctAnswerId is not set, find it from options
        if (!correctAnswer) {
          const correctOption = question.options?.find((opt: any) => opt.isCorrect);
          correctAnswer = correctOption?.id;
        }
        
        const isCorrect = userAnswer === correctAnswer;
        
        console.log(`Question ${question.id}:`);
        console.log(`  User answer: ${userAnswer}`);
        console.log(`  Correct answer: ${correctAnswer}`);
        console.log(`  Correct option from isCorrect:`, question.options?.find((opt: any) => opt.isCorrect));
        console.log(`  Is correct: ${isCorrect}`);
        
        if (isCorrect) {
          correctAnswers++;
        }
      });
      
      const finalScore = Math.round((correctAnswers / questions.length) * 100);
      
      console.log(`Final score: ${correctAnswers}/${questions.length} = ${finalScore}%`);
      console.log('=== END DEBUG ===');
      
      setScore(finalScore);
      setSubmitted(true);
      
      if (finalScore >= passingScore || isAdmin) {
        onComplete({ 
          score: finalScore, 
          correctAnswers, 
          totalQuestions: questions.length,
          answers,
          timeSpent,
          adminBypass: isAdmin && finalScore < passingScore
        });
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {block.payload?.title || 'Quiz Interactivo'}
          </h3>
          
          {questions.map((question: any, index: number) => (
            <div key={question.id} className="mb-6 p-4 border border-gray-200 rounded-lg">
              <h4 className="font-medium mb-3">
                {index + 1}. {question.question}
              </h4>
              
              <div className="space-y-2">
                {question.options?.map((option: any) => (
                  <label key={option.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name={question.id}
                      value={option.id}
                      checked={answers[question.id] === option.id}
                      onChange={(e) => setAnswers({ ...answers, [question.id]: e.target.value })}
                      disabled={submitted}
                      className="w-4 h-4 text-[#00365b] focus:ring-[#00365b]"
                    />
                    <span className={submitted && option.isCorrect ? 'text-green-600 font-medium' : ''}>
                      {option.text}
                    </span>
                  </label>
                ))}
              </div>
              
              {submitted && question.explanation && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-800">
                    <strong>Explicación:</strong> {question.explanation}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {!submitted && (Object.keys(answers).length === questions.length || isAdmin) && (
          <button
            onClick={handleSubmitQuiz}
            className="w-full px-4 py-3 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition"
          >
            {isAdmin ? 'Enviar Respuestas (Admin)' : 'Enviar Respuestas'}
          </button>
        )}

        {submitted && (
          <div className={`p-4 rounded-lg ${score >= passingScore ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-center gap-2">
              <CheckCircle className={`w-5 h-5 ${score >= passingScore ? 'text-green-600' : 'text-red-600'}`} />
              <span className={`font-medium ${score >= passingScore ? 'text-green-600' : 'text-red-600'}`}>
                Puntuación: {score}% ({score >= passingScore ? 'Aprobado' : 'No aprobado'})
              </span>
            </div>
            {score < passingScore && (
              <p className="text-red-600 text-sm mt-2">
                Necesitas al menos {passingScore}% para continuar. Repasa el contenido e inténtalo de nuevo.
              </p>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Quiz completado exitosamente</span>
          </div>
        )}
      </div>
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
                  {/* Link Preview - Always show iframe preview by default */}
                  <div className="aspect-video bg-gray-100 relative">
                    {/* Always show iframe preview */}
                    <iframe
                      src={link.url}
                      className="w-full h-full"
                      frameBorder="0"
                      title="Vista previa del enlace"
                      sandbox="allow-scripts allow-same-origin allow-forms"
                      onLoad={() => setHasVisited(true)}
                    />
                    
                  </div>
                  
                  {/* Link Content */}
                  <div className="p-4">
                    <h4 className="font-medium text-[#00365b] mb-2">{link.title || 'Enlace'}</h4>
                    {link.description && (
                      <p className="text-gray-600 text-sm mb-3">{link.description}</p>
                    )}
                    
                    {/* URL Display */}
                    <p className="text-xs text-gray-500 mb-3 truncate">{link.url}</p>
                    
                    {/* Only Visit Button - No Preview Button */}
                    <a
                      href={link.url}
                      target={link.openInNewTab !== false ? '_blank' : '_self'}
                      rel="noopener noreferrer"
                      onClick={() => setHasVisited(true)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Visitar enlace
                    </a>
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
            className="w-full px-4 py-3 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {isAdmin ? 'Continuar (Admin)' : 'He visitado los enlaces - Continuar'}
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Enlaces visitados</span>
          </div>
        )}
      </div>
    );
  };

  const renderDefaultBlock = () => (
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
          className="w-full px-4 py-3 bg-[#10B981] text-white rounded-md hover:bg-green-700 transition flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          Marcar como completado
        </button>
      )}
    </div>
  );

  const renderDownloadBlock = () => {
    const files = block.payload?.files || [];
    const title = block.payload?.title || 'Archivos para descargar';
    const description = block.payload?.description || '';

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
                    <Download className="w-5 h-5 text-[#00365b]" />
                    <div>
                      <p className="font-medium text-gray-900">{file.name || file.originalName || 'Archivo'}</p>
                      <p className="text-sm text-gray-500">
                        {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''} • {file.type || 'Archivo'}
                      </p>
                    </div>
                  </div>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Descargar
                  </a>
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
            className="w-full px-4 py-3 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            {isAdmin ? 'Continuar (Admin)' : 'Marcar como Completado'}
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Archivos revisados</span>
          </div>
        )}
      </div>
    );
  };

  const renderGroupAssignmentBlock = () => {
    const { title, description } = block.payload || {};
    
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-[#00365b] mb-3">
            Tarea Grupal: {title || 'Sin título'}
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <span className="text-blue-600">•</span>
                    Los detalles completos de la tarea
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-600">•</span>
                    Tu grupo asignado y compañeros de equipo
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-600">•</span>
                    El espacio de discusión grupal
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-600">•</span>
                    La opción para entregar el trabajo
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-md border border-blue-100">
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
            className="w-full px-4 py-3 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Entendido - Continuar con la lección
          </button>
        )}

        {isCompleted && (
          <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Información de tarea grupal revisada</span>
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
    default:
      return renderDefaultBlock();
  }
}