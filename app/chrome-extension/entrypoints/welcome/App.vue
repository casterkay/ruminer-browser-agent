<script setup lang="ts">
import { ref } from 'vue';
import { LINKS } from '@/common/constants';

import '../sidepanel/styles/agent-chat.css';

const COMMANDS = {
  oneShotSetup: 'bash scripts/setup.sh',
  startGateway: 'openclaw gateway run --port 18789 --force',

  installEvermemos:
    'openclaw plugins install --link "/absolute/path/to/ruminer-browser-agent/app/openclaw-extensions/evermemos"',
  enableEvermemos: 'openclaw plugins enable evermemos',
  installMcpClient:
    'openclaw plugins install --link "/absolute/path/to/ruminer-browser-agent/app/openclaw-extensions/mcp-client"',
  enableMcpClient: 'openclaw plugins enable mcp-client',

  configMcpUrl:
    'openclaw config set plugins.entries.mcp-client.config.mcpUrl "http://127.0.0.1:12306/mcp"',
  configEmosBaseUrl:
    'openclaw config set plugins.entries.evermemos.config.evermemosBaseUrl "https://your-emos.example"',
  configEmosApiKey: 'openclaw config set plugins.entries.evermemos.config.apiKey "YOUR_API_KEY"',
} as const;

type CommandKey = keyof typeof COMMANDS;
const copiedKey = ref<CommandKey | null>(null);

async function copyCommand(key: CommandKey): Promise<void> {
  try {
    await navigator.clipboard.writeText(COMMANDS[key]);
    copiedKey.value = key;
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy command', error);
  }
}

function copyLabel(key: CommandKey): string {
  return copiedKey.value === key ? 'Copied' : 'Copy';
}

async function openDocs(): Promise<void> {
  try {
    await chrome.tabs.create({ url: LINKS.TROUBLESHOOTING });
  } catch {
    window.open(LINKS.TROUBLESHOOTING, '_blank', 'noopener,noreferrer');
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
    <div class="mx-auto max-w-5xl px-5 py-10">
      <header class="flex flex-col gap-6">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-2">
            <h1 class="text-balance text-3xl font-semibold tracking-tight text-slate-50">
              Ruminer Browser Agent
            </h1>
            <div
              class="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-xs text-slate-300"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              Chrome MCP • EverMemOS • OpenClaw • Claude Code • Codex
            </div>
            <p class="max-w-2xl text-pretty text-sm leading-6 text-slate-300">
              A browser agent that exposes Chrome automation tools through a local MCP server, and
              optionally connects to OpenClaw + EverMemOS for chat and memory.
            </p>
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <div class="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div class="text-xs font-medium text-slate-300">Chat</div>
            <div class="mt-1 text-sm text-slate-100">Sidepanel UI → OpenClaw Gateway</div>
            <div class="mt-2 text-xs text-slate-400">Default: ws://127.0.0.1:18789</div>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div class="text-xs font-medium text-slate-300">Tools</div>
            <div class="mt-1 text-sm text-slate-100">MCP client → Ruminer MCP server</div>
            <div class="mt-2 text-xs text-slate-400">Default: http://127.0.0.1:12306/mcp</div>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div class="text-xs font-medium text-slate-300">Workflows</div>
            <div class="mt-1 text-sm text-slate-100">RR‑V3 runtime for resilient automation</div>
            <div class="mt-2 text-xs text-slate-400">Runs in MV3 background service worker</div>
          </div>
        </div>
      </header>

      <main class="mt-10 grid gap-6">
        <section class="rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-50">Recommended: one-shot setup</h2>
              <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                From your local repo root, run setup to build the extension, register the native
                host, and configure OpenClaw plugins (best-effort).
              </p>
            </div>
            <div class="text-xs text-slate-400">Runs locally • no cloud</div>
          </div>

          <div class="mt-4 flex flex-col gap-3">
            <div
              class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200">{{
                COMMANDS.oneShotSetup
              }}</code>
              <button
                class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                @click="copyCommand('oneShotSetup')"
              >
                {{ copyLabel('oneShotSetup') }}
              </button>
            </div>

            <div class="text-xs leading-6 text-slate-400">
              Then load unpacked extension from
              <span class="font-mono text-slate-300">app/chrome-extension/.output/chrome-mv3</span>.
            </div>
          </div>
        </section>

        <section class="grid gap-6 md:grid-cols-2">
          <div class="rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
            <h2 class="text-lg font-semibold text-slate-50">OpenClaw Gateway (chat)</h2>
            <p class="mt-1 text-sm leading-6 text-slate-300">
              Start the Gateway to enable sidepanel chat. If you already run OpenClaw elsewhere, you
              can skip this.
            </p>

            <div
              class="mt-4 flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200">{{
                COMMANDS.startGateway
              }}</code>
              <button
                class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                @click="copyCommand('startGateway')"
              >
                {{ copyLabel('startGateway') }}
              </button>
            </div>

            <div class="mt-3 text-xs leading-6 text-slate-400">
              Tip: use the same OpenClaw profile everywhere (e.g.
              <span class="font-mono text-slate-300">--profile dev</span>).
            </div>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
            <h2 class="text-lg font-semibold text-slate-50">Manual plugin install (optional)</h2>
            <p class="mt-1 text-sm leading-6 text-slate-300">
              Only needed if you didn’t run the setup script. Replace the absolute path with your
              local clone.
            </p>

            <div class="mt-4 space-y-3">
              <div
                class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
              >
                <code
                  class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200"
                  >{{ COMMANDS.installMcpClient }}</code
                >
                <button
                  class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                  @click="copyCommand('installMcpClient')"
                >
                  {{ copyLabel('installMcpClient') }}
                </button>
              </div>
              <div
                class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
              >
                <code
                  class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200"
                  >{{ COMMANDS.enableMcpClient }}</code
                >
                <button
                  class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                  @click="copyCommand('enableMcpClient')"
                >
                  {{ copyLabel('enableMcpClient') }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-950/40 p-6">
          <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 class="text-lg font-semibold text-slate-50">EverMemOS (memory)</h2>
              <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                Configure EverMemOS if you want memory search/add in OpenClaw, and ingestion
                workflows (RR‑V3) to write to EMOS.
              </p>
            </div>
            <div class="text-xs text-slate-400">Optional</div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <div
              class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200">{{
                COMMANDS.installEvermemos
              }}</code>
              <button
                class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                @click="copyCommand('installEvermemos')"
              >
                {{ copyLabel('installEvermemos') }}
              </button>
            </div>

            <div
              class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200">{{
                COMMANDS.enableEvermemos
              }}</code>
              <button
                class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                @click="copyCommand('enableEvermemos')"
              >
                {{ copyLabel('enableEvermemos') }}
              </button>
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <div
              class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200">{{
                COMMANDS.configMcpUrl
              }}</code>
              <button
                class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                @click="copyCommand('configMcpUrl')"
              >
                {{ copyLabel('configMcpUrl') }}
              </button>
            </div>
            <div
              class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200">{{
                COMMANDS.configEmosBaseUrl
              }}</code>
              <button
                class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                @click="copyCommand('configEmosBaseUrl')"
              >
                {{ copyLabel('configEmosBaseUrl') }}
              </button>
            </div>
            <div
              class="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
            >
              <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-200">{{
                COMMANDS.configEmosApiKey
              }}</code>
              <button
                class="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-700"
                @click="copyCommand('configEmosApiKey')"
              >
                {{ copyLabel('configEmosApiKey') }}
              </button>
            </div>
          </div>

          <div class="mt-3 text-xs leading-6 text-slate-400">
            You also need to configure EMOS inside the extension Settings for the Memory tab and
            ingestion workflows.
          </div>
        </section>

        <footer
          class="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-950/30 p-6 text-xs text-slate-400 md:flex-row md:items-center md:justify-between"
        >
          <div>
            Plugin paths in this repo:
            <span class="ml-2 font-mono text-slate-300">app/openclaw-extensions/evermemos</span>
            <span class="mx-2 text-slate-600">•</span>
            <span class="font-mono text-slate-300">app/openclaw-extensions/mcp-client</span>
          </div>
          <button
            class="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 hover:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-700"
            @click="openDocs"
          >
            Need help? Troubleshooting
          </button>
        </footer>
      </main>
    </div>
  </div>
</template>
