import { createElement as h, useEffect, useRef, useState } from 'react'
import { BotMark } from './mark.js'
import { CharacterGrid, avatarImage } from './bot-settings.js'
import { AGENT_AVATARS, AgentAvatarPreview } from './agent-avatar-preview.js'
import { DEFAULT_SHAPES, DEFAULT_COLORS } from './characters.js'
import { ChevronLeftIcon, CloseIcon } from './icons.js'
import { useEscape } from './overlay-hooks.js'
import { createPayload, freshBotName, startModel } from './bot-draft.js'
import { ModelMenu } from './model-menu.js'
import { hostText, t } from './i18n.js'
import { nameProblem } from '../shared/mentions.js'
import { assistantIdentityProblem } from '../shared/assistant-identity.js'

const pick = list => list[Math.floor(Math.random() * list.length)]
const randomLook = (avoid = {}) => {
  const shapes = DEFAULT_SHAPES.filter(shape => shape !== avoid.shape)
  const colors = DEFAULT_COLORS.filter(color => color !== avoid.color)
  return { shape: pick(shapes), color: pick(colors) }
}

// The new-Bot form: look first, then name and model. Nothing exists until Create.
// `inline` drops the pane's header for a form shown inside Settings.
export function CreateBot({ roster, actions, start, brief = '', onBack, canGoBack, onCreated, inline = false }) {
  const [look, setLook] = useState(() => randomLook())
  const [image, setImage] = useState(null)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentTrigger, setAgentTrigger] = useState(0)
  const [name, setName] = useState(start?.name ?? '')
  const [model, setModel] = useState(() => startModel(roster))
  const [effort, setEffort] = useState(undefined)
  const [teamId, setTeamId] = useState('')
  const [employment, setEmployment] = useState('long-term')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const frame = useRef(null)
  useEscape(onBack)
  // Inside Settings the form opens below other sections, so it scrolls itself into view.
  useEffect(() => { if (inline) frame.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [])
  const fallbackName = freshBotName(roster, t('New Bot'))
  const finalName = name.trim() || fallbackName
  const clash = roster.bots.some(bot => bot.name.toLowerCase() === finalName.toLowerCase())
  const problem = nameProblem(finalName) ?? assistantIdentityProblem({ name: finalName })
  const create = async () => {
    if (busy || clash || problem) return
    setError('')
    setBusy(true)
    try {
      let savedImage = image
      if (selectedAgent && employment !== 'temporary') {
        const response = await fetch(selectedAgent.poster, { cache: 'force-cache' })
        if (!response.ok) throw new Error(t('Could not load the character image. Choose it again or upload a photo.'))
        // Presets are WebP, but the static route may return a generic MIME type.
        const poster = new Blob([await response.blob()], { type: 'image/webp' })
        savedImage = await avatarImage(poster)
      }
      const bot = await actions.createBot({ ...createPayload({ name: finalName, look, image: savedImage, model, effort, brief }), teamId: teamId || null, employment, ...(employment === 'temporary' ? { avatar: null } : {}) })
      onCreated(bot)
    } catch (failure) {
      setError(failure?.message ?? String(failure))
      setBusy(false)
    }
  }
  const selectAgent = (agent) => {
    setSelectedAgent(agent)
    setImage(agent.poster)
    setAgentTrigger(prev => prev + 1)
  }
  const upload = (file) => {
    if (!file) return
    setError('')
    setSelectedAgent(null)
    avatarImage(file).then(setImage, failure => setError(failure?.message ?? String(failure)))
  }
  const previewLook = image ? { ...look, image } : look
  const card = h('div', { className: 'bt-create-card' },
    h('div', { className: 'bt-create-preview' },
      // Keep temporary role icons; permanent employees can preview the selected portrait.
      h('span', { key: employment === 'temporary' ? 'temporary' : selectedAgent ? `${selectedAgent.id}:${agentTrigger}` : `${look.shape}:${look.color}:${image ? 'photo' : ''}`, className: 'bt-create-pop' },
        employment !== 'temporary' && selectedAgent
          ? h(AgentAvatarPreview, { agent: selectedAgent, size: 88, triggerKey: agentTrigger, onReplay: () => setAgentTrigger(prev => prev + 1) })
          : h(BotMark, { look: employment === 'temporary' ? undefined : previewLook, bot: { id: 'new-bot', employment, name: finalName }, size: 88, live: true, gaze: true, pokeable: true })),
      h('span', { className: 'bt-create-name' }, finalName)),
    h('div', { className: 'bt-create-step' }, t('Look')),
    employment === 'temporary' ? h('p', { className: 'bt-note' }, t('Temporary employees start with a role icon.')) : h('div', { className: 'bt-create-looks' },
      h('div', { className: 'bt-create-presets', style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '10px' } },
        AGENT_AVATARS.map((agent, idx) => {
          const isSelected = selectedAgent?.id === agent.id
          return h('button', {
            key: agent.id || idx,
            type: 'button',
            className: `bt-create-preset-btn${isSelected ? ' is-selected' : ''}`,
            title: agent.name,
            'aria-label': agent.name,
            style: {
              position: 'relative',
              boxSizing: 'border-box',
              border: isSelected ? '2px solid var(--bt-accent, #3b82f6)' : '1px solid var(--bt-line-2, #e5e7eb)',
              borderRadius: '10px',
              padding: 0,
              background: 'var(--bt-card, #ffffff)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              aspectRatio: '1',
              outline: 'none',
              overflow: 'hidden',
              boxShadow: isSelected ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
              transition: 'transform .1s ease, border-color .15s ease, box-shadow .15s ease',
            },
            onClick: () => selectAgent(agent),
          },
            h('img', {
              src: agent.poster,
              alt: agent.name,
              style: {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center top',
                display: 'block',
                pointerEvents: 'none',
              },
            })
          )
        })),
      h(CharacterGrid, {
        look, hasPhoto: Boolean(image),
        onShape: (shape) => { setImage(null); setSelectedAgent(null); setLook(current => ({ ...current, shape })) },
        onColor: (color) => { setImage(null); setSelectedAgent(null); setLook(current => ({ ...current, color })) },
      }),
      h('div', { className: 'bt-actions bt-create-lookbar' },
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => { setImage(null); setSelectedAgent(null); setLook(current => randomLook(current)) } }, t('Shuffle')),
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => fileRef.current?.click() }, image ? t('Replace photo') : t('Upload photo')),
        image ? h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => { setImage(null); setSelectedAgent(null) } }, t('Remove photo')) : null,
        h('input', { ref: fileRef, type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onChange: (event) => { const file = event.target.files?.[0]; event.target.value = ''; upload(file) } }))),
    h('label', { className: 'bt-field' },
      h('span', { className: 'bt-field-label' }, t('Name')),
      h('input', {
        className: 'bt-input', autoFocus: !inline, value: name, placeholder: fallbackName, maxLength: 40, 'aria-label': t('Name'),
        onChange: event => setName(event.target.value),
        onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void create() } },
      }),
      problem ? h('span', { className: 'bt-note bt-danger' }, hostText(problem))
        : clash ? h('span', { className: 'bt-note bt-danger' }, t('A Bot named {name} already exists', { name: finalName })) : null),
    h('div', { className: 'bt-field' },
      h('span', { className: 'bt-field-label' }, t('Model')),
      h(ModelMenu, { bot: { id: 'new-bot', name: finalName, model: model || undefined, effort }, roster, actions, wide: true, onPick: ref => { setModel(ref); setEffort(undefined) }, onPickEffort: setEffort }),
      h('span', { className: 'bt-note' }, (roster.models ?? []).length > 0
        ? t('The Bot runs on this model. You can change it later in its details.')
        : t('Add a provider and a model in DeepSeek Harness first, or pick one in the Bot\'s chat later.'))),
    h('label', { className: 'bt-field' }, h('span', { className: 'bt-field-label' }, t('Team membership')),
      h('select', { className: 'bt-input', value: teamId, disabled: employment === 'temporary', onChange: event => setTeamId(event.target.value) },
        h('option', { value: '' }, t('Independent employee')),
        (roster.teams ?? []).map(team => h('option', { key: team.id, value: team.id }, team.name))),
      h('span', { className: 'bt-note' }, t('Optional. Groups do not change team membership.'))),
    h('label', { className: 'bt-field' }, h('span', { className: 'bt-field-label' }, t('Employee duration')),
      h('select', { className: 'bt-input', value: employment, onChange: event => { setEmployment(event.target.value); if (event.target.value === 'temporary') setTeamId('') } },
        h('option', { value: 'long-term' }, t('Long-term employee')),
        h('option', { value: 'temporary' }, t('Temporary employee'))),
      h('span', { className: 'bt-note' }, employment === 'temporary' ? t('Removed from the active roster after its task.') : t('Keeps a compact experience summary for future tasks.'))),
    error ? h('div', { className: 'bt-error', role: 'alert', style: { padding: 0 } }, error) : null,
    h('div', { className: 'bt-create-foot' },
      h('button', { type: 'button', className: 'bt-soft', onClick: onBack }, canGoBack ? t('Back') : t('Cancel')),
      h('button', { type: 'button', className: 'bt-send bt-create-go', disabled: busy || clash || Boolean(problem), onClick: () => void create() }, busy ? t('Creating…') : t('Create'))))
  if (inline) return h('div', { ref: frame, className: 'bt-create-inline', role: 'group', 'aria-label': t('Create Bot') }, card)
  return h('div', { className: 'bt-create', role: 'dialog', 'aria-label': t('Create Bot') },
    h('div', { className: 'bt-create-head' },
      canGoBack ? h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': t('Back to new chat'), onClick: onBack }, h(ChevronLeftIcon)) : h('span', { className: 'bt-create-gap' }),
      h('span', { className: 'bt-create-title' }, t('Create Bot')),
      h('button', { type: 'button', className: 'bt-icon-btn', 'aria-label': t('Close'), onClick: () => actions.closeOverlay() }, h(CloseIcon))),
    h('div', { className: 'bt-create-body' }, card))
}
