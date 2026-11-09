import { createElement as h, useEffect, useRef, useState } from 'react'
import { hostText, t } from './i18n.js'
import { BotAvatar } from './mark.js'

export function experienceEmployees(sessionId, roster) {
  const room = roster.roomsById?.[sessionId]
  const bot = roster.byId?.[sessionId]
  return (room ? [...new Set(room.members ?? [])].map(id => roster.byId?.[id]) : [bot]).filter(bot => bot && !bot.retiredAt && bot.employment !== 'temporary')
}

export function experienceSourceLabel(source) {
  if (source?.kind === 'manual') return t('Manually added')
  if (source?.kind === 'task') return source.title
    ? t('Source: {task} · {author}', { author: source.author, task: source.title })
    : t('Original task unavailable')
  if (source?.kind === 'conversation') return t('Source: conversation {part} · #{seq}', { part: source.part, seq: source.seq })
  return t('Source not recorded')
}

function ExperienceSource({ entry, open }) {
  const source = entry.provenance
  const label = experienceSourceLabel(source)
  const details = source?.kind === 'task' || source?.targetId
  return details ? h('details', { className: 'bt-job-experience-source' },
    h('summary', null, label),
    source.kind === 'task' ? h('p', null, source.summary || t('The original task summary was not retained.')) : null,
    source.edited ? h('small', null, t('Edited by you; original source retained.')) : null,
    source.targetId && open ? h('button', { type: 'button', onClick: () => open(source.targetId) }, t('Open source conversation')) : null)
    : h('div', { className: 'bt-job-experience-source' }, label)
}

function ExperienceRow({ entry, edit, remove, disabled, open }) {
  const [expanded, setExpanded] = useState(false), [confirming, setConfirming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false), menu = useRef(null)
  useEffect(() => {
    if (!menuOpen) return undefined
    const outside = event => { if (!menu.current?.contains(event.target)) setMenuOpen(false) }
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); menu.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true) }
  }, [menuOpen])
  return h('article', { className: 'bt-job-experience-entry' },
    h('p', { className: expanded ? '' : 'bt-job-experience-short' }, entry.text),
    h(ExperienceSource, { entry, open }),
    h('div', { className: 'bt-job-experience-meta' },
      h('small', null, entry.edited || entry.added || ''),
      h('div', null,
        entry.text.length > 90 ? h('button', { type: 'button', onClick: () => setExpanded(value => !value) }, t(expanded ? 'Collapse' : 'Expand')) : null,
        h('button', { type: 'button', disabled, className: 'bt-job-experience-icon', title: t('Edit experience'), 'aria-label': t('Edit experience'), onClick: () => edit(entry) },
          h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true }, h('path', { d: 'm10 3 3 3M3 10l7.5-7.5a1.4 1.4 0 0 1 2 2L5 12l-3 1zM8 13h6' }))),
        h('div', { ref: menu, className: 'bt-job-experience-menu' },
          h('button', { type: 'button', disabled, className: 'bt-job-experience-icon', title: t('More experience options'), 'aria-label': t('More experience options'), 'aria-expanded': menuOpen,
            onClick: () => setMenuOpen(value => !value) },
            h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'currentColor', 'aria-hidden': true },
              ...[3, 8, 13].map(cx => h('circle', { key: cx, cx, cy: 8, r: 1.2 })))),
          menuOpen ? h('div', { className: 'bt-job-experience-menu-items' },
            h('button', { type: 'button', disabled, onClick: () => { setMenuOpen(false); setConfirming(true) } }, t('Remove'))) : null))),
    confirming ? h('div', { className: 'bt-job-experience-remove' },
      h('span', null, t('Remove this experience from future work?')),
      h('button', { type: 'button', disabled, onClick: () => remove(entry) }, t('Confirm removal')),
      h('button', { type: 'button', disabled, onClick: () => setConfirming(false) }, t('Cancel'))) : null)
}

export function EmployeeExperience({ bot, actions, active, open }) {
  const [view, setView] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState(null), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false)
  const mounted = useRef(true), request = useRef(0), pending = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++ } }, [])
  const refresh = async () => {
    const ticket = ++request.current
    setLoading(true)
    try {
      const next = await actions.jobExperienceView(bot.id)
      if (mounted.current && ticket === request.current) { setView(next); setError('') }
    } catch (failure) { if (mounted.current && ticket === request.current) setError(hostText(failure?.message ?? String(failure))) }
    finally { if (mounted.current && ticket === request.current) setLoading(false) }
  }
  useEffect(() => {
    if (!active || editor || busy) return undefined
    void refresh()
    const timer = setInterval(() => void refresh(), 15000)
    return () => { clearInterval(timer); request.current++ }
  }, [active, Boolean(editor), busy, bot.id, actions.jobExperienceView])
  const change = async payload => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setSaved(false)
    try {
      const next = await actions.jobExperienceSave({ botId: bot.id, ...payload })
      if (mounted.current) { request.current++; setView(next); setEditor(null); setSaved(true) }
    } catch (failure) { if (mounted.current) setError(hostText(failure?.message ?? String(failure))) }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const edit = entry => { setSaved(false); setError(''); setEditor({ action: 'edit', entryId: entry.id, revision: view.revision, text: entry.text }) }
  return h('div', { className: 'bt-job-experience', 'aria-busy': busy || loading },
    loading && !view ? h('p', { role: 'status' }, t('Loading…')) : null,
    view && !view.entries.length && !editor ? h('p', { className: 'bt-task-panel-empty' }, t('No job experience saved yet.')) : null,
    view?.entries.map(entry => h(ExperienceRow, { key: entry.id, entry, edit, open, disabled: busy || Boolean(editor),
      remove: entry => change({ action: 'remove', entryId: entry.id, revision: view.revision }) })),
    editor ? h('form', { className: 'bt-job-experience-editor', onSubmit: event => { event.preventDefault(); if (editor.text.trim()) void change(editor) } },
      h('label', null, t('Experience content'), h('textarea', { autoFocus: true, rows: 4, value: editor.text, maxLength: view?.limit ?? 300, disabled: busy,
        onChange: event => setEditor(value => ({ ...value, text: event.target.value })) })),
      h('small', null, `${editor.text.length} / ${view?.limit ?? 300}`),
      h('div', { className: 'bt-work-task-actions' },
        h('button', { type: 'submit', disabled: busy || !editor.text.trim() }, t('Save experience')),
        h('button', { type: 'button', disabled: busy, onClick: () => { setEditor(null); setError('') } }, t('Cancel'))))
      : view ? h('button', { type: 'button', disabled: busy, className: 'bt-job-experience-add', onClick: () => { setSaved(false); setEditor({ action: 'add', revision: view.revision, text: '' }) } },
        h('span', { 'aria-hidden': true }, '+'), t('Add experience')) : null,
    error ? h('div', { className: 'bt-job-experience-error', role: 'alert' }, error,
      !editor ? h('button', { type: 'button', disabled: busy || loading, onClick: refresh }, t('Retry')) : null) : null,
    saved ? h('small', { className: 'bt-job-experience-saved', role: 'status' }, t('Experience saved')) : null)
}

function MemberExperience({ bot, actions, active, open }) {
  const [expanded, setExpanded] = useState(false)
  return h('details', { className: 'bt-job-experience-member', onToggle: event => setExpanded(event.currentTarget.open) },
    h('summary', null, h(BotAvatar, { bot, size: 22 }), h('span', null, bot.name), h('span', { className: 'bt-job-experience-chevron', 'aria-hidden': true }, '⌄')),
    h(EmployeeExperience, { bot, actions, open, active: active && expanded }))
}

export function JobExperience({ sessionId, roster, actions, active, open }) {
  const bots = experienceEmployees(sessionId, roster)
  if (roster.memory === false) return h('p', { className: 'bt-task-panel-empty' }, t('Job experience is unavailable while employee memory is off.'))
  if (roster.byId?.[sessionId]?.employment === 'temporary') return h('p', { className: 'bt-task-panel-empty' }, t('Temporary employees do not keep lasting job experience.'))
  if (!bots.length) return h('p', { className: 'bt-task-panel-empty' }, t('No available employee in this conversation.'))
  if (roster.roomsById?.[sessionId]) return h('div', { className: 'bt-job-experience-members' },
    bots.map(bot => h(MemberExperience, { key: bot.id, bot, actions, active, open })))
  return h(EmployeeExperience, { key: bots[0].id, bot: bots[0], actions, active, open })
}

export const JOB_EXPERIENCE_CSS = `
.bt-job-experience .bt-job-experience-meta{min-height:28px;gap:8px}.bt-job-experience-meta>small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bt-job-experience-meta>div{flex:none;justify-content:flex-end;gap:4px}.bt-job-experience .bt-job-experience-meta .bt-job-experience-icon{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:28px;max-width:28px;width:28px;height:28px;flex:0 0 28px;padding:0;line-height:1;letter-spacing:normal}.bt-job-experience-icon>svg{display:block;flex:none;transform:none}.bt-job-experience-menu{flex:none}
.bt-job-experience-source{margin:0 0 5px;color:#8796a8;font-size:10px;line-height:1.65;overflow-wrap:anywhere}.bt-job-experience-source>summary{cursor:pointer;list-style:none}.bt-job-experience-source>summary::-webkit-details-marker{display:none}.bt-job-experience-source>summary:hover{color:#187761}.bt-job-experience-source>summary:after{content:'⌄';margin-left:4px}.bt-job-experience-source[open]>summary:after{content:'⌃'}.bt-job-experience-entry .bt-job-experience-source p{font-size:11px;margin:7px 0;padding-left:8px;border-left:2px solid #dce6e9;color:#64748b}.bt-job-experience-source>small{display:block}.bt-job-experience-source>button{font-size:10px}
.bt-job-experience-entry{padding:12px 0;border-bottom:1px solid #edf0f3}.bt-job-experience-entry:first-child{padding-top:2px}.bt-job-experience-entry p{margin:0 0 8px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;color:#334155}.bt-job-experience-short{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.bt-job-experience-meta{display:flex;gap:6px;align-items:center;justify-content:space-between}.bt-job-experience-meta small{color:#9aa6b5;font-size:10px}.bt-job-experience button{border:0;border-radius:6px;background:transparent;color:#64748b;padding:4px 7px;font:inherit;cursor:pointer}.bt-job-experience button:hover{background:#edf3f6;color:#187761}.bt-job-experience button:disabled{opacity:.5;cursor:default}.bt-job-experience-meta>div{display:flex;align-items:center;gap:2px}.bt-job-experience .bt-job-experience-icon{display:grid;place-items:center;width:26px;height:26px;padding:0}.bt-job-experience .bt-job-experience-add{display:inline-flex;align-items:center;gap:5px;margin-top:8px;color:#187761;font-size:11px;padding:5px 0}.bt-job-experience-add>span{font-size:16px;font-weight:400}.bt-job-experience-menu{position:relative}.bt-job-experience-menu-items{position:absolute;z-index:3;right:0;bottom:29px;min-width:76px;padding:4px;border:1px solid #e8edf2;border-radius:8px;background:white;box-shadow:0 3px 12px #0f172a12}.bt-job-experience-menu-items>button{width:100%;text-align:start;color:#a84838}.bt-job-experience-editor{margin-top:10px;padding:10px;display:grid;gap:5px;border:1px solid #dce5e8;border-radius:10px;background:white}.bt-job-experience-editor label{display:grid;gap:6px;color:#64748b;font-size:11px}.bt-job-experience-editor textarea{box-sizing:border-box;width:100%;resize:vertical;min-height:90px;padding:8px;border:1px solid #edf0f3;border-radius:6px;font:12px/1.65 var(--bt-font-sans,system-ui);color:#334155;background:#fbfcfe}.bt-job-experience-editor small{color:#94a3b8;text-align:end;font-size:10px}.bt-job-experience-editor button[type=submit]{background:#187761;color:white;padding:5px 11px}.bt-job-experience-error{color:#b45309;margin-top:8px;overflow-wrap:anywhere}.bt-job-experience-error button{margin-left:6px}.bt-job-experience-saved{display:block;color:#187761;margin-top:8px}.bt-job-experience-remove{margin-top:7px;display:flex;flex-wrap:wrap;gap:5px}.bt-job-experience-remove>span{flex-basis:100%;color:#64748b}.bt-job-experience-member{border-bottom:1px solid #edf0f3;padding:8px 0}.bt-job-experience-member>summary{display:flex;gap:8px;align-items:center;cursor:pointer;list-style:none}.bt-job-experience-member>summary::-webkit-details-marker{display:none}.bt-job-experience-member>summary>span:nth-last-child(2){flex:1;min-width:0}.bt-job-experience-chevron{color:#94a3b8}.bt-job-experience-member[open]>summary{margin-bottom:10px}.bt-job-experience-member[open] .bt-job-experience-chevron{transform:rotate(180deg)}.bt-job-experience :is(button,textarea):focus-visible{outline:2px solid #187761;outline-offset:2px}
`
