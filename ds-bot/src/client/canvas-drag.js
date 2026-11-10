import { desktopBounds } from './canvas-desktop.js'

// updateCanvas can clamp a newly opened Dock icon before React mounts it. Use
// its rendered origin for temporary movement, not the unclamped drag snapshot.
export function paintCanvasDrag(current, root) {
  if (!root || !current?.latest || !['avatar', 'window'].includes(current.kind)) return
  if (!current.nodes?.length || current.nodes.length !== current.ids.length || current.nodes.some(node => node.isConnected === false)) {
    current.nodes = [...(root.querySelectorAll?.('.bt-canvas-world > [data-window-id]') ?? [])].filter(node => current.ids.includes(node.dataset.windowId))
  }
  for (const node of current.nodes) {
    const to = current.latest.windows.find(window => window.id === node.dataset.windowId)
    const x = parseFloat(node.style.left), y = parseFloat(node.style.top)
    if (!to || !Number.isFinite(x) || !Number.isFinite(y)) continue
    node.style.transition = 'none'
    node.style.transform = `translate3d(${to.x - x}px,${to.y - y}px,0)`
    node.style.willChange = 'transform'
  }
  if (root.dataset) root.dataset.dragging = 'true'
}

// Temporary drag geometry: no normalization, collision relocation or storage.
export function dragGeometry(state, ids, dx, dy, bounds, draftId) {
  const selected = new Set(ids)
  const moving = state.windows.filter(window => selected.has(window.id))
  const draft = draftId && state.groups.find(group => group.id === draftId && group.draft)
  const items = draft ? [{ ...draft, width: 280, height: 180 }] : moving.map(window => ({ ...window, width: 120, height: window.kind === 'room' ? 132 : 112 }))
  if (bounds && items.length) {
    const edges = desktopBounds(bounds)
    const minX = Math.min(...items.map(window => window.x)), minY = Math.min(...items.map(window => window.y))
    const maxX = Math.max(...items.map(window => window.x + window.width)), maxY = Math.max(...items.map(window => window.y + window.height))
    const clamp = (value, low, high) => Math.max(low, Math.min(Math.max(low, high), value))
    dx = clamp(dx, edges.left - minX, edges.right - maxX)
    dy = clamp(dy, edges.top - minY, edges.bottom - maxY)
  }
  return { ...state, selected: ids,
    windows: state.windows.map(window => selected.has(window.id) ? { ...window, x: window.x + dx, y: window.y + dy } : window),
    groups: draftId ? state.groups.map(group => group.id === draftId && group.draft ? { ...group, x: group.x + dx, y: group.y + dy } : group) : state.groups }
}
