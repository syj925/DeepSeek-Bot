// Browser pages belong to an employee and one conversation. Task labels are only
// presentation: they never grant access to another conversation's pages.
export function browserContext(value) {
  if (!value || typeof value.roomId !== 'string' || !value.roomId.trim()) return null
  return {
    roomId: value.roomId.trim().slice(0, 200),
    ...(typeof value.label === 'string' && value.label.trim() ? { label: value.label.trim().slice(0, 200) } : {}),
    ...(typeof value.taskId === 'string' && value.taskId.trim() ? { taskId: value.taskId.trim().slice(0, 200) } : {}),
  }
}

export const browserContextKey = value => browserContext(value)?.roomId ?? ''
export const sameBrowserContext = (left, right) => browserContextKey(left) === browserContextKey(right)
