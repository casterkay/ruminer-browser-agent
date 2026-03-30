import type { ServerResponse } from 'node:http';
import type { AgentSessionsStreamEvent } from 'chrome-mcp-shared';

/**
 * AgentSessionsStreamManager manages SSE connections for global session list updates.
 *
 * Unlike AgentStreamManager (session-scoped chat stream), this manager broadcasts events to
 * all connected clients.
 */
export class AgentSessionsStreamManager {
  private readonly sseClients = new Set<ServerResponse>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  addSseStream(res: ServerResponse): void {
    this.sseClients.add(res);
    this.ensureHeartbeatTimer();
  }

  removeSseStream(res: ServerResponse): void {
    this.sseClients.delete(res);
    this.stopHeartbeatTimerIfIdle();
  }

  publish(event: AgentSessionsStreamEvent): void {
    const payload = JSON.stringify(event);
    const ssePayload = `data: ${payload}\n\n`;

    const dead: ServerResponse[] = [];
    for (const res of this.sseClients) {
      if (this.isResponseDead(res)) {
        dead.push(res);
        continue;
      }
      try {
        res.write(ssePayload);
      } catch {
        dead.push(res);
      }
    }
    for (const res of dead) {
      this.removeSseStream(res);
    }
  }

  closeAll(): void {
    for (const res of this.sseClients) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
    this.sseClients.clear();
    this.stopHeartbeatTimer();
  }

  private isResponseDead(res: ServerResponse): boolean {
    return (res as any).writableEnded || (res as any).destroyed;
  }

  private ensureHeartbeatTimer(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.sseClients.size === 0) {
        this.stopHeartbeatTimer();
        return;
      }

      const event: AgentSessionsStreamEvent = {
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
      };
      this.publish(event);
    }, 30_000);

    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeatTimerIfIdle(): void {
    if (this.sseClients.size === 0) this.stopHeartbeatTimer();
  }

  private stopHeartbeatTimer(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
