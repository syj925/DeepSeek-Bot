# QibitAI canvas 0.1.31 source handoff

Date: 2026-10-17. Repository: syj925/DeepSeek-Bot. Source branch: feat/qibitai-main-agent-groups.

## Scope

This snapshot includes the accumulated local QibitAI canvas changes on top of 74432ab, including the supplied Starbots visual assets, employee and group interactions, General Assistant and lasting-team organization, task completion notices, independent resizable chat windows, widget-aware arrangement, simplified settings, and the removal of the in-chat model selector. Model selection remains in employee settings.

The source lives in ds-bot/src/client and ds-bot/src/host. ds-bot/client.js is the generated browser bundle. The repository contains the plugin and its test/development tools; it does not contain the separate QibitAI desktop application's full source or an installer.

## Current limits

- Automatic model selection by task or employee role is not implemented. Department creation inherits the General Assistant's model. Explicit model changes use list_models/create_bot/update_bot and existing ownership boundaries.
- Removing the theme/accent UI also disables applying those old preferences and rejects attempts to set them. Avatar motion remains supported. Existing saved team data is retained.
- The acknowledgements panel was removed from the UI; LICENSE and NOTICE remain in the distribution.
- No changes to the upstream main branch are implied by this source snapshot. No business acceptance or cloud CI success is claimed.

## Build and verification

Use Node.js 22.19+ (the local validation used the existing Windows runtime). In ds-bot:

```sh
npm ci
npm run harness
npm run build
npm test
npm run lint
node scripts/build-client.mjs --check
```

Completed before this source handoff:

- 743 unit tests passed for 0.1.31; lint passed with warnings, bundle consistency passed.
- The most recent backend changes passed all 40 smoke steps in a fresh isolated mock profile at 0.1.30. The only subsequent changes were removal of the chat model selector, its styling, and settings guidance.
- Isolated browser verification confirmed the chat picker is absent, employee settings retain model selection, multiple chats remain open, and clicking other controls clears desktop selection.
- The installed local desktop plugin's 46 packaged files matched 0.1.31 source hashes. The desktop was restarted; interaction validation was performed in the isolated browser, not native desktop automation.
- No paid models were called by these tests. Real provider availability and task-based model routing were not tested.

## Source package

The ZIP includes source, generated client.js, bundled assets, tests, development scripts, lockfiles, workflow files, documentation and licenses. It excludes .git, node_modules, local test profiles, private configuration and runtime logs. Reinstall dependencies before building. The ZIP manifest records SHA-256 values for every included source file.

For rollback, reinstall the previous plugin package and restart the desktop. Preserve the desktop profile before any data migration; source packaging itself does not modify user sessions or team data.
