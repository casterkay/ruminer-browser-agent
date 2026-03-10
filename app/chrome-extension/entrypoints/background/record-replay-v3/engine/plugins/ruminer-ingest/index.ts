import type { RRPlugin } from '../types';
import type { PluginRegistry } from '../registry';

import { authCheckNodeDefinition } from './auth-check';
import { extractListNodeDefinition } from './extract-list';
import { normalizeAndHashNodeDefinition } from './normalize-and-hash';
import { ledgerUpsertNodeDefinition } from './ledger-upsert';
import { emosIngestNodeDefinition } from './emos-ingest';
import { batchingNodeDefinition } from './batching';
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
    ctx.registerNode(normalizeAndHashNodeDefinition);
    ctx.registerNode(ledgerUpsertNodeDefinition);
    ctx.registerNode(emosIngestNodeDefinition);
  },
};

export function registerRuminerIngestNodes(registry: PluginRegistry): void {
  registry.registerPlugin(ruminerIngestPlugin);
}
