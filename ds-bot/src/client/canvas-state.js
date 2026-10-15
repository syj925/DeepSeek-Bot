export const CANVAS_STORAGE_KEY = 'ds-bot:canvas'

export const CANVAS_LIMITS = Object.freeze({
  coordinate: 1_000_000,
  minWidth: 300,
  minHeight: 280,
  compactWidth: 320,
  compactHeight: 200,
  avatarWidth: 120,
  avatarHeight: 112,
  maxSize: 1600,
  minZoom: 0.2,
  maxZoom: 2,
})

export const DEFAULT_CANVAS = Object.freeze({
  version: 1,
  windows: Object.freeze([]),
  groups: Object.freeze([]),
  viewport: Object.freeze({ x: 0, y: 0, zoom: 1 }),
  selected: Object.freeze([]),
  active: null,
})

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const idOf = value => typeof value === 'string' && value.trim() !== '' && value.length <= 512 ? value : null
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback
const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, finite(value, fallback)))
const coordinate = value => clamp(value, -CANVAS_LIMITS.coordinate, CANVAS_LIMITS.coordinate, 0)
const unique = values => [...new Set(values)]
const defaultStorage = () => { try { return globalThis.localStorage } catch { return undefined } }
const windowId = (kind, entityId) => `canvas-${kind}-${entityId}`
const matching = (window, id) => window.id === id || window.entityId === id

function dimensions(value) {
  return {
    width: clamp(value.width, CANVAS_LIMITS.minWidth, CANVAS_LIMITS.maxSize, 420),
    height: clamp(value.height, CANVAS_LIMITS.minHeight, CANVAS_LIMITS.maxSize, 540),
  }
}

function normalizeWindow(value, index) {
  if (!object(value) || !['bot', 'room'].includes(value.kind) || !idOf(value.entityId)) return null
  const compact = value.compact === true
  return {
    id: idOf(value.id) ?? windowId(value.kind, value.entityId),
    kind: value.kind,
    entityId: value.entityId,
    x: coordinate(value.x),
    y: coordinate(value.y),
    ...dimensions(value),
    z: clamp(value.z, 0, CANVAS_LIMITS.coordinate, index + 1),
    open: value.open !== false,
    compact,
  }
}

function cleanReferences(state) {
  const all = new Set(state.windows.map(window => window.id))
  const open = new Set(state.windows.filter(window => window.open).map(window => window.id))
  const claimed = new Set(), groups = [], groupIds = new Set()
  for (const value of state.groups) {
    if (!object(value) || !idOf(value.id) || groupIds.has(value.id) || !Array.isArray(value.members)) continue
    const members = unique(value.members).filter(id => all.has(id) && !claimed.has(id))
    if (members.length < 2 && value.draft !== true) continue
    groups.push({ id: value.id, name: typeof value.name === 'string' ? value.name.trim().slice(0, 100) || 'Window group' : 'Window group', members,
      ...(value.draft === true ? { draft: true, x: coordinate(value.x), y: coordinate(value.y) } : {}) })
    groupIds.add(value.id)
    members.forEach(id => claimed.add(id))
  }
  state.groups = groups
  state.selected = unique(state.selected).filter(id => open.has(id))
  if (!open.has(state.active)) {
    state.active = state.selected.at(-1) ?? state.windows.filter(window => window.open).sort((a, b) => b.z - a.z)[0]?.id ?? null
  }
  return state
}

function entityIds(roster, kind) {
  const rows = kind === 'bot' ? roster.bots : roster.rooms
  const index = kind === 'bot' ? roster.byId : roster.roomsById
  return new Set((Array.isArray(rows) ? rows : Object.values(object(index) ? index : {})).map(row => row?.id).filter(idOf))
}

export function createCanvasState(seed = {}) {
  return normalizeCanvas({ ...seed, version: 1 })
}

// Only geometry and stable entity references cross the persistence boundary.
export function normalizeCanvas(saved, options = {}) {
  const value = object(saved) && saved.version === 1 ? saved : DEFAULT_CANVAS
  const ids = new Set(), entities = new Set(), windows = []
  for (const [index, entry] of (Array.isArray(value.windows) ? value.windows : []).entries()) {
    const window = normalizeWindow(entry, index)
    if (!window) continue
    const entity = `${window.kind}:${window.entityId}`
    if (ids.has(window.id) || entities.has(entity)) continue
    ids.add(window.id)
    entities.add(entity)
    windows.push(window)
  }
  const viewport = object(value.viewport) ? value.viewport : {}
  const state = {
    version: 1,
    windows,
    groups: Array.isArray(value.groups) ? value.groups : [],
    viewport: { x: coordinate(viewport.x), y: coordinate(viewport.y), zoom: clamp(viewport.zoom, CANVAS_LIMITS.minZoom, CANVAS_LIMITS.maxZoom, 1) },
    selected: Array.isArray(value.selected) ? value.selected : [],
    active: idOf(value.active),
  }
  const { roster } = options
  if (object(roster) && (options.rosterReady ?? options.ready ?? roster.ready) === true) {
    const bots = entityIds(roster, 'bot'), rooms = entityIds(roster, 'room')
    state.windows = windows.filter(window => (window.kind === 'bot' ? bots : rooms).has(window.entityId))
  }
  return cleanReferences(state)
}

export function readCanvas(storage = defaultStorage(), options = {}) {
  // Restoring a layout must not reopen every saved conversation subscription.
  try { return compactConversations(normalizeCanvas(JSON.parse(storage?.getItem(CANVAS_STORAGE_KEY) ?? 'null'), options)) } catch { return createCanvasState() }
}

export function writeCanvas(storage, state) {
  try {
    const target = storage ?? defaultStorage()
    if (typeof target?.setItem !== 'function') return false
    target.setItem(CANVAS_STORAGE_KEY, JSON.stringify(normalizeCanvas(state)))
    return true
  } catch { return false }
}

export function reconcileCanvas(state, roster, options = {}) {
  return normalizeCanvas(state, { ...options, roster })
}

function bringForward(state, window) {
  let max = Math.max(0, ...state.windows.map(item => item.z))
  if (max >= CANVAS_LIMITS.coordinate) {
    [...state.windows].sort((a, b) => a.z - b.z).forEach((item, index) => { item.z = index + 1 })
    max = state.windows.length
  }
  window.z = max + 1
  state.active = window.id
}

function nextWindowPosition(state, window) {
  const gap = 32
  const origin = { x: (40 - state.viewport.x) / state.viewport.zoom, y: (100 - state.viewport.y) / state.viewport.zoom }
  const width = windowWidth(window), height = windowHeight(window)
  const right = origin.x + Math.max(width, CANVAS_LIMITS.compactWidth * 3 + gap * 2)
  const occupied = state.windows.filter(item => item.open).map(item => ({
    x: item.x, y: item.y, right: item.x + windowWidth(item), bottom: item.y + windowHeight(item),
  }))
  const rows = unique([origin.y, ...occupied.map(item => item.bottom + gap).filter(y => y >= origin.y)]).sort((a, b) => a - b)
  for (const y of rows) {
    let x = origin.x
    while (x + width <= right) {
      const collision = occupied.find(item => x < item.right + gap && x + width + gap > item.x && y < item.bottom + gap && y + height + gap > item.y)
      if (!collision) return { x, y }
      x = collision.right + gap
    }
  }
  return origin
}

export function openWindow(state, entity, options = {}) {
  const next = normalizeCanvas(state)
  const kind = entity?.kind ?? options.kind ?? 'bot'
  const entityId = idOf(entity?.entityId ?? entity?.id)
  if (!entityId || !['bot', 'room'].includes(kind)) return next
  let window = next.windows.find(item => item.kind === kind && item.entityId === entityId)
  if (!window) {
    const compact = options.compact !== false
    const baseId = windowId(kind, entityId)
    let id = baseId, serial = 1
    while (next.windows.some(item => item.id === id)) id = `${baseId}-${serial++}`
    window = normalizeWindow({
      id, kind, entityId,
      width: options.width, height: options.height, compact,
    }, next.windows.length)
    const position = nextWindowPosition(next, window)
    window.x = coordinate(finite(options.x, position.x))
    window.y = coordinate(finite(options.y, position.y))
    next.windows.push(window)
  }
  window.open = true
  window.compact = options.compact !== false
  Object.assign(window, dimensions(window))
  bringForward(next, window)
  next.selected = [window.id]
  return next
}

export function collapseWindow(state, id) {
  const next = normalizeCanvas(state)
  const window = next.windows.find(item => matching(item, id))
  if (window) window.open = false
  return cleanReferences(next)
}

export function setWindowCompact(state, id, compact) {
  const next = normalizeCanvas(state)
  const window = next.windows.find(item => matching(item, id))
  if (window) {
    window.compact = compact === true
    Object.assign(window, dimensions(window))
  }
  return next
}

export function compactConversations(state) {
  const next = normalizeCanvas(state)
  next.windows.forEach(window => { window.compact = true })
  return next
}

export function arrangeCards(state) {
  const next = compactConversations(state)
  const remaining = new Set(next.windows.filter(window => window.open).map(window => window.id))
  const blocks = next.groups.map(group => group.members.filter(id => remaining.has(id))).filter(ids => ids.length)
  blocks.flat().forEach(id => remaining.delete(id))
  if (remaining.size) blocks.push([...remaining])
  let y = 115
  for (const ids of blocks) {
    for (let index = 0; index < ids.length; index += 3) {
      const row = ids.slice(index, index + 3).map(id => next.windows.find(window => window.id === id))
      let x = 42
      for (const window of row) {
        window.x = x
        window.y = y
        x += windowWidth(window) + 32
      }
      y += Math.max(...row.map(windowHeight)) + 32
    }
    y += 48
  }
  return next
}

export const windowWidth = window => window.compact ? window.kind === 'bot' ? CANVAS_LIMITS.avatarWidth : CANVAS_LIMITS.compactWidth : window.width
export const windowHeight = window => window.compact ? window.kind === 'bot' ? CANVAS_LIMITS.avatarHeight : CANVAS_LIMITS.compactHeight : window.height

export function windowBounds(state, ids) {
  const wanted = ids === undefined ? null : new Set(ids)
  const windows = state.windows.filter(window => window.open && (wanted === null || wanted.has(window.id)))
  if (!windows.length) return null
  const x = Math.min(...windows.map(window => window.x)), y = Math.min(...windows.map(window => window.y))
  const right = Math.max(...windows.map(window => window.x + windowWidth(window))), bottom = Math.max(...windows.map(window => window.y + windowHeight(window)))
  return { x, y, width: right - x, height: bottom - y, right, bottom }
}

export function setCanvasSelection(state, ids, active) {
  const next = normalizeCanvas(state)
  next.selected = Array.isArray(ids) ? ids : []
  if (active !== undefined) next.active = active
  const window = next.windows.find(item => item.id === next.active && item.open)
  if (window) bringForward(next, window)
  return cleanReferences(next)
}

export function setCanvasViewport(state, viewport) {
  const next = normalizeCanvas(state)
  return normalizeCanvas({ ...next, viewport: { ...next.viewport, ...viewport } })
}

export function groupWindows(state, ids = state.selected, options = {}) {
  const next = normalizeCanvas(state)
  const members = unique(Array.isArray(ids) ? ids : []).filter(id => next.windows.some(window => window.id === id))
  if (members.length < 2) return next
  const used = new Set(next.groups.map(group => group.id))
  let serial = 1
  while (used.has(`canvas-group-${serial}`)) serial += 1
  const id = idOf(options.id) ?? `canvas-group-${serial}`
  next.groups = next.groups.filter(group => group.id !== id).map(group => ({ ...group, members: group.members.filter(member => !members.includes(member)) }))
  next.groups.push({ id, name: options.name ?? 'Window group', members })
  return cleanReferences(next)
}

export function createEmptyGroup(state, position = {}) {
  const next = normalizeCanvas(state)
  let serial = 1
  while (next.groups.some(group => group.id === `canvas-group-${serial}`)) serial++
  next.groups.push({ id: `canvas-group-${serial}`, name: position.name || 'New group', members: [], draft: true, x: coordinate(position.x), y: coordinate(position.y) })
  return next
}

export function addDraftMembers(state, groupId, ids) {
  const next = normalizeCanvas(state)
  const group = next.groups.find(value => value.id === groupId && value.draft)
  if (!group) return next
  const added = unique(ids).filter(id => next.windows.some(window => window.id === id && window.kind === 'bot'))
  next.groups.forEach(value => { if (value.id !== groupId) value.members = value.members.filter(id => !added.includes(id)) })
  group.members = unique([...group.members, ...added])
  return cleanReferences(next)
}

export function moveDraftGroup(state, id, dx, dy) {
  const next = normalizeCanvas(state)
  const group = next.groups.find(value => value.id === id && value.draft)
  if (group) { group.x = coordinate(group.x + dx); group.y = coordinate(group.y + dy) }
  return next
}

export function ungroupWindows(state, groupIdOrIds) {
  const next = normalizeCanvas(state)
  if (typeof groupIdOrIds === 'string') next.groups = next.groups.filter(group => group.id !== groupIdOrIds)
  else {
    const ids = new Set(Array.isArray(groupIdOrIds) ? groupIdOrIds : next.selected)
    next.groups = next.groups.filter(group => !group.members.some(id => ids.has(id)))
  }
  return next
}

function moveBounds(value, min, max) {
  const lower = coordinate(finite(min, -CANVAS_LIMITS.coordinate))
  const upper = Math.max(lower, coordinate(finite(max, CANVAS_LIMITS.coordinate)))
  return clamp(value, lower, upper, 0)
}

export function moveWindow(state, id, dx, dy, bounds = {}) {
  const next = normalizeCanvas(state)
  const ids = new Set(Array.isArray(id) ? id : [id])
  next.windows.forEach(window => {
    if (!ids.has(window.id) && !ids.has(window.entityId)) return
    window.x = moveBounds(window.x + finite(dx, 0), bounds.minX, bounds.maxX)
    window.y = moveBounds(window.y + finite(dy, 0), bounds.minY, bounds.maxY)
  })
  return next
}

export function resizeWindow(state, id, dw, dh, bounds = {}) {
  const next = normalizeCanvas(state)
  const window = next.windows.find(item => matching(item, id))
  if (!window) return next
  const minWidth = clamp(bounds.minWidth, CANVAS_LIMITS.minWidth, CANVAS_LIMITS.maxSize, 0)
  const minHeight = clamp(bounds.minHeight, CANVAS_LIMITS.minHeight, CANVAS_LIMITS.maxSize, 0)
  window.width = clamp(window.width + finite(dw, 0), minWidth, clamp(bounds.maxWidth, minWidth, CANVAS_LIMITS.maxSize, CANVAS_LIMITS.maxSize), window.width)
  window.height = clamp(window.height + finite(dh, 0), minHeight, clamp(bounds.maxHeight, minHeight, CANVAS_LIMITS.maxSize, CANVAS_LIMITS.maxSize), window.height)
  return next
}

export function fitViewport(state, viewportSize, padding = 40, ids) {
  const next = normalizeCanvas(state)
  let bounds = windowBounds(next, ids)
  if (ids === undefined) for (const group of next.groups.filter(group => group.draft)) {
    const x = Math.min(bounds?.x ?? group.x, group.x), y = Math.min(bounds?.y ?? group.y, group.y)
    const right = Math.max(bounds?.right ?? group.x, group.x + 280), bottom = Math.max(bounds?.bottom ?? group.y, group.y + 180)
    bounds = { x, y, right, bottom, width: right - x, height: bottom - y }
  }
  const width = viewportSize?.width, height = viewportSize?.height
  if (!bounds || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return next
  if (ids === undefined && next.groups.some(group => !group.draft && next.windows.some(window => window.open && group.members.includes(window.id)))) {
    bounds = { ...bounds, x: bounds.x - 16, y: bounds.y - 45, width: bounds.width + 32, height: bounds.height + 61 }
  }
  const insets = object(padding) ? padding : { left: padding, right: padding, top: padding, bottom: padding }
  const left = clamp(insets.left, 0, width / 2 - 1, 24), right = clamp(insets.right, 0, width / 2 - 1, 24)
  const top = clamp(insets.top, 0, height - 2, 80), bottom = clamp(insets.bottom, 0, height - top - 1, 80)
  const availableWidth = width - left - right, availableHeight = height - top - bottom
  const zoom = clamp(Math.min(availableWidth / bounds.width, availableHeight / bounds.height), CANVAS_LIMITS.minZoom, 1, 1)
  next.viewport = { x: coordinate(left + (availableWidth - bounds.width * zoom) / 2 - bounds.x * zoom), y: coordinate(top + (availableHeight - bounds.height * zoom) / 2 - bounds.y * zoom), zoom }
  return next
}
