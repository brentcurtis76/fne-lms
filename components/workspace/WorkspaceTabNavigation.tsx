import React from 'react';
import { 
  HomeIcon, 
  UsersIcon, 
  DocumentTextIcon, 
  ChatAlt2Icon, 
  ClipboardCheckIcon,
  CalendarIcon 
} from '@heroicons/react/outline';

interface Tab {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
}

interface WorkspaceTabNavigationProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isAdmin?: boolean;
}

const WorkspaceTabNavigation: React.FC<WorkspaceTabNavigationProps> = ({
  activeSection,
  onSectionChange,
  isAdmin = false
}) => {
  const tabs: Tab[] = [
    { id: 'overview', name: 'Vista General', icon: HomeIcon, show: true },
    { id: 'meetings', name: 'Reuniones', icon: CalendarIcon, show: true },
    { id: 'documents', name: 'Documentos', icon: DocumentTextIcon, show: true },
    { id: 'messaging', name: 'Mensajes', icon: ChatAlt2Icon, show: true },
    { id: 'group-assignments', name: 'Tareas Grupales', icon: ClipboardCheckIcon, show: true },
    { id: 'communities', name: 'Gestión', icon: UsersIcon, show: isAdmin }
  ].filter(tab => tab.show);

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onSectionChange(tab.id)}
              className={`
                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm
                ${isActive
                  ? 'border-[#fdb933] text-[#00365b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <Icon
                className={`
                  -ml-0.5 mr-2 h-5 w-5
                  ${isActive
                    ? 'text-[#00365b]'
                    : 'text-gray-400 group-hover:text-gray-500'
                  }
                `}
                aria-hidden="true"
              />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default WorkspaceTabNavigation;