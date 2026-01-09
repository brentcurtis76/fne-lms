/**
 * ActivityCard Component
 * Individual activity display with icons, actions, and contextual information
 * Phase 5 of Collaborative Workspace System for Genera
 */

import React, { useState, useCallback } from 'react';
import { 
  MoreHorizontal, 
  Eye, 
  Edit3, 
  Trash2, 
  Reply, 
  Download, 
  Share2, 
  Bookmark,
  ExternalLink,
  User,
  Calendar,
  MessageCircle,
  FileText,
  FolderOpen,
  Users,
  Settings,
  Clock,
  Star
} from 'lucide-react';
import {
  ActivityWithDetails,
  ActivityCardProps,
  ActivityAction,
  ACTIVITY_ACTIONS,
  ACTIVITY_TYPE_CONFIG
} from '../../types/activity';

const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  showActions = true,
  showUserInfo = true,
  showTimestamp = true,
  compact = false,
  onClick,
  onUserClick,
  onEntityClick
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Get activity configuration
  const config = ACTIVITY_TYPE_CONFIG[activity.activity_type];
  const categoryColors = {
    meeting: 'text-blue-600 bg-blue-50',
    document: 'text-green-600 bg-green-50',
    message: 'text-amber-600 bg-amber-50',
    user: 'text-orange-600 bg-orange-50',
    system: 'text-gray-600 bg-gray-50'
  };

  // Get available actions for this activity
  const getAvailableActions = useCallback((): ActivityAction[] => {
    return ACTIVITY_ACTIONS.filter(action => {
      // Check if action applies to this entity type
      if (action.entity_types && !action.entity_types.includes(activity.entity_type)) {
        return false;
      }

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

      return true;
    });
  }, [activity]);

  // Handle action clicks
  const handleActionClick = useCallback((actionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    switch (actionId) {
      case 'view':
        if (activity.entity_url) {
          window.open(activity.entity_url, '_blank');
        }
        break;
      case 'edit':
        // Handle edit action
        console.log('Edit activity:', activity.id);
        break;
      case 'reply':
        if (onEntityClick) {
          onEntityClick(activity.entity_type, activity.entity_id || '');
        }
        break;
      case 'download':
        // Handle download for documents
        console.log('Download:', activity.entity_id);
        break;
      case 'share':
        // Handle share action
        if (navigator.share && activity.entity_url) {
          navigator.share({
            title: activity.title,
            text: activity.description || '',
            url: activity.entity_url
          });
        } else if (activity.entity_url) {
          navigator.clipboard.writeText(activity.entity_url);
        }
        break;
      case 'bookmark':
        // Handle bookmark action
        console.log('Bookmark activity:', activity.id);
        break;
      default:
        console.log('Unknown action:', actionId);
    }

    setShowDropdown(false);
  }, [activity, onEntityClick]);

  // Handle card click
  const handleCardClick = useCallback(() => {
    if (onClick) {
      onClick(activity);
    }
  }, [onClick, activity]);

  // Handle user click
  const handleUserClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (onUserClick && activity.user_id) {
      onUserClick(activity.user_id);
    }
  }, [onUserClick, activity.user_id]);

  // Get entity icon
  const getEntityIcon = () => {
    switch (activity.entity_type) {
      case 'meeting':
        return <Calendar className="w-4 h-4" />;
      case 'document':
        return <FileText className="w-4 h-4" />;
      case 'folder':
        return <FolderOpen className="w-4 h-4" />;
      case 'message':
        return <MessageCircle className="w-4 h-4" />;
      case 'thread':
        return <MessageCircle className="w-4 h-4" />;
      case 'user':
        return <User className="w-4 h-4" />;
      case 'workspace':
        return <Users className="w-4 h-4" />;
      case 'system':
        return <Settings className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const availableActions = getAvailableActions();

  return (
    <div
      className={`activity-card group relative bg-white rounded-lg border border-gray-200 hover:border-[#fbbf24] hover:shadow-md transition-all duration-200 cursor-pointer ${
        compact ? 'p-3' : 'p-4'
      } ${activity.is_recent ? 'ring-2 ring-blue-200 ring-opacity-50' : ''}`}
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Activity indicator */}
      {activity.is_recent && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
      )}

      <div className="flex items-start gap-3">
        {/* Activity icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          config ? categoryColors[config.category] : 'text-gray-600 bg-gray-50'
        }`}>
          <span className="text-lg" role="img" aria-label="activity-icon">
            {activity.activity_icon}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {activity.title}
              </h3>
              
              {/* User info */}
              {showUserInfo && activity.user_name && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={handleUserClick}
                    className="flex items-center gap-1 text-xs text-gray-600 hover:text-[#0a0a0a] transition-colors"
                  >
                    <User className="w-3 h-3" />
                    <span className="font-medium">{activity.user_name}</span>
                    {activity.user_role && (
                      <span className="text-gray-400">
                        ({activity.user_role === 'lider_comunidad' ? 'Líder' : 
                          activity.user_role === 'admin' ? 'Admin' : 'Docente'})
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            {showActions && availableActions.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDropdown(!showDropdown);
                  }}
                  className={`p-1 rounded-lg hover:bg-gray-100 transition-colors ${
                    isHovered ? 'opacity-100' : 'opacity-0'
                  } group-hover:opacity-100`}
                >
                  <MoreHorizontal className="w-4 h-4 text-gray-500" />
                </button>

                {/* Dropdown menu */}
                {showDropdown && (
                  <div className="absolute right-0 top-8 z-10 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                    {availableActions.map((action) => (
                      <button
                        key={action.id}
                        onClick={(e) => handleActionClick(action.id, e)}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <span role="img" aria-label={action.label}>
                          {action.icon}
                        </span>
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {activity.description && !compact && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
              {activity.description}
            </p>
          )}

          {/* Metadata */}
          {activity.metadata && Object.keys(activity.metadata).length > 0 && !compact && (
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(activity.metadata).slice(0, 3).map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-600"
                >
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {activity.tags && activity.tags.length > 0 && !compact && (
            <div className="flex flex-wrap gap-1 mb-2">
              {activity.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-1 rounded-full bg-[#fbbf24] bg-opacity-10 text-xs text-[#0a0a0a] font-medium"
                >
                  #{tag}
                </span>
              ))}
              {activity.tags.length > 3 && (
                <span className="text-xs text-gray-500">
                  +{activity.tags.length - 3} más
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-4">
            {/* Entity type and timestamp */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                {getEntityIcon()}
                <span className="capitalize">{activity.entity_type}</span>
              </div>
              
              {showTimestamp && (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{activity.time_ago}</span>
                </div>
              )}
            </div>

            {/* Importance indicator */}
            {activity.importance_score > 2 && (
              <div className="flex items-center gap-1">
                {Array.from({ length: activity.importance_score }, (_, i) => (
                  <Star
                    key={i}
                    className={`w-3 h-3 ${
                      i < activity.importance_score 
                        ? 'text-[#fbbf24] fill-current' 
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Related users */}
          {activity.related_users && activity.related_users.length > 0 && !compact && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Users className="w-3 h-3" />
                <span>
                  {activity.related_users.length === 1 
                    ? '1 usuario involucrado' 
                    : `${activity.related_users.length} usuarios involucrados`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* External link indicator */}
      {activity.entity_url && (
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </div>
      )}

      {/* Click overlay for better UX */}
      <div className="absolute inset-0 pointer-events-none group-hover:bg-black group-hover:bg-opacity-5 rounded-lg transition-colors"></div>
    </div>
  );
};

export default ActivityCard;