QibitAI DS Bot plugin 0.1.82

Current release:

- Add independent task records behind employee chats and groups: scoped participants, saved checkpoints, retained delivery versions, explicit continuation and user acceptance.
- Give new private tasks a fresh execution context and reset after acceptance while retaining history and job experience. Query relevant memory instead of injecting it all. Recognize explicit intent; hold ambiguous input for a choice beside the composer without another model call.
- Organize the information panel into Tasks, Deliveries and Pending. Preserve compact file lists, editable employee experience with provenance, and real task and error recovery actions.
- Remember collapsible sections per conversation, synchronize open windows and retain editor drafts. Fold unavailable files into one row; removal and undo affect only the list. Disk files, task history and saved deliveries are preserved, and verified restored files return to the list.
- Allow marking errors handled. A later successful reply resolves earlier model errors in the same conversation; empty replies and delegation alone do not. Keep diagnostic records and avoid automatic task replay.

Validation: 1,296 unit tests, build consistency and lint passed. Isolated mock Host checks cover task acceptance, context boundaries, restart, recovery and retained files. Browser checks cover narrow/regular layouts, record removal and undo, persistence, window synchronization and draft retention. Formal desktop reports Bot 0.1.82 enabled without plugin errors.

This package is the DS Bot plugin source, not the Electron host or installer. It does not add a RAG service, automatically approved workflow templates or a production cross-device collaboration server. Mock checks do not establish real-model business-output quality. See UI-HANDOFF.md and docs/source-package-0.1.82.zh.md.

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
