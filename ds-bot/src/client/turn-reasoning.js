// Only public reasoning blocks enter the preview. Its owner stays on the first
// reasoning step while later steps continue updating that same row.
export function turnReasoningState(steps, current) {
  const members = steps.length ? steps : [current]
  if (members.find(step => stepReasoning(step) !== '')?.step !== current.step) return { text: '', streaming: false }
  return { text: members.map(stepReasoning).filter(Boolean).join('\n\n'), streaming: members.some(thinkingLive) }
}

export const turnReasoning = (steps, current) => turnReasoningState(steps, current).text

const texts = step => step.blocks.filter(block => block.kind === 'text' && block.text.trim() !== '')

const thinkingLive = step => step.status === 'running' && texts(step).length === 0 && step.blocks.some(block => block.kind === 'reasoning')

const stepReasoning = step => step.blocks.filter(block => block.kind === 'reasoning').map(block => block.text).join('\n').trim()
