import { createElement as h } from 'react'
import { MarkdownDelegateProvider } from '@deepseek-ai/dsh-client-ui-primitives'

export function MarkdownFileLinks({ openFile, children }) {
  return MarkdownDelegateProvider ? h(MarkdownDelegateProvider, { openFile }, children) : children
}

export function ConversationFiles({ sessionId, conversationId, actions, openFile, children }) {
  // The provider replaces its enclosing scope. Leave classic Chat's navigation and images intact.
  if (!sessionId || !actions.openConversationFile || !actions.isCanvasVisible?.()) return children
  return h(MarkdownFileLinks, { openFile: (path, options) => actions.openConversationFile(sessionId, path, options, openFile, conversationId) }, children)
}
