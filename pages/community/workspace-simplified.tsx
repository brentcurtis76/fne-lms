// Simplified GroupAssignmentsTabContent component
import SimplifiedGroupAssignments from '../../components/workspace/SimplifiedGroupAssignments';

const GroupAssignmentsTabContent: React.FC<GroupAssignmentsTabContentProps> = ({ 
  workspace, 
  workspaceAccess, 
  user, 
  searchQuery 
}) => {
  if (!workspace) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <ClipboardDocumentCheckIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No hay espacio de trabajo seleccionado
        </h3>
        <p className="text-gray-500">
          Selecciona una comunidad para ver las tareas grupales.
        </p>
      </div>
    );
  }

  return (
    <SimplifiedGroupAssignments 
      communityId={workspace.community_id} 
      userId={user.id}
    />
  );
};