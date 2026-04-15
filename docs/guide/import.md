# Import

Import existing documents into Kumbukum by dragging and dropping files onto the Notes page. Each file is converted into a new note with the extracted text content.

## Supported File Types

| Format | Extensions |
| ------ | ---------- |
| PDF | `.pdf` |
| Microsoft Word | `.doc`, `.docx` |
| Plain text | `.txt`, `.md`, `.rtf`, and other text-based files |

## How to Import

1. Open the **Notes** page
2. Drag one or more files from your file manager onto the page
3. A drop overlay appears — release the files
4. Each file is uploaded, its text content extracted, and a new note is created automatically
5. The note title is set to the original filename

You can import multiple files at once. Each file becomes a separate note.

## What Happens During Import

- **PDF files** — Text is extracted from all pages using `pdfjs-parse`
- **Word documents** — Converted to HTML via `mammoth`, then plain text is extracted
- **Text files** — Read line by line, preserving paragraph structure

The extracted content is stored as both plain text (for search indexing) and HTML (for the note editor). All imported notes are indexed in Typesense for full-text and semantic search.

## Tips

- Large PDF files with scanned images (no selectable text) will result in empty notes — only text-based PDFs are supported
- Code files (`.js`, `.py`, `.sh`, etc.) are treated as plain text and imported as-is
- Imported notes are created in your currently selected project
