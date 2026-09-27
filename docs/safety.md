# Safety Model

The agent assists. It does not act on the user's behalf without their consent.

Every tool call maps to one of four safety levels. The mapping lives in
`apps/agent/src/agent/safety.ts` as `getSafetyLevel()`. Changing the model
means editing that table — not hunting through the codebase.

## The four levels

| Level | Name               | Examples                                                  | Behaviour                                            |
| ----- | ------------------ | --------------------------------------------------------- | ---------------------------------------------------- |
| 1     | **Read**           | `analyze_message`, `get_context`, `get_reminders`         | Auto-execute                                         |
| 2     | **Low-risk**       | `save_context`, `create_reminder`, `draft_family_message` | Execute, then report what happened in plain language |
| 3     | **External comms** | `send_family_message`                                     | Draft → **explicit confirmation** → send             |
| 4     | **Irreversible**   | Payment, deletion                                         | Not executed in MVP. Simulated only.                 |

The level 3 gate is the one judges will test.

## How the gate works — end to end

### 1. The agent decides *when* to ask

In `orchestrator.ts`, `handleDraftMessage` calls `draft_family_message` and
stores the result in `state.pendingConfirmation`. It returns a reply ending
in "Should I send it?" and does **not** call `send_family_message`.

The switch statement in `handleMessage` has no path from `DRAFT_MESSAGE`
to `send_family_message`. They are separate intents.

### 2. Confirmation routing does not use the LLM

In `planner.ts`, the first thing the planner does is check for a pending
confirmation. If one exists and the user's message matches the affirmative
or negative regex, the planner returns `CONFIRM_SEND` or `DENY_SEND`
**without calling Bedrock or OpenAI**.

This means a prompt injection cannot trick the agent into confirming. The
regex in `safety.ts` is the only thing consulted; the LLM never sees the
message when a confirmation is pending and the reply is yes/no.

### 3. The MCP server independently validates the send

Even if the agent somehow called `send_family_message`, the server enforces
four guards in `mcp-server/src/tools/messaging.ts`:

```text
Guard 1: does a draft exist for (userId, draftId)?
Guard 2: is the draft still in status 'draft'?
Guard 3: does confirmationToken match the token stored on the draft?
Guard 4: is userConfirmation a non-empty string?
```

Each guard returns a structured rejection (`{ sent: false, rejectionReason }`)
rather than throwing. The agent can explain the failure to the user.

### 4. The database enforces the lifecycle

Even if all four guards passed, the write to DynamoDB uses conditional
expressions:

```text
markConfirmed: SET status = 'confirmed' WHERE status = 'draft'
markSent: SET status = 'sent' WHERE status = 'confirmed'
```

A draft cannot skip `confirmed`. A sent draft cannot be sent again. DynamoDB
throws `ConditionalCheckFailedException` on violation, and the tool surfaces
it as a rejection.

### 5. The confirmation token is one-time and server-issued

`draft_family_message` generates a UUID via `crypto.randomUUID()`, stores it
on the draft row, and returns it exactly once. `send_family_message` compares
with `crypto.timingSafeEqual`. A fabricated token fails. A reused token fails
because the draft is no longer in `draft` status.

## What "never" means

The system never:

* Sends a message without a matching draft row
* Sends a draft that has already been confirmed or sent
* Executes a payment or any level-4 action
* Claims an action succeeded when the tool returned a rejection
* Answers a follow-up question from outside the stored context

The last point is why `analyze_message` returns a
`questionsAnswerableFromSource` allow-list. Anything not on the list must be
answered with "the message doesn't say."

## Test coverage

| Behaviour                                 | Test file                                  | Count |
| ----------------------------------------- | ------------------------------------------ | ----- |
| Token generation, matching, timing-safety | `mcp-server/tests/confirmation.test.ts`    | 8     |
| Draft lifecycle conditional writes        | `mcp-server/tests/draft-lifecycle.test.ts` | 5     |
| Server-side send guards                   | `mcp-server/tests/tools.test.ts`           | 6     |
| Deterministic yes/no routing              | `apps/agent/tests/planner.test.ts`         | 7     |
| Agent sends nothing without confirmation  | `apps/agent/tests/workflows.e2e.test.ts`   | 2     |
| No hallucination from unknown information | `apps/agent/tests/workflows.e2e.test.ts`   | 2     |

The two tests named "send without confirmation MUST NOT SEND" and "Test F —
no hallucination from unknown information" assert on the **tool-call log**,
not just the reply text. They would fail if any code path leaked a call or
fabricated an answer, regardless of what the reply said.
