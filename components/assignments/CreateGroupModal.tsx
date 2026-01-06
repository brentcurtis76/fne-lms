import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: any;
  communityId: string;
  currentUserId: string;
  onGroupCreated: () => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  assignment,
  communityId,
  currentUserId,
  onGroupCreated
}) => {
  const supabase = useSupabaseClient();
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [availableMembers, setAvailableMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadAvailableMembers();
    }
  }, [isOpen]);

  const loadAvailableMembers = async () => {
    try {
      setLoadingMembers(true);
      
      // Get community members who don't have a group for this assignment
      const { data: communityMembers, error: membersError } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          user:profiles!user_id (
            id,
            name,
            email,
            avatar_url
          )
        `)
        .eq('community_id', communityId)
        .not('user_id', 'eq', currentUserId);

      if (membersError) throw membersError;

      // Get existing group members for this assignment
      const { data: existingMembers, error: existingError } = await supabase
        .from('group_assignment_members')
        .select('user_id')
        .eq('assignment_id', assignment.id);

      if (existingError) throw existingError;

      const existingUserIds = new Set(existingMembers?.map(m => m.user_id) || []);
      
      // Filter out users who already have groups
      const available = communityMembers
        ?.filter(member => !existingUserIds.has(member.user_id) && member.user)
        .map(member => ({
          id: member.user_id,
          ...member.user
        })) || [];

      setAvailableMembers(available);
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Error al cargar los miembros disponibles');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleCreateGroup = async () => {
    if (selectedMembers.length < assignment.min_group_size - 1) {
      toast.error(`El grupo debe tener al menos ${assignment.min_group_size} miembros (incluyéndote)`);
      return;
    }

    if (selectedMembers.length > assignment.max_group_size - 1) {
      toast.error(`El grupo no puede tener más de ${assignment.max_group_size} miembros`);
      return;
    }

    setLoading(true);
    try {
      const groupId = crypto.randomUUID();
      
      // Create group with current user as leader
      const members = [
        {
          assignment_id: assignment.id,
          community_id: communityId,
          group_id: groupId,
          user_id: currentUserId,
          role: 'leader'
        },
        ...selectedMembers.map(userId => ({
          assignment_id: assignment.id,
          community_id: communityId,
          group_id: groupId,
          user_id: userId,
          role: 'member'
        }))
      ];

      const { error } = await supabase
        .from('group_assignment_members')
        .insert(members);

      if (error) throw error;

      toast.success('Grupo creado exitosamente');
      onGroupCreated();
      onClose();
    } catch (error) {
      console.error('Error creating group:', error);
      toast.error('Error al crear el grupo');
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Crear Grupo para {assignment.title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Group Requirements */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Requisitos del grupo:</strong> Entre {assignment.min_group_size} y {assignment.max_group_size} miembros
            </p>
            <p className="text-sm text-blue-800 mt-1">
              Seleccionados: {selectedMembers.length + 1} miembros (incluyéndote)
            </p>
          </div>

          {/* Member Selection */}
          {loadingMembers ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a] mx-auto"></div>
              <p className="text-gray-500 mt-2">Cargando miembros...</p>
            </div>
          ) : availableMembers.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
              {availableMembers.map(member => (
                <div
                  key={member.id}
                  onClick={() => toggleMember(member.id)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition ${
                    selectedMembers.includes(member.id)
                      ? 'bg-[#fbbf24]/20 border-2 border-[#fbbf24]'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.name}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <Users className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                  </div>
                  {selectedMembers.includes(member.id) && (
                    <div className="text-[#fbbf24]">
                      <UserPlus className="w-5 h-5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 mb-6">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">
                No hay miembros disponibles para formar grupos
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Todos los miembros ya tienen grupo asignado
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateGroup}
              disabled={loading || selectedMembers.length < assignment.min_group_size - 1}
              className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creando...' : 'Crear Grupo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};