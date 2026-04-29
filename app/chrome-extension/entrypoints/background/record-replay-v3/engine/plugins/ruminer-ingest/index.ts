import type { PluginRegistry } from '../registry';
import type { RRPlugin } from '../types';

import { authCheckNodeDefinition } from './auth-check';
import { batchingNodeDefinition } from './batching';
import { extractListNodeDefinition } from './extract-list';
import { ensureConversationTabNodeDefinition } from './nodes/ensure-conversation-tab';
import { ingestCurrentNodeDefinition } from './nodes/ingest-conversation';
import { scanAndEnqueueNodeDefinition } from './nodes/scan-and-ingest-all';
import { pageAuthCheckNodeDefinition } from './page-auth-check';
import { randomDelayNodeDefinition } from './random-delay';

export const ruminerIngestPlugin: RRPlugin = {
  name: 'ruminer-ingest',
  register(ctx) {
    ctx.registerNode(authCheckNodeDefinition);
    ctx.registerNode(pageAuthCheckNodeDefinition);
    ctx.registerNode(extractListNodeDefinition);
    ctx.registerNode(randomDelayNodeDefinition);
    ctx.registerNode(batchingNodeDefinition);
    ctx.registerNode(ingestCurrentNodeDefinition);
    ctx.registerNode(scanAndEnqueueNodeDefinition);
    ctx.registerNode(ensureConversationTabNodeDefinition);
  },
};

export function registerRuminerIngestNodes(registry: PluginRegistry): void {
  registry.registerPlugin(ruminerIngestPlugin);
}
