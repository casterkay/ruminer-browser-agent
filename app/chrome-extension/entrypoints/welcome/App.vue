<script setup lang="ts">
import { ref } from 'vue';
import { LINKS } from '@/common/constants';

import '../sidepanel/styles/agent-chat.css';

const COMMANDS = {
  installEvermemos:
    'openclaw plugins install "/absolute/path/to/ruminer-browser-agent/app/openclaw-extensions/evermemos"',
  enableEvermemos: 'openclaw plugins enable evermemos',
  installMcpClient:
    'openclaw plugins install "/absolute/path/to/ruminer-browser-agent/app/openclaw-extensions/mcp-client"',
  enableMcpClient: 'openclaw plugins enable mcp-client',
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
  <div class="welcome-page">
    <header class="welcome-header">
      <h1>Ruminer Browser Agent</h1>
      <p>Install OpenClaw plugins to enable chat memory and browser routes.</p>
      <button class="welcome-button" @click="openDocs">Troubleshooting Docs</button>
    </header>

    <main class="welcome-main">
      <section class="welcome-card">
        <h2>Install evermemos plugin</h2>
        <p>Provides memory add/search methods for OpenClaw chat experiences.</p>
        <div class="command-row">
          <code>{{ COMMANDS.installEvermemos }}</code>
          <button @click="copyCommand('installEvermemos')">{{
            copyLabel('installEvermemos')
          }}</button>
        </div>
        <div class="command-row">
          <code>{{ COMMANDS.enableEvermemos }}</code>
          <button @click="copyCommand('enableEvermemos')">{{
            copyLabel('enableEvermemos')
          }}</button>
        </div>
      </section>

      <section class="welcome-card">
        <h2>Install mcp-client plugin</h2>
        <p>Lets OpenClaw call Ruminer browser tools via the local MCP server.</p>
        <div class="command-row">
          <code>{{ COMMANDS.installMcpClient }}</code>
          <button @click="copyCommand('installMcpClient')">{{
            copyLabel('installMcpClient')
          }}</button>
        </div>
        <div class="command-row">
          <code>{{ COMMANDS.enableMcpClient }}</code>
          <button @click="copyCommand('enableMcpClient')">{{
            copyLabel('enableMcpClient')
          }}</button>
        </div>
      </section>

      <section class="welcome-card">
        <h2>Plugin paths in this repo</h2>
        <ul>
          <li><code>app/openclaw-extensions/evermemos</code></li>
          <li><code>app/openclaw-extensions/mcp-client</code></li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.welcome-page {
  min-height: 100vh;
  padding: 24px;
  color: #e5e7eb;
  background: radial-gradient(circle at 20% 20%, #1f2937, #0b1020 70%);
}

.welcome-header,
.welcome-main {
  max-width: 920px;
  margin: 0 auto;
}

.welcome-header h1 {
  font-size: 28px;
  margin: 0;
}

.welcome-button {
  margin-top: 12px;
  border: 1px solid #334155;
  background: #111827;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
}

.welcome-main {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.welcome-card {
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 16px;
  background: rgba(17, 24, 39, 0.9);
}

.command-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 8px;
}

.command-row code {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}

.command-row button {
  border: 1px solid #334155;
  background: #111827;
  color: #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
  cursor: pointer;
}

ul {
  margin: 0;
  padding-left: 16px;
}
</style>
