# Ruminer Browser Agent

Ruminer Browser Agent is your browser agent with:

- A sidepanel chat UI that talks to an OpenClaw Gateway (local WebSocket)
- A local MCP server at `http://127.0.0.1:12306/mcp` for browser automation tools
- EverMemOS (EMOS) integration (search + ingestion)
- RR-V3 workflows that survive MV3 service worker restarts

前端可收集四个 AI 聊天平台的消息记录（ChatGPT, Gemini, DeepSeek, Claude），后端可连接三种 AI 智能体进行任务自动化（OpenClaw，Claude Code, Codex）。

This repository is a pnpm monorepo. It is not “installable via npm” as a single upstream package in the way the old mcp-chrome docs suggest. Use the local build + registration flow below.

## Architecture (quick mental model)

1. Your MCP client (OpenClaw via plugin, Codex CLI, Claude Code) calls Ruminer MCP at `http://127.0.0.1:12306/mcp`.

2. The local native server (app/native-server) forwards tool calls to the extension background service worker via Native Messaging.

3. The extension executes the browser action (tabs, scripting, debugger, etc.) and returns results.

OpenClaw chat uses the Gateway (default `ws://127.0.0.1:18789`) and the extension sidepanel UI.

## Prerequisites

- Node.js >= 22.5.0
- pnpm (see packageManager in [package.json](package.json))
- Chrome (or Chromium-based browser)
- Optional but recommended:
  - OpenClaw CLI (for sidepanel chat + OpenClaw plugin tool routing)
  - EverMemOS base URL + API key (for memory features)

## One-shot local setup (recommended)

Run the setup script from the repo root:

```bash
bash scripts/setup.sh
```

Optional: auto-configure the OpenClaw EverMemOS plugin during setup:

```bash
EVERMEMOS_BASE_URL="https://api.evermind.ai" \
EVERMEMOS_API_KEY="your_api_key" \
bash scripts/setup.sh
```

What this does:

- Installs dependencies with pnpm
- Builds the Chrome extension
- Generates a stable dev extension identity (writes app/chrome-extension/.env.local with CHROME_EXTENSION_KEY)
- Registers the Native Messaging host with the derived extension ID allowlist
- Installs/enables OpenClaw plugins and writes plugin config (best-effort)

## Load the extension (manual)

Chrome does not allow “Load unpacked” via a script.

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click “Load unpacked”
4. Select this folder:

## Start OpenClaw Gateway (for sidepanel chat)

Run the Gateway locally (default port expected by the extension is 18789):

```bash
openclaw gateway run --port 18789 --force
```

If you use a custom OpenClaw profile, pass `--profile <name>` consistently to both `openclaw gateway ...` and any `openclaw config/plugins/...` commands.

## Configure MCP clients

### OpenClaw (tools via mcp-client plugin)

Setup writes the plugin config for you, but you can verify:

```bash
openclaw plugins info mcp-client --json
openclaw plugins info evermemos --json
```

### Codex CLI

Run terminal command:

`codex mcp add ruminer-chrome --url http://127.0.0.1:12306/mcp`

### Claude Code

Run terminal command:

`claude mcp add --transport http ruminer-chrome http://127.0.0.1:12306/mcp`

## EverMemOS (EMOS) integration

Ruminer has two EMOS integration paths (they are intentionally separate):

1. OpenClaw EverMemOS plugin (used when OpenClaw agent wants memory tools)
2. Extension direct EMOS client (used by ingestion workflows and the Memory UI)

### 1) OpenClaw EverMemOS plugin config

If you didn’t pass env vars to setup, configure via OpenClaw:

```bash
openclaw config set plugins.entries.evermemos.config.evermemosBaseUrl "https://your-emos.example"
openclaw config set plugins.entries.evermemos.config.apiKey "your_api_key"
```

Then validate:

```bash
openclaw plugins info evermemos --json
```

### 2) Extension EMOS settings

Open the extension Options/Settings UI and set:

- EverMemOS base URL
- API key
- Default user id (if required by your EMOS deployment)

This enables memory search in the sidepanel and allows RR-V3 ingestion workflows to write to EMOS without OpenClaw.

## RR-V3 workflows (browser automation)

RR-V3 is the workflow runtime used by the extension to keep runs resilient under MV3 service worker restarts.

After the extension is loaded and connected:

1. Open the sidepanel
2. Go to the Workflows tab
3. Create or import a flow and run it

Workflows can call the same browser tools exposed over MCP, plus Ruminer-specific nodes for extraction/ingestion.

## Tool reference

- Full tool list: [docs/TOOLS.md](docs/TOOLS.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Troubleshooting: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

<details>
<summary><strong>📊 Browser Management (6 tools)</strong></summary>

- `get_windows_and_tabs` - List all browser windows and tabs
- `chrome_navigate` - Navigate to URLs and control viewport
- `chrome_switch_tab` - Switch the current active tab
- `chrome_close_tabs` - Close specific tabs or windows
- `chrome_go_back_or_forward` - Browser navigation control
- `chrome_inject_script` - Inject content scripts into web pages
- `chrome_send_command_to_inject_script` - Send commands to injected content scripts
</details>

<details>
<summary><strong>📸 Screenshots & Visual (1 tool)</strong></summary>

- `chrome_screenshot` - Advanced screenshot capture with element targeting, full-page support, and custom dimensions
</details>

<details>
<summary><strong>🌐 Network Monitoring (4 tools)</strong></summary>

- `chrome_network_capture_start/stop` - webRequest API network capture
- `chrome_network_debugger_start/stop` - Debugger API with response bodies
- `chrome_network_request` - Send custom HTTP requests
</details>

<details>
<summary><strong>🔍 Content Analysis (4 tools)</strong></summary>

- `search_tabs_content` - AI-powered semantic search across browser tabs
- `chrome_get_web_content` - Extract HTML/text content from pages
- `chrome_get_interactive_elements` - Find clickable elements
- `chrome_console` - Capture and retrieve console output from browser tabs
</details>

<details>
<summary><strong>🎯 Interaction (3 tools)</strong></summary>

- `chrome_click_element` - Click elements using CSS selectors
- `chrome_fill_or_select` - Fill forms and select options
- `chrome_keyboard` - Simulate keyboard input and shortcuts
</details>

<details>
<summary><strong>📚 Data Management (5 tools)</strong></summary>

- `chrome_history` - Search browser history with time filters
- `chrome_bookmark_search` - Find bookmarks by keywords
- `chrome_bookmark_add` - Add new bookmarks with folder support
- `chrome_bookmark_delete` - Delete bookmarks
</details>

## Usage examples

### AI helps you summarize webpage content and automatically control Excalidraw for drawing

prompt: [excalidraw-prompt](prompt/excalidraw-prompt.md)
Instruction: Help me summarize the current page content, then draw a diagram to aid my understanding.
https://www.youtube.com/watch?v=3fBPdUBWVz0

https://github.com/user-attachments/assets/fd17209b-303d-48db-9e5e-3717141df183

### After analyzing the content of the image, the LLM automatically controls Excalidraw to replicate the image

prompt: [excalidraw-prompt](prompt/excalidraw-prompt.md)|[content-analize](prompt/content-analize.md)
Instruction: First, analyze the content of the image, and then replicate the image by combining the analysis with the content of the image.
https://www.youtube.com/watch?v=tEPdHZBzbZk

https://github.com/user-attachments/assets/60d12b1a-9b74-40f4-994c-95e8fa1fc8d3

### AI automatically injects scripts and modifies webpage styles

prompt: [modify-web-prompt](prompt/modify-web.md)
Instruction: Help me modify the current page's style and remove advertisements.
https://youtu.be/twI6apRKHsk

https://github.com/user-attachments/assets/69cb561c-2e1e-4665-9411-4a3185f9643e

### AI automatically captures network requests for you

query: I want to know what the search API for Xiaohongshu is and what the response structure looks like

https://youtu.be/1hHKr7XKqnQ

https://github.com/user-attachments/assets/dc7e5cab-b9af-4b9a-97ce-18e4837318d9

### AI helps analyze your browsing history

query: Analyze my browsing history from the past month

https://youtu.be/jf2UZfrR2Vk

https://github.com/user-attachments/assets/31b2e064-88c6-4adb-96d7-50748b826eae

### Web page conversation

query: Translate and summarize the current web page
https://youtu.be/FlJKS9UQyC8

https://github.com/user-attachments/assets/aa8ef2a1-2310-47e6-897a-769d85489396

### AI automatically takes screenshots for you (web page screenshots)

query: Take a screenshot of Hugging Face's homepage
https://youtu.be/7ycK6iksWi4

https://github.com/user-attachments/assets/65c6eee2-6366-493d-a3bd-2b27529ff5b3

### AI automatically takes screenshots for you (element screenshots)

query: Capture the icon from Hugging Face's homepage
https://youtu.be/ev8VivANIrk

https://github.com/user-attachments/assets/d0cf9785-c2fe-4729-a3c5-7f2b8b96fe0c

### AI helps manage bookmarks

query: Add the current page to bookmarks and put it in an appropriate folder

https://youtu.be/R_83arKmFTo

https://github.com/user-attachments/assets/15a7d04c-0196-4b40-84c2-bafb5c26dfe0

### Automatically close web pages

query: Close all shadcn-related web pages

https://youtu.be/2wzUT6eNVg4

https://github.com/user-attachments/assets/83de4008-bb7e-494d-9b0f-98325cfea592

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed guidelines.

## Roadmap

We have exciting plans for the future development of Chrome MCP Server:

- [ ] Authentication
- [ ] Recording and Playback
- [ ] Workflow Automation
- [ ] Enhanced Browser Support (Firefox Extension)

---

**Want to contribute to any of these features?** Check out our [Contributing Guide](docs/CONTRIBUTING.md) and join our development community!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## More documentation

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Tool list: [docs/TOOLS.md](docs/TOOLS.md)
- Troubleshooting: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
