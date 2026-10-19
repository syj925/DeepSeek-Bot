import { createElement as h, useEffect, useRef, useState } from 'react'
import { fnv1a, lookOf, shapeId, shapeOf, MASK_ID, nextMarkSerial, characterMarkup } from './characters.js'
import { getLetterAvatarProps } from './avatar-colors.js'
import { t } from './i18n.js'
import { employeeIcon } from '../shared/employee-avatar.js'
import { EmployeeIcon } from './employee-icon.js'

export { colorOf, lookOf } from './characters.js'
export { getAvatarBgColor, getAvatarTheme, getLetterAvatarProps, AVATAR_BG_COLORS, getContrastTextColor } from './avatar-colors.js'

export function LetterAvatar(props) {
  const { text, ...domProps } = getLetterAvatarProps(props)
  domProps.style = { ...domProps.style, backgroundColor: 'transparent' }
  return h('span', domProps, text)
}

// -------------------------------------------------------------------------
// Bot mark: the Bot's character (or its uploaded photo), looked up by lookOf.

// Mascot states: what the Bot is doing picks the
// motion. Uploaded images only bob or hop, since they have no parts to move.
const STATES = ['idle', 'thinking', 'searching', 'working', 'sending', 'orbit', 'alert', 'done']
export const botState = (running, activity, alert) => (running ? (STATES.includes(activity) ? activity : 'working') : alert ? 'alert' : 'idle')
export const toolState = name => (/^(message_bot|stop_bot|create_bot|update_bot|create_group|update_group|delete_group|post_to_group)$/.test(name) ? 'sending'
  : /search|fetch|browse|read|grep|glob|list|recall/i.test(name) ? 'searching' : 'working')

// Eyes follow the pointer on large marks.
function useGaze(ref, enabled) {
  useEffect(() => {
    if (!enabled) return undefined
    let frame = 0
    let point = null
    const place = () => {
      frame = 0
      const node = ref.current
      if (!node || !point) return
      const box = node.getBoundingClientRect()
      const clamp = value => Math.max(-1, Math.min(1, value))
      node.style.setProperty('--bt-gx', clamp((point.x - box.left - box.width / 2) / 160).toFixed(2))
      node.style.setProperty('--bt-gy', clamp((point.y - box.top - box.height / 2) / 160).toFixed(2))
    }
    const onMove = (event) => { point = { x: event.clientX, y: event.clientY }; if (!frame) frame = requestAnimationFrame(place) }
    const onLeave = () => { point = null; ref.current?.style.setProperty('--bt-gx', '0'); ref.current?.style.setProperty('--bt-gy', '0') }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [enabled])
}

// A mark moves for its state. `live` marks (sidebar, header, details) also answer the
// pointer, and at the lively motion level blink and fidget at rest (each Bot its own
// fidget and moment); transcript marks stay still so a long chat does not run dozens
// of animations.
const FIDGETS = ['hop', 'sway', 'stretch', 'look']
export function BotMark({ bot, look: given, size = 36, state = 'idle', live = false, gaze = false, pokeable = false, label }) {
  const look = given ?? lookOf(bot)
  const icon = !given && employeeIcon(bot)
  const ref = useRef(null)
  const maskId = useRef('')
  if (maskId.current === '') maskId.current = `bt-mark-${nextMarkSerial()}`
  const [poked, setPoked] = useState(false)
  useGaze(ref, gaze)
  const common = {
    ref,
    className: poked ? 'bt-mark bt-mark-poke' : 'bt-mark',
    'data-shape': icon ? 'role-icon' : look.image ? 'image' : shapeId(look.shape),
    'data-state': STATES.includes(state) ? state : 'idle',
    'data-live': live ? '' : undefined,
    'data-fidget': live ? FIDGETS[fnv1a(`${bot?.id ?? ''}:fidget`) % FIDGETS.length] : undefined,
    'data-gaze': gaze ? '' : undefined,
    'data-poke': pokeable ? '' : undefined,
    style: { width: size, height: size, ...(live ? { '--bt-delay': `${-(fnv1a(String(bot?.id ?? '')) % 5000) / 1000}s`, '--bt-fidget-delay': `${-(fnv1a(`${bot?.id ?? ''}:when`) % 9000) / 1000}s` } : {}) },
    role: label ? 'img' : undefined,
    'aria-label': label,
    'aria-hidden': label ? undefined : true,
    onClick: pokeable ? () => setPoked(true) : undefined,
    onAnimationEnd: poked ? (event) => { if (/^bt-poke/.test(event.animationName)) setPoked(false) } : undefined,
  }
  if (icon) return h('span', { ...common, title: bot?.employment === 'temporary' ? t('Temporary employee') : undefined }, h(EmployeeIcon, { icon }))
  if (look.image) return h('span', common, h('img', { className: 'bt-mark-img', src: look.image, alt: '', draggable: false }))
  const box = shapeOf(look.shape).size
  return h('span', common, h('svg', { viewBox: `0 0 ${box} ${box}`, dangerouslySetInnerHTML: { __html: characterMarkup(look.shape, look.color).replaceAll(MASK_ID, maskId.current) } }))
}

function StarIcon({ size = 8 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 10 10', 'aria-hidden': true },
    h('path', { d: 'M5 .6l1.3 2.8 3 .3-2.3 2 .7 3L5 7.2 2.3 8.7l.7-3L.7 3.7l3-.3z', fill: '#fff' }))
}
// The small star in a disc that marks a group admin, beside a name.
export function AdminStar() {
  return h('span', { className: 'bt-admin-star', role: 'img', 'aria-label': t('Admin') }, h(StarIcon, { size: 7 }))
}
// A Main Bot wears a large solid star; a group admin wears the small star in a disc.
function MainStar() {
  return h('svg', { viewBox: '0 0 20 20', 'aria-hidden': true },
    h('path', { d: 'M10 2.4l2.29 5.04 5.51.63-4.09 3.74 1.11 5.42L10 14.5l-4.82 2.73 1.11-5.42L2.2 8.07l5.51-.63z' }))
}

// Marks settle with a short squash when a run finishes.
function useSettled(state) {
  const prev = useRef(state)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const was = prev.current
    prev.current = state
    if (state !== 'idle') { setSettled(false); return undefined }
    if (was === 'idle' || was === 'alert') return undefined
    setSettled(true)
    const timer = setTimeout(() => setSettled(false), 1800)
    return () => clearTimeout(timer)
  }, [state])
  return settled
}

export function BotAvatar({ bot, size, state = 'idle', main, admin, badge = true, live = true, gaze = false, pokeable = false }) {
  const settled = useSettled(state)
  if (bot === undefined) return h(BotMark, { size })
  const badgeKind = !badge ? null : state === 'alert' ? 'alert' : state !== 'idle' ? 'working' : admin ? 'admin' : main ? 'main' : null
  return h('span', { className: 'bt-mark', style: { width: size, height: size, '--bt-size': `${size}px`, backgroundColor: 'transparent' } },
    h(BotMark, { bot, size, state: settled ? 'done' : state, live, gaze, pokeable }),
    badgeKind === 'working' ? h('span', { className: 'bt-badge bt-badge-working', 'aria-label': t('Working'), role: 'img' }) : null,
    badgeKind === 'alert' ? h('span', { className: 'bt-badge bt-badge-alert', 'aria-label': t('Waiting for your answer'), role: 'img' }, '?') : null,
    badgeKind === 'admin' ? h('span', { className: 'bt-badge bt-badge-admin', 'aria-label': t('Admin'), role: 'img' }, h(StarIcon)) : null,
    badgeKind === 'main' ? h('span', { className: 'bt-badge bt-badge-main', 'aria-label': t('Main Bot'), role: 'img' }, h(MainStar)) : null)
}

// Normalized seats leave room for the frame and each portrait's white rim.
const CLUSTER_LAYOUTS = {
  3: [[0.35, 0.32, 0.48], [0.73, 0.41, 0.35], [0.52, 0.75, 0.39]],
  4: [[0.31, 0.32, 0.45], [0.73, 0.26, 0.31], [0.72, 0.70, 0.42], [0.29, 0.77, 0.28]],
  5: [[0.29, 0.28, 0.38], [0.70, 0.25, 0.31], [0.52, 0.55, 0.39], [0.24, 0.78, 0.28], [0.78, 0.76, 0.29]],
  6: [[0.28, 0.28, 0.40], [0.72, 0.24, 0.27], [0.55, 0.56, 0.33], [0.23, 0.74, 0.25], [0.80, 0.59, 0.22], [0.60, 0.82, 0.20]],
  9: [[0.49, 0.18, 0.23], [0.73, 0.26, 0.25], [0.82, 0.49, 0.22], [0.73, 0.74, 0.24], [0.51, 0.82, 0.22], [0.26, 0.74, 0.23], [0.18, 0.52, 0.22], [0.26, 0.26, 0.24], [0.49, 0.50, 0.32]],
}

function clusterSeats(count, frame, seed = '') {
  if (count <= 1) {
    const s = Math.round(frame * 0.8)
    const p = Math.round((frame - s) / 2)
    return [[p, p, s]]
  }
  if (count === 2) {
    const s = Math.round(frame * 0.55)
    const offset = Math.round(frame * 0.06)
    return [[offset, offset, s], [frame - s - offset, frame - s - offset, s]]
  }
  const hash = fnv1a(seed)
  const random = (index, channel) => fnv1a(`${seed}:${index}:${channel}`) / 4294967295
  const layout = CLUSTER_LAYOUTS[count] ?? [
    ...Array.from({ length: count - 1 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / (count - 1)
      return [0.5 + Math.cos(angle) * 0.32, 0.5 + Math.sin(angle) * 0.32, 0.24 + (index % 3) * 0.015]
    }),
    [0.5, 0.5, count === 7 ? 0.38 : count === 8 ? 0.35 : 0.32],
  ]
  // Seeded variation keeps a group's composition steady across renders and sizes.
  return layout.map(([cx, cy, diameter], index) => {
    const s = diameter * (0.96 + random(index, 'size') * 0.08)
    const x = ((hash & 1) ? 1 - cx : cx) + (random(index, 'x') - 0.5) * 0.02
    const y = ((hash & 2) ? 1 - cy : cy) + (random(index, 'y') - 0.5) * 0.02
    const inset = 0.06
    const left = Math.max(inset, Math.min(1 - inset - s, x - s / 2))
    const top = Math.max(inset, Math.min(1 - inset - s, y - s / 2))
    return [left * frame, top * frame, s * frame]
  })
}

export function RoomAvatar({ room, roster, size = 36 }) {
  const members = room.members.map(id => roster.byId[id] ?? roster.retiredById?.[id]).filter(Boolean)
  // A group with one Bot left shows the user beside it.
  const people = members.length === 1 ? [members[0], null] : members
  const seat = (bot, seatSize, key) => (bot
    ? h(BotMark, { key, bot, size: seatSize })
    : h('span', { key, className: 'bt-cluster-you', style: { width: seatSize, height: seatSize } }))
  if (people.length === 0) return h(BotMark, { size })
  // Inline sizes have no room for a cluster, so the members line up instead.
  if (size <= 20 && people.length > 1) {
    return h('span', { className: 'bt-stack', style: { '--bt-stack-size': `${size}px` } },
      people.slice(0, 3).map((bot, index) => seat(bot, size, bot?.id ?? `you-${index}`)),
      people.length > 3 ? h('span', { className: 'bt-stack-more' }, `+${people.length - 3}`) : null)
  }
  const count = Math.min(people.length, 9)
  const seed = `${room.id ?? ''}:${people.map(bot => bot?.id ?? 'you').join(':')}`
  const seats = clusterSeats(count, size, seed)
  const overflow = people.length > 9 ? people.length - 8 : 0

  return h('span', { className: 'bt-cluster bt-room-cluster', style: { width: size, height: size, containerType: 'inline-size' } },
    seats.map(([x, y, s], index) => {
      const style = { position: 'absolute', left: `${x / size * 100}%`, top: `${y / size * 100}%`, width: `${s / size * 100}%`, height: `${s / size * 100}%`, zIndex: index + 1 }
      if (overflow > 0 && index === seats.length - 1) {
        return h('span', { key: 'more', className: 'bt-cluster-seat bt-cluster-more', style: { ...style, fontSize: `clamp(6px, ${Math.round(s / size * 52)}cqw, 18px)` } }, `+${overflow}`)
      }
      const bot = people[index]
      return h('span', { key: bot?.id ?? `you-${index}`, className: 'bt-cluster-seat', style }, seat(bot, s))
    }))
}

