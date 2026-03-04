/**
 * Re-export agent types from shared package for backward compatibility.
 * All types are now defined in packages/shared/src/agent-types.ts to ensure
 * consistency between native-server and chrome-extension.
 */
export {
  type AgentActRequest,
  type AgentActResponse,
  type AgentAttachment,
  type AgentCliPreference,
  type AgentConnectedEvent,
  type AgentEngineInfo,
  type AgentHeartbeatEvent,
  type AgentMessage,
  type AgentProject,
  type AgentRole,
  type AgentStatusEvent,
  type AgentStoredMessage,
  type GetOpenClawGatewaySettingsResponse,
  type ListOpenClawAgentsResponse,
  type OpenClawAgentDto,
  type OpenClawGatewaySettingsDto,
  type RealtimeEvent,
  type StreamTransport,
  type TestOpenClawGatewayResponse,
  type UpdateOpenClawGatewaySettingsRequest,
  type UpdateOpenClawGatewaySettingsResponse,
} from 'chrome-mcp-shared';
