# Amazon Nova Act

## 1. Overview

AWS service for building reliable AI agents that automate UI-based browser workflows. Combines a custom foundation model, an orchestrator (`ActDispatcher`), and a Playwright-based browser actuator — end-to-end trained — to translate natural language instructions into browser actions.

Designed to generalize across sites without brittle selectors. Trained on hard UI elements (date pickers, dropdowns, dynamic loading) via RL over simulated web gyms. ~90% reliability on production workflows. Often used as a low-level computer-use primitive inside multi-agent systems.

## 2. Terminology

- **Act** — A single `nova.act("...")` call; executes an agentic loop of observe-act cycles
- **Step** — One cycle within an act: observe page state, take one action
- **Session** — Browser instance with one or more sequential `act()` calls; state persists across calls
- **Workflow** — End-to-end task combining `act()` statements and Python code
- **Program** — List of executable `Call` objects derived from model output AST
- **Call** — Atomic operation invoking a browser action or custom tool

## 3. Architecture

### Components (from SDK source)

| Component                         | Source                                   | Role                                                                                                                                                |
| --------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NovaAct`                         | `nova_act.py`                            | Primary client — session lifecycle, auth, act dispatching                                                                                           |
| `ActDispatcher`                   | `dispatcher.py`                          | Implements the observation-action loop until completion/timeout/max steps                                                                           |
| `DefaultNovaLocalBrowserActuator` | `default_nova_local_browser_actuator.py` | Playwright-based browser controller — screenshots, DOM capture, page settling, navigation, tool registration                                        |
| `Routes`                          | `base.py`                                | Abstract backend communication; two implementations: `SunshineRoutes` (API key → Starburst backend) and `HeliosRoutes` (IAM SigV4 → Helios backend) |

### Agentic Loop (per `act()` call)

Each step is stateless — the model receives a fresh observation with no hidden state:

1. **Observe** — Capture screenshot + simplified DOM via `take_observation()`
2. **Infer** — Send `StepRequest` to backend; receive `ModelOutput` with `program_ast`
3. **Interpret** — `NovaActInterpreter` parses AST into executable `Program` (list of `Call` objects)
4. **Execute** — `ProgramRunner` executes calls sequentially via actuator or custom tools
5. **Decide** — Return statement → done; exception → error; otherwise → next step

### Backend Routing

- `nova_act_api_key` provided → `StarburstBackend`
  - Endpoint: `POST {uri}/step`, header `Authorization: ApiKey {key}`, 30s connect / 5min read timeout
- `Workflow` context present → `SunburstBackend`
  - Endpoint: `POST {uri}/nova-act/invoke`, SigV4-signed, payload with `nexusActId`, `nexusSessionId`, `planInput`
- Default → `StarburstBackend`

### Data Model

```
Session (unique ID, logs dir, stop hooks)
  └─ Act (session_id, timeout, max_steps, accumulates steps)
       └─ Step (ModelInput: observation → ModelOutput: program AST)
            └─ Program (list of Call objects)
                 └─ Call (atomic action)
```

## 4. Core API

```python
from nova_act import NovaAct

with NovaAct(starting_page="https://example.com") as nova:
    result = nova.act("click the search button")       # execute actions
    data = nova.act_get("get prices", schema=MySchema) # extract structured data
```

- `act(prompt)` — Natural language instruction → agentic loop → result with success status. Keep under 30 steps.
- `act_get(prompt, schema)` — Actions + structured data extraction matching a provided schema.

### Workflow (AWS deployment)

```python
from nova_act import NovaAct, Workflow

with Workflow(workflow_definition_name="my_workflow", model_id="nova-act-latest") as wf:
    with NovaAct(starting_page="https://example.com", workflow=wf) as nova:
        nova.act("complete task")
```

Also available as `@workflow` decorator.

## 5. Authentication

| Mode    | Config                                                               | Backend              | Use                   |
| ------- | -------------------------------------------------------------------- | -------------------- | --------------------- |
| API Key | `NOVA_ACT_API_KEY` env var; generate at nova.amazon.com/act          | Starburst (Sunshine) | Local experimentation |
| AWS IAM | boto3 session via `boto_session_kwargs`; requires `Workflow` context | Helios               | Production            |

## 6. Error Hierarchy

All `ActError` instances receive `ActMetadata` (session/act IDs, step counts, timing) via `@_handle_act_fail` decorator.

- **ActAgentError** — Task not feasible: failed, timeout, max steps exceeded
- **ActExecutionError** — Local failures: canceled, actuation error, invalid model output
- **ActClientError** — Bad request (400), guardrails triggered, rate limit (429)
- **ActServerError** — Internal error (500), service unavailable

## 7. Extension Points

- **Custom Tools** — `@tool` decorator exposes Python functions to the agent
- **Human-in-the-Loop** — Implement `HumanInputCallbacksBase` for approval (async screenshot review) or UI takeover (live browser handoff for CAPTCHAs/MFA)
- **Security Guardrails** — `state_guardrail` callback to control navigation
- **Observability** — `StopHook` interface for custom logging (e.g., `S3Writer`)
- **MCP** — Remote Model Context Protocol server connections for extended tool use
- **Agentic Frameworks** — Strands Agents, Amazon Bedrock AgentCore integration

## 8. Input Validation

Pre-execution validators raise `ValidationFailed` before any backend call:

- `validate_prompt()` — Non-empty string
- `validate_timeout()` — Positive integer
- `validate_url()` — http/https/file schemes
- `validate_step_limit()` — Positive integer

## 9. Interfaces

- **Playground** — Browser-based at nova.amazon.com/act; Amazon account only; export to Python
- **SDK** — `pip install nova-act`; Python 3.10+
- **IDE Extension** — VS Code, Cursor, Kiro; builder mode with live preview; integrated deployment
- **CLI** — Containerization, ECR, S3, IAM, workflow definitions; built into IDE extension
- **Console** — Workflow runs with observability: Runs → Sessions → Acts → Steps

## 10. Prompting Best Practices

1. Be direct — action-oriented language, not conversational
2. Complete instructions — all details/constraints in one prompt
3. Break down complex tasks into smaller sequential `act()` calls
4. Keep each act under ~30 steps
5. Avoid ambiguity — explicit selectors/descriptions

## 11. Limitations

- CAPTCHAs require HITL UI takeover
- English only
- First run: 1-2 min for Playwright setup
- JS-heavy sites may be challenging
- SDK v3.0+ only
- macOS Sierra+ / Ubuntu 22.04+ / Windows 10+ (WSL2)

---

References:

- https://github.com/aws/nova-act
- https://deepwiki.com/aws/nova-act
- https://docs.aws.amazon.com/nova-act/latest/userguide/what-is-nova-act.html
- https://github.com/amazon-agi-labs/nova-act-samples/blob/main/examples/README.md
