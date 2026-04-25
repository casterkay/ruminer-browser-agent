import { afterEach, describe, expect, test } from '@jest/globals';
import {
  clearEphemeralSessionState,
  getEphemeralSessionState,
  setEphemeralEngineSessionId,
  upsertEphemeralSessionContext,
} from './ephemeral-session-store';

describe('ephemeral-session-store', () => {
  const sessionId = 'session-hermes';

  afterEach(() => {
    clearEphemeralSessionState(sessionId);
  });

  test('stores generic engine session ids for Hermes sessions', () => {
    upsertEphemeralSessionContext({
      sessionId,
      projectId: 'project-1',
      engineName: 'hermes',
    });

    setEphemeralEngineSessionId(sessionId, 'resp_123');

    expect(getEphemeralSessionState(sessionId)).toMatchObject({
      sessionId,
      projectId: 'project-1',
      engineName: 'hermes',
      engineSessionId: 'resp_123',
    });
  });

  test('preserves existing engine session id when context is refreshed', () => {
    upsertEphemeralSessionContext({
      sessionId,
      projectId: 'project-1',
      engineName: 'hermes',
    });
    setEphemeralEngineSessionId(sessionId, 'resp_456');

    upsertEphemeralSessionContext({
      sessionId,
      projectId: 'project-1',
      engineName: 'hermes',
    });

    expect(getEphemeralSessionState(sessionId)?.engineSessionId).toBe('resp_456');
  });
});
