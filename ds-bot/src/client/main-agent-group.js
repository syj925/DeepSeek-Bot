import { createElement as h, useEffect, useRef, useState } from 'react'
import { BotAvatar } from './mark.js'
import { isMainOf } from './sources.js'
import { t } from './i18n.js'

export function MainAgentGroup({ members, roster, actions, onClose }) {
  const dialog = useRef(null)
  const pending = useRef(false)
  const created = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const bots = members.map(id => roster.byId[id]).filter(Boolean)
  const valid = bots.length === 2 && new Set(members).size === 2 && members.every(id => isMainOf(roster, id))
  useEffect(() => { dialog.current.showModal(); return () => dialog.current?.close() }, [])
  const close = () => { if (!pending.current) onClose() }
  const create = async () => {
    if (pending.current || !valid) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      created.current ??= await actions.createRoom(members, { mainOnly: true, admin: members[0], name: name.trim() })
      actions.openCanvasEntity(created.current.id)
      onClose()
    } catch (failure) { setError(failure?.message ?? String(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  return h('dialog', { ref: dialog, className: 'bt-main-group', 'aria-labelledby': 'bt-main-group-title', onCancel: event => { event.preventDefault(); close() } },
    h('div', { className: 'bt-main-group-avatars' }, bots.map(bot => h(BotAvatar, { key: bot.id, bot, main: true, size: 56 }))),
    h('h2', { id: 'bt-main-group-title' }, t('Create Main Agent group')),
    h('p', null, bots.map(bot => bot.name).join(' + ')),
    h('p', { className: 'bt-note' }, t('A new group conversation. Each Main Agent keeps its own children, chats and running tasks.')),
    h('label', { className: 'bt-field' }, h('span', { className: 'bt-field-label' }, t('Group name')),
      h('input', { className: 'bt-input', value: name, maxLength: 80, disabled: busy, placeholder: bots.map(bot => bot.name).join(' + '), onChange: event => setName(event.target.value) })),
    !valid ? h('p', { role: 'alert' }, t('Both members must still be Main Agents.')) : null,
    error ? h('p', { role: 'alert', className: 'bt-error' }, error) : null,
    h('div', { className: 'bt-actions' },
      h('button', { type: 'button', className: 'bt-soft', disabled: busy, onClick: close }, t('Cancel')),
      h('button', { type: 'button', className: 'bt-send', disabled: busy || !valid, onClick: create }, t(busy ? 'Creating…' : 'Create group chat'))))
}

export const MAIN_GROUP_CSS = `
.bt-main-group{border:1px solid var(--bt-line-2);border-radius:24px;padding:28px;width:min(440px,90vw);color:var(--bt-ink);background:var(--bt-card);box-shadow:0 24px 90px #0003}
.bt-main-group::backdrop{background:#10182855;backdrop-filter:blur(6px)}
.bt-main-group h2{font-size:21px;margin:20px 0 8px}.bt-main-group p{line-height:1.65}.bt-main-group .bt-field{margin:20px 0}.bt-main-group .bt-actions{justify-content:flex-end;gap:12px;margin-top:24px}
.bt-main-group-avatars{display:flex;gap:18px}.bt-canvas-window[data-drop-target=true]{outline:2px solid #658aff;border-radius:20px;background:#658aff22;box-shadow:0 0 24px #658aff33}
`
