QibitAI canvas plugin 0.1.70

- Restore the shared information panel in team chats and detached windows. Keep task progress, completed work, deliverable files and error recovery together, with shared read indicators.
- Preserve file source Sessions and index shared group deliverables so results remain accessible after history trimming or context changes.
- Integrate the supplied visual handoff: bundled typography, light frosted controls, group multi-selection, Dock avoidance, grid placement and bottom-edge removal that preserves conversations.
- Fix delivered-file cards in embedded chats and detached windows to use canvas previews. Keep external-app menus and copy-path controls unchanged.
- Drain queued diagnostic log writes on runtime shutdown, including warnings added while cleanup waits. Prevent the Node 22 cleanup race without suppressing failures or log persistence.
- Validate with 1,207 unit tests, build consistency, lint and isolated host smoke. Retain the integrated present-tool CSV/Markdown canvas preview regressions and UI handoff documents.
