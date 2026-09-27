# Architecture

## The claim

The product is not a chatbot. It is an **orchestration layer** that turns an
ambiguous everyday problem into a safe, multi-step workflow. The architecture
exists to make that claim true in code.

## Component map

```mermaid
flowchart TB
    UI["Alexa+<br/>(or web UI)"]
    AG["Independence Agent<br/>apps/agent<br/><br/>planner — classify intent<br/>context resolver — &quot;that bill&quot; → contextId<br/>safety policy — 4-level action model<br/>tool orchestration — sequence MCP calls"]
    MCP["MCP Server<br/>mcp-server<br/><br/>7 typed tools<br/>Zod schemas<br/>Guards"]

    U["Understand<br/><br/>Bedrock or<br/>OpenAI"]
    M["Memory<br/><br/>DynamoDB<br/>(5 tables)"]
    A["Actions<br/><br/>Reminders, Drafts,<br/>Message send"]

    UI -->|HTTPS| AG
    AG -->|MCP Streamable HTTP| MCP
    MCP --> U
    MCP --> M
    MCP --> A
```

## Responsibilities

| Layer | Owns | Must not |
|---|---|---|
| **Web UI** | Conversation display, voice input, visible confirmation gate | Reach the MCP server directly |
| **Agent** (`apps/agent`) | Intent classification, reference resolution, safety policy, tool sequencing, response generation | Touch DynamoDB; decide whether a send is authorized |
| **MCP Server** (`mcp-server`) | Capability exposure, input validation, guard enforcement | Contain agent reasoning; decide *when* to send |
| **DB layer** (`mcp-server/src/db`) | Persistent state, conditional writes | Expose raw CRUD to the agent |
| **AWS** | Reasoning (Bedrock), state (DynamoDB), deployment (AgentCore) | Be decorative |

## Data flow for the hero scenario

```mermaid
flowchart TB
    U1["User: &quot;I got a message from the electricity company. I don't understand it.&quot;"]
    U1 --> P1["Agent calls planner (Bedrock/OpenAI) → UNDERSTAND_MESSAGE"]
    P1 --> M1["Agent calls MCP: analyze_message(content, source)"]
    M1 --> R1["Returns { summary, facts, entities, questionsAnswerableFromSource }"]
    R1 --> M2["Agent calls MCP: save_context per entity"]
    M2 --> R2["Writes to DynamoDB contexts table"]
    R2 --> L1["Agent calls LLM: generate reply from extracted summary"]
    L1 --> O1["Returns { reply, context, actions, pendingConfirmation: null }"]

    U2["User: &quot;Remind me on the 10th.&quot;"]
    U2 --> P2["Agent calls planner → CREATE_REMINDER"]
    P2 --> R3["Agent resolves &quot;it&quot; → active context (no LLM, no lookup — vague ref)"]
    R3 --> D1["Agent parses &quot;the 10th&quot; → ISO datetime"]
    D1 --> M3["Agent calls MCP: create_reminder(title, scheduledAt, relatedContextId)"]
    M3 --> O2["Returns { reply, actions: [reminder_created] }"]

    U3["User: &quot;And tell my daughter about it.&quot;"]
    U3 --> P3["Agent calls planner → DRAFT_MESSAGE"]
    P3 --> R4["Agent resolves &quot;it&quot; → active context"]
    R4 --> M4["Agent calls MCP: draft_family_message(recipient, content, relatedContextId)"]
    M4 --> T1["Issues one-time confirmation token, stores on draft row"]
    T1 --> O3["Returns { reply, pendingConfirmation: {...} } ← STOPS. Nothing sent."]

    U4["User: &quot;Yes.&quot;"]
    U4 --> P4["Agent planner short-circuits (deterministic, no LLM) → CONFIRM_SEND"]
    P4 --> M5["Agent calls MCP: send_family_message(draftId, confirmationToken, userConfirmation)"]
    M5 --> G1["Guard 1: draft exists?"]
    G1 --> G2["Guard 2: status === 'draft'?"]
    G2 --> G3["Guard 3: token matches stored token?"]
    G3 --> G4["Guard 4: userConfirmation non-empty?"]
    G4 --> W1["Conditional write: draft → confirmed → sent"]
    W1 --> O4["Returns { reply, actions: [message_sent], pendingConfirmation: null }"]
```

## Why the agent and MCP server are separate processes

1. **Swap the entry point without touching the orchestrator.** Real Alexa+ MCP Toolkit access would replace the web UI. The agent, MCP server, and data layer stay identical.

2. **Enforce the safety gate at the capability boundary.** The agent decides when to *ask*; the MCP server decides whether to *execute*. Neither trusts the other. A compromised or confused agent cannot force a send.

3. **Match Amazon's deployment model.** AgentCore hosts MCP servers over Streamable HTTP. Building against that boundary means the deployment story is already true.

## Why `buildServer()` is a separate file

`mcp-server/src/build-server.ts` constructs an `McpServer` with all seven tools registered. `server.ts` binds it to Express and a port. Tests import `buildServer` directly and connect over `InMemoryTransport`, so the same code path is exercised without opening a socket. Separation of construction from deployment is what makes the tool tests fast and reliable.

## Latency budget

Amazon's Alexa+ MCP requirements specify a 500ms round-trip budget per query. Our pipeline:

| Stage | Typical |
|---|---|
| Planner (LLM classification, short prompt) | 200–400ms |
| `analyze_message` (deterministic extractor) | <5ms |
| `save_context` (DynamoDB write) | 10–20ms |
| Response generation (LLM, short prompt) | 300–600ms |

The two LLM calls dominate. For the demo, this is acceptable — the total is under 1.5s wall-clock, and the extraction path stays under 500ms on its own.

If tighter latency is needed later, the planner can be replaced with a classifier (fewer tokens, faster) and response generation can stream. Neither change affects the architecture.
