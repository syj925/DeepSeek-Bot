export function roleIcon(bot) {
  const role = `${bot?.role ?? ''} ${bot?.name ?? ''}`
  if (/开发|工程|程序|技术|code|develop|engineer/i.test(role)) return 'code'
  if (/设计|美术|视觉|design|art/i.test(role)) return 'design'
  if (/财务|预算|会计|finance|account/i.test(role)) return 'finance'
  if (/分析|数据|运营|analyst|data|operat/i.test(role)) return 'chart'
  if (/研究|搜索|调研|research|search/i.test(role)) return 'search'
  if (/写|文案|编辑|报告|writer|editor/i.test(role)) return 'write'
  return 'work'
}

export function employeeIcon(bot) {
  if (bot?.avatar?.image) return undefined
  return bot?.avatar?.icon ?? (bot?.employment === 'temporary' ? roleIcon(bot) : undefined)
}

// Keep only lightweight identity in transcripts, never image bytes in model context.
export function temporaryIdentity(bot) {
  return bot?.employment === 'temporary' && !bot.avatar?.image
    ? { identity: { id: bot.id, name: bot.name, role: bot.role, color: bot.color, employment: 'temporary', avatar: { icon: employeeIcon(bot) } } }
    : {}
}

export function replyIdentity(reply, roster) {
  return reply.identity ?? roster.byId[reply.botId] ?? roster.retiredById?.[reply.botId]
    ?? { id: reply.botId, name: reply.name, color: reply.color ?? 'gray' }
}
