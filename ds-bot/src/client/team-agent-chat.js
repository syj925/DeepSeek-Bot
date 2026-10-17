import { RESTORED_CHAT_CSS } from './restored-chat-styles.js'
import { createElement as h, useEffect } from 'react'
import { currentPart } from './text.js'
import { CanvasSession } from './canvas-session.js'

// Keep one canonical conversation surface for files, mentions, tools and approvals.
export function TeamAgentChat({ entity, roster, actions, useSessions }) {
  const sessionId = roster.roomsById?.[entity.id] ? entity.id : currentPart(entity)
  useEffect(() => {
    actions.beginVisit(sessionId)
    actions.clearUnread(entity.id)
    return () => actions.endVisit(sessionId)
  }, [sessionId])
  return h('div', { className: 'bt-agent-chat-container bt-restored-chat' },
    h(CanvasSession, { sessionId, actions, useSessions }))
}

export const TEAM_AGENT_CHAT_CSS = `${RESTORED_CHAT_CSS}

.bt-agent-chat-container {
  display: flex !important;
  flex-direction: column !important;
  height: 100% !important;
  width: 100% !important;
  overflow: hidden !important;
  background: transparent !important;
  box-sizing: border-box !important;
}

.bt-agent-chat-messages {
  flex: 1 1 0% !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  padding: 16px 20px 8px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 14px !important;
  scrollbar-width: thin !important;
  background: transparent !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.bt-agent-chat-messages::-webkit-scrollbar {
  width: 5px;
}
.bt-agent-chat-messages::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 999px;
}

.bt-agent-chat-bubble-row {
  display: flex !important;
  align-items: flex-start !important;
  gap: 10px !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.bt-bubble-row--user {
  justify-content: flex-end !important;
}

.bt-bubble-row--agent {
  justify-content: flex-start !important;
}

.bt-bubble-avatar {
  flex: none !important;
  margin-top: 2px !important;
}

.bt-agent-chat-bubble {
  width: fit-content !important;
  max-width: min(75%, 620px) !important;
  padding: 10px 14px !important;
  font-size: 13.5px !important;
  line-height: 21px !important;
  word-break: break-word !important;
  white-space: pre-wrap !important;
  border-radius: 12px !important;
  box-sizing: border-box !important;
}

.bt-agent-chat-bubble--user {
  background: #f1f5f9 !important;
  color: #0f172a !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 14px 14px 4px 14px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03) !important;
}

.bt-agent-chat-bubble--agent {
  background: rgba(255, 255, 255, 0.82) !important;
  color: #0f172a !important;
  border-radius: 14px 14px 14px 4px !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03) !important;
}

.bt-agent-chat-bubble-time {
  display: block !important;
  font-size: 10.5px !important;
  opacity: 0.65 !important;
  margin-top: 4px !important;
  text-align: right !important;
}

.bt-agent-chat-typing {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 8px 12px !important;
  background: rgba(255, 255, 255, 0.8) !important;
  border-radius: 12px !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  font-size: 12px !important;
  color: #64748b !important;
}

.bt-typing-dot {
  width: 4px !important;
  height: 4px !important;
  border-radius: 50% !important;
  background: #64748b !important;
  animation: bt-typing-bounce 1.4s infinite ease-in-out both !important;
}

.bt-typing-dot:nth-child(1) { animation-delay: -0.32s !important; }
.bt-typing-dot:nth-child(2) { animation-delay: -0.16s !important; }

@keyframes bt-typing-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1.1); opacity: 1; }
}

.bt-typing-label {
  margin-left: 4px !important;
}

/* Bottom Zone: Floating Input Container (no top/bottom layout split) */
.bt-agent-chat-bottom-zone {
  flex: none !important;
  padding: 0 18px 16px !important;
  background: transparent !important;
  display: flex !important;
  flex-direction: column !important;
  box-sizing: border-box !important;
}

.bt-composer-quick-chips {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin-bottom: 12px !important;
  overflow-x: auto !important;
  scrollbar-width: none !important;
}
.bt-composer-quick-chips::-webkit-scrollbar {
  display: none !important;
}

.bt-composer-quick-chip {
  flex: none !important;
  padding: 4px 12px !important;
  border-radius: 999px !important;
  font-size: 12px !important;
  line-height: 16px !important;
  background: rgba(255, 255, 255, 0.75) !important;
  border: 1px solid rgba(255, 255, 255, 0.85) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02) !important;
  color: #475569 !important;
  cursor: pointer !important;
  white-space: nowrap !important;
  transition: all 0.12s ease !important;
}
.bt-composer-quick-chip:hover {
  background: rgba(255, 255, 255, 0.95) !important;
  color: #0f172a !important;
  border-color: rgba(255, 255, 255, 1) !important;
}

/* Two-Tier Rounded Container: 128px height, rounded 14px, floating above dialogue */
.bt-agent-composer-box {
  height: 128px !important;
  min-height: 120px !important;
  max-height: 136px !important;
  background: rgba(255, 255, 255, 0.75) !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  border-radius: 14px !important;
  padding: 12px 14px !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  backdrop-filter: blur(16px) !important;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease !important;
}

.bt-agent-composer-box:focus-within {
  background: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(59, 130, 246, 0.4) !important;
  box-shadow: 0 6px 20px rgba(37, 99, 235, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
}

/* Upper Tier: Textarea occupying main space */
.bt-composer-textarea {
  flex: 1 1 0% !important;
  width: 100% !important;
  min-height: 52px !important;
  border: none !important;
  outline: none !important;
  background: transparent !important;
  font: inherit !important;
  font-size: 13.5px !important;
  line-height: 20px !important;
  color: #0f172a !important;
  resize: none !important;
  padding: 0 !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.bt-composer-textarea::placeholder {
  color: #94a3b8 !important;
}

/* Lower Tier: Toolbar with linear tool icons on the left, send button on the right */
.bt-composer-toolbar {
  flex: none !important;
  height: 32px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding-top: 4px !important;
}

.bt-composer-linear-tools {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
}

.bt-composer-icon-btn {
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  border: none !important;
  background: transparent !important;
  color: #64748b !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  transition: background-color 0.12s ease, color 0.12s ease !important;
  padding: 0 !important;
}

.bt-composer-icon-btn:hover {
  background: #f1f5f9 !important;
  color: #1e293b !important;
}

.bt-composer-icon-btn svg {
  width: 15px !important;
  height: 15px !important;
}

.bt-composer-send-btn {
  width: 30px !important;
  height: 30px !important;
  border-radius: 8px !important;
  border: none !important;
  background: #f1f5f9 !important;
  color: #94a3b8 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: not-allowed !important;
  transition: all 0.15s ease !important;
  padding: 0 !important;
}

.bt-composer-send-btn.bt-send-active {
  background: #0f172a !important;
  color: #ffffff !important;
  cursor: pointer !important;
}

.bt-composer-send-btn.bt-send-active:hover {
  background: #1e293b !important;
}

.bt-composer-send-btn svg {
  width: 15px !important;
  height: 15px !important;
}
`
