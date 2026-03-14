import { describe, expect, test, afterAll, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import Server from './index';

describe('服务器测试', () => {
  // 启动服务器测试实例
  beforeAll(async () => {
    await Server.getInstance().ready();
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
});
