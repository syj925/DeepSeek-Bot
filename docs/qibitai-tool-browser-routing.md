# Employee context, tool inspection and browser routing

[中文](qibitai-tool-browser-routing.zh.md)

This document describes the implementation boundaries in 0.1.59. Source integration does not establish publication, installation or a working tool connection. Verify an actual tool call in its execution Session to establish that browser operation works.

## One employee, separate execution contexts

An employee's private chat, its participation in group A and its participation in group B use separate execution Sessions. A group's full transcript is not automatically copied to another group or the private chat. Employee identity, saved model, instructions, long-term memory and permission policy still belong to the same Bot. Group membership and canvas layout do not change that ownership.

This is not a privacy sandbox. A Bot can use `read_own_chat`, `read_group_chat` and `read_task_history` to retrieve its own history, group records and task results as needed. Separate execution contexts reduce unrelated resident context; they do not block retrieval already allowed by existing permissions.

**Recent group work** in private chat reuses the employee's task index, saved group-task results and group-reply notices. It shows up to six recent records, with links to the original group and available result files. An ordinary reply is labelled **Replied in group**, not task completion. A deleted group retains its saved summary without a broken navigation action. This panel does not automatically inject full group discussions into the model context.

## Four different tool snapshots

Open **Tools & browser** from the current conversation. Groups show each member's actual execution Session; private chat shows the employee's private Session. Inspection reads existing Agents. It does not activate inactive Agents, wait for capability mounts or poll in the background. Use **Refresh tools** when a new snapshot is needed.

| Column | What it records | What it does not establish |
| --- | --- | --- |
| Registered tools | Tool schema names currently visible in the Agent registry | Every schema was sent unchanged to the model provider |
| Last model request | Tool names in the Session's last assembled request header | The provider's final wire payload is identical |
| Initial tool history | Initial declarations retained in Session history | Every historical tool remains loaded now |
| Added tool history | Declarations added later in Session history | Loading happened just now, or the tool connection works |

Each column retains its own `deferLoading` markers. These declare deferred loading in that snapshot; they do not establish a missing tool. PTC or code-tool modes can also expose capabilities through an entry such as `run_code`. A top-level request without individually named browser tools does not by itself establish the absence of browser capability.

**Agent inactive**, **Not started** and **Unavailable** mean the relevant snapshot could not be read. They do not mean the Agent has zero tools. Employee capability mounts appear separately and belong to the employee, not to a single request's loading state. A ready mount still requires an actual call to verify operation.

The view displays names, states and necessary Session/preset identifiers. It does not expose parameter schemas, descriptions, plugin configuration or credentials. Unknown conversations, mismatched owners and non-member requests are rejected.

### When only `read_browser` seems available

1. Check that the complete plugins are installed and enabled. Compatible QibitAI Desktop builds preinstall `dsh-builtin-browser` and also provide `dsh-computer-use-win` on Windows. They are separate from DS Bot's extra page reader.
2. Compare the ordinary host Agent and the affected Bot: preset, current registered tools and employee capability mounts. Installation, preset visibility and permission are separate conditions.
3. If the complete tools are registered, inspect the last assembled request, historical declarations, `deferLoading` and code-tool mode. A single top-level entry is not a reason to force eager loading of everything.
4. If visible tools fail when called, check the target execution Session, page guest/automation connection and approval state. On the global canvas page, a complete registry does not establish that the native browser has acquired an operable page.

These steps locate the failing layer. A model saying it can only read a page, or one static list of tool names, cannot establish the cause alone.

## Native operation browser and extra page reader

### Host-native operation browser

**Tools & browser → choose a group member → Open operation browser** resolves the employee's real task execution Session. Private chat uses its private Session. A group requires an explicit member choice. Only this explicit opening action prepares a missing group execution Session through the existing `ensureGroupSession` path; inspection alone does not create it.

The plugin then switches to that Session's classic Agent view, waits for the public Sidebar's `ready` and `mounted` values to identify the target Session, and focuses an existing Browser tab or creates one. It requests a floating window when supported. Navigation or returning during opening cancels the old request so a late result cannot reclaim navigation. **Back to Bot** returns to the source employee or group.

This uses the public `sidebarRight` interface and does not create another browser automation environment. **Browser tab opened** confirms the UI tab only. It does not confirm guest acquisition, an automation connection or a successful operation. The complete host browser plugin still supplies the tools.

The current public host interface requires the owning Session to be visible before its native browser tab can be created. The Bot canvas is a global page, not a Sidebar host for every hidden Session. This release therefore does not embed several hidden Sessions' native pages together on the canvas. It does not call private host globals or create a separate `webview` to impersonate the tool's real page.

### Legacy Bot page reader

The additional page reader needs its separate Desktop bridge, which a modern host may not supply. It shows unavailable when the bridge is absent. Its `read_browser` reads visible page text, addresses, links and controls. This extra read-only tool does not register, replace or restrict the full host browser or computer tools.

The reader can appear as a movable, resizable canvas window. It remains bound to the employee and group/private chat from which it opened instead of following the next selected conversation. Selected tabs are also recorded by employee and originating group/private chat, preventing one group from borrowing another group's current tab.

The same employee's reader tabs retain a shared login partition, including cookies and login state. Separate tab selection between groups and private chat is not account isolation between tasks. Different employees use separate reader partitions. These rules describe only the legacy reader; the host-native browser follows its own Session and partition rules.

## Parallel browsing and a shared computer

A Bot has its own employee identity and execution context. It does not automatically get a separate computer, virtual machine or sandbox. Computer control operates the desktop permitted by the host. Multiple employees controlling one desktop can still interfere; this plugin release does not add a global exclusive scheduler.

A browser may have several pages and execution Sessions, but several tabs do not inherently isolate cookies, accounts or the filesystem. The host browser plugin's page ownership, connection and permissions determine actual concurrency. The native entry resolves which employee's execution page to inspect; it does not promise parallel canvas hosting for several hidden native guests.

## Implementation entry points

- [Tool inspection and execution Session resolution](../ds-bot/src/host/tool-inspection.js)
- [Tool inspection UI](../ds-bot/src/client/tool-inspection.js)
- [Native browser routing through the public Sidebar](../ds-bot/src/client/native-browser.js)
- [Browser/work entry points and return notice](../ds-bot/src/client/conversation-tools.js)
- [Employee group-work updates](../ds-bot/src/client/employee-work-context.js)
- [Legacy reader host bridge and tool](../ds-bot/src/host/browser.js)
- [Legacy reader conversation ownership](../ds-bot/src/shared/browser-context.js)
