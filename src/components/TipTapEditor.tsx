// src/components/TipTapEditor.tsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import { buildMeetingEditorExtensions } from '@/lib/tiptap/extensions';

interface TipTapEditorProps {
  initialContent: any; // Can be TipTap JSON or string (HTML)
  onChange: (jsonContent: any) => void;
  expandable?: boolean;
  minHeight?: number;
  maxHeight?: number;
  placeholder?: string;
  editable?: boolean;
  onBlur?: (json: any) => void;
}

interface ButtonConfig {
  action: () => void;
  can?: () => boolean;
  isActiveKey?: string;
  isActiveOptions?: { [key: string]: any };
  label: string;
  ariaLabel: string;
  title: string;
  noActiveState?: boolean;
}

interface MenuBarProps {
  editor: Editor | null;
  buttonConfigs: ButtonConfig[];
  expandable?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const MaximizeIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const MinimizeIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

const MenuBar: React.FC<MenuBarProps> = ({ editor, buttonConfigs, expandable, isFullscreen, onToggleFullscreen }) => {
  if (!editor) {
    return null;
  }

  const baseStyle = 'px-3 py-2 mx-3 mb-2 text-sm font-bold border-4 rounded-md shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#0a0a0a] inline-block';
  const inactiveStyle = `bg-white text-[#0a0a0a] border-[#0a0a0a] ${baseStyle}`;
  const activeStyle = `bg-[#fbbf24] text-[#0a0a0a] border-[#fbbf24] ${baseStyle}`;
  const iconButtonStyle = `bg-white text-[#0a0a0a] border-[#0a0a0a] px-2 py-2 mx-3 mb-2 border-4 rounded-md shadow-md hover:shadow-lg focus:outline-none focus:ring-4 focus:ring-[#0a0a0a] inline-flex items-center justify-center`;

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
            aria-label={config.ariaLabel}
            aria-pressed={config.noActiveState ? undefined : isEffectivelyActive}
            title={config.title}
            className={config.noActiveState ? inactiveStyle : (isEffectivelyActive ? activeStyle : inactiveStyle)}
          >
            {config.label}
          </button>
        );
      })}
      {expandable && onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Minimizar editor' : 'Maximizar editor'}
          title={isFullscreen ? 'Minimizar (Esc)' : 'Maximizar'}
          className={`${iconButtonStyle} ml-auto`}
        >
          {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </button>
      )}
    </div>
  );
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  initialContent,
  onChange,
  expandable = false,
  minHeight = 150,
  maxHeight,
  placeholder,
  editable = true,
  onBlur,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const editor = useEditor({
    extensions: buildMeetingEditorExtensions({ placeholder }),
    content: initialContent || '',
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
    onBlur: ({ editor }) => {
      if (onBlur) {
        onBlur(editor.getJSON());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-xl focus:outline-none p-3 border border-gray-300 rounded-md w-full',
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(initialContent);
    if (current === next) return;
    editor.commands.setContent(initialContent || '', false);
  }, [initialContent, editor]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  const buttonConfigs: ButtonConfig[] = [
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleBold().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'bold',
      label: 'Bold',
      ariaLabel: 'Negrita',
      title: 'Negrita (Ctrl+B)',
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleItalic().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'italic',
      label: 'Italic',
      ariaLabel: 'Cursiva',
      title: 'Cursiva (Ctrl+I)',
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleUnderline().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'underline',
      label: 'Underline',
      ariaLabel: 'Subrayado',
      title: 'Subrayado (Ctrl+U)',
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
      label: 'H2',
      ariaLabel: 'Encabezado nivel 2',
      title: 'Encabezado 2 (Ctrl+Alt+2)',
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
      label: 'H3',
      ariaLabel: 'Encabezado nivel 3',
      title: 'Encabezado 3 (Ctrl+Alt+3)',
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleBulletList().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'bulletList',
      label: 'Bullet List',
      ariaLabel: 'Lista con viñetas',
      title: 'Lista con viñetas (Ctrl+Shift+8)',
    },
    {
      action: () => {
        if (editor && editor.isEditable) {
          editor.chain().focus().toggleOrderedList().run();
        }
      },
      can: () => editor ? editor.isEditable : false,
      isActiveKey: 'orderedList',
      label: 'Numbered List',
      ariaLabel: 'Lista numerada',
      title: 'Lista numerada (Ctrl+Shift+7)',
    },
    {
      action: () => {
        if (editor && editor.isEditable && editor.can().undo()) {
          editor.chain().focus().undo().run();
        }
      },
      can: () => editor ? editor.can().undo() && editor.isEditable : false,
      label: 'Undo',
      ariaLabel: 'Deshacer',
      title: 'Deshacer (Ctrl+Z)',
      noActiveState: true,
    },
    {
      action: () => {
        if (editor && editor.isEditable && editor.can().redo()) {
          editor.chain().focus().redo().run();
        }
      },
      can: () => editor ? editor.can().redo() && editor.isEditable : false,
      label: 'Redo',
      ariaLabel: 'Rehacer',
      title: 'Rehacer (Ctrl+Shift+Z)',
      noActiveState: true,
    },
  ];

  if (!editor) {
    return null;
  }

  const contentStyle: React.CSSProperties = {
    minHeight: `${minHeight}px`,
    ...(maxHeight && !isFullscreen ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' } : {}),
  };

  const inlineEditor = (
    <div className="border-2 border-gray-300 rounded-lg shadow-md">
      <MenuBar
        editor={editor}
        buttonConfigs={buttonConfigs}
        expandable={expandable}
        isFullscreen={false}
        onToggleFullscreen={expandable ? () => setIsFullscreen(true) : undefined}
      />
      <EditorContent
        editor={editor}
        style={contentStyle}
        className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none w-full tiptap-editor"
      />
    </div>
  );

  const fullscreenEditor = (
    <div
      className="fixed inset-0 z-50 bg-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Editor en pantalla completa"
    >
      <div className="flex items-center justify-between border-b-2 border-gray-300 px-4 py-2 bg-gray-50">
        <span className="text-sm font-bold text-[#0a0a0a]">Editor</span>
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          aria-label="Cerrar pantalla completa"
          title="Cerrar (Esc)"
          className="px-3 py-1 text-sm font-bold border-2 border-[#0a0a0a] rounded-md bg-white hover:bg-gray-100 focus:outline-none focus:ring-4 focus:ring-[#0a0a0a]"
        >
          ✕
        </button>
      </div>
      <MenuBar
        editor={editor}
        buttonConfigs={buttonConfigs}
        expandable={expandable}
        isFullscreen={true}
        onToggleFullscreen={() => setIsFullscreen(false)}
      />
      <EditorContent
        editor={editor}
        className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none w-full tiptap-editor flex-1 overflow-y-auto"
      />
    </div>
  );

  return (
    <>
      {inlineEditor}
      {isFullscreen && isMounted && typeof document !== 'undefined'
        ? createPortal(fullscreenEditor, document.body)
        : null}
    </>
  );
};

export default TipTapEditor;
