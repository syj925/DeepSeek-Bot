QibitAI canvas plugin 0.1.64

- Fix opening task artifacts after leaving the canvas: a null viewport measurement now uses safe default dimensions instead of throwing while reading width. Opening, maximizing and resizing previews also handle missing measurements.
- Isolate each file preview's rendering failures so the canvas, other files and conversations remain visible. Offer retry, close and explicit classic-view recovery in the affected window.
- Preserve the existing canvas file readers, source Session identity, complete-original downloads, chat drafts and upgrade startup behavior.
