import React, { useState } from 'react';

interface Block {
  id: string;
  type: 'video' | 'quiz' | 'text';
  content: {
    title?: string;
    vimeoUrl?: string;
    [key: string]: any;
  };
}

interface CourseListProps {
  showInstructor?: boolean;
  limit?: number;
}

const initialBlocks: Block[] = [];

const CourseList: React.FC<CourseListProps> = ({ showInstructor, limit }) => {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const addBlock = (type: Block['type']) => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type,
      content: {},
    };
    setBlocks([...blocks, newBlock]);
  };

  const handleSelectBlock = (id: string) => {
    setSelectedBlockId(id);
  };

  const handleContentChange = (key: string, value: string) => {
    setBlocks(prev =>
      prev.map(block =>
        block.id === selectedBlockId
          ? { ...block, content: { ...block.content, [key]: value } }
          : block
      )
    );
  };

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <button onClick={() => addBlock('video')} className="px-4 py-2 bg-blue-600 text-white rounded">
          + Video
        </button>
        <button onClick={() => addBlock('quiz')} className="px-4 py-2 bg-green-600 text-white rounded">
          + Quiz
        </button>
        <button onClick={() => addBlock('text')} className="px-4 py-2 bg-yellow-500 text-white rounded">
          + Text
        </button>
      </div>

      <div className="bg-gray-100 p-4 rounded-md">
        <h3 className="font-semibold text-lg mb-2">Timeline</h3>
        <div className="space-y-2">
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className={`p-3 rounded-md cursor-pointer border ${
                selectedBlockId === block.id ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white'
              }`}
              onClick={() => handleSelectBlock(block.id)}
            >
              <p className="text-sm font-medium">#{index + 1} - {block.type.toUpperCase()}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedBlock && (
        <div className="bg-white border p-4 rounded-md space-y-4">
          <h4 className="font-semibold mb-2">Edit Block</h4>
          <p className="text-xs text-gray-500">Block ID: {selectedBlock.id}</p>

          {selectedBlock.type === 'video' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Video Title</label>
                <input
                  type="text"
                  value={selectedBlock.content.title || ''}
                  onChange={(e) => handleContentChange('title', e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Vimeo URL</label>
                <input
                  type="text"
                  value={selectedBlock.content.vimeoUrl || ''}
                  onChange={(e) => handleContentChange('vimeoUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </>
          )}

          {selectedBlock.type === 'quiz' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Quiz Question</label>
                <input
                  type="text"
                  value={selectedBlock.content.question || ''}
                  onChange={(e) => handleContentChange('question', e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Correct Answer</label>
                <input
                  type="text"
                  value={selectedBlock.content.answer || ''}
                  onChange={(e) => handleContentChange('answer', e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </>
          )}

          {selectedBlock.type === 'text' && (
            <div>
              <label className="block text-sm font-medium mb-1">Text Content</label>
              <textarea
                value={selectedBlock.content.body || ''}
                onChange={(e) => handleContentChange('body', e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CourseList;
