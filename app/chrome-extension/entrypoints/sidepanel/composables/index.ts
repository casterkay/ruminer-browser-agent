/**
 * Agent Chat Composables
 * Export all composables for agent chat functionality.
 */
export { useAgentChat } from './useAgentChat';
export { useAgentChatViewRoute } from './useAgentChatViewRoute';
export { useAgentProjects } from './useAgentProjects';
export { useAgentServer } from './useAgentServer';
export { useAgentSessions } from './useAgentSessions';
export { preloadAgentTheme, THEME_LABELS, useAgentTheme } from './useAgentTheme';
export { AGENT_SERVER_PORT_KEY, useAgentThreads } from './useAgentThreads';
export { useAttachments, type AttachmentWithPreview } from './useAttachments';
export { useChatBackendPreference } from './useChatBackendPreference';
export { useEmosSearch } from './useEmosSearch';
export { useEmosSuggestions } from './useEmosSuggestions';
export { useOpenClawChat } from './useOpenClawChat';
export { useOpenClawGateway } from './useOpenClawGateway';
export { useWebEditorTxState, WEB_EDITOR_TX_STATE_INJECTION_KEY } from './useWebEditorTxState';

export type { RequestState, UseAgentChatOptions } from './useAgentChat';
export type {
  AgentChatRouteState,
  AgentChatView,
  UseAgentChatViewRoute,
  UseAgentChatViewRouteOptions,
} from './useAgentChatViewRoute';
export type { UseAgentProjectsOptions } from './useAgentProjects';
export type { UseAgentServerOptions } from './useAgentServer';
export type { UseAgentSessionsOptions } from './useAgentSessions';
export type { AgentThemeId, UseAgentTheme } from './useAgentTheme';
export type {
  AgentThread,
  AgentThreadState,
  ThreadHeader,
  TimelineItem,
  ToolKind,
  ToolPresentation,
  ToolSeverity,
  UseAgentThreadsOptions,
  WebEditorApplyMeta,
} from './useAgentThreads';
export type { SidepanelChatBackend, UseChatBackendPreference } from './useChatBackendPreference';
export type { MemoryFilters, MemoryItem, UseEmosSearch } from './useEmosSearch';
export type { MemorySuggestion, UseEmosSuggestions } from './useEmosSuggestions';
export type { ChatMessage, ChatRole, UseOpenClawChat } from './useOpenClawChat';
export type { GatewayEvent, UseOpenClawGateway } from './useOpenClawGateway';
export type { UseWebEditorTxStateOptions, WebEditorTxStateReturn } from './useWebEditorTxState';

// RR V3 Composables
export { useRRV3Debugger } from './useRRV3Debugger';
export type { UseRRV3Debugger, UseRRV3DebuggerOptions } from './useRRV3Debugger';
export { useRRV3Rpc } from './useRRV3Rpc';
export type { RpcRequestOptions, UseRRV3Rpc, UseRRV3RpcOptions } from './useRRV3Rpc';

// Textarea Auto-Resize
export { useTextareaAutoResize } from './useTextareaAutoResize';
export type {
  UseTextareaAutoResizeOptions,
  UseTextareaAutoResizeReturn,
} from './useTextareaAutoResize';

// Fake Caret (comet tail animation)
export { useFakeCaret } from './useFakeCaret';
export type { FakeCaretTrailPoint, UseFakeCaretOptions, UseFakeCaretReturn } from './useFakeCaret';

// Open Project Preference
export { useOpenProjectPreference } from './useOpenProjectPreference';
export type {
  UseOpenProjectPreference,
  UseOpenProjectPreferenceOptions,
} from './useOpenProjectPreference';

// Agent Input Preferences (fake caret, etc.)
export { useAgentInputPreferences } from './useAgentInputPreferences';
export type { UseAgentInputPreferences } from './useAgentInputPreferences';

// Floating Icon Preference
export { useFloatingIconPreference } from './useFloatingIconPreference';
export type { UseFloatingIconPreference } from './useFloatingIconPreference';
