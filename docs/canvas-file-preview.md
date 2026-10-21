# Canvas file previews (0.1.63)

Task notification file chips, saved result files, local Markdown links and resolved file mentions in Bot reply bubbles open canvas file windows when the canvas is active or preferred. Classic-view file navigation keeps the host Sidebar. A preview never selects a different conversation, starts an Agent, changes employee affiliation or expands every employee's context.

Windows support title-bar dragging, corner resizing (also arrow keys), maximize/restore, manual reload, Escape/close and multiple simultaneous files. Selecting a chat brings it above inactive previews; selecting a preview raises it. Reopening the same path under the same source Session focuses one window. Closing returns focus to the previous control when available. Window identity and geometry live only in transient client state; file contents, bytes and previews are never stored in canvas localStorage.

## Formats

| Format | Canvas behavior |
| --- | --- |
| Markdown | The host's public `MarkdownText` renderer, with source toggle and document-relative file links. Raw HTML is not executed. Local inline images are not loaded automatically. |
| CSV / TSV | Read-only table with quoted delimiters, escaped quotes, Unicode and multiline cells; source toggle. At most 500 rows and 80 columns are rendered. |
| Text / code / HTML / SVG | Escaped source with line numbers, with line-fragment navigation when supplied. HTML and SVG are not executed. |
| PNG, JPEG, GIF, WebP, AVIF, BMP | Original bytes displayed through a transient typed Blob URL. |
| PDF | Sandboxed browser PDF frame; support depends on the desktop/browser PDF viewer. Download remains available. |
| Office documents, archives and other known binary formats | Download original or explicitly open the host's classic viewer. No automatic navigation out of the canvas. |

Text reads are paged (300 lines per request), up to 5,000 lines or 1,000,000 characters in a preview. Partial CSV records wait for the next page. Paging across a file version change restarts the preview instead of mixing versions. **Download original** always performs a fresh complete-byte read; it never exports a shortened text/table preview. The host's configured file-read caps still apply. Closing, changing or reloading a preview cancels superseded reads. Errors remain inside the window with retry or explicit classic-view navigation.

## API and ownership

All reads use documented `remote.workspaceFiles.read` / `readBytes`, under the source Session identity, without borrowing the selected main chat. New group task completions retain the completing member's execution Session. Older records fall back to their saved identity. Relative links inside a preview resolve from the document's Host-returned absolute path.

The host's right Sidebar is bound to an on-screen classic Session; its documented controller does not embed its complete tab body in a global canvas panel. Canvas previews therefore reuse public file readers and Markdown primitives. They do not adopt private Sidebar stores or patch the host. Office conversion/editing, host Save as/Share integrations, automatic filesystem refresh and local Markdown image rewriting remain in the classic viewer.

## Preview recovery (0.1.64)

The canvas releases its measurement as `null` when another surface replaces it. Task results may open before the canvas remounts. File placement and rendering normalize missing, null, zero or nonfinite dimensions to a positive fallback viewport, then fit to measured bounds when available. Each file has its own rendering error boundary; a broken preview retains local retry/close controls while the canvas, other files and conversations stay mounted. Regression checks cover task-file opening with the released measurement, maximize/restore and an injected renderer failure beside another preview.

## Startup behavior

Upgrades with existing teams and no incomplete preset marker do not create preset employees. Existing saved data returns first. New installations persist setup intent after Chief is created, then initialize bundled employees and departments in the background. Interrupted setup resumes from saved progress. Completed setup and employees already created in 0.1.62 are preserved; no cleanup or data reset runs on upgrade.
