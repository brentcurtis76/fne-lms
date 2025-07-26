import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

interface MentionListProps {
  items: Array<{
    id: string;
    display_name: string;
    avatar_url?: string;
    role?: string;
    email?: string;
  }>;
  command: (item: any) => void;
}

export default forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      props.command({ 
        id: item.id, 
        label: item.display_name 
      });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

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

  if (!props.items.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-sm text-gray-500">
        No se encontraron usuarios
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
      <div className="py-1">
        {props.items.map((item, index) => (
          <button
            className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center space-x-3 transition-colors ${
              index === selectedIndex ? 'bg-blue-50 border-r-2 border-blue-500' : ''
            }`}
            key={index}
            onClick={() => selectItem(index)}
          >
            {/* Avatar */}
            <div className="flex-shrink-0">
              {item.avatar_url ? (
                <img
                  src={item.avatar_url}
                  alt={item.display_name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-500 font-medium">
                    {item.display_name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
              )}
            </div>

            {/* User info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-sm text-gray-900 truncate">
                  {item.display_name}
                </span>
                {item.role && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                    {getRoleLabel(item.role)}
                  </span>
                )}
              </div>
              {item.email && item.email !== item.display_name && (
                <div className="text-xs text-gray-500 truncate">
                  {item.email}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
});