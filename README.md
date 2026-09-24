# Alexa+ Everyday Independence Agent

A voice-first AI agent that helps people understand confusing digital information
and safely complete the everyday tasks that follow from it.

Built for the **Build, Ship, Shape: Amazon Developer Hackathon 2026** — Alexa+ Track.

---

## The Problem

Everyday digital services assume users can:

- Read complicated messages
- Navigate applications and menus
- Understand payment information
- Manage reminders across devices
- Interpret documents
- Remember information from past conversations

For many adults — especially older adults — these assumptions create a gap
between *what they want to accomplish* and *what the interface allows them to do*.

This is not a "people need answers" problem. It is a **coordination** problem.

> The user knows the outcome they want. The digital interface creates unnecessary
> complexity between the user and that outcome.

## The Solution

A voice-first orchestration agent that turns an ambiguous everyday problem into
a safe, multi-step workflow.

The agent is **not** a generic chatbot. It:

1. **Understands** — interprets the user's intent and retrieves the relevant message or document.
2. **Extracts** — pulls structured facts (amount, due date, provider).
3. **Explains** — converts the extracted information into plain language.
4. **Answers** — responds to follow-ups strictly from the source, never inventing details.
5. **Remembers** — persists authorized facts so the user can say "that bill" days later.
6. **Plans** — creates reminders and sequences multi-step actions.
7. **Acts** — drafts family messages and other communications.
8. **Confirms** — stops and asks before any externally-visible action.
9. **Communicates** — sends only after explicit user confirmation.

This is the full loop: **READ → UNDERSTAND → EXPLAIN → ANSWER → REMEMBER → PLAN → ACT → CONFIRM → COMMUNICATE.**

## Hero Scenario

The user receives a confusing electricity-company message.

> **User:** "Alexa, I got a message from the electricity company. I don't understand it."
>
> **Agent:** "It says your electricity bill is ₹1,842 and payment is due September 28."
>
> **User:** "What happens if I don't pay it?"
>
> **Agent:** "The message doesn't say what happens after the deadline. I don't want to guess."
>
> **User:** "Remind me on the 26th."
>
> **Agent:** "Done. I'll remind you on September 26."
>
> **User:** "And tell my daughter about it."
>
> **Agent:** "I can send your daughter a message saying your electricity bill is ₹1,842 and is due September 28. Should I send it?"
>
> **User:** "Yes."
>
> **Agent:** *(sends, after independently validating confirmation)*

Two days later:

> **User:** "What was that bill I was worried about yesterday?"
>
> **Agent:** "It was your electricity bill for ₹1,842, due September 28."

That final exchange demonstrates the persistent contextual memory that separates
this project from a single-turn assistant.

---

## Architecture


┌───────────────┐
│ Alexa+ │ (conversational entry point)
└───────┬───────┘
│
▼
┌────────────────────┐
│ Independence Agent │ (orchestrator)
│ │
│ Intent │
│ Planning │
│ Context Resolution │
│ Safety Policy │
└─────────┬──────────┘
│
▼
┌────────────────┐
│ MCP Client │
└───────┬────────┘
│
Streamable HTTP
│
▼
┌────────────────┐
│ MCP Server │ (capability boundary)
└───────┬────────┘
│
┌─────────────────┼──────────────────┐
│ │ │
▼ ▼ ▼
Understand Memory Actions
│ │ │
▼ ▼ ▼
Bedrock DynamoDB Reminders/Messages




**Separation of concerns is architectural, not stylistic:**

| Layer | Owns |
|---|---|
| **Alexa+ / Web UI** | Conversational interface |
| **Agent** (`apps/agent`) | Reasoning, planning, safety decisions, reference resolution |
| **MCP Server** (`mcp-server`) | Capability exposure, input validation, tool execution |
| **Data Layer** (`mcp-server/src/db`) | Persistent state; the only code that touches DynamoDB |
| **AWS** | Bedrock (reasoning), DynamoDB (state), S3 (documents), AgentCore (MCP hosting) |

The agent never manipulates the database directly. The model never executes a
tool without passing through MCP validation.

## MCP Tools

The server exposes seven typed tools, each with a clear description that helps
an agent understand **when** and **how** to use it:

| Tool | Purpose | Risk Level |
|---|---|---|
| `analyze_message` | Extract structured facts from a supplied message | Read |
| `get_context` | Retrieve relevant stored context | Read |
| `save_context` | Persist an authorized fact | Low |
| `create_reminder` | Schedule a reminder tied to a context | Low |
| `get_reminders` | List active reminders | Read |
| `draft_family_message` | Prepare a message — **does not send** | Low |
| `send_family_message` | Send after independent confirmation validation | High |

## Safety Model

Four levels, enforced in code — not just documented:

| Level | Example | Behavior |
|---|---|---|
| **1 — Read** | Explain a document | Auto-execute |
| **2 — Low-risk** | Create a reminder | Execute + report result |
| **3 — External comms** | Send a family message | Draft → **Confirm** → Send |
| **4 — Irreversible** | Payment | **Not executed in MVP** — simulated only |

The confirmation step for `send_family_message` is validated **independently**
by the MCP server. The server does not trust `confirmation: true` from the LLM.

## Alexa+ Integration Status

**Honest disclosure:** Amazon's Alexa+ MCP Toolkit is currently available to
**select partners only**. Direct production integration is not possible for
hackathon participants at this time.

Per Amazon's own hackathon guidance, the recommended path is:

- Build a **real, spec-compliant MCP server** (MCP 2025-11-25, Streamable HTTP).
- Provide a **simulated Alexa+ experience** in a web application that connects
  to the same MCP server over the same transport.

This project follows that path. The MCP server is not a mock — it is a fully
functional Streamable HTTP server. Only the outer conversational layer is
simulated. Swapping it for real Alexa+ access requires no changes to the agent,
the MCP server, or the data layer.

## AWS Usage

AWS is used where it provides a concrete function, not as decoration:

| Service | Role |
|---|---|
| **Amazon Bedrock** | Document extraction, natural-language reasoning, response generation |
| **AWS DynamoDB** | Persistent state: users, context, reminders, drafts, conversations |
| **Amazon S3** | Uploaded documents and source messages |
| **Amazon Bedrock AgentCore** | Deployment target for the Streamable HTTP MCP server |

## Repository Structure


alexa-independence-agent/
├── apps/
│ ├── agent/ # Agent orchestrator (Node.js/TypeScript)
│ └── web/ # Simulated Alexa+ experience (React + Vite)
├── mcp-server/ # MCP server over Streamable HTTP
├── infrastructure/ # AWS: DynamoDB tables, Terraform, setup scripts
├── demo/ # Fixtures, script, screenshots
├── docs/ # Architecture, safety, MCP, AWS, compliance
└── package.json # npm workspaces root




## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict mode)
- **MCP SDK:** `@modelcontextprotocol/sdk` (official)
- **Transport:** Streamable HTTP (SSE is deprecated by MCP 2025-11-25)
- **AWS SDK:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-bedrock-runtime`
- **Frontend:** React 19 + Vite 6
- **Validation:** Zod

## Local Setup

### Prerequisites

- Node.js 20 or later
- npm 10 or later
- An AWS account with Bedrock model access enabled
- AWS credentials configured (`aws configure` or environment variables)


### MIT License


Copyright (c) 2026 Suraj Thapa, Kapish Bisht

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Install

```bash
git clone https://github.com/<your-org>/alexa-independence-agent.git
cd alexa-independence-agent
npm install 

