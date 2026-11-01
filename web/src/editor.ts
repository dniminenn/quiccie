import { WikiLink } from "./wiki";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "@tiptap/markdown";
export function makeEditor(
  element: HTMLElement,
  onChange: (markdown: string) => void,
) {
  return new Editor({
    element,
    extensions: [
      WikiLink,
      StarterKit.configure({ link: { openOnClick: false } }),
      TableKit.configure({ table: { resizable: true } }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
    ],
    content: "",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Note editor",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });
}
export function toolbar(container: HTMLElement, editor: Editor) {
  const actions: [string, string, () => void][] = [
    ["B", "Bold", () => editor.chain().focus().toggleBold().run()],
    ["I", "Italic", () => editor.chain().focus().toggleItalic().run()],
    [
      "H1",
      "Heading 1",
      () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    ],
    [
      "H2",
      "Heading 2",
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    ],
    ["≡", "Bullet list", () => editor.chain().focus().toggleBulletList().run()],
    ["☑", "Task list", () => editor.chain().focus().toggleTaskList().run()],
    ["❞", "Quote", () => editor.chain().focus().toggleBlockquote().run()],
    [
      "〈〉",
      "Code block",
      () => editor.chain().focus().toggleCodeBlock().run(),
    ],
    [
      "▦",
      "Insert table",
      () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    ],
    ["↶", "Undo", () => editor.chain().focus().undo().run()],
    ["↷", "Redo", () => editor.chain().focus().redo().run()],
  ];
  for (const [label, title, action] of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.onclick = action;
    container.append(b);
  }
}
export function splitFrontmatter(content: string) {
  const m = content.match(/^---\r?\n(?:[\s\S]*?\r?\n)?---(?:\r?\n|$)/);
  return {
    front: m?.[0] ?? "",
    body: m ? content.slice(m[0].length) : content,
  };
}
