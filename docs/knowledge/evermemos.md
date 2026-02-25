# EverMemOS

## What It Is

EverMemOS is an open-source (Apache 2.0) enterprise-grade intelligent memory system for conversational AI by EverMind AI. It transforms raw interactions into structured, searchable, and semantically meaningful memories through a three-stage pipeline (encoding, consolidation, retrieval). It enables AI agents to maintain long-term, contextual understanding of user interactions beyond simple conversation logs.

**Core vision**: "Build AI memory that never forgets, making every conversation built on previous understanding."

GitHub: `EverMind-AI/EverMemOS` — v1.2.0, ~2.2k stars, 231 forks.
Discord: https://discord.gg/pfwwskxp
Paper: https://arxiv.org/abs/2601.02163

---

## Key Differentiators

- **Coherent Narrative**: Connects conversation fragments into thematic storylines rather than storing isolated pieces. Understands complete narratives within multi-threaded discussions.
- **Evidence-Based Perception**: Proactively identifies deep connections between memories and tasks. Recalls contextually relevant information without explicit prompting (e.g., automatically considering dental surgery when recommending food).
- **Living Profiles**: User profiles dynamically evolve with each interaction — progressively recognizing individual preferences rather than storing static records.

---

## Architecture

EverMemOS uses a **five-layer vertical slice architecture** with strict unidirectional dependencies, organized around two cognitive tracks: **memory construction** (encoding) and **memory perception** (retrieval).

### Layers

| Layer              | Responsibility                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **API**            | FastAPI controllers (MemoryController) handling HTTP endpoints, request/response serialization via DTOs            |
| **Agentic**        | Orchestration facades (MemoryManager) coordinating memory operations and retrieval strategy dispatch               |
| **Business**       | Core workflows (`mem_memorize.py`) implementing memory extraction pipelines and persistence orchestration          |
| **Memory**         | Extraction algorithms (Episode/Foresight/EventLog extractors), boundary detection, LLM interactions                |
| **Infrastructure** | Repository pattern for data access, format converters, external service communication (MongoDB, Redis, ES, Milvus) |

### Three-Stage Memory Pipeline

**Encoding** transforms raw messages into structured memories using specialized extractors (ConvMemCellExtractor, EpisodeMemoryExtractor, ForesightExtractor, EventLogExtractor).

**Consolidation** organizes memories through ClusterManager and ProfileManager, synthesizing user/group profiles.

**Retrieval** intelligently fetches context via five methods: keyword, vector, hybrid, RRF, and agentic.

### Memory Construction Flow

```
User Conversation → Message Ingestion → Boundary Detection →
MemCell Creation → Parallel Extraction (Episode/Foresight/EventLog) →
Clustering → Profile Synthesis → Triple-Database Persistence
```

### Request-Response Flow

```
HTTP request → MemoryController → request converter (auto-generates group_id for single-user mode)
→ MemoryManager facade → business layer coordination → repository pattern for data access
→ response aggregation → HTTP response
```

---

## Core Concepts

### MemCell

**MemCell** is the atomic structured unit — a semantically-coherent segment of conversation determined by boundary detection. Each MemCell contains:

- Unique event identifier
- List of participants and user IDs
- Original raw message data
- Timestamp of last message
- Summary description
- Group association
- Conversation type classification

Related MemCells are grouped into clusters by semantic similarity via ClusterManager.

### Boundary Detection

Dual detection mechanisms determine where to split conversations into MemCells:

1. **Hard Limits (Force Split)**: Automatic split at **8192 tokens** or **50 messages** per cell.
2. **LLM-Based Semantic Detection**: Analyzes topic continuity, time gaps, and conversation context to identify natural boundaries.

### Memory Types

Nine distinct memory types are extracted:

| Type                      | Description                                      |
| ------------------------- | ------------------------------------------------ |
| **MemCell**               | Atomic boundary-detected conversation segment    |
| **Episodic Memory**       | Narrative summaries with importance scoring      |
| **Foresight**             | Future-oriented predictions and plans            |
| **Event Log**             | Atomic facts as structured event records         |
| **Profile Memory**        | Personal attributes, preferences, relationships  |
| **User Profile**          | Work/life profile data for individuals           |
| **Group Profile**         | Group topics, roles, collaborative relationships |
| **Group User Profile**    | User-specific profiles within group contexts     |
| **Conversation Metadata** | Scene type and participant information           |

### Memory Extraction

Extraction runs in parallel via `asyncio.gather()`:

- **Episode Extraction**: Generates narrative summaries with subject and importance scoring.
- **Foresight Generation**: Predicts future events with trigger timing.
- **Event Log Creation**: Structures atomic facts with entity/action/time relationships.
- **Profile Synthesis**: Incrementally builds user/group characteristics from clustered MemCells.

All extractors follow a consistent pattern: standardized request objects, LLMProvider integration for generation, VectorizeService for embedding generation (primary + fallback).

### Triple-Database Persistence

| Database          | Role                | Details                                                                            |
| ----------------- | ------------------- | ---------------------------------------------------------------------------------- |
| **MongoDB**       | Source of truth     | Full document storage, indexed by user_id/group_id/timestamp                       |
| **Elasticsearch** | BM25 keyword search | Jieba tokenization, index namespace `{ns}_episodic_memory`, `{ns}_foresight`, etc. |
| **Milvus**        | Vector search       | 1024-dimensional HNSW index with L2 distance metrics                               |

Episodes persist to all three immediately. Foresights/EventLogs use eventual consistency via async MemorySyncService.

---

## Retrieval Strategies

| Strategy           | Mechanism                                           | Latency    | Use Case                           |
| ------------------ | --------------------------------------------------- | ---------- | ---------------------------------- |
| **Keyword (BM25)** | Elasticsearch keyword matching                      | ~50–200ms  | Exact term matching                |
| **Vector**         | Milvus HNSW semantic similarity search              | ~100–300ms | Conceptual queries                 |
| **Hybrid**         | Parallel keyword + vector with reranking            | ~200–500ms | Balanced performance (recommended) |
| **RRF**            | Reciprocal Rank Fusion (k=60)                       | ~200–400ms | Fast fusion without rerank cost    |
| **Agentic**        | LLM-guided two-round search with sufficiency checks | ~1–3s      | Complex multi-faceted queries      |

Reranking is optional and can be layered on top of any strategy.

---

## Tech Stack

| Component        | Technology                                                       |
| ---------------- | ---------------------------------------------------------------- |
| Runtime          | Python 3.10+, FastAPI, Pydantic, asyncio                         |
| Primary Storage  | MongoDB 7.0+ (via Beanie ODM)                                    |
| Caching / Locks  | Redis 7.x                                                        |
| Full-Text Search | Elasticsearch 8.x (BM25 + jieba tokenization)                    |
| Vector Search    | Milvus 2.4+ (HNSW, 1024-dim)                                     |
| AI Services      | Configurable LLM (OpenAI, DeepSeek, Anthropic, Grok, OpenRouter) |
| Embeddings       | Qwen/Qwen3-Embedding-4B (via DeepInfra or vLLM)                  |
| Reranking        | Qwen/Qwen3-Reranker-4B (via DeepInfra or vLLM)                   |
| Containerization | Docker / Docker Compose                                          |
| Package Manager  | uv                                                               |
| Observability    | Custom Prometheus-compatible metrics with multi-tenant labels    |

---

## Quick Start

```bash
git clone https://github.com/EverMind-AI/EverMemOS.git
cd EverMemOS
docker compose up -d

# Install uv (Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync

# Configure environment
cp env.template .env
# Edit .env — set LLM_API_KEY and VECTORIZE_API_KEY

# Start the server (runs at http://localhost:1995)
uv run python src/run.py

# Health check
curl http://localhost:1995/health

# Run demo
uv run python src/bootstrap.py demo/simple_demo.py
```

---

## API Reference

Base URL: `http://localhost:1995`

### Core Endpoints

| Method   | Endpoint                        | Purpose                                                |
| -------- | ------------------------------- | ------------------------------------------------------ |
| `POST`   | `/api/v1/memories`              | Store messages (with intelligent extraction)           |
| `GET`    | `/api/v1/memories`              | Fetch memories by type (user_id, group_id, time range) |
| `GET`    | `/api/v1/memories/search`       | Search memories with 5 retrieval methods               |
| `DELETE` | `/api/v1/memories`              | Delete memories                                        |
| `POST`   | `/api/v1/conversation-metadata` | Store conversation metadata                            |

### Store a Memory

```bash
curl -X POST "http://localhost:1995/api/v1/memories" \
  -H "Content-Type: application/json" \
  -d '{
    "message_id": "msg_001",
    "create_time": "2025-01-20T10:00:00+00:00",
    "sender": "user_001",
    "content": "I love building AI applications with memory!"
  }'
```

### Message Fields

| Field         | Type   | Required | Description                         |
| ------------- | ------ | -------- | ----------------------------------- |
| `message_id`  | string | Yes      | Unique identifier                   |
| `create_time` | string | Yes      | ISO 8601 timestamp                  |
| `sender`      | string | Yes      | Sender ID                           |
| `sender_name` | string | No       | Display name                        |
| `content`     | string | Yes      | Message text                        |
| `refer_list`  | array  | No       | Referenced messages                 |
| `group_id`    | string | No       | Group identifier (multi-user/agent) |
| `group_name`  | string | No       | Group display name                  |

### Search Memories

```bash
curl -X GET "http://localhost:1995/api/v1/memories/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What does the user love?",
    "user_id": "user_001",
    "retrieve_method": "hybrid"
  }'
```

**`retrieve_method` options**: `keyword`, `vector`, `hybrid`, `rrf`, `agentic`

**`memory_types` filter options**: `episodic_memory`, `profile`, `foresight`, `event_log`

### Response Format

```json
{
  "code": 0,
  "message": "success",
  "result": {
    "count": 2,
    "saved_memories": [
      {
        "memory_id": "mem_001",
        "type": "episode",
        "content": "Extracted memory"
      }
    ]
  }
}
```

### Client Examples

**Python (httpx)**:

```python
import httpx

async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://localhost:1995/api/v1/memories",
        json={
            "message_id": "msg_001",
            "create_time": "2025-02-01T10:00:00+00:00",
            "sender": "user_103",
            "content": "Message content"
        }
    )
```

**JavaScript (fetch)**:

```javascript
fetch('http://localhost:1995/api/v1/memories', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message_id: 'msg_001',
    create_time: '2025-02-01T10:00:00+00:00',
    sender: 'user_103',
    content: 'Message content',
  }),
});
```

### Batch Loading

```bash
uv run python src/bootstrap.py src/run_memorize.py \
  --input data/group_chat_en.json \
  --scene group_chat \
  --api-url http://localhost:1995/api/v1/memories
```

Sample data files: `data/group_chat_en.json` (English), `data/group_chat_zh.json` (Chinese).

---

## Configuration

All settings live in a `.env` file (copied from `env.template`). Settings are loaded via dataclass `__post_init__()` methods at service initialization — environment variables take precedence over defaults. No configuration files are used beyond `.env`.

**Security**: Never commit `.env`. Restrict permissions: `chmod 600 .env`. Use separate API keys for dev vs. prod. Store production credentials in secret management systems.

### LLM Settings

| Variable          | Description                                        | Default / Example                 |
| ----------------- | -------------------------------------------------- | --------------------------------- |
| `LLM_PROVIDER`    | Provider (use `openai` for SDK compat)             | `openai`                          |
| `LLM_MODEL`       | Model name                                         | `gpt-4o-mini`, `x-ai/grok-4-fast` |
| `LLM_BASE_URL`    | API endpoint (supports OpenRouter, DeepSeek, etc.) | `https://api.openai.com/v1`       |
| `LLM_API_KEY`     | API key                                            | —                                 |
| `LLM_TEMPERATURE` | Sampling temperature                               | `0.3`                             |
| `LLM_MAX_TOKENS`  | Token limit                                        | `32768`                           |

Supports OpenRouter, DeepSeek, Qwen, Claude Sonnet, and direct OpenAI through configurable endpoints.

**Model selection**: Use `openai/gpt-4o-mini` for evaluation/benchmarking (reproducible). Use `x-ai/grok-4-fast` for production/demo (balanced speed/cost/quality).

### Vectorization Settings (Primary + Fallback)

| Variable                      | Description                                                 |
| ----------------------------- | ----------------------------------------------------------- |
| `VECTORIZE_PROVIDER`          | `deepinfra` or `vllm`                                       |
| `VECTORIZE_API_KEY`           | Required for DeepInfra; use `EMPTY` for vLLM                |
| `VECTORIZE_BASE_URL`          | Service endpoint                                            |
| `VECTORIZE_MODEL`             | e.g., `Qwen/Qwen3-Embedding-4B`                             |
| `VECTORIZE_DIMENSIONS`        | Target dimensions; `1024` default (`0` disables truncation) |
| `VECTORIZE_FALLBACK_PROVIDER` | Fallback provider type or `none` to disable                 |
| `VECTORIZE_FALLBACK_API_KEY`  | Required for DeepInfra fallback                             |
| `VECTORIZE_FALLBACK_BASE_URL` | Required if fallback enabled                                |
| `VECTORIZE_TIMEOUT`           | Request timeout (default: `30` seconds)                     |
| `VECTORIZE_MAX_RETRIES`       | Retry attempts (default: `3`)                               |
| `VECTORIZE_BATCH_SIZE`        | Texts per batch (default: `10`)                             |
| `VECTORIZE_MAX_CONCURRENT`    | Max concurrent requests (default: `5`)                      |
| `VECTORIZE_ENCODING_FORMAT`   | Encoding format (default: `float`)                          |

Fallback activates when: provider is not `none`, base URL is configured, and API key is set (for DeepInfra) or provider is `vllm`.

### Reranking Settings (Primary + Fallback)

| Variable                   | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `RERANK_PROVIDER`          | `deepinfra` or `vllm`                          |
| `RERANK_API_KEY`           | Required for DeepInfra; `EMPTY` for vLLM       |
| `RERANK_BASE_URL`          | Service URL                                    |
| `RERANK_MODEL`             | e.g., `Qwen/Qwen3-Reranker-4B`                 |
| `RERANK_FALLBACK_PROVIDER` | Fallback provider type or `none`               |
| `RERANK_FALLBACK_API_KEY`  | Required for DeepInfra fallback                |
| `RERANK_FALLBACK_BASE_URL` | Required if fallback enabled                   |
| `RERANK_TIMEOUT`           | Request timeout (default: `30` seconds)        |
| `RERANK_MAX_RETRIES`       | Retry attempts (default: `3`)                  |
| `RERANK_BATCH_SIZE`        | Query-document pairs per batch (default: `10`) |
| `RERANK_MAX_CONCURRENT`    | Max concurrent requests (default: `5`)         |

Endpoint differences: vLLM uses `/v1/rerank`; DeepInfra uses `/v1/inference`.

### Database Configuration

| Service       | Host      | Port  | Notes                                                                                       |
| ------------- | --------- | ----- | ------------------------------------------------------------------------------------------- |
| Redis         | localhost | 6379  | DB index 8; `REDIS_SSL` option available                                                    |
| MongoDB       | localhost | 27017 | User: `admin`, Pass: `memsys123`, DB: `memsys`; URI params configurable                     |
| Elasticsearch | localhost | 19200 | Index namespace: `memsys`; supports multi-node (comma-separated hosts); optional basic auth |
| Milvus        | localhost | 19530 | Collection namespace: `memsys`                                                              |

Index/collection naming: `{namespace}_episodic_memory`, `{namespace}_foresight`, etc.

### Other Settings

| Variable             | Options                             | Default                 |
| -------------------- | ----------------------------------- | ----------------------- |
| `LOG_LEVEL`          | `INFO`, `DEBUG`, `WARNING`, `ERROR` | `INFO`                  |
| `ENV`                | `dev`, `prod`, `staging`            | `dev`                   |
| `MEMORY_LANGUAGE`    | `zh`, `en`                          | `en`                    |
| `API_BASE_URL`       | Client connection endpoint          | `http://localhost:1995` |
| `PYTHONASYNCIODEBUG` | Asyncio debug mode                  | `1`                     |

**Critical**: `MEMORY_LANGUAGE` must match your data language and be configured before starting the server. Mismatches result in mixed-language extracted memories.

### Deployment Options

- **DeepInfra** (recommended): Use DeepInfra API endpoints for both vectorization and reranking.
- **Local vLLM**: Run vLLM locally. Embedding models deploy with `--task embed`, reranker models with `--task reward` (requires vLLM v0.4.0+).

### Troubleshooting

| Issue                | Symptom                                 | Solution                                                                  |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Missing API key      | `VectorizeError: API key required`      | Set `VECTORIZE_API_KEY` or fallback variant                               |
| Fallback not working | Primary failures don't trigger fallback | Verify fallback provider isn't `none`; ensure `_FALLBACK_BASE_URL` is set |
| Language mismatch    | Mixed Chinese/English in memories       | Update `MEMORY_LANGUAGE` in `.env` and restart                            |
| Connection refused   | `ConnectionError` to database           | Verify Docker services: `docker-compose ps`                               |
| Timeout errors       | `TimeoutError` from vLLM                | Increase `VECTORIZE_TIMEOUT` or check vLLM server logs                    |

---

## Performance

| Metric                 | Value                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| **LoCoMo accuracy**    | 93% overall (95% single-hop, 91% multi-hop reasoning)                     |
| **Message ingestion**  | 100–500 msgs/sec with batching                                            |
| **Extraction latency** | 2–5 seconds for new MemCell (parallel LLM calls)                          |
| **Database scaling**   | Horizontal via MongoDB replica sets and Elasticsearch multi-node clusters |

Additional benchmarks: **LongMemEval**, **PersonaMem**. Includes a built-in evaluation suite with smoke testing.

---

## Observability

Custom Prometheus-compatible metrics with multi-tenant labels (`space_id`, `raw_data_type`):

- Memorize latency
- Boundary detection triggers
- Memory extraction counts
- Retrieval method distribution
- AI service fallback tracking

---

## Use Cases

- **Assistant Mode** (1-on-1): Personal attributes extraction, foresight generation, personalized recommendations.
- **Group Chat Mode**: Team dynamics tracking, role identification, collaborative knowledge management.
- Customer service bots with conversation history
- Education tutors and therapy companions
- CRM assistants and content creator copilots
- Game NPC systems with persistent memory
- Research analysis tools

---

## Integration Opportunities

EverMemOS is designed for integration as a platform plugin or backend:

- Browser extensions (Chrome)
- IDE extensions (VSCode)
- Chat platform bots (Slack, Discord)
- Knowledge tools (Notion, Obsidian)
- AI frameworks (LangChain backend, LlamaIndex connector)
- CLI tools

---

## Practical Notes

- Memory extraction may be delayed due to boundary detection — don't expect instant indexing after storing.
- Use `hybrid` retrieval for the best speed/accuracy balance in most scenarios.
- Use `group_id` to separate memory spaces for multi-user or multi-agent setups.
- The `agentic` retrieval method is most powerful but slowest — reserve for complex queries.
- Pre-loaded sample data is available for testing without building your own dataset.
- MongoDB serves as source of truth; Elasticsearch and Milvus are async-synced with eventual consistency.
- Vectorization and reranking use a dual-provider strategy with automatic fallback on failure.
