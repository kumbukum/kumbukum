import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Icon } from "./Icon";

export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string, text: string) => void }) {
	const editor = useEditor({
		extensions: [StarterKit.configure({ link: { openOnClick: false } })],
		content: value,
		onUpdate: ({ editor: current }) => onChange(current.getHTML(), current.getText()),
	});
	if (!editor) return null;
	return <div className="editor-shell">
		<div className="editor-toolbar">
			<button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()}><Icon name="format_bold" /></button>
			<button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()}><Icon name="format_italic" /></button>
			<button type="button" className={editor.isActive("bulletList") ? "active" : ""} onClick={() => editor.chain().focus().toggleBulletList().run()}><Icon name="format_list_bulleted" /></button>
			<button type="button" className={editor.isActive("orderedList") ? "active" : ""} onClick={() => editor.chain().focus().toggleOrderedList().run()}><Icon name="format_list_numbered" /></button>
			<button type="button" className={editor.isActive("blockquote") ? "active" : ""} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Icon name="format_quote" /></button>
		</div>
		<EditorContent editor={editor} />
	</div>;
}
