import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlock from '@tiptap/extension-code-block';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';

const editorIcon = (name, extraClasses = '') => window.StreamientIcons?.icon(name, extraClasses) || `<span class="st-icon material-symbols-outlined ${extraClasses}" aria-hidden="true">${name}</span>`;

const RICH_EDITOR_COMMANDS = {
	heading1: {
		isActive: (editor) => editor.isActive('heading', { level: 1 }),
		run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
	},
	heading2: {
		isActive: (editor) => editor.isActive('heading', { level: 2 }),
		run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
	},
	heading3: {
		isActive: (editor) => editor.isActive('heading', { level: 3 }),
		run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
	},
	bold: {
		isActive: (editor) => editor.isActive('bold'),
		run: (editor) => editor.chain().focus().toggleBold().run(),
	},
	italic: {
		isActive: (editor) => editor.isActive('italic'),
		run: (editor) => editor.chain().focus().toggleItalic().run(),
	},
	underline: {
		isActive: (editor) => editor.isActive('underline'),
		run: (editor) => editor.chain().focus().toggleUnderline().run(),
	},
	link: {
		isActive: (editor) => editor.isActive('link'),
		run: async (editor) => {
			const previous = editor.getAttributes('link').href || '';
			const target = editor.view.dom.closest('.modal') || document.body;
			const result = await window.Swal.fire({ title: previous ? 'Edit link' : 'Add link', input: 'text', inputLabel: 'Link URL', inputValue: previous, showCancelButton: true, confirmButtonText: 'Apply', target });
			if (!result.isConfirmed) return;
			const href = String(result.value || '').trim();
			if (!href) {
				editor.chain().focus().extendMarkRange('link').unsetLink().run();
				return;
			}
			editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
		},
	},
	bulletList: {
		isActive: (editor) => editor.isActive('bulletList'),
		run: (editor) => editor.chain().focus().toggleBulletList().run(),
	},
	orderedList: {
		isActive: (editor) => editor.isActive('orderedList'),
		run: (editor) => editor.chain().focus().toggleOrderedList().run(),
	},
	taskList: {
		isActive: (editor) => editor.isActive('taskList'),
		run: (editor) => editor.chain().focus().toggleTaskList().run(),
	},
	codeBlock: {
		isActive: (editor) => editor.isActive('codeBlock'),
		run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
	},
	blockquote: {
		isActive: (editor) => editor.isActive('blockquote'),
		run: (editor) => editor.chain().focus().toggleBlockquote().run(),
	},
	horizontalRule: {
		run: (editor) => editor.chain().focus().setHorizontalRule().run(),
	},
	undo: {
		isEnabled: (editor) => editor.can().chain().focus().undo().run(),
		run: (editor) => editor.chain().focus().undo().run(),
	},
	redo: {
		isEnabled: (editor) => editor.can().chain().focus().redo().run(),
		run: (editor) => editor.chain().focus().redo().run(),
	},
	clear: {
		run: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
	},
};

function bindRichEditorToolbar(toolbar, editor) {
	const buttons = toolbar.querySelectorAll('button[data-command]');
	const refresh = () => {
		const hasFocus = editor.isFocused;
		buttons.forEach((button) => {
			const command = RICH_EDITOR_COMMANDS[button.dataset.command];
			if (!command) return;
			const active = hasFocus && Boolean(command.isActive?.(editor));
			button.classList.toggle('active', active);
			if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', String(active));
			button.disabled = command.isEnabled ? !command.isEnabled(editor) : false;
		});
	};

	buttons.forEach((button) => {
		const command = RICH_EDITOR_COMMANDS[button.dataset.command];
		if (!command) return;
		button.addEventListener('mousedown', (event) => event.preventDefault());
		button.addEventListener('click', async (event) => {
			event.preventDefault();
			await command.run(editor);
			refresh();
		});
	});

	editor.on('selectionUpdate', refresh);
	editor.on('transaction', refresh);
	editor.on('focus', refresh);
	editor.on('blur', refresh);
	refresh();
}

// ---- Editor Factory ----

export function createEditor(element, { content = '', onUpdate = null } = {}) {
	const template = document.getElementById('st-rich-editor-template');
	if (!(template instanceof HTMLTemplateElement)) throw new Error('Rich editor template not found');
	element.replaceChildren(template.content.cloneNode(true));
	const toolbar = element.querySelector('.st-rich-editor-toolbar');
	const editorMount = element.querySelector('.st-rich-editor-body');
	if (!toolbar || !editorMount) throw new Error('Rich editor template is invalid');
	const editorOptions = {
		element: editorMount,
		extensions: [
			StarterKit.configure({
				codeBlock: false,
				horizontalRule: false,
			}),
			CodeBlock,
			HorizontalRule,
			TaskList,
			TaskItem.configure({
				nested: true,
			}),
			Image,
		],
		content,
	};

	if (onUpdate) {
		editorOptions.onUpdate = ({ editor: ed }) => onUpdate(ed);
	}

	const editor = new Editor(editorOptions);
	bindRichEditorToolbar(toolbar, editor);
	return editor;
}

const EMAIL_TOOLBAR_BUTTONS = [
	{
		name: 'bold',
		label: 'Bold',
		icon: 'format_bold',
		isActive: (editor) => editor.isActive('bold'),
		run: (editor) => editor.chain().focus().toggleBold().run(),
	},
	{
		name: 'italic',
		label: 'Italic',
		icon: 'format_italic',
		isActive: (editor) => editor.isActive('italic'),
		run: (editor) => editor.chain().focus().toggleItalic().run(),
	},
	{
		name: 'underline',
		label: 'Underline',
		icon: 'format_underlined',
		isActive: (editor) => editor.isActive('underline'),
		run: (editor) => editor.chain().focus().toggleUnderline().run(),
	},
	{
		name: 'link',
		label: 'Link',
		icon: 'link',
		isActive: (editor) => editor.isActive('link'),
		run: (editor) => {
			const previous = editor.getAttributes('link').href || '';
			const href = window.prompt('Link URL', previous);
			if (href === null) return;
			const trimmed = href.trim();
			if (!trimmed) {
				editor.chain().focus().extendMarkRange('link').unsetLink().run();
				return;
			}
			editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
		},
	},
	{
		name: 'bulletList',
		label: 'Bullet list',
		icon: 'format_list_bulleted',
		isActive: (editor) => editor.isActive('bulletList'),
		run: (editor) => editor.chain().focus().toggleBulletList().run(),
	},
	{
		name: 'orderedList',
		label: 'Numbered list',
		icon: 'format_list_numbered',
		isActive: (editor) => editor.isActive('orderedList'),
		run: (editor) => editor.chain().focus().toggleOrderedList().run(),
	},
	{
		name: 'blockquote',
		label: 'Quote',
		icon: 'format_quote',
		isActive: (editor) => editor.isActive('blockquote'),
		run: (editor) => editor.chain().focus().toggleBlockquote().run(),
	},
	{
		name: 'undo',
		label: 'Undo',
		icon: 'undo',
		isActive: () => false,
		run: (editor) => editor.chain().focus().undo().run(),
	},
	{
		name: 'redo',
		label: 'Redo',
		icon: 'redo',
		isActive: () => false,
		run: (editor) => editor.chain().focus().redo().run(),
	},
	{
		name: 'clear',
		label: 'Clear formatting',
		icon: 'format_clear',
		isActive: () => false,
		run: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
	},
];

function createEmailToolbar(editor) {
	const toolbar = document.createElement('div');
	toolbar.className = 'st-email-editor-toolbar';
	toolbar.setAttribute('role', 'toolbar');
	toolbar.setAttribute('aria-label', 'Email formatting');

	function refresh() {
		toolbar.querySelectorAll('button[data-command]').forEach((button) => {
			const command = EMAIL_TOOLBAR_BUTTONS.find((item) => item.name === button.dataset.command);
			if (!command) return;
			button.classList.toggle('active', Boolean(command.isActive(editor)));
		});
	}

	EMAIL_TOOLBAR_BUTTONS.forEach((command) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'btn btn-sm btn-outline-secondary st-email-editor-button';
		button.dataset.command = command.name;
		button.title = command.label;
		button.setAttribute('aria-label', command.label);
		button.innerHTML = editorIcon(command.icon);
		button.addEventListener('click', (event) => {
			event.preventDefault();
			command.run(editor);
			refresh();
		});
		toolbar.appendChild(button);
	});

	editor.on('selectionUpdate', refresh);
	editor.on('transaction', refresh);
	setTimeout(refresh, 0);
	return toolbar;
}

export function createEmailEditor(element, { content = '', onUpdate = null, placeholder = 'Write a reply...' } = {}) {
	element.innerHTML = '';
	const toolbarMount = document.createElement('div');
	const editorMount = document.createElement('div');
	editorMount.className = 'st-email-editor-body';
	element.appendChild(toolbarMount);
	element.appendChild(editorMount);

	const editorOptions = {
		element: editorMount,
		extensions: [
			StarterKit.configure({
				codeBlock: false,
				heading: false,
				horizontalRule: false,
			}),
			Placeholder.configure({ placeholder }),
		],
		content,
		editorProps: {
			attributes: {
				class: 'st-email-editor-prosemirror',
			},
		},
	};

	if (onUpdate) {
		editorOptions.onUpdate = ({ editor: ed }) => onUpdate(ed);
	}

	const editor = new Editor(editorOptions);
	toolbarMount.replaceWith(createEmailToolbar(editor));
	return editor;
}

// Export for global use
window.StreamientEditor = { createEditor, createEmailEditor };
