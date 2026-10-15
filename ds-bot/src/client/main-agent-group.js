import { createElement as h, useEffect, useRef, useState } from 'react'
import { BotAvatar } from './mark.js'
import { isMainOf } from './sources.js'
import { t } from './i18n.js'

export function MainAgentGroup({ members, roster, actions, onClose, target, onComplete }) {
  const dialog = useRef(null)
  const pending = useRef(false)
  const created = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState(target?.name ?? '')
  const bots = members.map(id => roster.byId[id]).filter(Boolean)
  const room = target?.kind === 'room' ? roster.roomsById[target.id] : null
  const adding = target?.kind === 'room'
  const staging = target?.kind === 'draft' && members.length < 2
  const additions = adding ? members.filter(id => !room?.members.includes(id)) : members
  const valid = bots.length === members.length && new Set(members).size === members.length && members.length >= (target ? 1 : 2) && members.every(id => isMainOf(roster, id)) &&
    (!adding || room?.mainOnly === true && additions.length > 0)
  useEffect(() => { dialog.current.showModal(); return () => dialog.current?.close() }, [])
  const close = () => { if (!pending.current) onClose() }
  const create = async () => {
    if (pending.current || !valid) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      if (adding) await actions.updateRoom(target.id, { add: additions })
      else if (!staging) created.current ??= await actions.createRoom(members, { mainOnly: true, admin: members[0], name: name.trim() })
      onComplete?.({ room: adding ? room : created.current, members, name: name.trim() })
      if (adding || created.current) actions.openCanvasEntity(adding ? room.id : created.current.id)
      onClose()
    } catch (failure) { setError(failure?.message ?? String(failure)) }
    finally { pending.current = false; setBusy(false) }
  }
  return h('dialog', { ref: dialog, className: 'bt-main-group', 'aria-labelledby': 'bt-main-group-title', onCancel: event => { event.preventDefault(); close() } },
    h('div', { className: 'bt-main-group-avatars' }, bots.map(bot => h(BotAvatar, { key: bot.id, bot, main: true, size: 56 }))),
    h('h2', { id: 'bt-main-group-title' }, t(adding ? 'Add Main Agents to group' : staging ? 'Add to empty group' : 'Create Main Agent group')),
    adding ? h('strong', null, room?.name ?? target.name) : null,
    h('p', null, bots.map(bot => bot.name).join(' + ')),
    h('p', { className: 'bt-note' }, t('A new group conversation. Each Main Agent keeps its own children, chats and running tasks.')),
    staging ? h('p', { className: 'bt-note' }, t('Add another Main Agent to start a group conversation.')) : null,
    adding ? null : h('label', { className: 'bt-field' }, h('span', { className: 'bt-field-label' }, t('Group name')),
      h('input', { className: 'bt-input', value: name, maxLength: 80, disabled: busy, placeholder: bots.map(bot => bot.name).join(' + '), onChange: event => setName(event.target.value) })),
    !valid ? h('p', { role: 'alert' }, t(adding && !additions.length ? 'These Main Agents are already in this group.' : 'Select available Main Agents to continue.')) : null,
    error ? h('p', { role: 'alert', className: 'bt-error' }, error) : null,
    h('div', { className: 'bt-actions' },
      h('button', { type: 'button', className: 'bt-soft', disabled: busy, onClick: close }, t('Cancel')),
      h('button', { type: 'button', className: 'bt-send', disabled: busy || !valid, onClick: create }, t(busy ? 'Saving…' : adding || staging ? 'Add to group' : 'Create group chat'))))
}

export const MAIN_GROUP_CSS = `
.bt-main-group{border:1px solid var(--bt-line-2);border-radius:24px;padding:28px;width:min(440px,90vw);color:var(--bt-ink);background:var(--bt-card);box-shadow:0 24px 90px #0003}
.bt-main-group::backdrop{background:#10182855;backdrop-filter:blur(6px)}
.bt-main-group h2{font-size:21px;margin:20px 0 8px}.bt-main-group p{line-height:1.65}.bt-main-group .bt-field{margin:20px 0}.bt-main-group .bt-actions{justify-content:flex-end;gap:12px;margin-top:24px}
.bt-main-group-avatars{display:flex;gap:18px}.bt-canvas-window[data-drop-target=true]{outline:2px solid #658aff;border-radius:20px;background:#658aff22;box-shadow:0 0 24px #658aff33}
.bt-main-group-avatars{flex-wrap:wrap;max-height:180px;overflow:auto}
.bt-canvas-group.bt-canvas-draft{z-index:1;display:flex;flex-direction:column;align-items:stretch;border-style:dashed;background:var(--bt-card);color:var(--bt-ink);transition:border-color .16s,box-shadow .16s}
.bt-canvas-draft[data-drop-target=true]{border:2px solid var(--bt-accent);box-shadow:0 0 0 5px color-mix(in srgb,var(--bt-accent) 15%,transparent)}
.bt-canvas-draft>p{margin:8px 16px;font-size:12px;line-height:1.5;color:var(--bt-muted);text-align:center}
.bt-canvas-draft>.bt-canvas-button{align-self:center}.bt-canvas-draft-members{display:flex;justify-content:center;gap:8px;min-height:40px;overflow:hidden;padding:6px 16px}
.bt-canvas-context{position:absolute;z-index:60;width:230px;padding:6px;border:1px solid var(--bt-line-2);border-radius:14px;background:var(--bt-card);color:var(--bt-ink);box-shadow:0 12px 40px #0003}
.bt-canvas-context .bt-canvas-button{display:flex;justify-content:flex-start;width:100%;min-height:36px;border:0;background:transparent;border-radius:8px}
.bt-canvas-context .bt-canvas-button:hover:not(:disabled){background:color-mix(in srgb,var(--bt-accent) 12%,transparent)}
@media(prefers-reduced-motion:reduce){.bt-canvas-group.bt-canvas-draft{transition:none}}
`
