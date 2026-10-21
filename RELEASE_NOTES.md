QibitAI canvas plugin 0.1.65

- Fix the "useMarkdownDelegate is not a function" error blocking canvas file previews and reply bubbles. Use only the host's public Markdown interfaces; older hosts without the file-link provider still render preview contents.
- Keep Markdown links on the canvas under their original source Session, including document-relative paths and line targets. Preserve classic Chat's existing navigation and image scope.
- Verify imports against the installed DSH package's real public exports, alongside missing-interface preview regression checks. Retain per-file error isolation, safe viewport dimensions, original downloads and saved team data.
