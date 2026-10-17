export const ASSISTANT_RESERVED = 'The General Assistant already exists. Choose a different employee name and role.'

const reserved = new Set(['总助理', '总助', 'generalassistant'])
const isReserved = value => reserved.has(String(value ?? '').normalize('NFKC').replace(/[\s_-]+/g, '').toLowerCase())

export function assistantIdentityProblem({ name, role } = {}) {
  return isReserved(name) || isReserved(role) ? ASSISTANT_RESERVED : undefined
}
