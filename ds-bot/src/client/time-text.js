import { dateLocale } from './i18n.js'

export function whenText(time) {
  const date = new Date(time)
  const today = new Date().toDateString() === date.toDateString()
  const clock = date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  return today ? clock : `${date.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })} ${clock}`
}
