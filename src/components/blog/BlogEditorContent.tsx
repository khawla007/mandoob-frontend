'use client';

import { useCallback, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { generateHTML } from '@tiptap/html';
import {
  Bold,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
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

const extensions = [
  StarterKit,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
  }),
  Image,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Underline,
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: 'Write the post content...' }),
];

function contentOrEmpty(content: JsonContent | null | undefined): JsonContent {
  return content && Object.keys(content).length > 0 ? content : emptyContent;
}

export function BlogEditorContent({ initialContent }: { initialContent?: JsonContent | null }) {
  const initialJson = useMemo(() => contentOrEmpty(initialContent), [initialContent]);
  const initialHtml = useMemo(() => generateHTML(initialJson, extensions), [initialJson]);
  const [contentState, setContentState] = useState(() => ({
    json: initialJson,
    html: initialHtml,
  }));
  const updateContentState = useCallback((editorInstance: Editor) => {
    setContentState({
      json: editorInstance.getJSON() as JsonContent,
      html: editorInstance.getHTML(),
    });
  }, []);
  const editor = useEditor({
    extensions,
    content: initialJson,
    immediatelyRender: false,
    onCreate: ({ editor }) => updateContentState(editor),
    onUpdate: ({ editor }) => updateContentState(editor),
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-96 px-4 py-3 focus:outline-none',
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

  return (
    <div className="space-y-3">
      <input type="hidden" name="contentJson" value={JSON.stringify(contentState.json)} readOnly />
      <input type="hidden" name="contentHtml" value={contentState.html} readOnly />
      <div className="border-border/70 overflow-hidden rounded-lg border">
        <div className="bg-muted/40 flex flex-wrap gap-1 border-b p-2">
          <ToolbarButton
            label="Bold"
            active={editor?.isActive('bold')}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor?.isActive('italic')}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={editor?.isActive('underline')}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            active={editor?.isActive('heading', { level: 2 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            active={editor?.isActive('heading', { level: 3 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 />
          </ToolbarButton>
          <ToolbarButton
            label="Bullet list"
            active={editor?.isActive('bulletList')}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List />
          </ToolbarButton>
          <ToolbarButton
            label="Ordered list"
            active={editor?.isActive('orderedList')}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </ToolbarButton>
          <ToolbarButton
            label="Task list"
            active={editor?.isActive('taskList')}
            onClick={() => editor?.chain().focus().toggleTaskList().run()}
          >
            <ListChecks />
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            active={editor?.isActive('blockquote')}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </ToolbarButton>
          <ToolbarButton label="Link" active={editor?.isActive('link')} onClick={setLink}>
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
      className={cn(active && 'bg-muted text-foreground')}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
