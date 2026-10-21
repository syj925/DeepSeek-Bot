QibitAI canvas plugin 0.1.66

- Reopening the same file now focuses its existing preview without cancelling and repeating a pending read, resetting its source view or losing its reading position. A new line target and manual reload still navigate or refresh.
- Limit canvas previews and downloads to two concurrent reads. Retry transient transport and reader-availability failures at most twice with a short backoff; another file can finish while a retry waits.
- Closing or reloading a preview cancels its queued work and retry timers. Preserve each file's source Session, reject stale results, and retain final read error codes in local diagnostics without recording file paths or contents.
