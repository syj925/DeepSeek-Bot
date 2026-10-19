import { createElement as h, useEffect, useRef, useState } from 'react'
import { currentPart } from './text.js'
import { ActivityIndicator } from './activity-row.js'
import { t } from './i18n.js'
import { ClassicAgentIcon } from './icons.js'
import { ModelRecovery, MODEL_RECOVERY_CSS } from './model-recovery.js'
import { chatSurfaces } from './chat-surface.js'
import { TaskGroupJourney, TaskGroupNavigation } from './task-groups.js'
import { ExecutionStatus, EXECUTION_STATUS_CSS } from './execution-status.js'

export const CANVAS_PANEL = 'ds-bot-canvas'
export const CANVAS_CONVERSATION = 'ds-bot.canvas.conversation'

export function canvasSessionId(window, roster) {
  const entity = window.kind === 'room' ? roster.roomsById[window.entityId] : roster.byId[window.entityId]
  return entity ? window.kind === 'room' ? entity.id : currentPart(entity) : undefined
}

let bridgeProvider = null
let bridgeSlot = null

export function registerSessionBridge(SessionProvider, renderSlot) {
  if (SessionProvider) bridgeProvider = SessionProvider
  if (renderSlot) bridgeSlot = renderSlot
}

export function getSessionBridge() {
  return { SessionProvider: bridgeProvider, renderSlot: bridgeSlot }
}

// Retention belongs to this occurrence, while the window key stays the Bot id.
export function CanvasSession({ sessionId, actions, useSessions, SessionProvider, renderSlot, onOpenConversation }) {
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
  const Provider = SessionProvider || bridgeProvider
  const slot = renderSlot || bridgeSlot
  return h(Provider, { session: entry.reference }, slot ? slot(CANVAS_CONVERSATION, onOpenConversation ? { onOpenConversation } : {}) : null)
}

function CanvasChat({ renderSlot }) { return renderSlot('conversation.session', { view: 'chat' }) }
const CONTENT_SLOTS = { views: CanvasChat, widthControls: () => null }

export function CanvasConversation({ sessionId, useSession, useRoster, useWork, useSessionStatus, useLive, useCanvas, actions, renderFactorySlot, onOpenConversation }) {
  const session = useSession(value => value)
  const roster = useRoster(value => value)
  const entity = roster.byId[sessionId] ?? roster.roomsById[sessionId] ?? (roster.bots ?? []).find(bot => currentPart(bot) === sessionId)
  const active = useCanvas ? useCanvas(state => state.windows.find(window => window.id === state.active)?.entityId === entity?.id) : true
  const root = useRef(null)
  const surface = useRef(null)
  const [ownsEditor, setOwnsEditor] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  useEffect(() => {
    const entry = chatSurfaces.register(sessionId, setOwnsEditor)
    surface.current = entry
    return () => { entry.release(); surface.current = null }
  }, [sessionId])
  // Unmount the previous occurrence before binding the same session's editor here.
  useEffect(() => {
    setEditorReady(false)
    if (!ownsEditor) return undefined
    const timer = setTimeout(() => setEditorReady(true), 0)
    return () => clearTimeout(timer)
  }, [sessionId, ownsEditor])
  useEffect(() => {
    if (!(active || onOpenConversation) || !ownsEditor || !editorReady) return undefined
    const stopReading = actions.readCanvasChat(sessionId)
    actions.beginVisit(sessionId)
    actions.clearUnread(entity?.id ?? sessionId)
    return () => { stopReading(); actions.endVisit(sessionId) }
  }, [sessionId, active, Boolean(onOpenConversation), ownsEditor, editorReady])
  return h(TaskGroupNavigation.Provider, { value: onOpenConversation ?? actions.openSession }, h('div', {
    key: sessionId, ref: root, className: 'bt-canvas-session', 'data-session-id': sessionId,
    'data-bt-room': roster.roomsById[sessionId] ? '' : undefined,
    style: { '--bt-placeholder': JSON.stringify(t('Message {name}', { name: entity?.name ?? '' })), '--bt-first-sep': 'none' },
  }, session.openState === 'error' ? h('div', { role: 'alert' }, t('Could not open conversation')) : null,
  h('style', null, MODEL_RECOVERY_CSS + EXECUTION_STATUS_CSS),
  h(TaskGroupJourney, { sessionId, roster, actions, onOpenConversation }),
  h(ModelRecovery, { sessionId, roster, actions, onOpenConversation }),
  entity?.contextResetError ? h('div', { className: 'bt-context-clear-note', role: 'alert' }, t('Context could not be cleared. Your history is safe; try /clear again.'))
    : entity?.contextClearedAt ? h('div', { className: 'bt-context-clear-note', role: 'status', title: t('History and long-term memory are retained. Model instructions and tools still use context.') }, t('Context cleared · history retained')) : null,
  ownsEditor && editorReady
    ? renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: CONTENT_SLOTS })
    : h('div', { className: 'bt-canvas-session-error' }, h('p', null, t('This conversation is open in another window.')),
      h('button', { type: 'button', className: 'bt-canvas-button', onClick: () => surface.current?.activate() }, t('Continue here'))),
  h(ExecutionStatus, { sessionId, useRoster, useWork, useSessionStatus, useSession, useLive, actions }),
  h(ActivityIndicator, { key: sessionId, sessionId, useRoster, useSessionStatus, useSession, useLive, actions, rootRef: root })))
}

export function CanvasLauncher({ useSurface, usePanelInfo, actions }) {
  const canvasActive = usePanelInfo(value => value.activePanelId === CANVAS_PANEL)
  const enabled = useSurface(value => value.mode === 'bot')
  if (!enabled) return null
  if (canvasActive) return h('button', { type: 'button', className: 'bt-classic-return', title: t('Switch to classic Agent mode'), 'aria-label': t('Switch to classic Agent mode'), onClick: () => actions.setSurface('agent') }, h(ClassicAgentIcon), h('span', null, t('Switch to classic Agent mode')))
  return h('button', { type: 'button', className: 'bt-canvas-launcher', title: t('Employee canvas'), 'aria-label': t('Employee canvas'), onClick: () => actions.openCanvas() },
    h('span', { 'aria-hidden': true }, '▦'))
}
