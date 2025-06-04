/**
 * MentionPicker Component
 * @username autocomplete with community member suggestions
 * Phase 4 of Collaborative Workspace System for FNE LMS
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AtSign, User, Crown, Shield, Briefcase } from 'lucide-react';
import { MentionSuggestion, MentionType } from '../../types/messaging';

interface MentionPickerProps {
  isVisible: boolean;
  query: string;
  suggestions: MentionSuggestion[];
  selectedIndex: number;
  position?: { x: number; y: number };
  onSelect: (suggestion: MentionSuggestion) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClose: () => void;
  maxSuggestions?: number;
  className?: string;
}

const MentionPicker: React.FC<MentionPickerProps> = ({
  isVisible,
  query,
  suggestions,
  selectedIndex,
  position,
  onSelect,
  onKeyDown,
  onClose,
  maxSuggestions = 10,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isVisible) {
        onKeyDown(e as any);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, onKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (isVisible && containerRef.current) {
      const selectedElement = containerRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [isVisible, selectedIndex]);

  // Get role icon
  const getRoleIcon = (role?: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return <Crown className="w-3 h-3 text-yellow-500" />;
      case 'lider_comunidad':
        return <Shield className="w-3 h-3 text-blue-500" />;
      case 'consultant':
        return <Briefcase className="w-3 h-3 text-green-500" />;
      default:
        return <User className="w-3 h-3 text-gray-400" />;
    }
  };

  // Get role label
  const getRoleLabel = (role?: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'Administrador';
      case 'lider_comunidad':
        return 'Líder de Comunidad';
      case 'consultant':
        return 'Consultor';
      case 'docente':
        return 'Docente';
      default:
        return '';
    }
  };

  // Filter and limit suggestions
  const filteredSuggestions = suggestions
    .filter(suggestion => 
      query === '' || 
      suggestion.display_name.toLowerCase().includes(query.toLowerCase()) ||
      (suggestion.email && suggestion.email.toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, maxSuggestions);

  if (!isVisible || filteredSuggestions.length === 0) {
    return null;
  }

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 1000,
    ...(position && {
      left: position.x,
      top: position.y,
    }),
  };

  return (
    <div
      ref={containerRef}
      className={`bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto ${className}`}
      style={containerStyle}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <AtSign className="w-4 h-4" />
          <span>Mencionar usuario</span>
          {query && (
            <span className="text-gray-400">
              buscando "{query}"
            </span>
          )}
        </div>
      </div>

      {/* Suggestions list */}
      <div className="py-1">
        {filteredSuggestions.map((suggestion, index) => (
          <button
            key={suggestion.id}
            onClick={() => onSelect(suggestion)}
            className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors ${
              index === selectedIndex ? 'bg-blue-50 border-r-2 border-blue-500' : ''
            }`}
          >
            {/* Avatar or icon */}
            <div className="flex-shrink-0">
              {suggestion.avatar ? (
                <img
                  src={suggestion.avatar}
                  alt={suggestion.display_name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  {getRoleIcon(suggestion.role)}
                </div>
              )}
            </div>

            {/* User info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm text-gray-900 truncate">
                  {suggestion.display_name}
                </span>
                {suggestion.role && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                    {getRoleLabel(suggestion.role)}
                  </span>
                )}
              </div>
              {suggestion.email && suggestion.email !== suggestion.display_name && (
                <div className="text-xs text-gray-500 truncate">
                  {suggestion.email}
                </div>
              )}
            </div>

            {/* Mention type indicator */}
            <div className="flex-shrink-0">
              {suggestion.type === 'all' && (
                <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                  @todos
                </span>
              )}
              {suggestion.type === 'role' && (
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  @{suggestion.role}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Special mentions section */}
      {query === '' && (
        <div className="border-t border-gray-100">
          <div className="px-3 py-2 bg-gray-50">
            <div className="text-xs text-gray-600 font-medium">Menciones especiales</div>
          </div>
          <div className="py-1">
            <button
              onClick={() => onSelect({
                type: 'all' as MentionType,
                id: 'all',
                display_name: 'todos',
                email: '',
              })}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
            >
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                <AtSign className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900">@todos</div>
                <div className="text-xs text-gray-500">Mencionar a todos en la comunidad</div>
              </div>
              <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                Especial
              </span>
            </button>

            <button
              onClick={() => onSelect({
                type: 'role' as MentionType,
                id: 'lider_comunidad',
                display_name: 'lideres',
                email: '',
                role: 'lider_comunidad',
              })}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Shield className="w-4 h-4 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900">@lideres</div>
                <div className="text-xs text-gray-500">Mencionar a los líderes de comunidad</div>
              </div>
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                Rol
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Footer with instructions */}
      <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
        <div className="text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>↑↓ navegar</span>
            <span>Enter seleccionar</span>
            <span>Esc cerrar</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MentionPicker;