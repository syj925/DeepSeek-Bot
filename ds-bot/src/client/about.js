import { createElement as h, useState } from 'react'
import { hostText, t } from './i18n.js'
import { QIBITAI_LOGO } from './qibitai-brand.js'

const linkProps = href => ({ className: 'bt-soft bt-soft-sm bt-about-link', href, target: '_blank', rel: 'noopener noreferrer' })

export function AboutPage({ useUpdate, actions, run, Section, Row }) {
  const update = useUpdate(value => value) ?? {}
  const [checking, setChecking] = useState(false)
  const local = update.source === 'path'
  const phase = update.phase ?? 'idle'
  const check = () => {
    setChecking(true)
    void run(actions.checkUpdate()).finally(() => setChecking(false))
  }
  const hint = local ? t('This build is installed locally. Install the latest QibitAI package to update it.')
    : phase === 'failed' ? hostText(update.error ?? '')
      : phase === 'installed' ? t('Update installed. Restart QibitAI to apply it.')
        : update.available ? t('A component update is available: {version}', { version: update.latest })
          : t('Component updates are separate from desktop app updates.')
  const control = local || phase === 'installed' ? null
    : update.available || phase === 'installing'
      ? h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: phase === 'installing', onClick: () => run(actions.installUpdate()) }, t(phase === 'installing' ? 'Updating…' : 'Update'))
      : h('button', { type: 'button', className: 'bt-soft bt-soft-sm', disabled: checking || update.enabled === false, onClick: check }, t(checking ? 'Checking…' : 'Check for updates'))
  return [
    h('div', { key: 'hero', className: 'bt-about-hero' },
      h('img', { src: QIBITAI_LOGO, alt: 'QibitAI', width: 60, height: 60 }),
      h('div', { className: 'bt-about-copy' }, h('strong', { className: 'bt-about-name' }, 'QibitAI'),
        h('span', { className: 'bt-about-description' }, t('Your AI team, in one workspace.')),
        update.current ? h('span', { className: 'bt-about-version' }, t('Canvas component {version}', { version: update.current })) : null)),
    h(Section, { key: 'update', title: t('Version and updates') }, h(Row, { label: t('Canvas component'), hint }, control)),
    h(Section, { key: 'help', title: t('Need help?') },
      h(Row, { label: t('Feedback and support'), hint: t('Describe a problem or suggestion, and export diagnostic information if needed.') },
        h('button', { type: 'button', className: 'bt-soft bt-soft-sm', onClick: () => actions.openSettings('feedback') }, t('Open'))),
      h(Row, { label: t('Release notes'), hint: t('Browse the QibitAI project releases.') }, h('a', linkProps('https://github.com/syj925/DeepSeek-Bot/releases'), t('Open')))),

  ]
}

export const ABOUT_CSS = `
.bt-about-hero{display:flex;align-items:center;gap:18px;padding:26px 22px;border:1px solid var(--bt-line);border-radius:18px;background:linear-gradient(135deg,var(--bt-card),color-mix(in srgb,#4054f4 5%,var(--bt-card)))}
.bt-about-hero>img{flex:none;border-radius:15px;box-shadow:0 8px 22px #4054f422}
.bt-about-copy{min-width:0;display:flex;flex-direction:column;gap:6px}
.bt-about-name{font-size:24px;line-height:30px;letter-spacing:-.6px}
.bt-about-description{font-size:13px;color:var(--bt-ink-2)}
.bt-about-version{font-size:11px;line-height:18px;color:var(--bt-ink-3)}
.bt-about-link{display:inline-flex;align-items:center;gap:6px;text-decoration:none;white-space:nowrap}
.bt-settings-brand{display:flex;align-items:center;gap:9px;padding:5px 10px 22px;font-size:16px;letter-spacing:-.3px}
.bt-settings-nav{overflow-y:auto}
.bt-settings-advanced-nav{margin-top:auto;padding-top:24px;position:relative;z-index:1}
.bt-settings-advanced-nav>summary{display:flex;align-items:center;gap:8px;padding:8px;color:var(--bt-ink-3);font-size:12px;cursor:pointer;list-style:none}
.bt-settings-advanced-nav>summary::-webkit-details-marker{display:none}
.bt-settings-advanced-nav>summary:after{content:'⌄';margin-left:auto}
.bt-settings-advanced-nav[open]>summary:after{content:'⌃'}
.bt-settings-advanced-nav .bt-settings-item{width:100%;font-size:12px}
.bt-settings-tabs{display:flex;align-self:flex-start;gap:3px;padding:4px;border-radius:11px;background:var(--bt-hover)}
.bt-settings-tabs>button{padding:6px 14px;border:0;border-radius:8px;background:transparent;color:var(--bt-ink-2);font:inherit;font-size:12px;cursor:pointer}
.bt-settings-tabs>button[aria-pressed=true]{background:var(--bt-card);color:var(--bt-ink);box-shadow:0 1px 4px #0000000a}
.bt-settings-overview{display:flex;flex-direction:column;gap:20px}
.bt-settings-intro{margin:0;color:var(--bt-ink-2);font-size:13px;line-height:1.8}
.bt-settings-advanced-card{padding:16px;border:1px solid var(--bt-line);border-radius:12px;color:var(--bt-ink-2)}
.bt-settings-advanced-card>summary{font-size:12px;cursor:pointer;color:var(--bt-ink)}
.bt-settings-advanced-card>p{font-size:12px;line-height:1.8;margin:14px 0}
`
