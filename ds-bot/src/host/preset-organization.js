import portraits from '../shared/company-dock-portraits.json' with { type: 'json' }

const definitions = [
  ['admin', '人事部'], ['product', '产品部'], ['sales', '销售部'],
  ['tech', '技术部'], ['ops', '运营部'], ['temporary', '临时员工部'],
]

export function install(rt) {
  let pending
  async function initialize() {
    const { state } = rt
    if (state.presetOrganization?.version === 1) return
    const blocked = rt.readOnly()
    if (blocked !== undefined) throw new Error(blocked)
    // Save progress between people: interrupted installs resume without duplicating Sessions.
    state.presetOrganization ??= { employees: {}, departments: {} }
    const progress = state.presetOrganization
    const chief = rt.botOf(state.generalAssistantId)
    if (!chief) return
    for (const [key, name] of definitions) {
      if (progress.departments[key]) continue
      const existing = rt.findTeam(name)
      if (existing) {
        progress.departments[key] = existing.id
        await rt.save()
        continue
      }
      const preset = key === 'temporary' ? {
        purpose: '由长期负责人协调临时用人；临时员工按任务加入，完成后退出。',
        members: [{ ...portraits.management.members[0], name: '临时员工主管', position: '临时员工部负责人', role: 'Coordinate temporary staffing and task handoffs. Temporary workers keep their task ownership and retire after completing their tasks; you remain a permanent coordinator.' }],
      } : portraits[key]
      const members = []
      for (const [index, person] of preset.members.entries()) {
        const slot = `${key}:${index}`
        let employee = rt.botOf(progress.employees[slot]) ?? Object.values(state.bots).find(bot => bot.presetKey === slot)
        if (!employee) {
          const base = person.name.replace(/\s*Agent$/, '').trim()
          let name = base, suffix = 2
          // Names alone never authorize taking ownership of an existing user's employee.
          while (rt.findBot(name)) name = `${base} ${suffix++}`
          employee = await rt.createBot({ name, role: person.position || base,
            avatar: { image: person.image }, quiet: true, employment: 'long-term', presetKey: slot,
            createdBy: chief.id,
            instructions: `${person.role}\nWork within this specialty. Coordinate deliverables in task groups, ask only necessary questions and report verifiable results. Do not start work until assigned. Organizational roles do not grant additional tool permissions.`,
          })
          progress.employees[slot] = employee.id
          await rt.save()
        }
        members.push(employee.id)
      }
      const team = await rt.createTeam({ name, purpose: preset.purpose, leaderId: members[0], members })
      progress.departments[key] = team.id
      await rt.save()
    }
    progress.version = 1
    await rt.save()
  }
  rt.ensurePresetOrganization = () => {
    if (rt.config.presetOrganization !== true) return Promise.resolve()
    pending ??= initialize().finally(() => { pending = undefined })
    return pending
  }
}
