// src/components/TipTapEditor.tsx
import React from 'react';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';
import History from '@tiptap/extension-history';
import Heading from '@tiptap/extension-heading';
import Underline from '@tiptap/extension-underline';

interface TipTapEditorProps {
  initialContent: any; // Can be TipTap JSON or string (HTML)
  onChange: (jsonContent: any) => void;
}

interface MenuBarProps {
  editor: Editor | null;
  buttonConfigs: {
    action: () => void;
    can?: () => boolean;
    isActiveKey?: string; // Corrected type: should always be a string if provided
    isActiveOptions?: { [key: string]: any };
    label: string;
    noActiveState?: boolean;
  }[];
}

const MenuBar: React.FC<MenuBarProps> = ({ editor, buttonConfigs }) => {
  if (!editor) {
    return null;
  }

  // Define button styles with very prominent styling to ensure they appear as buttons
  const baseStyle = 'px-3 py-2 mx-3 mb-2 text-sm font-bold border-4 rounded-md shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#0a0a0a] inline-block';
  const inactiveStyle = `bg-white text-[#0a0a0a] border-[#0a0a0a] ${baseStyle}`;
  const activeStyle = `bg-[#fbbf24] text-[#0a0a0a] border-[#fbbf24] ${baseStyle}`;

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 border-b-2 border-gray-400 mb-3 bg-gray-50">
      {buttonConfigs.map(config => {
        const isEffectivelyActive = config.isActiveKey && editor.isEditable ? editor.isActive(config.isActiveKey, config.isActiveOptions) : false;
        return (
          <button
            type="button"
            key={config.label}
            onClick={config.action}
            disabled={!(config.can ? config.can() && editor.isEditable : editor.isEditable)}
            className={config.noActiveState ? inactiveStyle : (isEffectivelyActive ? activeStyle : inactiveStyle)}
          >
            {config.label}
          </button>
        );
      })}
    </div>
  );
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({ initialContent, onChange }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        history: false,
      }),
      // Explicitly include extensions for clarity
      Heading.configure({ levels: [2, 3] }),
      BulletList,
      OrderedList,
      ListItem,
      History,
      Underline,
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    editorProps: { // Restoring editorProps for styling the content area
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-xl focus:outline-none p-3 border border-gray-300 rounded-md min-h-[150px] w-full',
      },
    },
    immediatelyRender: false,
  });

  const buttonConfigs: MenuBarProps['buttonConfigs'] = [
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleBold().run();
        }
      },
      can: () => editor ? editor.isEditable : false, 
      isActiveKey: 'bold',
      label: 'Bold'
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleItalic().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'italic',
      label: 'Italic'
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleUnderline().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'underline',
      label: 'Underline'
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleHeading({ level: 2 }).run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'heading',
      isActiveOptions: { level: 2 },
      label: 'H2'
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleHeading({ level: 3 }).run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'heading',
      isActiveOptions: { level: 3 },
      label: 'H3'
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleBulletList().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'bulletList',
      label: 'Bullet List'
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleOrderedList().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'orderedList',
      label: 'Numbered List'
    },
    {
      action: () => {
        if (editor && editor.isEditable && editor.can().undo()) {
          editor.chain().focus().undo().run();
        }
      },
      can: () => editor ? editor.can().undo() && editor.isEditable : false,
      label: 'Undo',
      noActiveState: true
    },
    {
      action: () => {
        if (editor && editor.isEditable && editor.can().redo()) {
          editor.chain().focus().redo().run();
        }
      },
      can: () => editor ? editor.can().redo() && editor.isEditable : false,
      label: 'Redo',
      noActiveState: true
    },
  ];

  if (!editor) {
    return null;
  }

  return (
    <div className="border-2 border-gray-300 rounded-lg shadow-md">
      <MenuBar editor={editor} buttonConfigs={buttonConfigs} />
      <EditorContent 
        editor={editor} 
        className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none w-full tiptap-editor"
      />
    </div>
  );
};

export default TipTapEditor;
