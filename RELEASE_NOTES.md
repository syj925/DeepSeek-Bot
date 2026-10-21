QibitAI canvas plugin 0.1.62

- Integrate the collaboration branch into main while retaining incremental group replies, character reveal, inline mentions, provider icons, employee cleanup and explicit user-requested model changes.
- Add department contacts, executive and temporary staffing collections, settings and appearance controls to the Dock. Seed missing bundled departments and employees once when preset organization is enabled; preserve existing departments and completed initialization.
- Drag the current conversation onto the canvas without creating another conversation. Keep its draft, identity and existing messages; support keyboard placement and gesture cancellation.
- Show collaboration records over the source chat with live updates, reading-position preservation, retry feedback and focus restoration. Keep saved task results visible while subsequent work continues.
- Allow desktop widgets and conversation cards to be removed from the canvas and widgets restored in display settings. Improve waiting feedback without duplicating group member streaming.
- Preserve tool inspection, employee native-browser routing, group-work updates, permissions and the verified HTTPS update pipeline from main.
- Retry transient atomic state-file replacement failures without deleting the saved snapshot, and recheck ownership before every retry.
