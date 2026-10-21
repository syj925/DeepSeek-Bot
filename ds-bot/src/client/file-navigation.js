import { createElement as h } from 'react'
import { MarkdownDelegateProvider, useMarkdownDelegate } from '@deepseek-ai/dsh-client-ui-primitives'

export function ConversationFiles({ sessionId, conversationId, actions, children }) {
  const delegate = useMarkdownDelegate()
  return h(MarkdownDelegateProvider, { ...delegate,
    openFile: actions.openConversationFile && sessionId
      ? (path, options) => actions.openConversationFile(sessionId, path, options, delegate.openFile, conversationId)
      : delegate.openFile,
  }, children)
}
