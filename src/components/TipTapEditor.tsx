// src/components/TipTapEditor.tsx
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Heading2 as Heading2Icon,
  Heading3 as Heading3Icon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Undo2 as Undo2Icon,
  Redo2 as Redo2Icon,
  Maximize2 as Maximize2Icon,
  Minimize2 as Minimize2Icon,
  X as XIcon,
} from 'lucide-react';
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
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  ariaLabel: string;
  label: string;
  title: string;
  noActiveState?: boolean;
}

interface ToolbarGroup {
  id: string;
  buttons: ButtonConfig[];
}

interface MenuBarProps {
  editor: Editor | null;
  toolbarGroups: ToolbarGroup[];
  expandable?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

// h-9 always (36px) for a comfortable touch hit area; the visible label sits beside the icon.
// Redesign groundwork (phase 3): this file once asked for more than it got. Tailwind did not read `src/`, so some
// classes written here were never generated and never applied: icon-only toolbar buttons with hidden labels from the
// md width up, an amber focus ring on buttons and on the box, a margin and padding between button groups, and larger
// prose sizes on wide screens. They were taken out when `src/` joined Tailwind's `content`, so that the editor keeps
// looking exactly as it did (Brent, 13 Nov 2026). The exact class names are in the git history of this line and in
// docs/plan/redesign/harness/README.md; they are not repeated here because Tailwind would generate them from a comment.
// Whoever rebuilds the editor decides anew.
const buttonBase =
  'inline-flex items-center justify-center h-9 gap-1.5 px-2 rounded-md transition-colors focus:outline-none focus-visible:ring-2';
const buttonInactive = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';
const buttonActive = 'bg-amber-100 text-amber-900 hover:bg-amber-100';
const buttonDisabled = 'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none';
const buttonLabel = 'text-xs font-medium';

const MenuBar: React.FC<MenuBarProps> = ({ editor, toolbarGroups, expandable, isFullscreen, onToggleFullscreen }) => {
  if (!editor) {
    return null;
  }

  const renderButton = (item: ButtonConfig) => {
    const Icon = item.icon;
    const isEffectivelyActive =
      item.isActiveKey && editor.isEditable
        ? editor.isActive(item.isActiveKey, item.isActiveOptions)
        : false;
    const isEnabled = item.can ? item.can() && editor.isEditable : editor.isEditable;
    const stateClass = item.noActiveState
      ? buttonInactive
      : isEffectivelyActive
      ? buttonActive
      : buttonInactive;

    return (
      <button
        type="button"
        key={item.ariaLabel}
        onClick={item.action}
        disabled={!isEnabled}
        aria-label={item.ariaLabel}
        aria-pressed={item.noActiveState ? undefined : isEffectivelyActive}
        title={item.title}
        className={`${buttonBase} ${stateClass} ${buttonDisabled}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className={buttonLabel}>{item.label}</span>
      </button>
    );
  };

  return (
    <div
      className="flex flex-wrap items-center gap-y-1 px-1.5 py-1 border-b border-slate-200 bg-white"
      role="toolbar"
      aria-label="Formato de texto"
    >
      {toolbarGroups.map((group, idx) => (
        <div
          key={group.id}
          className={`flex items-center gap-0.5 ${idx > 0 ? 'border-l border-slate-200' : ''}`}
        >
          {group.buttons.map(renderButton)}
        </div>
      ))}
      {expandable && onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Minimizar editor' : 'Maximizar editor'}
          title={isFullscreen ? 'Minimizar (Esc)' : 'Maximizar'}
          className={`${buttonBase} ${buttonInactive} ml-auto`}
        >
          {isFullscreen ? (
            <Minimize2Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Maximize2Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className={buttonLabel}>{isFullscreen ? 'Reducir' : 'Expandir'}</span>
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
        class: 'prose prose-sm focus:outline-none px-4 py-3 w-full',
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

  const toolbarGroups: ToolbarGroup[] = [
    {
      id: 'format',
      buttons: [
        {
          action: () => {
            if (editor && editor.isEditable) {
              editor.chain().focus().toggleBold().run();
            }
          },
          can: () => (editor ? editor.isEditable : false),
          isActiveKey: 'bold',
          icon: BoldIcon,
          ariaLabel: 'Negrita',
          label: 'Negrita',
          title: 'Negrita (Ctrl+B)',
        },
        {
          action: () => {
            if (editor && editor.isEditable) {
              editor.chain().focus().toggleItalic().run();
            }
          },
          can: () => (editor ? editor.isEditable : false),
          isActiveKey: 'italic',
          icon: ItalicIcon,
          ariaLabel: 'Cursiva',
          label: 'Cursiva',
          title: 'Cursiva (Ctrl+I)',
        },
        {
          action: () => {
            if (editor && editor.isEditable) {
              editor.chain().focus().toggleUnderline().run();
            }
          },
          can: () => (editor ? editor.isEditable : false),
          isActiveKey: 'underline',
          icon: UnderlineIcon,
          ariaLabel: 'Subrayado',
          label: 'Subrayar',
          title: 'Subrayado (Ctrl+U)',
        },
      ],
    },
    {
      id: 'block',
      buttons: [
        {
          action: () => {
            if (editor && editor.isEditable) {
              editor.chain().focus().toggleHeading({ level: 2 }).run();
            }
          },
          can: () => (editor ? editor.isEditable : false),
          isActiveKey: 'heading',
          isActiveOptions: { level: 2 },
          icon: Heading2Icon,
          ariaLabel: 'Encabezado nivel 2',
          label: 'Título 2',
          title: 'Encabezado 2 (Ctrl+Alt+2)',
        },
        {
          action: () => {
            if (editor && editor.isEditable) {
              editor.chain().focus().toggleHeading({ level: 3 }).run();
            }
          },
          can: () => (editor ? editor.isEditable : false),
          isActiveKey: 'heading',
          isActiveOptions: { level: 3 },
          icon: Heading3Icon,
          ariaLabel: 'Encabezado nivel 3',
          label: 'Título 3',
          title: 'Encabezado 3 (Ctrl+Alt+3)',
        },
      ],
    },
    {
      id: 'list',
      buttons: [
        {
          action: () => {
            if (editor && editor.isEditable) {
              editor.chain().focus().toggleBulletList().run();
            }
          },
          can: () => (editor ? editor.isEditable : false),
          isActiveKey: 'bulletList',
          icon: ListIcon,
          ariaLabel: 'Lista con viñetas',
          label: 'Viñetas',
          title: 'Lista con viñetas (Ctrl+Shift+8)',
        },
        {
          action: () => {
            if (editor && editor.isEditable) {
              editor.chain().focus().toggleOrderedList().run();
            }
          },
          can: () => (editor ? editor.isEditable : false),
          isActiveKey: 'orderedList',
          icon: ListOrderedIcon,
          ariaLabel: 'Lista numerada',
          label: 'Números',
          title: 'Lista numerada (Ctrl+Shift+7)',
        },
      ],
    },
    {
      id: 'history',
      buttons: [
        {
          action: () => {
            if (editor && editor.isEditable && editor.can().undo()) {
              editor.chain().focus().undo().run();
            }
          },
          can: () => (editor ? editor.can().undo() && editor.isEditable : false),
          icon: Undo2Icon,
          ariaLabel: 'Deshacer',
          label: 'Deshacer',
          title: 'Deshacer (Ctrl+Z)',
          noActiveState: true,
        },
        {
          action: () => {
            if (editor && editor.isEditable && editor.can().redo()) {
              editor.chain().focus().redo().run();
            }
          },
          can: () => (editor ? editor.can().redo() && editor.isEditable : false),
          icon: Redo2Icon,
          ariaLabel: 'Rehacer',
          label: 'Rehacer',
          title: 'Rehacer (Ctrl+Shift+Z)',
          noActiveState: true,
        },
      ],
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
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow">
      <MenuBar
        editor={editor}
        toolbarGroups={toolbarGroups}
        expandable={expandable}
        isFullscreen={false}
        onToggleFullscreen={expandable ? () => setIsFullscreen(true) : undefined}
      />
      <EditorContent
        editor={editor}
        style={contentStyle}
        className="prose prose-sm max-w-none focus:outline-none w-full tiptap-editor"
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
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 bg-white">
        <span className="text-sm font-semibold text-slate-900">Editor</span>
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          aria-label="Cerrar pantalla completa"
          title="Cerrar (Esc)"
          className={`${buttonBase} ${buttonInactive}`}
        >
          <XIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className={buttonLabel}>Cerrar</span>
        </button>
      </div>
      <MenuBar
        editor={editor}
        toolbarGroups={toolbarGroups}
        expandable={expandable}
        isFullscreen={true}
        onToggleFullscreen={() => setIsFullscreen(false)}
      />
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none focus:outline-none w-full tiptap-editor flex-1 overflow-y-auto"
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
