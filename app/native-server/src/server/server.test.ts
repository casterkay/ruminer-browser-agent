import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import supertest from 'supertest';
import { getDb } from '../agent/db';
import { getDefaultMemoryStoreRoot, getMemoryQmdIndexPath } from '../agent/storage';
import Server from './index';

describe('服务器测试', () => {
  const originalFetch = global.fetch;

  // 启动服务器测试实例
  beforeAll(async () => {
    await Server.getInstance().ready();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 关闭服务器
  afterAll(async () => {
    await Server.stop();
  });

  test('GET /ping 应返回正确响应', async () => {
    const response = await supertest(Server.getInstance().server)
      .get('/ping')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      status: 'ok',
      message: 'pong',
    });
  });

  test('GET /mcp without session should return 405 (Streamable HTTP probe)', async () => {
    const response = await supertest(Server.getInstance().server).get('/mcp').expect(405);

    expect(response.body).toEqual({
      error: 'GET /mcp requires an MCP session. Initialize via POST /mcp first.',
    });
  });

  test('GET /agent/memory/settings should return default generic memory settings', async () => {
    const response = await supertest(Server.getInstance().server)
      .get('/agent/memory/settings')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      settings: {
        backend: 'local_markdown_qmd',
        localRootPath: getDefaultMemoryStoreRoot(),
        qmdIndexPath: getMemoryQmdIndexPath(getDefaultMemoryStoreRoot()),
        updatedAt: new Date(0).toISOString(),
      },
    });
  });

  test('GET /agent/engines should include Hermes with MCP support', async () => {
    const response = await supertest(Server.getInstance().server)
      .get('/agent/engines')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body.engines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'hermes',
          supportsMcp: true,
        }),
      ]),
    );
  });

  test('GET /agent/hermes/settings should return default Hermes settings', async () => {
    getDb().run('DELETE FROM hermes_settings');

    const response = await supertest(Server.getInstance().server)
      .get('/agent/hermes/settings')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      settings: {
        baseUrl: '',
        apiKey: '',
        workspaceRoot: '',
        updatedAt: new Date(0).toISOString(),
        lastTestOkAt: null,
        lastTestError: null,
      },
    });
  });

  test('POST /agent/hermes/test should verify Hermes API server health', async () => {
    getDb().run('DELETE FROM hermes_settings');

    await supertest(Server.getInstance().server)
      .post('/agent/hermes/settings')
      .send({
        baseUrl: 'http://127.0.0.1:8642',
        apiKey: 'hermes-test-key',
        workspaceRoot: '/tmp',
      })
      .expect(200);

    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'hermes-agent' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    global.fetch = fetchMock;

    const response = await supertest(Server.getInstance().server)
      .post('/agent/hermes/test')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      ok: true,
      message: 'Hermes API server connect OK',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:8642/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer hermes-test-key',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:8642/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer hermes-test-key',
        }),
      }),
    );
  });

  test('POST /agent/hermes/test should fail when hermes-agent model is unavailable', async () => {
    getDb().run('DELETE FROM hermes_settings');

    await supertest(Server.getInstance().server)
      .post('/agent/hermes/settings')
      .send({
        baseUrl: 'http://127.0.0.1:8642',
        apiKey: 'hermes-test-key',
        workspaceRoot: '/tmp',
      })
      .expect(200);

    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'some-other-model' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    global.fetch = fetchMock;

    const response = await supertest(Server.getInstance().server)
      .post('/agent/hermes/test')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      ok: false,
      message: 'Hermes API server model hermes-agent is not available',
    });
  });

  test('POST /agent/chat/:sessionId/act should not leak Claude legacy resume state into Hermes', async () => {
    const db = getDb();
    db.run('DELETE FROM messages');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM projects');
    db.run('DELETE FROM hermes_settings');

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO projects (
        id, name, description, root_path, preferred_cli, selected_model,
        active_claude_session_id, use_ccr, enable_chrome_mcp,
        created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'project-hermes',
        'Hermes Project',
        null,
        '/tmp',
        'hermes',
        null,
        'claude-legacy-resume-id',
        '0',
        '1',
        now,
        now,
        now,
      ],
    );

    await supertest(Server.getInstance().server)
      .post('/agent/hermes/settings')
      .send({
        baseUrl: 'http://127.0.0.1:8642',
        apiKey: 'hermes-test-key',
        workspaceRoot: '/tmp',
      })
      .expect(200);

    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('upstream failure', { status: 500 }));
    global.fetch = fetchMock;

    const response = await supertest(Server.getInstance().server)
      .post('/agent/chat/session-hermes-act/act')
      .send({
        instruction: 'Say hello',
        projectId: 'project-hermes',
        cliPreference: 'hermes',
      });

    expect(response.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.previous_response_id).toBeUndefined();
    expect(body.conversation).toBeUndefined();
  });

  test('POST /agent/chat/:sessionId/act should reject Hermes when workspace root mismatches project', async () => {
    const db = getDb();
    db.run('DELETE FROM messages');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM projects');
    db.run('DELETE FROM hermes_settings');

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO projects (
        id, name, description, root_path, preferred_cli, selected_model,
        active_claude_session_id, use_ccr, enable_chrome_mcp,
        created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'project-hermes-mismatch',
        'Hermes Project Mismatch',
        null,
        '/tmp/ruminer-project',
        'hermes',
        null,
        null,
        '0',
        '1',
        now,
        now,
        now,
      ],
    );

    await supertest(Server.getInstance().server)
      .post('/agent/hermes/settings')
      .send({
        baseUrl: 'http://127.0.0.1:8642',
        apiKey: 'hermes-test-key',
        workspaceRoot: '/tmp/hermes-workspace',
      })
      .expect(200);

    const fetchMock = jest.fn<typeof fetch>();
    global.fetch = fetchMock;

    const response = await supertest(Server.getInstance().server)
      .post('/agent/chat/session-hermes-mismatch/act')
      .send({
        instruction: 'List files',
        projectId: 'project-hermes-mismatch',
        cliPreference: 'hermes',
      })
      .expect(400)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      error:
        'Hermes workspace root does not match the selected project. Configure Hermes to use /tmp/ruminer-project or create a matching project.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('POST /agent/sessions/:sessionId/reset should reject conversation reset', async () => {
    const db = getDb();
    db.run('DELETE FROM messages');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM projects');

    const now = new Date().toISOString();
    db.run(
      `INSERT INTO projects (
        id, name, description, root_path, preferred_cli, selected_model,
        active_claude_session_id, use_ccr, enable_chrome_mcp,
        created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'project-reset',
        'Reset Project',
        null,
        '/tmp',
        'hermes',
        null,
        null,
        '0',
        '1',
        now,
        now,
        now,
      ],
    );
    db.run(
      `INSERT INTO sessions (
        id, project_id, engine_name, engine_session_id, name, model,
        permission_mode, allow_dangerously_skip_permissions, system_prompt_config,
        options_config, management_info, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'session-reset',
        'project-reset',
        'hermes',
        'resp_123',
        'Reset Session',
        null,
        'default',
        null,
        null,
        null,
        null,
        now,
        now,
      ],
    );

    const response = await supertest(Server.getInstance().server)
      .post('/agent/sessions/session-reset/reset')
      .expect(409)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      error: 'Conversation reset is not supported. Create a new session instead.',
    });
  });
});
