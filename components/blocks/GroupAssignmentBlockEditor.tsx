import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Calendar, FileText, AlertCircle, Info } from 'lucide-react';
import BlockEditorWrapper from './BlockEditorWrapper';
import { GroupAssignmentBlock, GroupData, GroupMember } from '@/types/blocks';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { createGroupAssignmentFromBlock } from '@/lib/services/simpleGroupAssignments';

interface GroupAssignmentBlockEditorProps {
  block: GroupAssignmentBlock;
  onChange: (payload: GroupAssignmentBlock['payload']) => void;
  onDelete: () => void;
  mode: 'edit' | 'preview';
  courseId: string;
}

export default function GroupAssignmentBlockEditor({
  block,
  onChange,
  onDelete,
  mode,
  courseId
}: GroupAssignmentBlockEditorProps) {
  const [availableStudents, setAvailableStudents] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [currentGroupName, setCurrentGroupName] = useState('');

  useEffect(() => {
    if (mode === 'edit') {
      fetchEnrolledStudents();
    }
  }, [courseId, mode]);

  const fetchEnrolledStudents = async () => {
    setLoading(true);
    try {
      // Fetch students enrolled in this course
      const { data, error } = await supabase
        .from('course_enrollments')
        .select(`
          user_id,
          profiles!inner(id, full_name, email, role)
        `)
        .eq('course_id', courseId)
        .in('profiles.role', ['docente', 'lider_comunidad', 'lider_generacion', 'equipo_directivo']);

      if (error) throw error;

      const students = data?.map(enrollment => {
        const profile = enrollment.profiles as any;
        return {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email
        };
      }) || [];

      setAvailableStudents(students);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = () => {
    if (!currentGroupName || selectedStudents.length === 0) {
      alert('Por favor ingrese un nombre de grupo y seleccione al menos un estudiante');
      return;
    }

    const newGroup: GroupData = {
      group_id: uuidv4(),
      group_name: currentGroupName,
      members: selectedStudents.map(studentId => {
        const student = availableStudents.find(s => s.id === studentId);
        return {
          user_id: studentId,
          full_name: student?.full_name || '',
          email: student?.email
        };
      })
    };

    onChange({
      ...block.payload,
      groups: [...(block.payload.groups || []), newGroup]
    });

    // Reset form
    setCurrentGroupName('');
    setSelectedStudents([]);
  };

  const handleRemoveGroup = (groupId: string) => {
    onChange({
      ...block.payload,
      groups: block.payload.groups.filter(g => g.group_id !== groupId)
    });
  };

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const isStudentAssigned = (studentId: string) => {
    return block.payload.groups.some(group =>
      group.members.some(member => member.user_id === studentId)
    );
  };

  if (mode === 'preview') {
    return (
      <BlockEditorWrapper
        title="Tarea Grupal"
        subtitle={`${block.payload.groups?.length || 0} grupo${(block.payload.groups?.length || 0) !== 1 ? 's' : ''}`}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onDelete={onDelete}
      >
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{block.payload.title || 'Sin título'}</h3>
          {block.payload.description && (
            <p className="text-gray-600">{block.payload.description}</p>
          )}
          {block.payload.due_date && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>Fecha límite: {new Date(block.payload.due_date).toLocaleDateString('es-ES')}</span>
            </div>
          )}
          <div className="space-y-2">
            <h4 className="font-medium">Grupos:</h4>
            {block.payload.groups.map((group, index) => (
              <div key={group.group_id} className="border rounded p-3">
                <div className="font-medium">{group.group_name}</div>
                <div className="text-sm text-gray-600">
                  Miembros: {group.members.map(m => m.full_name).join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </BlockEditorWrapper>
    );
  }

  return (
    <BlockEditorWrapper
      title="Tarea Grupal"
      subtitle="Configurar asignación para grupos"
      isCollapsed={false}
      onToggleCollapse={() => {}}
      onDelete={onDelete}
    >
      <div className="space-y-6">
        {/* Info Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Tarea Grupal en la Lección</p>
            <p>Esta tarea grupal se creará automáticamente cuando guardes la lección. Los estudiantes podrán verla y entregar su trabajo en el Espacio Colaborativo.</p>
          </div>
        </div>

        {/* Basic Information */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título de la Tarea
            </label>
            <input
              type="text"
              value={block.payload.title || ''}
              onChange={(e) => onChange({ ...block.payload, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Ej: Proyecto Final de Investigación"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={block.payload.description || ''}
              onChange={(e) => onChange({ ...block.payload, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
              placeholder="Describe la tarea grupal..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instrucciones
            </label>
            <textarea
              value={block.payload.instructions || ''}
              onChange={(e) => onChange({ ...block.payload, instructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={4}
              placeholder="Instrucciones detalladas para completar la tarea..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Entrega
            </label>
            <input
              type="datetime-local"
              value={block.payload.due_date || ''}
              onChange={(e) => onChange({ ...block.payload, due_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        {/* Group Management */}
        <div className="border-t pt-6">
          <h3 className="font-medium text-gray-900 mb-4">Grupos de Trabajo</h3>

          {/* Existing Groups */}
          <div className="space-y-3 mb-6">
            {block.payload.groups.map((group, index) => (
              <div key={group.group_id} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium">{group.group_name}</h4>
                    <div className="mt-2 space-y-1">
                      {group.members.map(member => (
                        <div key={member.user_id} className="text-sm text-gray-600">
                          • {member.full_name} {member.email && `(${member.email})`}
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveGroup(group.group_id)}
                    className="text-red-600 hover:text-red-700 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add New Group */}
          <div className="border rounded-lg p-4 bg-blue-50">
            <h4 className="font-medium mb-3">Crear Nuevo Grupo</h4>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Grupo
                </label>
                <input
                  type="text"
                  value={currentGroupName}
                  onChange={(e) => setCurrentGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Ej: Grupo 1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar Estudiantes
                </label>
                {loading ? (
                  <div className="text-center py-4 text-gray-500">
                    Cargando estudiantes...
                  </div>
                ) : availableStudents.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                    No hay estudiantes inscritos en este curso
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto border rounded-md bg-white">
                    {availableStudents.map(student => {
                      const isAssigned = isStudentAssigned(student.id);
                      const isSelected = selectedStudents.includes(student.id);
                      
                      return (
                        <label
                          key={student.id}
                          className={`flex items-center p-2 hover:bg-gray-50 cursor-pointer ${
                            isAssigned && !isSelected ? 'opacity-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleStudentToggle(student.id)}
                            disabled={isAssigned && !isSelected}
                            className="mr-2"
                          />
                          <span className="text-sm">
                            {student.full_name}
                            {isAssigned && !isSelected && (
                              <span className="ml-2 text-xs text-gray-500">(ya asignado)</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={handleAddGroup}
                disabled={!currentGroupName || selectedStudents.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Agregar Grupo
              </button>
            </div>
          </div>
        </div>
      </div>
    </BlockEditorWrapper>
  );
}