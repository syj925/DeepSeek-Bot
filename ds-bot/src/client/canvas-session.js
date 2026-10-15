import { createElement as h, useEffect, useRef, useState } from 'react'
import { currentPart } from './text.js'
import { ActivityIndicator } from './activity-row.js'
import { t } from './i18n.js'

export const CANVAS_PANEL = 'ds-bot-canvas'
export const CANVAS_CONVERSATION = 'ds-bot.canvas.conversation'

export function canvasSessionId(window, roster) {
  const entity = window.kind === 'room' ? roster.roomsById[window.entityId] : roster.byId[window.entityId]
  return entity ? window.kind === 'room' ? entity.id : currentPart(entity) : undefined
}

// Retention belongs to this occurrence, while the window key stays the Bot id.
export function CanvasSession({ sessionId, actions, useSessions, SessionProvider, renderSlot }) {
  const [entry, setEntry] = useState(null)
  const known = useSessions(list => list.byId[sessionId] !== undefined)
  useEffect(() => {
    const lease = { active: true }
    let reference
    const release = () => {
      lease.active = false
      const owned = reference
      reference = undefined
      owned?.release()
    }
    const open = async () => {
      try {
        if (!known) { await actions.refreshCanvasSessions(); return }
        reference = actions.retainCanvasSession(sessionId)
        setEntry({ sessionId, reference, lease })
        await reference.ready
      } catch (error) {
        if (!lease.active) return
        setEntry({ sessionId, error: error?.message ?? String(error) })
        release()
      }
    }
    setEntry(null)
    void open()
    return release
  }, [sessionId, known])
  if (entry?.sessionId === sessionId && entry.error) return h('div', { className: 'bt-canvas-session-error', role: 'alert' }, entry.error,
    h('button', { type: 'button', className: 'bt-canvas-button', onClick: () => actions.openClassicSession(sessionId) }, t('Open in classic view')))
  if (!known || entry?.sessionId !== sessionId || !entry.lease?.active) return h('div', { className: 'bt-canvas-status', role: 'status' }, t('Loading…'))
  return h(SessionProvider, { session: entry.reference }, renderSlot(CANVAS_CONVERSATION, {}))
}

function CanvasChat({ renderSlot }) { return renderSlot('conversation.session', { view: 'chat' }) }
const CONTENT_SLOTS = { views: CanvasChat, widthControls: () => null }

export function CanvasConversation({ sessionId, useSession, useRoster, useSessionStatus, useLive, useCanvas, actions, renderFactorySlot }) {
  const session = useSession(value => value)
  const roster = useRoster(value => value)
  const entity = roster.byId[sessionId] ?? roster.roomsById[sessionId]
  const active = useCanvas(state => state.windows.find(window => window.id === state.active)?.entityId === entity?.id)
  const root = useRef(null)
  useEffect(() => {
    if (!active) return undefined
    actions.beginVisit(sessionId)
    actions.clearUnread(entity?.id ?? sessionId)
    return () => actions.endVisit(sessionId)
  }, [sessionId, active])
  return h('div', {
    ref: root, className: 'bt-canvas-session', 'data-session-id': sessionId,
    'data-bt-room': roster.roomsById[sessionId] ? '' : undefined,
    style: { '--bt-placeholder': JSON.stringify(t('Message {name}', { name: entity?.name ?? '' })), '--bt-first-sep': 'none' },
  }, session.openState === 'error' ? h('div', { role: 'alert' }, t('Could not open conversation')) : null,
  renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: CONTENT_SLOTS }),
  h(ActivityIndicator, { key: sessionId, sessionId, useRoster, useSessionStatus, useSession, useLive, actions, rootRef: root }))
}

export function CanvasLauncher({ useSurface, actions }) {
  const enabled = useSurface(value => value.mode === 'bot')
  if (!enabled) return null
  return h('button', { type: 'button', className: 'bt-canvas-launcher', title: t('Employee canvas'), 'aria-label': t('Employee canvas'), onClick: () => actions.openCanvas() },
    h('span', { 'aria-hidden': true }, '▦'))
}
