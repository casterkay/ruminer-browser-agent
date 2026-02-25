This document provides a complete reference for EverMemOS's REST APIs. It covers both the V1 Memory Controller API (production-ready memory management) and the V3 Agentic API (advanced retrieval and orchestration).

For high-level architecture context, see Architecture. For implementation details of memory processing, see Memory Processing Deep Dive. For practical examples, see Demos and Client Examples.
Overview

EverMemOS exposes two primary API surfaces:
API Version Purpose Base Path Status
V1 Memory Controller Memory storage, retrieval, and metadata management /api/v1/memories Production
V3 Agentic Advanced agentic retrieval with LLM-guided multi-round search /api/v3/agentic Production

EverMemOS supports tenant context headers for multi-tenant isolation and supports both synchronous and background processing modes.

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py1-979
README.md456-547
Common API Concepts
Tenant Context Headers

EverMemOS supports tenant identification headers:
Header Required Description Example
X-Organization-Id Yes Organization identifier org_123
X-Space-Id Yes Space identifier within organization space_456
X-API-Key Optional API authentication key sk_test_abc123

These headers enable resource isolation across tenants. See Multi-Tenant Architecture for details.

Ruminer MVP conventions (EverMemOS managed cloud)

- Use a single EverMemOS API key in a single organization/space for all Ruminer users/tenants (i.e., `X-Organization-Id` and `X-Space-Id` are constant values configured on the server).
- Tenant isolation for Ruminer MVP is implemented by encoding `TENANT_ID` into EverMemOS identifiers:
  - Sender / user ID: `TENANT_ID:AGENT_ID` (where `AGENT_ID` can be `me` or a model ID like `anthropic/claude-sonnet-4.6`)
  - Group ID: `TENANT_ID:PLATFORM:THREAD_ID` (thread = conversation/social post thread)

Sources:
tests/test_memory_controller.py84-97
Response Format

All endpoints return a unified response structure:

{
"status": "ok|failed",
"message": "Human-readable status message",
"result": {
// Endpoint-specific data
}
}

For errors, the response includes:

{
"status": "failed",
"code": "ERROR_CODE",
"message": "Error description",
"timestamp": "2025-01-15T10:30:00+00:00",
"path": "/api/v1/memories"
}

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py237-245
src/infra_layer/adapters/input/api/memory/memory_controller.py385-389
Synchronous vs. Background Processing

Endpoints that trigger memory extraction support a sync_mode query parameter:

    sync_mode=true (default): Block until memory extraction completes
    sync_mode=false: Queue for background processing, return immediately

Sources:
tests/test_memory_controller.py148-157
API Endpoint Hierarchy

Diagram: API Endpoint Structure

This diagram shows the relationship between API endpoints and their backing services. Both V1 and V3 APIs ultimately invoke the same MemoryManager orchestrator.

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py42-979
V1 Memory Controller API

The V1 API provides production-ready endpoints for memory lifecycle management.
POST /api/v1/memories

Store single message memory

Accepts a single message in simplified format and processes it through the memory extraction pipeline. Messages accumulate until boundary detection triggers extraction.

Endpoint: POST /api/v1/memories

Request Body:

{
"message_id": "msg_001",
"create_time": "2025-02-01T10:00:00+08:00",
"sender": "tenant_123:me",
"sender_name": "Me",
"content": "We need to complete the product design this week",
"group_id": "tenant_123:chatgpt:conv_001",
"group_name": "chatgpt conversation conv_001",
"scene": "group_chat",
"refer_list": ["msg_000"]
}

Request Fields:
Field Type Required Description
message_id string Yes Unique message identifier
create_time string Yes ISO 8601 timestamp with timezone
sender string Yes User ID of sender
sender_name string No Display name of sender
content string Yes Message text content
group_id string No Group/conversation identifier
group_name string No Group display name
scene string Yes Must be assistant or group_chat
refer_list array[string] No Referenced message IDs

Response (Extracted):

{
"status": "ok",
"message": "Extracted 2 memories",
"result": {
"saved_memories": [
{
"memory_type": "episodic_memory",
"user_id": "tenant_123:me",
"group_id": "tenant_123:chatgpt:conv_001",
"timestamp": "2025-02-01T10:00:00",
"summary": "Discussion about product design deadline"
}
],
"count": 2,
"status_info": "extracted"
}
}

Response (Accumulated):

{
"status": "ok",
"message": "Message queued, awaiting boundary detection",
"result": {
"saved_memories": [],
"count": 0,
"status_info": "accumulated"
}
}

Processing Flow:

Diagram: Memory Storage Request Flow

This sequence shows how messages are either accumulated or extracted based on boundary detection.

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py63-257
tests/test_memory_controller.py311-461
GET /api/v1/memories

Fetch user memories (KV retrieval)

Directly retrieves stored memories by user ID without search ranking. Supports multiple memory types.

Endpoint: GET /api/v1/memories

Request Body (JSON in GET request):

{
"user_id": "tenant_123:me",
"memory_type": "episodic_memory",
"limit": 10,
"offset": 0
}

Request Fields:
Field Type Required Description
user_id string Yes User identifier
memory_type string Yes episodic_memory, event_log, foresight, profile
limit integer No Maximum results (default: 10)
offset integer No Pagination offset (default: 0)

Response:

{
"status": "ok",
"message": "Memory retrieval successful, retrieved 5 memories",
"result": {
"memories": [
{
"memory_type": "episodic_memory",
"user_id": "tenant_123:me",
"timestamp": "2025-01-15T10:30:00",
"summary": "Discussed coffee preference",
"group_id": "tenant_123:chatgpt:conv_001"
}
],
"total_count": 15,
"has_more": true,
"metadata": {
"source": "fetch_mem_service",
"user_id": "tenant_123:me",
"memory_type": "episodic_memory"
}
}
}

Memory Types:
Type Description Common Fields
episodic_memory Conversation summaries summary, timestamp, group_id
event_log Atomic facts atomic_fact, timestamp, user_id
foresight Future predictions content, parent_episode_id, valid_until
profile User characteristics full_name, traits, preferences

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py259-402
tests/test_memory_controller.py463-518
GET /api/v1/memories/search

Search memories (keyword/vector/hybrid retrieval)

Performs ranked retrieval based on query text. Supports three retrieval strategies.

Endpoint: GET /api/v1/memories/search

Request Body:

{
"user_id": "tenant_123:me",
"query": "coffee preferences",
"data_source": "episode",
"memory_scope": "personal",
"retrieval_mode": "rrf",
"top_k": 10,
"start_time": "2024-12-01T00:00:00+08:00",
"end_time": "2025-01-15T23:59:59+08:00"
}

Request Fields:
Field Type Required Description
query string Yes* Natural language query (*optional for profile source)
user_id string No Filter by user ID
group_id string No Filter by group ID
data_source string Yes episode, event_log, foresight, profile
memory_scope string Yes personal, group, all
retrieval_mode string Yes bm25, embedding, rrf (recommended)
top_k integer No Results per group (default: 5)
start_time string No ISO 8601 timestamp for time filtering
end_time string No ISO 8601 timestamp for time filtering

Retrieval Modes:
Mode Method Use Case Speed
bm25 Keyword (BM25) Exact term matching Fast
embedding Vector similarity Semantic similarity Medium
rrf Reciprocal Rank Fusion Balanced precision/recall Medium

Response:

{
"status": "ok",
"message": "Memory search successful, retrieved 3 groups",
"result": {
"memories": [
{
"group_456": [
{
"memory_type": "episodic_memory",
"user_id": "tenant_123:me",
"timestamp": "2025-01-15T10:30:00",
"summary": "Discussed coffee preference",
"group_id": "tenant_123:chatgpt:conv_001"
}
]
}
],
"scores": [[0.95, 0.87]],
"importance_scores": [0.85],
"total_count": 3,
"has_more": false,
"metadata": {
"source": "hybrid_retrieval",
"user_id": "tenant_123:me",
"memory_type": "retrieve"
}
}
}

Response Structure:

    memories: List of dictionaries, each containing {group_id: [memory_list]}
    scores: List of score arrays, one per group, matching memory order
    importance_scores: Overall importance per group (for vector/hybrid modes)
    total_count: Number of groups returned
    has_more: Pagination indicator

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py404-563
tests/test_memory_controller.py637-799
POST /api/v1/memories/conversation-meta

Save conversation metadata

Creates or updates complete conversation metadata including participants, scene, and tags.

Endpoint: POST /api/v1/memories/conversation-meta

Request Body:

{
"version": "1.0",
"scene": "assistant",
"scene_desc": {
"description": "Project collaboration chat",
"bot_ids": ["bot_001"],
"extra": {"category": "work"}
},
"name": "Project Discussion Group",
"description": "Technical design discussions",
"group_id": "tenant_123:chatgpt:conv_001",
"created_at": "2025-01-15T10:00:00+08:00",
"default_timezone": "Asia/Shanghai",
"user_details": {
"tenant_123:me": {
"full_name": "Alice Chen",
"role": "developer",
"extra": {"department": "Engineering"}
}
},
"tags": ["project", "technical"]
}

Request Fields:
Field Type Required Description
version string Yes Metadata schema version
scene string Yes assistant or group_chat
scene_desc object Yes Scene-specific configuration
name string Yes Conversation display name
description string Yes Conversation description
group_id string Yes Unique group identifier
created_at string Yes ISO 8601 creation timestamp
default_timezone string Yes IANA timezone (e.g., Asia/Shanghai)
user_details object Yes Map of user_id → UserDetail
tags array[string] No Classification tags

UserDetail Schema:

{
"full_name": "string",
"role": "string",
"extra": {}
}

Response:

{
"status": "ok",
"message": "Conversation metadata saved successfully",
"result": {
"id": "507f1f77bcf86cd799439011",
"group_id": "tenant_123:chatgpt:conv_001",
"scene": "assistant",
"name": "Project Discussion Group",
"version": "1.0",
"created_at": "2025-01-15T02:00:00+00:00",
"updated_at": "2025-01-15T02:00:00+00:00"
}
}

Behavior:

    If group_id exists: Replaces entire record (upsert)
    If group_id does not exist: Creates new record

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py565-725
tests/test_memory_controller.py801-854
PATCH /api/v1/memories/conversation-meta

Partially update conversation metadata

Updates only specified fields of existing conversation metadata.

Endpoint: PATCH /api/v1/memories/conversation-meta

Request Body:

{
"group_id": "tenant_123:chatgpt:conv_001",
"name": "Updated Project Group",
"tags": ["project", "technical", "high-priority"]
}

Request Fields:
Field Type Required Description
group_id string Yes Group to update
Other fields various No Only provide fields to update

Updateable Fields:

    name, description, scene_desc, tags
    user_details (replaces entire map)
    default_timezone

Immutable Fields (cannot update):

    version, scene, group_id, conversation_created_at

Response:

{
"status": "ok",
"message": "Conversation metadata updated successfully, updated 2 fields",
"result": {
"id": "507f1f77bcf86cd799439011",
"group_id": "tenant_123:chatgpt:conv_001",
"scene": "assistant",
"name": "Updated Project Group",
"updated_fields": ["name", "tags"],
"updated_at": "2025-01-15T02:30:00+00:00"
}
}

Error Codes:

    404: Conversation metadata not found for group_id
    400: Missing required group_id or invalid field

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py727-978
tests/test_memory_controller.py856-903
V3 Agentic API

The V3 API provides advanced orchestration with LLM-guided retrieval and multi-round search.
POST /api/v3/agentic/memorize

Store memories with agentic processing

Similar to V1 memorize but with enhanced orchestration through MemoryManager. Supports complex conversation formats with metadata.

Endpoint: POST /api/v3/agentic/memorize

Request Body:

{
"conversation_meta": {
"group_id": "tenant_123:chatgpt:conv_001",
"name": "Project Team",
"scene": "group_chat",
"user_details": {
"tenant_123:me": {"full_name": "Alice", "role": "human"}
}
},
"conversation_list": [
{
"message_id": "msg_001",
"create_time": "2025-01-15T10:00:00+08:00",
"sender": "tenant_123:me",
"content": "Let's discuss the architecture"
}
]
}

Response:

Similar to V1 memorize with saved_memories, count, and status_info.

Sources:
README.md456-477
POST /api/v3/agentic/retrieve_lightweight

Lightweight retrieval (no LLM calls)

Fast retrieval using pre-configured strategies (BM25, embedding, or RRF) without LLM query refinement.

Endpoint: POST /api/v3/agentic/retrieve_lightweight

Request Body:

{
"query": "user's coffee preferences",
"user_id": "tenant_123:me",
"data_source": "episode",
"retrieval_mode": "rrf",
"top_k": 5
}

Retrieval Modes:

    bm25: Pure keyword search via Elasticsearch
    embedding: Pure vector search via Milvus
    rrf: Reciprocal Rank Fusion of both methods

Response:

Returns grouped memories with scores and importance rankings, similar to V1 search endpoint.

Sources:
README.md488-547
POST /api/v3/agentic/retrieve_agentic

Agentic multi-round retrieval (LLM-guided)

Intelligent retrieval with LLM-driven query expansion, multi-round search, and sufficiency checking.

Endpoint: POST /api/v3/agentic/retrieve_agentic

Request Body:

{
"query": "What food should I avoid after dental surgery?",
"user_id": "tenant_123:me",
"context": "User is asking for food recommendations",
"max_rounds": 3,
"data_source": "episode"
}

Request Fields:
Field Type Required Description
query string Yes User's natural language query
user_id string No Filter by user
context string No Additional context for query understanding
max_rounds integer No Maximum retrieval rounds (default: 3)
data_source string Yes Target memory type

Processing Flow:

Diagram: Agentic Retrieval Multi-Round Flow

This shows how the agentic retriever iteratively expands queries and checks sufficiency.

Key Features:

    Query Expansion: LLM generates 2-3 complementary queries
    Multi-Path Retrieval: Parallel RRF search across all queries
    Sufficiency Checking: LLM evaluates if results answer the query
    Iterative Refinement: Up to max_rounds attempts with query refinement

Response:

Similar structure to retrieve_lightweight but with additional metadata about rounds performed.

Sources:
README_zh.md189-194
GET /api/v3/agentic/conversation-meta

Retrieve conversation metadata

Fetches stored conversation metadata by group_id.

Endpoint: GET /api/v3/agentic/conversation-meta?group_id=group_001

Response:

Returns the ConversationMeta document with all fields from the POST/PATCH endpoints.
Request/Response Data Models
Common Data Structures
Message Format

{
message_id: string; // Unique message ID
create_time: string; // ISO 8601 with timezone
sender: string; // User ID
sender_name?: string; // Display name
content: string; // Message text
group_id?: string; // Optional group ID
group_name?: string; // Optional group name
scene: "assistant" | "group_chat";
refer_list?: string[]; // Referenced message IDs
}

Memory Object

{
memory_type: string; // "episodic_memory", "event_log", etc.
user_id: string; // Owner user ID
timestamp: string; // ISO 8601 timestamp
group_id?: string; // Optional group context

// Type-specific fields
summary?: string; // For episodic_memory
atomic_fact?: string; // For event_log
content?: string; // For foresight
traits?: object; // For profile
}

ConversationMeta

{
version: string;
scene: "assistant" | "group_chat";
scene_desc: {
description: string;
bot_ids?: string[];
extra?: object;
};
name: string;
description: string;
group_id: string;
created_at: string; // ISO 8601
default_timezone: string; // IANA timezone
user_details: {
[user_id: string]: {
full_name: string;
role: string;
extra?: object;
}
};
tags?: string[];
}

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py76-108
src/api_specs/dtos/memory_query.py (referenced)
API Request Flow Through System Layers

Diagram: API Request Processing Architecture

This diagram traces request flow from HTTP entry through converters, orchestration, and storage layers.

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py182-257
src/agentic_layer/memory_manager.py (referenced)
Error Handling
Error Response Format

{
"status": "failed",
"code": "ERROR_CODE",
"message": "Human-readable error description",
"timestamp": "2025-01-15T10:30:00+00:00",
"path": "/api/v1/memories/search"
}

Common Error Codes
HTTP Status Error Code Description Common Causes
400 INVALID_PARAMETER Request validation failed Missing required fields, invalid format
404 RESOURCE_NOT_FOUND Requested resource not found Invalid group_id, user has no memories
500 SYSTEM_ERROR Internal server error Database connection, LLM service failure
Error Examples

Missing Required Field:

{
"status": "failed",
"code": "INVALID_PARAMETER",
"message": "user_id cannot be empty",
"timestamp": "2025-01-15T10:30:00+00:00",
"path": "/api/v1/memories"
}

Conversation Not Found:

{
"status": "failed",
"code": "RESOURCE_NOT_FOUND",
"message": "Specified conversation metadata not found: group_123",
"timestamp": "2025-01-15T10:30:00+00:00",
"path": "/api/v1/memories/conversation-meta"
}

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py154-178
src/core/constants/errors.py (referenced)
Query Parameter Reference
Pagination Parameters

Available on fetch and search endpoints:
Parameter Type Default Description
limit integer 10 Maximum results per request
offset integer 0 Starting position for pagination
top_k integer 5 Maximum results per group (search only)
Time Filtering Parameters

Available on search endpoints:
Parameter Type Description Example
start_time string ISO 8601 lower bound 2024-12-01T00:00:00+08:00
end_time string ISO 8601 upper bound 2025-01-15T23:59:59+08:00
current_time string For foresight validity filtering 2025-01-15
Scope Parameters
Parameter Values Description
memory_scope personal, group, all Filter by user-only, group-only, or both
data_source episode, event_log, foresight, profile Target memory type

Sources:
src/infra_layer/adapters/input/api/memory/memory_controller.py260-343
tests/test_memory_controller.py467-477
Testing the API
Using curl

Store a message:

curl -X POST http://localhost:8001/api/v1/memories \
 -H "Content-Type: application/json" \
 -H "X-Organization-Id: ruminer" \
 -H "X-Space-Id: default" \
 -d '{
"message_id": "msg_001",
"create_time": "2025-01-15T10:00:00+08:00",
"sender": "tenant_123:me",
"content": "I love drinking coffee",
"scene": "assistant"
}'

Search memories:

curl -X GET http://localhost:8001/api/v1/memories/search \
 -H "Content-Type: application/json" \
 -H "X-Organization-Id: ruminer" \
 -H "X-Space-Id: default" \
 -d '{
"query": "coffee preferences",
"user_id": "tenant_123:me",
"data_source": "episode",
"memory_scope": "personal",
"retrieval_mode": "rrf"
}'

Using Python Test Script

Run the comprehensive test suite:

# Test all endpoints

python tests/test_memory_controller.py

# Test specific endpoint

python tests/test_memory_controller.py --test-method search_keyword

# Exclude specific tests

python tests/test_memory_controller.py --except-test-method memorize

# Custom API endpoint

python tests/test_memory_controller.py --base-url http://dev-server:8001

Sources:
tests/test_memory_controller.py1-1181
README.md461-477
Summary

The EverMemOS API provides comprehensive memory lifecycle management through two complementary surfaces:

    V1 Memory Controller: Production-ready CRUD operations with keyword/vector/hybrid search
    V3 Agentic API: Advanced LLM-guided retrieval with multi-round query refinement

Both APIs share common authentication, response formats, and tenant isolation mechanisms. Choose V1 for straightforward memory operations and V3 for intelligent, context-aware retrieval scenarios.
