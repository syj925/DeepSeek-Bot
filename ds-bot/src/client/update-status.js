import { whenText } from './time-text.js'
import { hostText, t } from './i18n.js'

export function installedUpdateText(update) {
  const params = { version: update.installed ?? update.latest }
  if (update.application === 'applied') return t('DS Bot {version} has been applied.', params)
  return update.source === 'hosted'
    ? t('DS Bot {version} is installed. Quit and reopen QibitAI Desktop to use it.', params)
    : t('Restart DSH to start using DS Bot {version}.', params)
}

export function botUpdateHint(update) {
  if (update.phase === 'installing') return t('Updating DS Bot…')
  if (update.phase === 'installed') return installedUpdateText(update)
  if (update.phase === 'failed') return t('The update did not finish: {reason}', { reason: hostText(update.error ?? '') })
  if (update.phase === 'cancelled') return t('Update cancelled.')
  if (update.checkError) return t('Could not check for updates: {reason}', { reason: hostText(update.checkError) })
  if (update.available) return t('DS Bot {version} is available', { version: update.latest })
  if (update.enabled === false) return t('Update checks are off.')
  if (update.source === 'path') return t('Installed from a local folder; update it there.')
  if (update.unavailableReason) return hostText(update.unavailableReason)
  if (!update.checkedAt) return null
  if (!update.latest && !['registry', 'hosted'].includes(update.source)) return t('Updates are not offered for this install.')
  const checked = t('Checked {time}', { time: whenText(update.checkedAt) })
  return `${update.latest ? t('Up to date') : t('Could not check for updates.')} · ${checked}`
}
