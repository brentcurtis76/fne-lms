/**
 * QuickActions Component
 * Context-aware action buttons for each activity type
 * Phase 5 of Collaborative Workspace System for Genera
 */

import React, { useState, useCallback } from 'react';
import { 
  Eye, 
  Edit3, 
  Trash2, 
  Reply, 
  Download, 
  Share2, 
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Copy,
  Flag,
  Archive,
  ArchiveRestore,
  Pin,
  PinOff,
  MessageCircle,
  Calendar,
  FileText,
  Users,
  MoreHorizontal
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  QuickActionsProps,
  ActivityAction,
  ActivityWithDetails,
  ACTIVITY_ACTIONS
} from '../../types/activity';

const QuickActions: React.FC<QuickActionsProps> = ({
  activity,
  onActionClick,
  availableActions
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [archived, setArchived] = useState(false);

  // Get icon for action
  const getActionIcon = (actionId: string) => {
    switch (actionId) {
      case 'view':
        return <Eye className="w-4 h-4" />;
      case 'edit':
        return <Edit3 className="w-4 h-4" />;
      case 'delete':
        return <Trash2 className="w-4 h-4" />;
      case 'reply':
        return <Reply className="w-4 h-4" />;
      case 'download':
        return <Download className="w-4 h-4" />;
      case 'share':
        return <Share2 className="w-4 h-4" />;
      case 'bookmark':
        return bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />;
      case 'pin':
        return pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />;
      case 'archive':
        return archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />;
      case 'copy_link':
        return <Copy className="w-4 h-4" />;
      case 'flag':
        return <Flag className="w-4 h-4" />;
      case 'external':
        return <ExternalLink className="w-4 h-4" />;
      default:
        return <MoreHorizontal className="w-4 h-4" />;
    }
  };

  // Get action color
  const getActionColor = (actionId: string) => {
    switch (actionId) {
      case 'delete':
        return 'text-red-600 hover:text-red-700 hover:bg-red-50';
      case 'edit':
        return 'text-[#fbbf24] hover:text-[#fbbf24]/80 hover:bg-[#fbbf24]/10';
      case 'view':
      case 'external':
        return 'text-[#0a0a0a] hover:text-[#0a0a0a]/80 hover:bg-[#0a0a0a]/10';
      case 'bookmark':
        return bookmarked 
          ? 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50'
          : 'text-gray-600 hover:text-yellow-600 hover:bg-yellow-50';
      case 'pin':
        return pinned
          ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
          : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50';
      case 'archive':
        return archived
          ? 'text-green-600 hover:text-green-700 hover:bg-green-50'
          : 'text-gray-600 hover:text-green-600 hover:bg-green-50';
      default:
        return 'text-gray-600 hover:text-gray-700 hover:bg-gray-50';
    }
  };

  // Handle action click with special behaviors
  const handleActionClick = useCallback(async (actionId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      switch (actionId) {
        case 'view':
          if (activity.entity_url) {
            window.open(activity.entity_url, '_blank');
          } else {
            onActionClick(actionId, activity);
          }
          break;

        case 'share':
          if (navigator.share && activity.entity_url) {
            await navigator.share({
              title: activity.title,
              text: activity.description || '',
              url: activity.entity_url
            });
            toast.success('Compartido exitosamente');
          } else if (activity.entity_url) {
            await navigator.clipboard.writeText(activity.entity_url);
            toast.success('Enlace copiado al portapapeles');
          } else {
            toast.error('No hay enlace para compartir');
          }
          break;

        case 'copy_link':
          if (activity.entity_url) {
            await navigator.clipboard.writeText(activity.entity_url);
            toast.success('Enlace copiado al portapapeles');
          } else {
            toast.error('No hay enlace disponible');
          }
          break;

        case 'bookmark':
          setBookmarked(!bookmarked);
          toast.success(bookmarked ? 'Marcador removido' : 'Agregado a marcadores');
          onActionClick(actionId, activity);
          break;

        case 'pin':
          setPinned(!pinned);
          toast.success(pinned ? 'Actividad despinneada' : 'Actividad pinneada');
          onActionClick(actionId, activity);
          break;

        case 'archive':
          setArchived(!archived);
          toast.success(archived ? 'Actividad restaurada' : 'Actividad archivada');
          onActionClick(actionId, activity);
          break;

        case 'delete':
          if (window.confirm('¿Estás seguro de que quieres eliminar esta actividad?')) {
            onActionClick(actionId, activity);
            toast.success('Actividad eliminada');
          }
          break;

        case 'flag':
          onActionClick(actionId, activity);
          toast.success('Actividad reportada');
          break;

        default:
          onActionClick(actionId, activity);
      }
    } catch (error) {
      console.error('Error executing action:', error);
      toast.error('Error al ejecutar la acción');
    }

    setShowDropdown(false);
  }, [activity, onActionClick, bookmarked, pinned, archived]);

  // Get context-specific actions
  const getContextActions = useCallback((): ActivityAction[] => {
    const contextActions = [...availableActions];

    // Add entity-specific actions
    switch (activity.entity_type) {
      case 'meeting':
        if (!contextActions.find(a => a.id === 'calendar')) {
          contextActions.push({
            id: 'calendar',
            label: 'Ver en calendario',
            icon: '📅',
            entity_types: ['meeting']
          });
        }
        break;

      case 'document':
        if (!contextActions.find(a => a.id === 'download')) {
          contextActions.push({
            id: 'download',
            label: 'Descargar',
            icon: '⬇️',
            entity_types: ['document']
          });
        }
        break;

      case 'message':
      case 'thread':
        if (!contextActions.find(a => a.id === 'reply')) {
          contextActions.push({
            id: 'reply',
            label: 'Responder',
            icon: '💬',
            entity_types: ['message', 'thread']
          });
        }
        break;
    }

    // Add universal actions
    const universalActions = [
      {
        id: 'bookmark',
        label: bookmarked ? 'Quitar marcador' : 'Marcar',
        icon: '⭐',
        entity_types: []
      },
      {
        id: 'copy_link',
        label: 'Copiar enlace',
        icon: '🔗',
        entity_types: []
      }
    ];

    universalActions.forEach(action => {
      if (!contextActions.find(a => a.id === action.id)) {
        contextActions.push(action);
      }
    });

    // Add admin-only actions if user has permissions
    if (activity.can_edit || activity.can_delete) {
      const adminActions = [
        {
          id: 'pin',
          label: pinned ? 'Despinnear' : 'Pinnear',
          icon: '📌',
          entity_types: [],
          requires_permission: 'can_edit'
        },
        {
          id: 'archive',
          label: archived ? 'Restaurar' : 'Archivar',
          icon: '📦',
          entity_types: [],
          requires_permission: 'can_edit'
        }
      ];

      adminActions.forEach(action => {
        if (!contextActions.find(a => a.id === action.id)) {
          contextActions.push(action);
        }
      });
    }

    return contextActions.filter(action => {
      // Check permissions
      if (action.requires_permission) {
        switch (action.requires_permission) {
          case 'can_edit':
            return activity.can_edit;
          case 'can_delete':
            return activity.can_delete;
          default:
            return true;
        }
      }

      // Check entity types
      if (action.entity_types && action.entity_types.length > 0) {
        return action.entity_types.includes(activity.entity_type);
      }

      return true;
    });
  }, [availableActions, activity, bookmarked, pinned, archived]);

  const contextActions = getContextActions();

  // Primary actions (shown directly)
  const primaryActions = contextActions.slice(0, 3);
  
  // Secondary actions (shown in dropdown)
  const secondaryActions = contextActions.slice(3);

  return (
    <div className="quick-actions flex items-center gap-1">
      {/* Primary actions */}
      {primaryActions.map((action) => (
        <button
          key={action.id}
          onClick={(e) => handleActionClick(action.id, e)}
          className={`p-2 rounded-lg transition-colors ${getActionColor(action.id)}`}
          title={action.label}
        >
          {getActionIcon(action.id)}
        </button>
      ))}

      {/* Secondary actions dropdown */}
      {secondaryActions.length > 0 && (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(!showDropdown);
            }}
            className="p-2 rounded-lg text-gray-600 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            title="Más acciones"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-1 z-10 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
              {secondaryActions.map((action) => (
                <button
                  key={action.id}
                  onClick={(e) => handleActionClick(action.id, e)}
                  className={`flex items-center gap-3 w-full px-3 py-2 text-sm transition-colors ${getActionColor(action.id)} text-left`}
                >
                  {getActionIcon(action.id)}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* External link indicator */}
      {activity.entity_url && (
        <button
          onClick={(e) => handleActionClick('external', e)}
          className="p-2 rounded-lg text-gray-400 hover:text-[#0a0a0a] hover:bg-[#0a0a0a]/10 transition-colors"
          title="Abrir en nueva pestaña"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      )}

      {/* Click overlay to close dropdown */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
};

export default QuickActions;