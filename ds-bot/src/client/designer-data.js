import { currentPart } from './text.js'

// The designer's department cards read the existing organization, never infer or create it.
export function departmentFor(entity, roster) {
  if (!entity || roster.roomsById?.[entity.id] || entity.generalAssistant) return null
  const team = (roster.teams ?? []).find(team => team.id === entity.teamId || team.members.includes(entity.id))
  if (!team) return null
  return {
    key: team.id, name: team.name, title: team.name, desc: team.purpose, icon: '',
    agents: [team.leaderId, ...team.members.filter(id => id !== team.leaderId)]
      .map(id => roster.byId[id]).filter(bot => bot && !bot.hidden)
      .map(bot => ({ ...bot, isLead: bot.id === team.leaderId, isMain: bot.generalAssistant === true, badge: bot.id === team.leaderId ? '主管' : '员工' })),
  }
}

export function managerFor(entity, roster) {
  const team = (roster.teams ?? []).find(team => team.id === entity?.teamId || team.members.includes(entity?.id))
  const id = team?.leaderId !== entity?.id ? team?.leaderId : undefined
  return roster.byId[id ?? entity?.ownerId] ?? roster.bots.find(bot => bot.generalAssistant)
}

export function reportsFor(entity, roster) {
  if (entity.generalAssistant) return roster.bots.filter(bot => bot.id !== entity.id && !bot.hidden)
  const team = (roster.teams ?? []).find(team => team.leaderId === entity.id)
  return roster.bots.filter(bot => !bot.hidden && bot.id !== entity.id && (team?.members.includes(bot.id) || bot.ownerId === entity.id))
}

export function chatMessages(list, entity, roster) {
  const id = roster.roomsById?.[entity.id] ? entity.id : currentPart(entity)
  const hidden = roster.exchangeTurns?.[id] ?? []
  const outline = list.projectionsBySession?.[id]?.values?.turnOutline ?? list.byId?.[id]?.projectionValues?.turnOutline ?? []
  return outline.filter(turn => !hidden.includes(turn.turn)).flatMap(turn => [
    ...(turn.prompt ? [{ id: `${id}:${turn.turn}:user`, role: 'user', text: turn.prompt, at: turn.startedAt }] : []),
    ...(turn.response ? [{ id: `${id}:${turn.turn}:assistant`, role: 'assistant', text: turn.response, at: turn.endedAt }] : []),
  ])
}
