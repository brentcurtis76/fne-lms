import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { 
  X, 
  MessageSquare, 
  AlertCircle, 
  Lightbulb, 
  Clock,
  CheckCircle,
  Download,
  ExternalLink,
  Send,
  User,
  Calendar,
  Copy,
  Code
} from 'lucide-react';

import { toast } from 'react-hot-toast';

interface FeedbackDetailProps {
  feedback: any;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate: (status: string) => void;
  onRefresh: () => void;
}

interface Activity {
  id: string;
  message: string;
  is_system_message: boolean;
  created_at: string;
  created_by: string;
  profiles?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function FeedbackDetail({ 
  feedback, 
  isOpen, 
  onClose, 
  onStatusUpdate,
  onRefresh 
}: FeedbackDetailProps) {
  const supabase = useSupabaseClient();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFullScreenshot, setShowFullScreenshot] = useState(false);

  useEffect(() => {
    if (isOpen && feedback) {
      loadActivities();
      // Mark as seen if new
      if (feedback.status === 'new') {
        onStatusUpdate('seen');
      }
    }
  }, [isOpen, feedback]);

  const loadActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('feedback_activity')
        .select(`
          *,
          profiles:created_by (
            first_name,
            last_name,
            email
          )
        `)
        .eq('feedback_id', feedback.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error loading activities:', error);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const { error } = await supabase
        .from('feedback_activity')
        .insert({
          feedback_id: feedback.id,
          message: newComment.trim(),
          created_by: user.id,
          is_system_message: false
        });

      if (error) throw error;

      setNewComment('');
      await loadActivities();
      toast.success('Comentario agregado');
    } catch (error: any) {
      console.error('Error adding comment:', error);
      toast.error('Error al agregar comentario');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'idea':
        return <Lightbulb className="w-5 h-5 text-blue-500" />;
      default:
        return <MessageSquare className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <Clock className="w-4 h-4" />;
      case 'in_progress':
        return <Clock className="w-4 h-4 animate-spin" />;
      case 'resolved':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const copyErrorDetailsForClaude = async () => {
    try {
      // Extract browser console error if present in browser_info
      let consoleError = '';
      if (feedback.browser_info && typeof feedback.browser_info === 'object') {
        // Look for any error-related fields in browser_info
        const errorFields = Object.entries(feedback.browser_info)
          .filter(([key, value]) => 
            key.toLowerCase().includes('error') || 
            key.toLowerCase().includes('stack') ||
            key.toLowerCase().includes('message')
          );
        
        if (errorFields.length > 0) {
          consoleError = errorFields
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        }
      }

      // Format the error details for Claude Code
      const errorDetails = `## Error Report #${feedback.id.slice(0, 8).toUpperCase()}

**Description:** ${feedback.description}

**Error Type:** ${feedback.type === 'bug' ? 'Bug/Error' : feedback.type === 'idea' ? 'Feature Request' : 'General Feedback'}

**Technical Context:**
- Page: ${feedback.page_url}
- User: ${feedback.profiles.first_name} ${feedback.profiles.last_name} (${feedback.profiles.email})
- Timestamp: ${new Date(feedback.created_at).toISOString()}
- Status: ${feedback.status}

**Browser Information:**
\`\`\`json
${JSON.stringify(feedback.browser_info || {}, null, 2)}
\`\`\`

${consoleError ? `**Console Error:**
\`\`\`
${consoleError}
\`\`\`

` : ''}**User Agent:**
${feedback.user_agent || 'Not captured'}

**Additional Notes:**
${feedback.screenshot_url ? '[Screenshot attached in feedback system]' : '[No screenshot attached]'}
${feedback.resolution_notes ? `\nResolution Notes: ${feedback.resolution_notes}` : ''}

---
*Copied from FNE LMS Feedback System*`;

      // Copy to clipboard
      await navigator.clipboard.writeText(errorDetails);
      toast.success('¡Detalles copiados para Claude Code!');
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Error al copiar los detalles');
    }
  };

  if (!isOpen || !feedback) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" 
          onClick={onClose}
          data-testid="modal-overlay"
        />

        {/* Modal Container - constrained height with flexbox */}
        <div className="relative w-full max-w-4xl max-h-[90vh] bg-white shadow-xl rounded-lg flex flex-col">
          {/* Header - Fixed */}
          <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
            <div className="flex items-center gap-3">
              {getTypeIcon(feedback.type)}
              <h3 className="text-lg font-semibold text-gray-900">
                Detalle de Feedback
              </h3>
              <span className="text-sm text-gray-500">
                #{feedback.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              data-testid="close-modal-button"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body - Scrollable */}
          <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
            {/* Main Content - Scrollable */}
            <div className="flex-1 p-6 overflow-y-auto">
                {/* Copy Button - Always visible at top */}
                <div className="mb-4 -mt-2">
                  <button
                    onClick={copyErrorDetailsForClaude}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                    title="Copiar todos los detalles del error para Claude Code"
                  >
                    <Copy className="w-5 h-5" />
                    <span className="font-medium">Copiar Detalles</span>
                  </button>
                </div>

                {/* User Info */}
                <div className="flex items-center gap-3 mb-4">
                  {feedback.profiles.avatar_url ? (
                    <img
                      src={feedback.profiles.avatar_url}
                      alt={`${feedback.profiles.first_name} ${feedback.profiles.last_name}`}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-600" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">
                      {feedback.profiles.first_name} {feedback.profiles.last_name}
                    </p>
                    <p className="text-sm text-gray-500">{feedback.profiles.email}</p>
                  </div>
                  <div className="ml-auto text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(feedback.created_at)}
                  </div>
                </div>

                {/* Description */}
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Descripción</h4>
                  <p className="text-gray-700 whitespace-pre-wrap">{feedback.description}</p>
                </div>

                {/* Screenshot */}
                {feedback.screenshot_url && (
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-2">Captura de pantalla</h4>
                    <img
                      src={feedback.screenshot_url}
                      alt="Screenshot"
                      className="rounded-lg border cursor-pointer hover:opacity-90 transition-opacity max-h-64 object-contain"
                      onClick={() => setShowFullScreenshot(true)}
                    />
                  </div>
                )}

                {/* Technical Details */}
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-2">Detalles técnicos</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      <a 
                        href={feedback.page_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline truncate"
                      >
                        {feedback.page_url}
                      </a>
                    </div>
                    {feedback.browser_info && (
                      <details className="cursor-pointer">
                        <summary className="hover:text-gray-800">Ver información del navegador</summary>
                        <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                          {JSON.stringify(feedback.browser_info, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>

                {/* Status Actions */}
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Acciones</h4>
                  <div className="flex flex-wrap gap-2">
                    {feedback.status !== 'in_progress' && feedback.status !== 'resolved' && feedback.status !== 'closed' && (
                      <button
                        onClick={() => onStatusUpdate('in_progress')}
                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                      >
                        Marcar en progreso
                      </button>
                    )}
                    {feedback.status !== 'resolved' && feedback.status !== 'closed' && (
                      <button
                        onClick={() => onStatusUpdate('resolved')}
                        className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                      >
                        Marcar como resuelto
                      </button>
                    )}
                    {feedback.status === 'resolved' && (
                      <button
                        onClick={() => onStatusUpdate('closed')}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cerrar ticket
                      </button>
                    )}
                    {feedback.status === 'closed' && (
                      <span className="px-4 py-2 bg-gray-300 text-gray-600 rounded-lg">
                        Ticket cerrado
                      </span>
                    )}
                    <button
                      onClick={onClose}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors ml-auto"
                    >
                      Cerrar ventana
                    </button>
                  </div>
                </div>
              </div>

              {/* Activity Panel - Fixed height with proper scrolling */}
              <div className="lg:w-96 border-l bg-gray-50 flex flex-col overflow-hidden">
                <div className="p-4 border-b bg-white flex-shrink-0">
                  <h4 className="font-medium text-gray-900">Actividad</h4>
                </div>
                
                <div className="flex flex-col flex-1 overflow-hidden">
                  {/* Activities List - Scrollable */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {activities.length === 0 ? (
                      <p className="text-center text-gray-500 py-8">
                        Sin actividad aún
                      </p>
                    ) : (
                      activities.map((activity) => (
                        <div
                          key={activity.id}
                          className={`${
                            activity.is_system_message
                              ? 'text-center'
                              : 'bg-white rounded-lg p-3 shadow-sm'
                          }`}
                        >
                          {activity.is_system_message ? (
                            <p className="text-sm text-gray-500 italic">
                              {activity.message}
                            </p>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-medium text-sm text-gray-900">
                                  {activity.profiles?.first_name} {activity.profiles?.last_name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(activity.created_at)}
                                </p>
                              </div>
                              <p className="text-sm text-gray-700">
                                {activity.message}
                              </p>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Comment Input - Fixed at bottom */}
                  <div className="p-4 border-t bg-white flex-shrink-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addComment()}
                        placeholder="Agregar comentario..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent text-sm"
                        disabled={isSubmitting}
                      />
                      <button
                        onClick={addComment}
                        disabled={isSubmitting || !newComment.trim()}
                        className="px-3 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#00243a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="send-comment-button"
                        aria-label="Send comment"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* Full Screenshot Modal */}
      {showFullScreenshot && feedback.screenshot_url && (
        <div 
          className="fixed inset-0 z-[60] bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setShowFullScreenshot(false)}
        >
          <img
            src={feedback.screenshot_url}
            alt="Screenshot"
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={() => setShowFullScreenshot(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300"
          >
            <X className="w-8 h-8" />
          </button>
        </div>
      )}
    </>
  );
}