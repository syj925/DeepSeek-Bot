// Fold the existing session feed; no demo messages or secondary chat history.
export function sessionMessages(entries, hiddenTurns = []) {
  const rows = []
  const live = new Map()
  const seen = new Set()
  const calls = new Map()
  for (const entry of entries ?? []) {
    const event = entry.event ?? entry
    const data = event.data ?? {}
    if (hiddenTurns.includes(data.turn)) continue
    if (event.type === 'user/message' && data.source?.kind !== 'user') continue
    const eventKey = `${event.type}:${event.seq}`
    if (event.type !== 'assistant/live-chunk') {
      if (event.seq !== undefined && seen.has(eventKey)) continue
      seen.add(eventKey)
    }
    if (event.type === 'tool/call') calls.set(data.call?.id ?? data.id, data.call?.name ?? data.name)
    if (event.type === 'assistant/message') for (const block of data.message?.content ?? []) if (block.type === 'tool-call') calls.set(block.id, block.name)
    if (event.type === 'tool/result' && calls.get(data.message?.source?.callId) === 'group_relay') {
      try {
        const content = data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        const replies = JSON.parse(content).replies ?? []
        for (const [index, reply] of replies.entries()) if (reply.text) rows.push({ id: `group-${event.seq}-${index}`, callId: data.message.source.callId, role: reply.kind === 'user' ? 'user' : 'assistant', botId: reply.botId, name: reply.name, text: reply.text, at: reply.time ?? event.time })
      } catch { /* malformed tool output stays available in the complete conversation */ }
    }
    if (event.type === 'user/message' || event.type === 'assistant/message') {
      const content = data.message?.content ?? data.content
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: typeof content === 'string' ? content : '' }]
      const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('\n')
      const attachments = blocks.filter(block => (block.type === 'image' || block.type === 'file') && block.attachment).map(block => ({ type: block.type, ...block.attachment }))
      const pending = live.get(`${data.turn}:${data.step}`)
      if (pending && event.type === 'assistant/message') {
        pending.text = text; pending.live = false; pending.attachments = attachments
        live.delete(`${data.turn}:${data.step}`)
      } else if (text || attachments.length) rows.push({ id: `event-${event.seq}`, role: event.type === 'user/message' ? 'user' : 'assistant', text, attachments, at: event.time })
    } else if (event.type === 'assistant/live-chunk' && data.chunk?.type === 'text-delta') {
      const key = `${data.turn}:${data.step}`
      if (!live.has(key)) { const row = { id: `live-${key}`, role: 'assistant', text: '', at: event.time, live: true }; live.set(key, row); rows.push(row) }
      live.get(key).text += data.chunk.text ?? data.chunk.delta ?? ''
    }
  }
  return rows
}
