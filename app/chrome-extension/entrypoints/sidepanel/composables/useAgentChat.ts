/**
 * Legacy AgentChat request lifecycle types.
 *
 * Ruminer's primary chat transport is OpenClaw (`useOpenClawChat`).
 * These types are kept to support existing AgentChat UI components.
 */

export type RequestState =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'error';
