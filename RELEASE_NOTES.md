QibitAI DS Bot plugin 0.1.87

Current release:

- Fix employee drag previews jumping above the pointer when taken out of Dock. Desktop bounds correction changed the rendered origin while movement used the earlier raw origin. Paint relative to the actual rendered position and synchronize the first mount before display. Keep grid snapping, cancellation, group creation and hidden conversations unchanged.
- Department member ellipses now open placement and deletion actions. Deletion requires a named confirmation; cancellation is safe, concurrent submissions are blocked, and failed deletion remains actionable. Chief, Main Bots and department leaders retain their protections. The existing deletion API stops the employee's work, removes department/group memberships and archives chats.
- Explicitly reopening an employee chat restores only that conversation to the team list. It stays visible when switching to Chief or closing the chat, until manually hidden again. Selecting/dragging icons, hovering Dock and restoring layout do not clear hidden preferences. Coalesce duplicate writes and report failed saves without automatic retries.
- Prevent department labels from shrinking below their 16px line height. Add 8px of Dock height and bottom spacing while retaining icon magnification. Isolated browser checks pass at 600/900/1280px widths and 100%/125%/150% display scales in idle and hover states.
- Keep department Dock contacts visible independently of hidden sidebar conversations. Preserve hidden preferences, department membership, temporary employees and member chat/drag actions; exclude retired employees and removed members.
- Add independent task records behind employee chats and groups: scoped participants, saved checkpoints, retained delivery versions, explicit continuation and user acceptance.
- Give new private tasks a fresh execution context and reset after acceptance while retaining history and job experience. Query relevant memory instead of injecting it all. Recognize explicit intent; hold ambiguous input for a choice beside the composer without another model call.
- Organize the information panel into Tasks, Deliveries and Pending. Preserve compact file lists, editable employee experience with provenance, and real task and error recovery actions.
- Remember collapsible sections per conversation, synchronize open windows and retain editor drafts. Fold unavailable files into one row; removal and undo affect only the list. Disk files, task history and saved deliveries are preserved, and verified restored files return to the list.
- Allow marking errors handled. A later successful reply resolves earlier model errors in the same conversation; empty replies and delegation alone do not. Keep diagnostic records and avoid automatic task replay.

Validation: 1,312 unit tests, build consistency and lint passed. Isolated browser checks reproduce the previous drag offset and verify the fix at 600/900/1280px widths and 100%/125%/150% scales: first mount, continuous movement, existing-icon placement, grid drop coordinates, cancellation and native member-card drops. The first full run hit an existing memory-summary test's fixed 20ms wait while browser checks ran concurrently; the full rerun passed without source changes. Earlier member-menu and conversation-visibility checks remain covered. This release does not change Host code.

Formal desktop verification: Bot 0.1.87 is enabled without plugin errors. Its native accessibility tree lists the executive office and saved departments. Employee, group and department membership and hidden-conversation flags are unchanged by installation. All 80 installed package files match the validated build. Drag interactions were exercised with synthetic employees in isolated browsers; live verification used native accessibility and read-only plugin APIs. No real employee was deleted and no messages were sent.

This package is the DS Bot plugin source, not the Electron host or installer. It does not add a RAG service, automatically approved workflow templates or a production cross-device collaboration server. Mock checks do not establish real-model business-output quality. See UI-HANDOFF.md and docs/source-package-0.1.87.zh.md for the current handoff and source archive.

Included earlier baseline updates:

- Automatically return task submissions and revisions for coordinator review, with bounded discussion and explicit incomplete states.
- Separate workspace/browser issues from model errors in the information panel; filter nonexistent inferred outputs and prospecting source documents.
- Recover stale previous-boot team locks after PID reuse. Include a narrowly scoped workspace-owner repair script with ACL backup.
- The installed browser still requires its employee execution conversation to be visible. This release does not introduce a headless browser or guarantee factual lead quality.

Previous version: 0.1.72

- Keep current execution and waiting indicators visible when an earlier turn has an unresolved error. Retain that error in the information panel and show approval/question blockers ahead of ongoing work.
- Cover new private turns, queued input and groups where another member continues working. Validated with 1,217 passing tests, build consistency and lint.

Previous version: 0.1.71

- Add user-enabled Chief authorization for a scoped prospecting preset: public search, input-folder reads and new CSV/text reports. Each grant expires after one execution turn or 30 minutes.
- Show pending approvals, revocation and recent authorization activity in the conversation information panel; resume eligible group operations without duplicate dispatch.
- Preserve host/user decisions for shell, connectors, file overwrites and other operations. Keep grants out of persisted state and recheck revocation before approval.
- This release covers permission handling, not the complete daily prospecting/feedback workflow. See docs/chief-task-permissions-mvp.zh.md.

Previous version: 0.1.70

- Restore the shared information panel in team chats and detached windows. Keep task progress, completed work, deliverable files and error recovery together, with shared read indicators.
- Preserve file source Sessions and index shared group deliverables so results remain accessible after history trimming or context changes.
- Integrate the supplied visual handoff: bundled typography, light frosted controls, group multi-selection, Dock avoidance, grid placement and bottom-edge removal that preserves conversations.
- Fix delivered-file cards in embedded chats and detached windows to use canvas previews. Keep external-app menus and copy-path controls unchanged.
- Validate with 1,206 unit tests, build consistency, lint, isolated host smoke and real present-tool CSV/Markdown previews in both chat layouts.
