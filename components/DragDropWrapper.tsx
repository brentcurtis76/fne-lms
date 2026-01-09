import React, { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';

interface DragDropWrapperProps {
  children: React.ReactNode;
  onDragEnd: (result: DropResult) => void;
  droppableId: string;
}

// This wrapper ensures drag and drop only renders on client side
export default function DragDropWrapper({ children, onDragEnd, droppableId }: DragDropWrapperProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div>{children}</div>;
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={droppableId}>
        {(provided, snapshot) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            style={{
              backgroundColor: snapshot.isDraggingOver ? '#f0f9ff' : 'transparent',
              transition: 'background-color 0.2s ease'
            }}
          >
            {children}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}