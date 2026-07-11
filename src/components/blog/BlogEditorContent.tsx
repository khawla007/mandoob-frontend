'use client';

import { useCallback, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { generateHTML } from '@tiptap/html';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImageIcon,
  Italic,
  LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type JsonContent = Record<string, unknown>;

const emptyContent: JsonContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const InlineHeading = Mark.create({
  name: 'inlineHeading',

  inclusive: false,

  addAttributes() {
    return {
      level: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute('data-heading-level') ?? 1),
        renderHTML: (attributes) => ({
          'data-heading-level': String(attributes.level),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-heading-level]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

const extensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3, 4],
    },
  }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
  }),
  Image,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  InlineHeading,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right'],
  }),
  Underline,
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: 'Write the post content...' }),
];

function contentOrEmpty(content: JsonContent | null | undefined): JsonContent {
  return content && Object.keys(content).length > 0 ? content : emptyContent;
}

function toggleInlineHeading(editor: Editor | null, level: 1 | 2 | 3 | 4): void {
  if (!editor) return;
  if (editor.isActive('inlineHeading', { level })) {
    editor.chain().focus().unsetMark('inlineHeading').run();
    return;
  }
  editor.chain().focus().unsetMark('inlineHeading').setMark('inlineHeading', { level }).run();
}

export function BlogEditorContent({ initialContent }: { initialContent?: JsonContent | null }) {
  const initialJson = useMemo(() => contentOrEmpty(initialContent), [initialContent]);
  const initialHtml = useMemo(() => generateHTML(initialJson, extensions), [initialJson]);
  const [contentState, setContentState] = useState(() => ({
    json: initialJson,
    html: initialHtml,
  }));
  const [, refreshToolbarState] = useState(0);
  const updateContentState = useCallback((editorInstance: Editor) => {
    setContentState({
      json: editorInstance.getJSON() as JsonContent,
      html: editorInstance.getHTML(),
    });
  }, []);
  const updateToolbarState = useCallback(() => {
    refreshToolbarState((value) => value + 1);
  }, []);
  const editor = useEditor({
    extensions,
    content: initialJson,
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      updateContentState(editor);
      updateToolbarState();
    },
    onUpdate: ({ editor }) => {
      updateContentState(editor);
      updateToolbarState();
    },
    onSelectionUpdate: updateToolbarState,
    onFocus: updateToolbarState,
    onBlur: updateToolbarState,
    editorProps: {
      attributes: {
        class: 'blog-editor-content min-h-96 px-4 py-3 focus:outline-none',
      },
    },
  });

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previousUrl ?? '');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  function addImage() {
    if (!editor) return;
    const url = window.prompt('Image URL');
    if (!url?.trim()) return;
    editor.chain().focus().setImage({ src: url.trim() }).run();
  }

  const hasTextSelection = editor ? !editor.state.selection.empty : false;

  return (
    <div className="space-y-3">
      <input type="hidden" name="contentJson" value={JSON.stringify(contentState.json)} readOnly />
      <input type="hidden" name="contentHtml" value={contentState.html} readOnly />
      <div className="border-border/70 overflow-hidden rounded-lg border">
        <div className="bg-muted/40 flex flex-wrap gap-1 border-b p-2">
          <ToolbarButton
            label="Bold"
            active={hasTextSelection && editor?.isActive('bold')}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={hasTextSelection && editor?.isActive('italic')}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={hasTextSelection && editor?.isActive('underline')}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            active={hasTextSelection && editor?.isActive('strike')}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 1"
            active={hasTextSelection && editor?.isActive('inlineHeading', { level: 1 })}
            onClick={() => toggleInlineHeading(editor, 1)}
          >
            <Heading1 />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            active={hasTextSelection && editor?.isActive('inlineHeading', { level: 2 })}
            onClick={() => toggleInlineHeading(editor, 2)}
          >
            <Heading2 />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            active={hasTextSelection && editor?.isActive('inlineHeading', { level: 3 })}
            onClick={() => toggleInlineHeading(editor, 3)}
          >
            <Heading3 />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 4"
            active={hasTextSelection && editor?.isActive('inlineHeading', { level: 4 })}
            onClick={() => toggleInlineHeading(editor, 4)}
          >
            <Heading4 />
          </ToolbarButton>
          <ToolbarButton
            label="Align left"
            active={hasTextSelection && editor?.isActive({ textAlign: 'left' })}
            onClick={() => editor?.chain().focus().setTextAlign('left').run()}
          >
            <AlignLeft />
          </ToolbarButton>
          <ToolbarButton
            label="Align center"
            active={hasTextSelection && editor?.isActive({ textAlign: 'center' })}
            onClick={() => editor?.chain().focus().setTextAlign('center').run()}
          >
            <AlignCenter />
          </ToolbarButton>
          <ToolbarButton
            label="Align right"
            active={hasTextSelection && editor?.isActive({ textAlign: 'right' })}
            onClick={() => editor?.chain().focus().setTextAlign('right').run()}
          >
            <AlignRight />
          </ToolbarButton>
          <ToolbarButton
            label="Bullet list"
            active={hasTextSelection && editor?.isActive('bulletList')}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List />
          </ToolbarButton>
          <ToolbarButton
            label="Ordered list"
            active={hasTextSelection && editor?.isActive('orderedList')}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </ToolbarButton>
          <ToolbarButton
            label="Task list"
            active={hasTextSelection && editor?.isActive('taskList')}
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
          >
            <ListChecks />
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            active={hasTextSelection && editor?.isActive('blockquote')}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </ToolbarButton>
          <ToolbarButton
            label="Code block"
            active={hasTextSelection && editor?.isActive('codeBlock')}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          >
            <Code2 />
          </ToolbarButton>
          <ToolbarButton
            label="Divider"
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            <Minus />
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            active={hasTextSelection && editor?.isActive('link')}
            onClick={setLink}
          >
            <LinkIcon />
          </ToolbarButton>
          <ToolbarButton label="Image URL" onClick={addImage}>
            <ImageIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Insert table"
            onClick={() =>
              editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <Table2 />
          </ToolbarButton>
          <ToolbarButton label="Undo" onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 />
          </ToolbarButton>
        </div>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        active &&
          'bg-zinc-400 text-zinc-950 shadow-inner ring-1 ring-zinc-500/50 hover:bg-zinc-400 dark:bg-zinc-500 dark:text-zinc-50 dark:ring-zinc-300/40 dark:hover:bg-zinc-500',
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
