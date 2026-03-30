import type { AgentSession, AgentSessionsStreamEvent } from 'chrome-mcp-shared';
import type { AgentSessionsStreamManager } from './sessions-stream-manager';

let sessionsStreamManager: AgentSessionsStreamManager | null = null;

export function setSessionsStreamManager(manager: AgentSessionsStreamManager | null): void {
  sessionsStreamManager = manager;
}

export function publishSessionsStreamEvent(event: AgentSessionsStreamEvent): void {
  sessionsStreamManager?.publish(event);
}

export function publishSessionCreated(session: AgentSession): void {
  publishSessionsStreamEvent({ type: 'session.created', data: { session } });
}

export function publishSessionUpdated(input: {
  sessionId: string;
  updatedAt?: string;
  session?: AgentSession;
}): void {
  const sessionId = String(input.sessionId || '').trim();
  if (!sessionId) return;
  publishSessionsStreamEvent({
    type: 'session.updated',
    data: {
      sessionId,
      updatedAt: input.updatedAt,
      session: input.session,
    },
  });
}

export function publishSessionDeleted(input: { sessionId: string; projectId?: string }): void {
  const sessionId = String(input.sessionId || '').trim();
  if (!sessionId) return;
  const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
  publishSessionsStreamEvent({
    type: 'session.deleted',
    data: { sessionId, projectId: projectId || undefined },
  });
}
