import React, { useState, useEffect, useMemo } from 'react';
import { Search, UserPlus, X, Users, Check } from 'lucide-react';

interface Collaborator {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  email?: string;
  avatar_url?: string;
  role_types?: string[];
}

interface CollaboratorSelectorProps {
  schoolId: number;
  assessmentId?: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
  maxSelections?: number;
}

export default function CollaboratorSelector({
  schoolId,
  assessmentId,
  selectedIds,
  onSelectionChange,
  disabled = false,
  maxSelections,
}: CollaboratorSelectorProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch eligible collaborators
  useEffect(() => {
    const fetchCollaborators = async () => {
      if (!schoolId) return;

      setLoading(true);
      setError(null);

      try {
        let url = `/api/vias-transformacion/eligible-collaborators?schoolId=${schoolId}`;
        if (assessmentId) {
          url += `&assessmentId=${assessmentId}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (response.ok) {
          setCollaborators(data.collaborators || []);
        } else {
          setError(data.error || 'Error al cargar colaboradores');
        }
      } catch (err) {
        console.error('[CollaboratorSelector] Error:', err);
        setError('Error al cargar colaboradores');
      } finally {
        setLoading(false);
      }
    };

    fetchCollaborators();
  }, [schoolId, assessmentId]);

  // Filter collaborators by search query
  const filteredCollaborators = useMemo(() => {
    if (!searchQuery.trim()) return collaborators;

    const query = searchQuery.toLowerCase();
    return collaborators.filter(
      c =>
        c.full_name.toLowerCase().includes(query) ||
        c.email?.toLowerCase().includes(query)
    );
  }, [collaborators, searchQuery]);

  const handleToggle = (id: string) => {
    if (disabled) return;

    const newSelected = selectedIds.includes(id)
      ? selectedIds.filter(sid => sid !== id)
      : maxSelections && selectedIds.length >= maxSelections
      ? selectedIds
      : [...selectedIds, id];

    onSelectionChange(newSelected);
  };

  const handleSelectAll = () => {
    if (disabled) return;

    const allIds = filteredCollaborators.map(c => c.id);
    if (maxSelections) {
      onSelectionChange(allIds.slice(0, maxSelections));
    } else {
      onSelectionChange(allIds);
    }
  };

  const handleClearAll = () => {
    if (disabled) return;
    onSelectionChange([]);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadge = (roleTypes?: string[]) => {
    if (!roleTypes || roleTypes.length === 0) return null;

    const primaryRole = roleTypes.includes('docente')
      ? 'docente'
      : roleTypes.includes('equipo_directivo')
      ? 'equipo_directivo'
      : roleTypes[0];

    const roleLabels: Record<string, string> = {
      docente: 'Docente',
      equipo_directivo: 'Directivo',
      lider_generacion: 'Líder de Generación',
      estudiante: 'Estudiante',
      admin: 'Admin',
      consultor: 'Consultor',
    };

    return (
      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
        {roleLabels[primaryRole] || primaryRole}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500"></div>
          <span className="ml-2 text-gray-500">Cargando colaboradores...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 rounded-lg p-4 bg-red-50">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (collaborators.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col items-center justify-center py-6 text-gray-500">
          <Users className="h-10 w-10 mb-2 text-gray-300" />
          <p className="text-sm">No hay otros usuarios en tu escuela</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Search and actions header */}
      <div className="bg-gray-50 p-3 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o correo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              disabled={disabled}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {selectedIds.length} de {collaborators.length} seleccionados
            {maxSelections && ` (máx. ${maxSelections})`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              disabled={disabled}
              className="text-yellow-600 hover:text-yellow-700 disabled:text-gray-400"
            >
              Seleccionar todos
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleClearAll}
              disabled={disabled || selectedIds.length === 0}
              className="text-gray-500 hover:text-gray-700 disabled:text-gray-400"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Collaborators list */}
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {filteredCollaborators.map(collaborator => {
          const isSelected = selectedIds.includes(collaborator.id);

          return (
            <label
              key={collaborator.id}
              className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                isSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggle(collaborator.id)}
                disabled={disabled}
                className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
              />

              {/* Avatar */}
              <div className="flex-shrink-0">
                {collaborator.avatar_url ? (
                  <img
                    src={collaborator.avatar_url}
                    alt={collaborator.full_name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                    {getInitials(collaborator.full_name)}
                  </div>
                )}
              </div>

              {/* Name and email */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {collaborator.full_name}
                  </p>
                  {getRoleBadge(collaborator.role_types)}
                </div>
                {collaborator.email && (
                  <p className="text-xs text-gray-500 truncate">{collaborator.email}</p>
                )}
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <Check className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              )}
            </label>
          );
        })}

        {filteredCollaborators.length === 0 && searchQuery && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No se encontraron colaboradores que coincidan con &quot;{searchQuery}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
