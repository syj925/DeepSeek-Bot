# Employee canvas

Status: implemented in the local development branch; final validation and release
are tracked separately. This document describes the current implementation, not a
claim that every acceptance scenario has passed.

## Product behavior

The employee canvas is a workspace for persistent AI employees and their real
group chats. It provides independent conversation windows over an original misty
lake, mountain and forest illustration or a locally chosen wallpaper, with dark
translucent surfaces and backdrop blur. The default illustration is bundled for
offline use. The background fills the workspace. The original employee list sits
above it as a movable, collapsible
glass panel, with a centered avatar dock below. This theme is scoped to the canvas;
the classic conversation view and its original sidebar remain available.

The canvas starts as an employee overview. Employees are 120×112 avatar entries
with identity, status and management controls; Rooms retain 320×200 summaries with
real member avatars. Clicking an employee avatar opens its conversation; dragging
it only moves it. An explicit **Open conversation**, directory, sidebar or dock
navigation also opens the chosen conversation. Several explicitly opened employees
and Rooms can remain expanded together; opening one does not collapse another.
Selecting, dragging or grouping entries does not retain Sessions.
**Collapse conversations** releases the conversation view without moving entries.
**Arrange cards** packs rows using actual entry sizes by visual group, preserving
membership and saved expanded dimensions. Restoring a saved layout always starts
collapsed, including layouts
saved by the earlier version with several expanded windows. Positions, groups,
the viewport and DSH-owned text drafts remain intact.

- **Create employee** opens the existing Bot configuration form and creates a
  real employee. **Employee directory**, the floating employee list and the bottom dock open
  existing employees or Rooms. Opening the same entity reuses its window.
- Drag a window title to move it, or its lower-right handle to resize it. The
  focused title or resize handle also accepts arrow keys; Shift increases the
  step. Compact employee avatars can also be dragged or moved with arrow keys.
  Shift-click toggles their selection. A window can shrink to its avatar or Room
  summary, or close from the canvas. Reopening keeps its saved position and size.
- Drag the background or scroll over it to pan. Ctrl-scroll or the zoom buttons
  zoom the canvas; **Fit windows** brings the open windows into view. Zoom is
  bounded to 20–200%.
- Use window checkboxes or Shift-drag on the background to select windows.
  **Group windows** creates a visual group; dragging its label moves its members.
  Its name can be edited. **Ungroup** removes that layout grouping.
- **Create group chat** opens the original group form. Selected employee windows,
  or a visual group's employees, can preselect its members. The user still chooses
  an admin and confirms creation. Visual grouping alone never creates a Room,
  changes membership, shares context or changes permissions.
- Windows expose current work, question and approval status, plus details,
  memory where applicable, and scheduled tasks. Compact entries retain the original
  management menu. Room cards show their admin, reply mode, member avatars and work, with
  direct group settings and member-window access. Selecting two employees opens
  their existing Bot exchange viewer. Expanded windows expose the original live
  activity indicator, conversation renderer and composer.
- **Quick message** identifies the current employee recipient and sends without
  mounting a conversation. It follows the last focused employee, falling back to
  the Main Bot or first employee before one is chosen. Each employee has a separate
  saved quick-message text draft. **Agenda** shows the original schedule catalog,
  marks this week's task dates and opens the existing task settings. Loading,
  unavailable and empty states are explicit; there are no invented orders or
  progress figures. Both panels can move and fold independently, and their header
  controls support arrow keys and Home to reset position.
- **Classic view** opens the focused conversation in the original full pane.
  The sidebar's **Employee canvas** action returns to the canvas. The local view
  preference is remembered; new local preferences default to the canvas.
- **Wallpaper → Choose local image** accepts JPEG, PNG, WebP and AVIF files up to
  25 MB. The selected image is centered and covers the workspace with a dark
  readability overlay; it stays fixed while the canvas contents pan and zoom.
  **Restore default background** deletes the saved image and restores the bundled
  misty lake illustration. Invalid files or failed saves leave the previous
  wallpaper in place. The illustration is original; no artwork is copied from
  reference sites. The plugin uploads no wallpaper and calls no image-generation
  API.

There are no manual connections, ports, workflow edges or connection permissions.
Employees continue to collaborate through the existing Bot messages and Rooms.
Moving or grouping windows never starts agent work.

## Entity and lifecycle boundaries

Each employee window references the stable `bot.id`; each Room window references
`room.id`. A Bot's current own-chat Session is resolved from the latest roster.
Changing conversation part replaces the window's Session binding without changing
its employee identity or geometry. Previous conversation parts remain governed by
the original history implementation.

Closing or compacting a window releases that view's conversation reference. It
does not delete or stop the employee, Room, memory, history or scheduled work.
Employee deletion remains the explicit existing management action. When a full
roster confirms an entity was deleted, its stale canvas references are removed.
Room membership and live work are read from the original host state rather than
copied into the layout.

Ordinary DSH Agent sessions remain separate from team employees and use their
original conversation view. A visual group is only a list of canvas window IDs.
Bot-to-Bot delivery and reply semantics are unchanged: a message does not expose
the sender's entire conversation to the recipient.

## Implementation

The implementation uses the documented DSH `0.2.0-rc.2` client contracts:

1. `main` registers the `ds-bot-canvas` global panel. Selecting it through
   `ctx.layout.selectPanel()` replaces the visible classic Conversation without
   changing the retained main Session.
2. Each explicitly expanded window acquires its current Session through
   `ctx.sessions.retain()` with the `dsBotCanvas` source. Acquisition waits for
   the Session to appear in the client catalog, whose publication can follow a
   roster response. Closing, compacting, changing part or leaving the panel
   releases that reference.
3. The standard `SessionProvider` binds the reference around a declared session
   child slot. That child renders the public `conversation.content` factory with
   `variant: 'embedded'` and its Chat view. The factory supplies the composer,
   including the existing pending-interaction routing.
4. One entity has at most one canvas window. The classic Conversation unmounts
   while the canvas is selected, so the same Session does not get a second
   editable root. DSH currently owns one editor per Session.
5. The sidebar, details panel, visits and approval navigation account for the
   focused canvas window. Hidden main-view navigation cannot pull the user out of
   the canvas when an old conversation part changes. Composer controls use their
   occurrence's DOM scope instead of querying another window's input. Live activity
   controls are scoped to the same occurrence so multiple windows remain independent.
6. Quick message calls the existing `actions.send(bot.id, text)` with the canonical
   employee ID, allowing the existing send action to resolve its current Session.
   It does not retain history. Agenda subscribes through the original `useSchedules`
   catalog and uses existing schedule settings actions.
7. Wallpaper processing stays in the browser. The selected image is decoded,
   reduced to a maximum dimension of 2560 pixels and compressed to WebP, with JPEG
   as a fallback. A temporary object URL displays the saved Blob; replacement and
   canvas unmount release that URL. Wallpaper changes do not retain Sessions or
   modify employee, Room or conversation state.

The principal modules are `ds-bot/src/client/canvas-state.js`,
`canvas-session.js`, `canvas-workspace.js`, `canvas-styles.js`, `floating-team.js`,
`spatial-widgets.js`, `canvas-wallpaper.js` and `wallpaper-image.js`. Integration is
in the existing client entry, surface, sidebar, overlays and composer modules.
No host endpoint, Bot runtime, memory format or DSH implementation was changed.

## Persistence

Canvas presentation state and quick-message drafts use browser-local storage:

- `ds-bot:canvas`: schema version, stable entity references, geometry, stacking
  order, compact/open state, visual groups, selection and viewport.
- `ds-bot:workspace-view`: canvas or classic preference.
- `ds-bot:team-panel`: floating employee panel position and folded state. Its
  position is constrained to the available workspace when the viewport changes.
- `ds-bot:spatial-widgets`: position and folded state for Quick message and Agenda.
- `ds-bot:canvas-quick-drafts`: quick-message text drafts keyed by canonical Bot ID,
  separate from the expanded conversation composer's drafts.

The processed wallpaper Blob is stored separately in IndexedDB, rather than as
base64 in localStorage or as part of the canvas layout. Reloading or returning to
the canvas restores it from the current browser/app profile. Reset removes the
stored image before clearing the displayed wallpaper; a storage failure preserves
the current background.

Employee profiles, messages, memory, permissions, Room membership and runtime
work status are not copied into the layout records. Existing DSH composer draft
behavior remains Session-scoped; quick-message drafts have their own local key.
Layout writes are debounced and finalized when
a gesture ends or the page is hidden; malformed saved layout falls back to a
normalized state.

These preferences belong to the current browser/profile and origin. They are not
shared across computers or browsers and are not part of `bot/state.json` or its
backup. Clearing browser storage resets the layout and quick-message drafts and
removes the saved wallpaper without deleting employees or their conversations.
The keys are not currently namespaced per team; when
the same origin serves a different team, confirmed roster reconciliation removes
unmatched entity references rather than retaining separate team layouts.

## Current limits

- There is one canvas and one editable window per employee or Room. Separate
  editable views of the same Session are not supported by the current DSH editor.
- Windows render Chat; additional native conversation views remain available
  through **Classic view**. Opening or closing views does not alter their data.
- The canvas does not add synchronized layouts, manual links, workflow execution
  or new collaboration permissions.
- Desktop Browser remains the existing details/browser panel. It has not been
  converted into one native browser guest per canvas window; its existing
  one-live-guest and platform restrictions remain.
- Reduced motion, reduced transparency, forced colors and a no-backdrop-filter
  fallback are implemented in the canvas styles. Mobile touch behavior, Desktop
  native guests, real providers and broad platform parity require separate
  acceptance checks.
- There is no offscreen conversation virtualization yet. Compact or close windows
  that do not need a live transcript; retaining many expanded conversations can
  increase browser resource use.

## Validation and acceptance

The local Web mock bench uses DSH `0.2.0-rc.2`, a profile linked to this checkout,
an isolated `.dsh-test-canvas` home and the repository's mock model. The page and
Bot state API have been reached successfully. This is local mock evidence, not
production deployment, packaged Desktop validation or real-provider acceptance.

Automated coverage includes layout normalization, measured viewport insets,
Session retain/release and current-part lifecycle, scoped composer behavior,
canvas navigation and completion acknowledgements. Required checks:

```sh
cd ds-bot
npm run build
npm test
node scripts/build-client.mjs --check
npm run lint
```

For the initial canvas implementation, all 563 unit tests passed, generated-bundle
consistency and `git diff --check` passed, and lint exited successfully with the
14 pre-existing warnings.

The original `dev/smoke.mjs` passed all 40 steps on a separate isolated mock bench,
including Bot messages, Room collaboration, context-part rotation and compaction,
history, workspace changes and capability isolation. No DSH source was modified.

The initial browser checks in Edge exercised two simultaneous employees with distinct
messages and replies; drafts across compact, close/reopen, classic/canvas,
Agent-mode transitions and page reload; real employee and Room creation; window
movement and resizing; group movement and ungrouping; pan and anchored zoom;
keyboard movement; background-completion unread and acknowledgement; empty-canvas
directory access; question selection/submission; details with a hidden Agent
main Session; native light/dark theme switching; and 390px/760px/1600px viewport
layouts. Reopening an employee kept a single editable occurrence. No uncaught
page errors were observed in those checks.

Context-part replacement is covered by lifecycle tests and host smoke, rather
than a long-running real-provider browser session. Approval dialogs, file upload,
voice and native Desktop guests still need end-to-end platform acceptance. The
Web checks do not establish packaged Desktop or real-provider readiness.

The earlier on-demand conversation update passed the 567-test suite plus
9 focused workspace component tests (576 total). Bundle freshness, lint and
diff checks passed, with the same 14 pre-existing lint warnings. Isolated Edge
checks verified zero mounted conversations on entry and reload, a single mounted
conversation while switching employees, independent text drafts, layout-only
selection/grouping/dragging, arranging without changing groups, Classic return,
on-demand Rooms, legacy expanded-layout restoration, and 760px/390px layouts.
These checks observed no uncaught page errors. They verify subscription/render
behavior, not a measured latency improvement or a new QibitAI installation.

That earlier update allowed only one expanded conversation. The previous floating-panel revision
allows multiple manual expansions, restores compact-card management and Room
collaboration controls, and floats the original employee list above the canvas.
Its 607-test suite passed. Generated-bundle consistency and `git diff --check`
passed; lint exited successfully with the same 14 pre-existing warnings.

The isolated Edge mock checks in `work/check-canvas-floating.cjs` passed all nine
groups, recorded in `work/canvas-floating-result.json` with no page errors:

- Full-width canvas and transparent floating employee list, with no conversation
  history mounted by default.
- Panel dragging, persisted position, keyboard reset, folding and expansion.
- Scrolling the employee list without panning the canvas.
- Multiple manually opened conversations and independent drafts after collapse.
- Selected employees entering the original Room creation flow, including explicit
  admin selection.
- Renaming and arranging a visual group without loading histories.
- Employee management from compact cards and original Room admin/reply-mode settings.
- Restoring the original sidebar in Classic view and returning to a lazy canvas.
- Reachable panel controls and no page overflow at 760px and 390px widths.

That revision's local delivery package remains `outputs/ds-bot-0.1.5-canvas-floating.tgz`, relative
to the task workspace. These checks verify the source and isolated Web mock
behavior. This package has not been installed in QibitAI, and no real-provider
or packaged Desktop acceptance is claimed.

The preceding spatial revision adds compact employee avatars, the canvas-local dark
glass theme and centered dock, plus Quick message and Agenda. All 628 unit tests,
generated-bundle consistency and `git diff --check` passed; lint exited successfully
with the same 14 pre-existing warnings. The isolated Edge mock checks passed all
10 groups, recorded in `work/canvas-spatial-result.json`, with no uncaught page errors.
They verified quick messages through the existing send action and their visibility
after opening the conversation, independent per-employee drafts, multiple expanded
conversations, dragging/folding/restoring panels, original settings access, and
760px/390px layouts. A separate expanded-window screenshot confirmed readable white
composer text on the dark glass theme. Message delivery was tested against the
isolated mock, not a real provider.

That revision's artifact path is `outputs/ds-bot-0.1.5-canvas-spatial.tgz`; the earlier
floating-panel package remains available. Source checks, packaging and QibitAI
installation are separate delivery steps. This revision has not been installed
in QibitAI, and no packaged Desktop or real-provider acceptance is claimed.

The local wallpaper revision adds the image picker, IndexedDB persistence and
original lake illustration described above. All 656 unit tests passed, including
28 image-processing and storage tests. Bundle freshness and diff checks passed;
lint completed with the same 14 pre-existing warnings. Nine isolated Edge browser
checks passed with no page errors (`work/canvas-wallpaper-result.json`): default
SVG display, local image compression and persistence, replacement and reload,
Classic return, malformed and oversized file rejection, restore-default deletion,
390px/760px menus and forced-colors behavior. No wallpaper upload occurred; the
existing background state-read request was observed separately.

The package is `outputs/ds-bot-0.1.5-canvas-wallpaper.tgz` (426051 bytes), SHA256
`AB0ADC49DA1EC94EC732822CC94A716BB6F6D73F948AE01F1DCBC9EFECC8AD04`.
Its bundled client exactly matches the source build and includes the default
landscape without external image dependencies or test data. It has not been
installed in QibitAI; native Desktop acceptance remains separate.

## Local baseline

- Upstream: `https://github.com/Fei2411/DeepSeek-Bot.git`
- Starting commit: `2b10c70b614e969117b68ddc6fd14e68968272f2`
- Development branch: `feat/employee-canvas`
- Plugin version: `0.1.5`; canvas changes remain unreleased.
