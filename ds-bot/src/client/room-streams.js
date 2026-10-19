import { createElement as h, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GroupMessage } from './cells.js'
import { replyIdentity } from '../shared/employee-avatar.js'
import { subscribeRoomProgress } from './room-progress.js'

// The classic header sits beside the conversation content. Walk only its own
// ancestors, and stop at the first container with this room's content. A canvas
// supplies its occurrence root explicitly; no global transcript lookup is used.
export function roomContentRoot(anchor, roomId, root) {
  for (let scope = root ?? anchor?.parentElement; scope; scope = root ? null : scope.parentElement) {
    if (scope.tagName === 'BODY' || scope.tagName === 'HTML') break
    if (scope.getAttribute?.('data-conversation-session') === roomId) return scope
    const content = [...(scope.querySelectorAll?.('[data-conversation-session]') ?? [])]
      .find(node => node.getAttribute('data-conversation-session') === roomId)
    if (content) return content
  }
  return null
}

export function roomStreamRows(progress) {
  const rows = progress.filter(entry => entry.background).flatMap(entry => entry.streams ?? [])
  const seen = new Set()
  return rows.filter(row => {
    if (!row.streamId || !row.text || !['active', 'completed'].includes(row.status) || seen.has(row.streamId)) return false
    seen.add(row.streamId)
    return true
  }).sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
}

// One live tail per opened room. It remains mounted after the relay finishes,
// because an employee can still be answering a delegated task in that room.
export function RoomStreams({ sessionId, roster, actions, useUi, rootRef }) {
  const room = roster.roomsById[sessionId]
  const anchor = useRef(null)
  const [streams, setStreams] = useState([])
  const [host, setHost] = useState(null)
  const [committed, setCommitted] = useState('[]')
  useEffect(() => {
    if (!room) return undefined
    let previous = ''
    return subscribeRoomProgress(actions, sessionId, progress => {
      const rows = roomStreamRows(progress)
      const key = JSON.stringify(rows)
      if (key !== previous) { previous = key; setStreams(rows) }
    })
  }, [Boolean(room), sessionId, actions])
  useLayoutEffect(() => {
    if (!room || !anchor.current) return undefined
    const scope = rootRef?.current ?? anchor.current.closest('header')?.parentElement ?? anchor.current.parentElement
    if (!scope) return undefined
    const doc = anchor.current.ownerDocument
    const target = doc.createElement('div')
    target.dataset.btRoomStreams = sessionId
    target.style.display = 'contents'
    const seen = new Set()
    let stopped = false
    const sync = () => {
      if (stopped) return
      const content = roomContentRoot(anchor.current, sessionId, rootRef?.current)
      const flow = content?.querySelector('[data-chat-flow]')
      if (flow) {
        // React can append another turn after our unmanaged host. Keep the live
        // tail at the tail without moving the transcript's own rows.
        if (target.parentElement !== flow || flow.lastElementChild !== target) flow.appendChild(target)
        setHost(previous => previous === target ? previous : target)
        for (const node of content.querySelectorAll('[data-bt-stream-id]')) {
          if (!target.contains(node)) seen.add(node.getAttribute('data-bt-stream-id'))
        }
        // A history row may leave the virtual viewport again. Once its durable
        // copy was observed here, never bring the temporary bubble back.
        const key = JSON.stringify([...seen].sort())
        setCommitted(previous => previous === key ? previous : key)
      } else {
        target.remove()
        setHost(previous => previous === null ? previous : null)
      }
    }
    const observer = new MutationObserver(records => {
      // Updating our own streamed text cannot change durable transcript IDs.
      if (records.some(record => !target.contains(record.target))) sync()
    })
    observer.observe(scope, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-bt-stream-id'] })
    sync()
    return () => { stopped = true; observer.disconnect(); target.remove() }
  }, [Boolean(room), sessionId, rootRef])
  const committedIds = new Set(JSON.parse(committed))
  const visible = streams.filter(stream => !committedIds.has(stream.streamId))
  return h(Fragment, null, h('span', { ref: anchor, hidden: true, 'data-bt-room-stream-anchor': sessionId }),
    host && room ? createPortal(h('div', { className: 'bt-group-replies' }, visible.map(stream => h(GroupMessage, {
      key: stream.streamId, bot: replyIdentity(stream, roster), text: stream.text, room, roster, actions, useUi,
      streaming: stream.status === 'active',
    }))), host) : null)
}
