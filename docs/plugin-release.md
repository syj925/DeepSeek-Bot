# Publish the QibitAI canvas plugin

This fork publishes `ds-bot` / **DS Bot** to `https://desktop.qibitai.ai`.
The release workflow is `.github/workflows/plugin-release.yml` and uses the
unified [QibitAI publishing protocol](https://github.com/syj925/qibitai-site/blob/cf1a568773c6efc9db807fe51ef6151804edad0c/docs/plugin-publishing.md).

## Release a version

1. On `main` in [syj925/DeepSeek-Bot](https://github.com/syj925/DeepSeek-Bot), update `ds-bot/package.json`, both version fields
   in `ds-bot/package-lock.json`, and `RELEASE_NOTES.md`. Keep notes below 2,000
   characters and the complete publishing metadata below 4,096 UTF-8 bytes.
2. Commit and push `main` to this fork. Wait for the **Test** workflow to pass.
3. Tag that commit with exactly `ds-bot-v<package version>` and push the tag:

   ```sh
   git tag ds-bot-v0.1.56
   git push fork ds-bot-v0.1.56
   ```

4. Wait for **DS Bot Plugin Release** to finish both jobs. It installs the pinned
   DSH harness, checks the generated client, builds, tests, lints and freezes
   `package.tgz`, `release.json` and `notes.md` as a 14-day Actions artifact.
   The publishing job downloads that same artifact without rebuilding it,
   publishes through HTTPS, then checks the latest metadata, redirect,
   immutable archive size and SHA-256 of the entire public download.

The commands assume this fork's remote is named `fork`; use your remote name
for `https://github.com/syj925/DeepSeek-Bot.git` if it differs.

Plain versions publish to `stable`; prereleases such as `0.1.56-beta.1` publish to
`beta`. The workflow writes the selected update channel into the packed manifest.
Every version must be globally newer than previously published versions across
both channels. Published versions are immutable: use a new version for a fix.
Do not delete or move release tags to try to replace an existing release.

`main` is the canonical development and release branch for this fork. Release
tags must point to commits already pushed to its `main`; the workflow rejects
tags outside that history. Main pushes and all pull requests run tests without
publishing. Only a matching version tag starts publication.

## One-time publishing configuration

The GitHub Environment `qibitai-release` allows only tags matching `ds-bot-v*`
and holds three secrets:

- `PLUGIN_PUBLISHER_EMAIL`: a dedicated account with the `plugin_publisher` role.
- `PLUGIN_PUBLISHER_PASSWORD`: that account's password.
- `PLUGIN_CI_TOKEN`: a DS Bot-specific publishing token configured on the gateway.

These credentials are available only to the HTTPS publishing step. The build
job and pull requests receive none of them. Keep credentials out of source,
release artifacts, shell arguments and logs. Token rotation must preserve other
plugins' gateway mappings and update the matching Environment secret.

The release workflow serializes publishing and does not cancel a running upload.
Push one release tag at a time and wait for its result before publishing another.
If publishing succeeds but a later network verification fails, inspect the public
release first; rerunning an upload of the same immutable version is rejected.

## Installation and verification

Stable installation URL:
`https://desktop.qibitai.ai/plugins/ds-bot/stable/latest.tgz`.
For beta, replace `stable` with `beta`.
Users check for updates in **Settings → About DS Bot** or the desktop plugin
manager and confirm the update. Completely restart Desktop when requested.
Publishing a release makes it available; it does not silently restart or modify
users' installed plugins.
