# Desktop UI integration — 2026-10-20

Integrated the designer's ui-20261020 cumulative changes into the current 0.1.54 feature baseline. Current release: 0.1.57. Existing backend, task orchestration and permissions are unchanged.

## User-confirmed adjustments

- Employee avatars use their saved roster identity, matching the team sidebar. Company department portraits from `company-dock-portraits.json` were used to configure the requested department employees through the public plugin API.
- The executive office lists Chief and the actual department leaders. This contact view does not move leaders out of their own departments or add conversation content to their context.
- Dock contains the General Assistant, actual organizational departments, and a temporary employee collection (Chinese label: 临时员工部). Group chats and unaffiliated permanent employees do not become Dock tabs; their existing conversation and canvas entries remain available.
- Temporary employees are collected from the live roster regardless of task or team. Each member retains its original action target and can be placed on the canvas. The collection itself cannot be dragged as an arbitrary first employee.
- A permanent coordinator and a temporary staffing department were explicitly configured through the public plugin API. The coordinator uses the former executive portrait (`27_strategy`). The department remains accessible without active temporary workers; retired workers are excluded. Temporary workers keep their existing task ownership and retirement lifecycle.
- Popovers show department responsibilities rather than recent private chat text. New formal departments created by Chief appear automatically; group chats do not become departments.
- Settings and wallpaper buttons reuse the existing handlers.

## Conversation drag-out

The designer's pointer gestures, keyboard shortcut and session-preserving placement are retained. Captured composer blur is ignored; only the window itself losing focus cancels the gesture. This fixes a real browser failure when dragging immediately after typing. Window placement is in-memory and is not promised to survive refresh.

## Validation

- 948 unit tests passed; lint passed with existing warnings; generated client consistency passed.
- Isolated mock browser verified portrait consistency, department descriptions and conversation drag-out with preserved session and draft. Regression tests cover management membership, temporary collection membership and newly created departments.
- Desktop 0.1.57 was activated through the plugin installer. Installed client hash matches source; Chief avatar matches the sidebar, the executive office displays seven management contacts, and the temporary department displays its permanent coordinator with the requested portrait.
- No test conversations were sent to the user's desktop profile. Live model responses, attachments and approvals were not part of this UI integration smoke test.

## Source archive boundary

The Git source archive contains application/plugin code, bundled avatar assets, tests and documentation. It excludes dependencies, local test logs, credentials and desktop profile data. The six departments and their employees configured on this desktop are user data, not automatic initialization code; extracting the source on a new machine does not recreate that roster. The designer's original handoff documents are retained as historical references; the current integration decisions above take precedence.
