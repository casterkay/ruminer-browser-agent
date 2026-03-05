import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './register-tools';

/**
 * Create a fresh MCP Server instance per call.
 * The SDK Server only supports one active transport at a time, so HTTP sessions
 * must each get their own instance.
 */
export const getMcpServer = () => {
  const mcpServer = new Server(
    {
      name: 'ChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  setupTools(mcpServer);
  return mcpServer;
};
