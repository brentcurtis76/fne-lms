import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Users, Loader2, Check, BookOpen, Route } from 'lucide-react';
import useDebounce from '../../../hooks/useDebounce';
import { toast } from 'react-hot-toast';

interface BatchAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: 'course' | 'learning_path';
  contentId: string;
  contentTitle: string;
  onAssignComplete: () => void;
}

// Simplified user target for Phase 3 MVP
interface UserTarget {
  id: string;
  name: string;
  email: string;
}

/**
 * Batch Assign Modal - Phase 3 MVP
 * Allows assigning a course or LP to multiple users at once.
 *
 * NOTE: School/community batch assignment deferred to future phase.
 * The existing learning_path_assignments.group_id is FK to community_workspaces,
 * NOT schools or growth_communities. Future implementation would require:
 * 1. New RPC to expand school/community to member list
 * 2. Batch assign to each individual user
 */
export function BatchAssignModal({
  isOpen,
  onClose,
  contentType,
  contentId,
  contentTitle,
  onAssignComplete
}: BatchAssignModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserTarget[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Search for users
  const searchUsers = useCallback(async () => {
    if (!debouncedSearch.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/admin/users?search=${encodeURIComponent(debouncedSearch)}&pageSize=20`);
      if (response.ok) {
        const data = await response.json();
        const users: UserTarget[] = (data.users || []).map((u: any) => ({
          id: u.id,
          name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          email: u.email
        }));
        setSearchResults(users);
      } else {
        toast.error('Error al buscar usuarios');
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      toast.error('Error al buscar usuarios');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    searchUsers();
  }, [searchUsers]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
    }
  }, [isOpen]);

  // Toggle user selection
  const toggleUser = (user: UserTarget) => {
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.id === user.id);
      if (exists) {
        return prev.filter(u => u.id !== user.id);
      }
      return [...prev, user];
    });
  };

  // Check if user is selected
  const isSelected = (user: UserTarget) => {
    return selectedUsers.some(u => u.id === user.id);
  };

  // Remove selected user
  const removeSelected = (user: UserTarget) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== user.id));
  };

  // Perform batch assignment
  const handleAssign = async () => {
    if (selectedUsers.length === 0) return;

    setAssigning(true);
    try {
      const userIds = selectedUsers.map(u => u.id);
      const endpoint = contentType === 'course'
        ? '/api/courses/batch-assign'
        : '/api/learning-paths/batch-assign';

      const body = contentType === 'course'
        ? { courseId: contentId, userIds }
        : { pathId: contentId, userIds };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        toast.success(`Asignado a ${selectedUsers.length} usuario(s)`);
        onAssignComplete();
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Error al asignar');
      }
    } catch (error: any) {
      console.error('Assignment error:', error);
      toast.error(error.message || 'Error al asignar');
    } finally {
      setAssigning(false);
    }
  };

  if (!isOpen) return null;

  const ContentIcon = contentType === 'course' ? BookOpen : Route;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ContentIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Asignar {contentType === 'course' ? 'Curso' : 'Ruta'}
                </h3>
                <p className="text-sm text-gray-500 truncate max-w-md" title={contentTitle}>
                  {contentTitle}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col p-6">
            {/* Header label */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-100 text-blue-700">
                <Users className="h-4 w-4" />
                Buscar Usuarios
              </div>
            </div>

            {/* Search input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar usuarios por nombre o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 animate-spin" />
              )}
            </div>

            {/* Selected users */}
            {selectedUsers.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">
                  {selectedUsers.length} usuario(s) seleccionado(s)
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((user) => (
                    <span
                      key={user.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs"
                    >
                      <Users className="h-3 w-3" />
                      {user.name}
                      <button
                        onClick={() => removeSelected(user)}
                        className="ml-1 hover:text-blue-900"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Search results */}
            <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
              {searchResults.length === 0 && !searching && searchQuery && (
                <div className="p-4 text-center text-sm text-gray-500">
                  No se encontraron usuarios
                </div>
              )}
              {searchResults.length === 0 && !searching && !searchQuery && (
                <div className="p-4 text-center text-sm text-gray-500">
                  Escribe para buscar usuarios
                </div>
              )}
              {searchResults.length > 0 && (
                <ul className="divide-y divide-gray-100">
                  {searchResults.map((user) => {
                    const selected = isSelected(user);
                    return (
                      <li key={user.id}>
                        <button
                          onClick={() => toggleUser(user)}
                          className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors ${
                            selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {user.email}
                            </p>
                          </div>
                          <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selected
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-gray-300'
                          }`}>
                            {selected && <Check className="h-3 w-3 text-white" />}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={assigning}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssign}
              disabled={selectedUsers.length === 0 || assigning}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {assigning && <Loader2 className="h-4 w-4 animate-spin" />}
              Asignar ({selectedUsers.length})
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default BatchAssignModal;
