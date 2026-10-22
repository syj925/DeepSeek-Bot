// Delivery cards belong to the host, but their preview gesture belongs to this
// embedded conversation. Native app menus and copy-path controls stay untouched.
export function openPresentedFile(event, sessionId, actions) {
  if (event.defaultPrevented || !actions.openConversationFile || !actions.isCanvasVisible?.()) return false
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target
  const button = target?.closest?.('button')
  const card = button?.closest('[data-presented-file]')
  if (!card || button !== card.firstElementChild || button.parentElement !== card) return false
  if (card.closest('.bt-canvas-session') !== event.currentTarget) return false
  const path = button.getAttribute('title')?.trim()
  if (!path) return false
  event.preventDefault()
  event.stopPropagation()
  actions.openConversationFile(sessionId, path)
  return true
}
