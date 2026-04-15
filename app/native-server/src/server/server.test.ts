import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import supertest from 'supertest';
import { getDefaultMemoryStoreRoot, getMemoryQmdIndexPath } from '../agent/storage';
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
});
