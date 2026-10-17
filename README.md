QibitAI canvas snapshot 0.1.31: [source handoff, build steps and known limits](docs/qibitai-0.1.31-handoff.md).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-dark.svg">
    <img src="docs/images/logo.svg" alt="DeepSeek Bot" width="260">
  </picture>
</p>

# DeepSeek Bot

English | [中文](README.zh.md)

![version](https://img.shields.io/badge/version-v0.1_preview-blue) ![DSH](https://img.shields.io/badge/DSH-0.2.0--rc.2-4D6BFE) ![license](https://img.shields.io/badge/license-Apache_2.0-green)

DeepSeek Bot (DS Bot) is a bot plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). It turns DSH into bots. You create your own bots, then talk and work with them.

![Say one sentence to Chief, and it sets up the bots and the group chat](docs/images/team.png)

## Task completion notifications

Employees declare verified final deliveries with `complete_task`. After that turn succeeds, a quiet card appears at the bottom right with the employee, task and result links. Ordinary replies, failed/stopped turns, pending approvals and internal member work do not announce completion; a group coordinator declares its final combined delivery. This is an explicit agent declaration, not an independent assessment of result quality.

The team bell retains the latest 100 deliveries and unread markers. Cards dismiss after six visible seconds, pause on hover/focus, and merge bursts into at most three cards. Opening a conversation uses the existing canvas window without recentering; opening a file uses the classic conversation's built-in file viewer. Notifications for the conversation currently being read are quietly recorded as read. Popup and optional sound settings are local to this browser profile. Background system notifications require permission, enabled explicitly in the notification center; the app/host must remain running. Restarting the window preserves history without replaying old popups.

## Install

First install DSH and set up at least one model in it. DS Bot uses the models from DSH.

**DSH Desktop (Windows, macOS)**

1. In the sidebar, select **Plugins** → **Add plugin**.
2. In **Package name or address**, enter `ds-bot`. In mainland China, set **Registry** to **Mainland China mirror**.
3. Select **Install**, then **Enable now**. If DSH says the change takes effect at the next start, quit DSH completely and open it again.

If npm is not reachable, in step 2 you can also enter the full path of `ds-bot-0.1.5.tgz` downloaded from [Releases](https://github.com/Fei2411/DeepSeek-Bot/releases), or `github:Fei2411/DeepSeek-Bot#v0.1.5&path:/ds-bot` (needs Git).

**DSH Web (Windows, macOS, Linux)**

Needs Node.js `22.19` or later, and pnpm.

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add ds-bot
npx @deepseek-ai/dsh@0.2.0-rc.2 web
```

## Setup

I strongly recommend that you set up your other bots and group chats by just talking to a bot.

## Features

### Employee canvas (unreleased)

**Chief is the unique General Assistant**, shown as an ordinary pinned employee with its existing avatar and conversation. Describe a lasting department in one sentence: Chief creates its leader, specialists and a separate group using `create_department`. Use `organize_team` to organize existing employees, and `assign_employee` for explicit transfers. A team has a name, ongoing purpose, leader and fixed membership; an employee may be independent or belong to one team, while joining many groups. Employees communicate and request tasks directly across teams. Leaders coordinate work, progress and results without forwarding every message. Opening a chat keeps the team list visible beside it. Older dedicated assistant conversations are retained in the directory; opening Chief makes no model call or permission change.

Group membership and canvas arrangement never change team affiliation, private conversations, running work or filesystem permissions. Groups retain their reply modes: admin-first by default, with `@Name` for a particular member. New requests queue by default when an employee is busy; explicit `when: now` is for corrections or urgent updates. Organizational leadership does not automatically grant employee-management rights. A leader must hand over leadership before leaving or being deleted. Only explicit legacy departments migrate to teams; ordinary groups never become teams automatically.

Floating components leave desktop Agent positions unchanged. Team-list drags follow a compact avatar and name; selected Agents show only a soft highlight and expose their management menu on right-click. Widgets expand toward the canvas interior and temporarily avoid overlap, returning to their saved position when collapsed. Manual placement remains free; click a widget to bring it forward. Conversations open in a consistent area beside the left team rail and can still be moved manually.

This development branch adds a canvas for persistent employees and group chats. The background fills the workspace, with a light gray gradient, milky translucent panels, a movable, collapsible team list and a centered avatar dock, following the supplied Starbots visual design. A slate variant follows the host dark theme. This theme is local to the canvas. Use **Create employee** to configure a new Bot, or open an existing one from **Employee directory**, the team list or the dock. Expanded conversations can move and resize; compacting or closing them preserves the employee, memory and conversation.

Employees start as draggable 120×112 avatar entries; Rooms remain 320×200 summaries with their real members. Click an employee avatar or a Room's **Open conversation** to load its conversation. Several manually opened conversations can stay visible together. Reloading restores compact entries and positions without loading all histories. **Arrange cards** packs entries by their actual sizes and visual groups; **Collapse conversations** keeps their positions. Moving and grouping entries never loads a conversation or stops background work.

**Quick message** and **Agenda** are separate movable, collapsible panels. Quick message identifies its employee recipient and sends through the existing messaging action without opening history; each employee has a separate locally saved quick-message draft. Agenda reads the existing scheduled-task catalog and links to its settings, showing empty or unavailable states when appropriate.

The default background is a bundled light gray gradient. Choose **Wallpaper → Choose local image** in the canvas toolbar to use a picture from your computer. JPEG, PNG, WebP and AVIF files up to 25 MB are supported. The image fills the workspace with a subtle overlay for readability. It is resized and saved only in the current browser or app profile, with no upload or image-generation API call. **Restore default background** removes the saved image and returns to the gradient. A failed selection keeps the previous wallpaper.

Seven bundled Starbots role portraits are available in employee creation and avatar settings: General Assistant, Engineering, Design, Administration, Operations, Finance and Sales. Existing avatars stay unchanged; uploads and the original Bot characters remain available. Choosing a portrait changes only the image, never the employee role, model or permissions.

The desktop uses a fixed viewport: drag entries and floating components to arrange them, or right-drag empty canvas to select employees. Background panning and wheel zoom are disabled. **Group windows** arranges windows together; rename its label to organize the layout. Select employees or use a visual group's **Create group chat** action to preselect members in the original group form, then choose its admin and confirm. Room cards expose their admin, reply mode, member avatars and work, and group settings. Employee avatars retain details and the original management menu; selecting exactly two employees also opens their Bot exchange. There are no manual connection lines or workflow actions. Choose **Classic view** in the toolbar for the original conversation pane and sidebar, and **Employee canvas** in the sidebar to return. Layout, panel positions, quick-message drafts and view preference are saved in this browser, without syncing to other devices.

Employee groups also support desktop-style gestures:

- Overlap two employee avatars, then confirm to create a group.
- Right-click empty canvas and choose **New empty group**, or use the toolbar button. Drag its title to move it; double-click the name to rename it.
- Hold the right mouse button and drag to select employees. Right-click empty canvas to create a group from the selection, or drag any selected avatar to add the selection to an empty or existing employee group. Right-clicking an avatar opens its management menu.
- Drag another employee, including one from the employee directory, onto a group to add it. A confirmation lists incoming members; existing members are not added twice.

An empty group or a group with one member is a local draft, saved with the canvas layout. Adding a second employee and confirming creates a real group conversation. Drafts do not send messages. Cancelling an avatar drop restores its original position; failed requests can be retried. These actions do not reassign employees, merge private chats or change running tasks and permissions. Ordinary group chats and visual window groups retain their existing behavior.

### Bot

You can do all your talking and work with one bot, in one window. You don't need to worry about the context behind it. The bot's details page shows its info, and there you can pick the model you want it to use. You can switch models at any time, but I still recommend that you keep one model for a bot for a long time, and switch only when you really need to.

Bots also have memory. A bot remembers what you like and uses it in later work. You can manage its memory on the bot's details page, or just tell the bot.

![Bot details: model, memory, usage](docs/images/details.png)

### Main bot

The main bot is your chief. It has very high rights: it manages the other bots and the group chats. The first time you open DS Bot, there is already a main bot called Chief. Talk to it, and it walks you through the setup.

In short: have a question? Ask the main bot.

### Group chats

DS Bot has group chats. A group chat is a great way to get several bots to work together, but it clearly costs more. So DS Bot does this: every group chat has an admin. The admin answers your messages by default and calls in the other bots for you. You can also @ a bot directly, and it answers you directly: type @ and pick the bot from the list. To give the bots another chat as context, use + → Reference a chat in the message box.

Any bot can hand work to another bot with @. That bot does the work on its own, and the group goes on. While it works, the group, the sidebar and the bot's own chat show what it is doing. When it is done, it posts the result in the group, and the bot that asked for the work answers. To stop the work, open the group's details.

![Group chat: the admin, Chief, hands the work to Writer and Coder](docs/images/group.png)

### Capabilities

Settings → **Capabilities** is a shared library of MCP servers, skills and packs. Add a capability to a Bot in its settings; it is available from that Bot's next message in its own chat and group chats. A local MCP command that a Bot adds needs your approval before it can run. While other Bots use a capability, only you or a Main Bot can change or delete it.

### Usage

In **Settings** → **Usage**, you can see token usage by time, by bot and by model.

![Usage page](docs/images/usage.png)

## Data

Employee, group-chat and conversation data stay on your own computer, in `bot/` and `sessions/` in the DSH home folder (`~/.dsh` by default). Uninstalling the plugin does not delete this data. Canvas layout and the selected wallpaper are separate browser-local data; clearing browser storage resets the layout and removes the wallpaper without deleting employees or conversations.

## Development

The plugin source is in [`ds-bot/`](ds-bot/). For options and internals, see [`ds-bot/README.md`](ds-bot/README.md). For development and tests, see [CONTRIBUTING.md](CONTRIBUTING.md). For changes between versions, see [CHANGELOG.md](CHANGELOG.md).

## Acknowledgments

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): DS Bot is built on the DSH plugin system. Every bot is a DSH session and uses the DSH tools and models.
- [esbuild](https://esbuild.github.io/): bundles the plugin's interface code.
- Thanks to these projects for the ideas they published. DS Bot learned from their designs and does not contain their code:
  - [AgentMemoryRepo](https://github.com/AgentMemoryRepo/agentmemoryrepo): the Markdown format of Bot memory.
  - [OpenAI Codex](https://github.com/openai/codex): checkpoints that keep the user's messages next to the summary, and message anchors for chat search.
  - [OpenMausBot](https://github.com/milind-soni/OpenMausBot): group chat rounds and @mention relays.
  - [Hermes Agent](https://github.com/NousResearch/hermes-agent) and [Hermes Bot Mode](https://github.com/NousResearch/Hermes-Bot-Mode): one session per member per group chat, and handoffs that carry the earlier user messages.
  - [OpenCode](https://github.com/sst/opencode), [goose](https://github.com/block/goose), [pi](https://github.com/badlogic/pi-mono) and [Gemini CLI](https://github.com/google-gemini/gemini-cli): when to condense a long chat, and what a handoff note holds.
  - [obelisk](https://github.com/tommy0103/obelisk): chat search with a SQLite full-text index.
- Everyone who tries DS Bot, asks questions and reports bugs.

## License

[Apache License 2.0](LICENSE). Provided "as is", without any warranty. Third-party code and its license are listed in [NOTICE](NOTICE).

## Disclaimer

DS Bot is an independent community project. **It is not an official DeepSeek product**, and it is not affiliated with, endorsed by or sponsored by DeepSeek. "DeepSeek", "DeepSeek Harness" and the other names are trademarks of their owners. They are used here only to say what this plugin works with.

Bots use your own model quota, and they read and write files and run commands when you ask them to. Check important actions yourself.
