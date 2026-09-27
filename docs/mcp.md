# MCP Integration

## Protocol requirements

| Item          | Value                                  | Source                                       |
| ------------- | -------------------------------------- | -------------------------------------------- |
| Spec version  | 2025-11-25 or later                    | Amazon Alexa+ MCP documentation              |
| Transport     | Streamable HTTP                        | MCP spec 2025-11-25 (SSE-only is deprecated) |
| Endpoint      | `POST /mcp`                            | Standard Streamable HTTP path                |
| SDK           | `@modelcontextprotocol/sdk` (official) | npm                                          |
| Session model | Stateless                              | Recommended for horizontal scaling           |

## Why Streamable HTTP and not SSE

The MCP specification deprecated the standalone HTTP+SSE transport in favor
of Streamable HTTP. Amazon's Alexa+ MCP documentation explicitly requires
Streamable HTTP. Building on SSE today would fail both the spec and the
hackathon requirement.

Our server uses `StreamableHTTPServerTransport` from
`@modelcontextprotocol/sdk/server/streamableHttp.js` with
`sessionIdGenerator: undefined` — stateless mode. Each request builds a
fresh `McpServer` and closes it when the response completes. No session
affinity, no in-memory session map, no sticky load balancer needed.

## The seven tools

Every tool has a Zod schema for input and output. The schema is serialized
to JSON Schema by the SDK, sent to the client during `tools/list`, and used
by the agent to understand argument shapes before calling.

### `analyze_message`

Extract structured facts from a message or document.

```text
Input: { content: string, source: string }
Output: {
summary: string,
facts: Array<{ label: string, value: string }>,
entities: Array<{ type, key, data }>,
questionsAnswerableFromSource: string[]
}
```

The `questionsAnswerableFromSource` array is the anti-hallucination
allow-list. The agent must not answer anything outside it without saying
the source does not cover the question.

**Demo implementation:** deterministic regex extractor for the electricity
bill fixture. **Production:** Amazon Bedrock Converse with a structured
output prompt. Same return shape.

### `get_context`

Retrieve previously stored context.

```text
Input: { userId: string, query: string, type?: ContextType }
Output: { matches: ContextMatch[] }
```

Two-tier lookup. Exact key match via the `KeyIndex` GSI first (fast). If no
match, fuzzy type-based search using the `type` hint or a heuristic. This
is what makes `"that bill"` resolvable across conversations.

### `save_context`

Persist an authorized fact.

```text
Input: { userId, type, key, data, source, ttlDays? }
Output: { contextId: string, saved: boolean }
```

TTL is optional. Reminders and drafts never expire. Contexts may expire
after 30 days to honor data minimization.

### `create_reminder`

```text
Input: { userId, title, scheduledAt, relatedContextId? }
Output: { reminderId: string, success: boolean }
```

`scheduledAt` must be ISO 8601 with timezone offset.

### `get_reminders`

```text
Input: { userId, status?: 'active' | 'completed' | 'cancelled' }
Output: { reminders: Array<{ reminderId, title, scheduledAt, status }> }
```

Uses the `StatusIndex` GSI.

### `draft_family_message`

Prepare a message. **Does not send.**

```text
Input: { userId, recipient, content, relatedContextId? }
Output: {
draftId: string,
recipient: string,
message: string,
requiresConfirmation: true,
confirmationToken: string
}
```

Issues a one-time token, stores it on the draft row, returns it exactly
once. The token must be passed back to `send_family_message` after the
user confirms.

### `send_family_message`

Send a previously drafted message. Rejects unless all four guards pass.

```text
Input: {
userId: string,
draftId: string,
confirmationToken: string,
userConfirmation: string
}
Output: {
sent: boolean,
draftId: string,
sentAt?: string,
rejectionReason?: string
}
```

See `docs/safety.md` for the four guards in detail.

## Tool descriptions

Tool descriptions are written for the model, not for humans. Each one
states when to use the tool and what constraints apply. For example,
`send_family_message`'s description reads:

> Send a previously drafted message. This tool will REJECT the call unless:
> (1) the draftId exists and is still in "draft" status, (2) the
> confirmationToken matches the one issued when the draft was created, and
> (3) userConfirmation contains the user's actual confirmation words. Never
> call this without having shown the draft to the user and received their
> explicit yes.

This is not decoration. The model reads it during tool selection and uses
it to decide whether the call is appropriate.

## Verification

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Connect to `http://localhost:3001/mcp`, transport **Streamable HTTP**. All
seven tools appear. Invoke `analyze_message` with the demo bill text and
inspect the structured response.

### Critical safety test

In the Inspector, call `send_family_message` with a non-existent draft:

```json
{
  "userId": "demo-user",
  "draftId": "nonexistent",
  "confirmationToken": "made-up",
  "userConfirmation": "yes"
}
```

Expected response:

```json
{ "sent": false, "draftId": "nonexistent", "rejectionReason": "No draft found for this user and draftId." }
```

If this returns `sent: true`, the safety model is broken. It does not.

---

## `docs/aws.md`

````markdown
# AWS Integration

AWS is used where it provides a concrete function. Nothing is added for
show.

## Services in use

| Service | Role | Where |
|---|---|---|
| **Amazon Bedrock** | Intent classification and response generation | `apps/agent/src/lib/llm/bedrock.ts` |
| **Amazon DynamoDB** | Persistent state across five tables | `mcp-server/src/db/*` |
| **Amazon Bedrock AgentCore** | Deployment target for the MCP server | Not deployed in MVP; architecture is compatible |

## Amazon Bedrock

### Where it is used

Two call sites in the agent:

1. **Planner** (`apps/agent/src/agent/planner.ts`) — classifies the user's
   message into one of nine intents. Short prompt, temperature 0, structured
   JSON output.
2. **Response generation** (`orchestrator.ts`) — turns the MCP tool result
   into a short spoken reply. Grounded in the tool output; the model is not
   asked to reason beyond what the tools returned.

### Model

Default: `us.anthropic.claude-sonnet-4-6` (cross-region inference profile).

The `us.` prefix selects cross-region inference. Bare model IDs for models
not available in every region return `ResourceNotFoundException`.

### Configuration

```text
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
````

### Provider abstraction

Bedrock is not called directly. `apps/agent/src/lib/llm/` exposes a
`LlmProvider` interface with `converse()` and `converseJson()`. Two adapters
implement it: `bedrock.ts` and `openai.ts`. The default is selected by
`LLM_PROVIDER` in `.env`.

This means the AWS narrative and the demo narrative are decoupled. If
Bedrock access is pending, the agent runs on OpenAI. When Bedrock access is
granted, changing one environment variable switches back. The DynamoDB and
MCP paths are identical either way.

## Amazon DynamoDB

### Tables

| Table                         | PK       | SK               | GSI                            | TTL         |
| ----------------------------- | -------- | ---------------- | ------------------------------ | ----------- |
| `independence-users`          | `userId` | —                | —                              | —           |
| `independence-context`        | `userId` | `contextId`      | `KeyIndex` (userId, key)       | `expiresAt` |
| `independence-reminders`      | `userId` | `reminderId`     | `StatusIndex` (userId, status) | —           |
| `independence-message-drafts` | `userId` | `draftId`        | —                              | —           |
| `independence-conversations`  | `userId` | `conversationId` | —                              | `expiresAt` |

Billing mode is `PAY_PER_REQUEST` for every table. This is a hackathon
project; provisioned capacity would be waste.

### Why a GSI on `key` for the context table

The primary key is `(userId, contextId)`, which supports point lookups by
ID. But the agent's most common query is "give me the context whose key is
`electricity_bill` for this user." Without a GSI, that's a `ScanCommand`.
With `KeyIndex` on `(userId, key)`, it's a `QueryCommand` — one partition,
one item.

### Why conditional writes for drafts

`markConfirmed` and `markSent` use `ConditionExpression`:

```text
SET status = 'confirmed' WHERE status = 'draft'
SET status = 'sent' WHERE status = 'confirmed'
```

This makes the safety model enforced at the database level. A double-send
or a skip-ahead throws `ConditionalCheckFailedException`. The MCP tool
catches it and returns a rejection rather than a fake success.

### Table creation

```bash
bash infrastructure/scripts/create-tables.sh
```

Idempotent. Re-running on an existing setup is a no-op.

## Amazon Bedrock AgentCore

AgentCore Runtime supports Streamable HTTP MCP servers. Our server is built
against that transport. Deployment would involve:

1. Package `mcp-server` as a container (Dockerfile is in place)
2. Push to ECR
3. Create an AgentCore Runtime pointing at the ECR image
4. Obtain a public MCP endpoint

**Not deployed in the MVP.** The demo runs the MCP server locally and the
agent reaches it over `localhost:3001`. The transport and tool surface are
identical to what AgentCore would expose; deploying is a container-registry
step, not an architectural one.

Skipping this is a deliberate scope decision, not a capability gap. If a
judge asks "could this run on AgentCore?", the answer is yes and the
`Dockerfile` in `mcp-server/` is the evidence.

````

---

## `docs/alexa-integration-status.md`

```markdown
# Alexa+ Integration Status

Honest disclosure of what is integrated, what is simulated, and why.

## Current status

| Component | Status |
|---|---|
| MCP server (Streamable HTTP, spec 2025-11-25) | Real, functional |
| MCP tools (7) | Real, functional |
| DynamoDB persistence | Real, functional |
| Bedrock/OpenAI reasoning | Real, functional |
| Alexa+ MCP Toolkit connection | **Not available** — see below |
| Simulated Alexa+ conversational UI | Real, functional |

## Why the Alexa+ Toolkit is not connected

Amazon's Alexa+ developer documentation states: *"At this time, Category SDK
and MCP Toolkit are available to select partners only."*

That means the production Alexa+ integration path is not available to
hackathon participants today. This is a stated platform limitation, not a
gap in this project.

Amazon's own hackathon guidance for participants says: *"Add-ons are coming,
are not live yet, and will run on the open MCP standard, so Alexa+ not being
live in your country yet does not affect the track."*

Amazon's recommended approach for hackathon demos: *"ask your coding agent
for a web mockup of Alexa+, connect your MCP server to it, and show that
conversation in the video."*

## What we built instead

We followed that recommendation exactly.

1. **Built the MCP server against the real Alexa+ specification.** Streamable
   HTTP transport, MCP 2025-11-25, the seven tools the agent actually needs.
   Nothing about the server is a mock.

2. **Built a simulated Alexa+ conversational UI.** The web app in `apps/web/`
   is a voice-first conversational interface. It has the same shape as
   Alexa+ would present to the user: a conversation, a visible context panel
   showing extracted facts, and a confirmation prompt when an external
   action is proposed.

3. **Kept the boundary identical.** When MCP Toolkit access is granted, the
   change is: point Alexa+ at our MCP server, and drop the web UI. The
   agent, MCP server, tools, and data layer do not change.

## What is not claimed

We do not claim:

- That this project has a working Alexa+ production integration
- That Amazon has endorsed, reviewed, or tested this project
- That the web UI *is* Alexa+
- That the demo runs on real Alexa+ hardware

The web UI is explicitly labeled as a **simulated Alexa+ experience**
throughout the codebase and documentation. This is honest and it matches
Amazon's own guidance.

## What would change with MCP Toolkit access

1. Register the MCP server with the Alexa+ developer console.
2. Configure authentication (OAuth 2.1 with PKCE is required for production).
3. Deploy the MCP server to a publicly reachable endpoint — AgentCore
   Runtime is the natural target since our transport is already Streamable
   HTTP.
4. Remove `apps/web/` from the deployed stack.

That is roughly a day of work. The architecture is not blocked by any
design decision we made.
````
