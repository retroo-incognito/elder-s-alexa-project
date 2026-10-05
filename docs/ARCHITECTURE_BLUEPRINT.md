# System Architecture Blueprint: Alexa+ Everyday Independence Agent

**Project Name:** Alexa+ Everyday Independence Agent  
**Hackathon Track:** Build, Ship, Shape: Amazon Developer Hackathon 2026 — Alexa+ Track  
**Protocol Specification:** Model Context Protocol (MCP) Spec `2025-11-25` (Streamable HTTP)  
**Document Classification:** System Architecture & Technical Specification Blueprint  
**Document Version:** 1.0.0  
**Target Output File:** `docs/ARCHITECTURE_BLUEPRINT.md`  

---

## 1. Executive Summary

The **Alexa+ Everyday Independence Agent** is a voice-first ambient orchestration system designed to help users understand complex, high-cognitive-load digital messages (such as electricity bills, clinic appointment updates, municipal notifications, and bank alerts) and safely execute the real-world tasks that follow from them. Everyday digital services routinely assume that users can interpret opaque account numbers, navigate complex multi-screen mobile apps, remember deadlines across weeks, and manage reminders across disparate tools. For many adults—particularly older adults or individuals managing cognitive fatigue—this gap creates significant friction and anxiety. The Everyday Independence Agent eliminates this friction by converting ambiguous text and documents into verified structured facts, managing persistent cross-session memory, scheduling contextual reminders, and preparing outbound family communications through an intuitive conversational interface.

What makes this system architecturally distinct is the strict physical and logical decoupling of **agent reasoning** from the **MCP capability boundary**, combined with an **asymmetric, 3-layer confirmation gate** governing all external communications. The agent reasoning layer (`apps/agent`) never interacts directly with the database or communication infrastructure; conversely, the underlying Model Context Protocol server (`mcp-server`) exposes capabilities through strictly typed Zod schemas and executes independent, non-LLM validation guards before allowing any state mutation. Safety-critical operations require:
1. Deterministic regular-expression routing at the agent orchestrator that short-circuits the LLM entirely;
2. Server-side token validation and status verification using constant-time cryptographic comparisons; and
3. Atomic conditional update expressions (`ConditionExpression`) enforced at the Amazon DynamoDB storage engine.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CORE ARCHITECTURAL PRINCIPLES                                    │
├──────────────────────────────┬───────────────────────────────────────────────────────────────────┤
│ Separation of Concerns       │ Reasoning, Tool Exposure, and Storage exist in isolated layers.   │
│                              │ The agent cannot bypass MCP; MCP cannot alter agent logic.        │
├──────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Non-LLM Safety Gates         │ External communication authorization never relies on model        │
│                              │ probabilities. Deterministic guards enforce user consent.         │
├──────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Persistent Context Memory    │ Authorized facts persist in DynamoDB across conversations,        │
│                              │ allowing natural references like "that bill" days later.          │
├──────────────────────────────┼───────────────────────────────────────────────────────────────────┤
│ Strict Anti-Hallucination    │ Information queries are restricted to an explicit fact allow-list │
│                              │ returned during document extraction.                              │
└──────────────────────────────┴───────────────────────────────────────────────────────────────────┘
```

---

## 2. Real-World Problems This Solves

Everyday digital communications place unreasonable cognitive demands on individuals who are less comfortable with modern multi-app ecosystems. Below are five concrete, lived scenarios demonstrating how the system operates in practice.

---

### Scenario 1: A Confusing Utility Bill with Obscure Deadlines & Penalties

#### What the user experiences today without the product
An older adult living independently receives an SMS message from their regional power distribution board:  
`"Bill ID 982341 for CA 102938472 generated: Rs 1,842.00 Due 28-SEP-2026. Avoid disconnection/late surcharge by paying via bit.ly/3xXyZ."`  
The message contains technical shorthand (`CA`, `surcharge`), an obscure short URL, and an alarming mention of disconnection. The user does not understand whether the bill is already overdue, what the specific penalty is, or whether the link is a scam.

#### What goes wrong / why it is stressful
The user attempts to log into the utility company’s web portal on a smartphone. They encounter an expired session, fail password recovery due to forgotten security questions, and struggle with an image CAPTCHA. In frustration, they either travel in person to a physical payment center or succumb to telephone scammers claiming they can "clear utility arrears" over the phone.

#### What the agent does instead
1. The user speaks to the device: *"Alexa, I got a message from the electricity company. I don't understand it."*
2. The agent orchestrator triggers `analyze_message` via MCP. The tool extracts verified facts: `amount: 1842`, `currency: "INR"`, `dueDate: "2026-09-28"`, `provider: "Electricity Company"`, and generates an anti-hallucination allow-list.
3. The agent saves the structured context via `save_context` and responds in calm, clear language: *"It says your electricity bill is ₹1,842 and payment is due September 28."*
4. When the user asks *"What happens if I don't pay it?"*, the agent checks `questionsAnswerableFromSource`. Because disconnection policies are not detailed in the SMS text, the agent states plainly: *"The message doesn't say what happens after the deadline. I don't want to guess."*
5. When the user says *"Remind me on the 26th"*, the agent creates an active reminder linked to the bill context.

#### Specific code path handling it
- **Planning:** [`apps/agent/src/agent/planner.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/planner.ts) (`plan()` yields `UNDERSTAND_MESSAGE` and `FOLLOW_UP`)
- **Orchestration:** [`apps/agent/src/agent/orchestrator.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/orchestrator.ts) (`handleUnderstand()` and `handleFollowUp()`)
- **Tool Execution:** [`mcp-server/src/tools/analyze-message.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/analyze-message.ts) (`extractFacts()`)
- **Context Persistence:** [`mcp-server/src/db/contexts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/contexts.ts) (`saveContext()`)

---

### Scenario 2: A Medical Appointment Change Buried in a Long Text

#### What the user experiences today without the product
A specialist clinic sends an automated SMS update:  
`"Notice from City Cardiology Associates: Dr. Robert Chen's Thursday clinic at Metro Health Suite 402 is rescheduled. Your new consultation is Tuesday, Oct 14 at 10:30 AM with Dr. Sarah Jenkins at Westside Diagnostic Annex, 2nd Floor. Bring recent INR blood test records."`

#### What goes wrong / why it is stressful
The user scans only the first sentence, assumes their appointment is still on Thursday with Dr. Chen at Metro Health, and misses the date shift, physician change, new location, and required laboratory paperwork. They show up at the wrong hospital on the wrong day without their blood test results, delaying critical cardiac care.

#### What the agent does instead
1. The user asks: *"Alexa, read that doctor's message."*
2. `analyze_message` extracts a structured `appointment` entity containing:
   - `doctor`: `"Dr. Sarah Jenkins"`
   - `location`: `"Westside Diagnostic Annex, 2nd Floor"`
   - `appointmentDate`: `"2026-10-14T10:30:00"`
   - `requirements`: `"Recent INR blood test records"`
3. The agent explains the key details: *"Your cardiology appointment has been moved to Tuesday, October 14 at 10:30 AM with Dr. Sarah Jenkins at Westside Diagnostic Annex. You need to bring your recent INR blood test records."*
4. The user says: *"Remind me the day before."* The orchestrator calculates `2026-10-13T09:00:00Z` via `parseReminderDate()` and schedules the reminder.

#### Specific code path handling it
- **Context Engine:** [`apps/agent/src/agent/context.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/context.ts) (`findContextDate()`)
- **Date Math:** [`apps/agent/src/agent/orchestrator.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/orchestrator.ts) (`parseReminderDate()`)
- **Reminder Persistence:** [`mcp-server/src/db/reminders.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/reminders.ts) (`createReminder()`)

---

### Scenario 3: A Deceptive Bank Alert vs. Legitimate Communication

#### What the user experiences today without the product
The user receives an urgent message:  
`"STATE BANK ALERT: Account #...4409 temporarily restricted due to KYC non-compliance. Click https://sbi-kyc-update.me to verify immediately and prevent permanent closure."`

#### What goes wrong / why it is stressful
Fear of having their pension account locked triggers panic. The user taps the suspicious link, arrives at a spoofed phishing page, and inadvertently enters their internet banking password, debit card PIN, and OTP.

#### What the agent does instead
1. The user asks: *"Is this bank message real? What should I do?"*
2. `analyze_message` processes the message. The extraction system recognizes the lack of official bank authorization metadata and flags the presence of an unverified third-party domain.
3. The response generation system ([`apps/agent/src/agent/prompts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/prompts.ts)) enforces a defensive stance: it warns the user never to tap external links and advises contacting the bank directly.
4. The agent replies: *"This message asks for urgent verification through an unofficial link. I cannot verify this message. Do not click the link. Call the phone number on the back of your bank card instead."*

#### Specific code path handling it
- **Grounding Rules:** [`apps/agent/src/agent/prompts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/prompts.ts) (`RESPONSE_SYSTEM_PROMPT`)
- **Allow-List Checks:** [`mcp-server/src/schemas/tool-schemas.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/schemas/tool-schemas.ts) (`questionsAnswerableFromSource`)

---

### Scenario 4: An Event Invitation the User Wants to Share with Family

#### What the user experiences today without the product
The user receives a WhatsApp or SMS invitation:  
`"Please join us for the Golden Jubilee Celebration of Ramesh & Sunita on Sunday, Nov 15, 6:30 PM at Grand Orchid Banquet Hall, Ring Road. RSVP to Anand by Nov 5."`

#### What goes wrong / why it is stressful
The user wants their daughter to drive them to the event. They try to forward the message, but misplace it in their chat history, send it to the wrong family group, or transcribe the wrong time or venue when typing manually.

#### What the agent does instead
1. The user says: *"Alexa, tell my daughter about this anniversary event."*
2. The agent executes `resolve_contact(userId, "daughter")` to look up Priya Sharma (`whatsapp`, `+91 98765 43210`).
3. It composes a clear message from the stored event context: `"I wanted to let you know about Golden Jubilee Celebration. It's on November 15 at 6:30 PM at Grand Orchid Banquet Hall."`
4. The agent calls `draft_family_message`, generating a staged draft with a one-time cryptographic confirmation token.
5. The agent asks: *"I can send Priya Sharma a WhatsApp message saying: '...'. Should I send it?"*
6. The user replies *"Yes."* The orchestrator deterministically triggers `send_family_message`.

#### Specific code path handling it
- **Contact Resolution:** [`mcp-server/src/tools/contacts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/contacts.ts) (`resolve_contact`)
- **Draft Creation:** [`mcp-server/src/tools/messaging.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/messaging.ts) (`draft_family_message`)
- **Confirmation Short-Circuit:** [`apps/agent/src/agent/planner.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/planner.ts) (`isAffirmative()`)
- **Message Transmission:** [`mcp-server/src/tools/messaging.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/messaging.ts) (`send_family_message`)

---

### Scenario 5: A Recurring Deadline the User Keeps Forgetting

#### What the user experiences today without the product
Quarterly property tax assessments, annual vehicle insurance renewals, or monthly medicine refills arrive at irregular intervals. The user puts the paper circular or SMS aside and forgets about it.

#### What goes wrong / why it is stressful
Lapsed insurance policies lead to vehicle fines; missed tax windows result in compounding interest penalties; forgotten medicine refills cause dangerous gaps in chronic treatment.

#### What the agent does instead
1. When any recurring document is parsed, the user says: *"Remind me 5 days before it's due."*
2. The agent calculates the offset date relative to the context date, creates a reminder in DynamoDB, and links it to the document's context ID.
3. At any future time, the user can ask: *"What reminders do I have coming up?"*
4. The agent calls `get_reminders(userId, "active")` and reads out the list: *"You have 2 reminders: Pay Property Tax on October 10; Doctor follow-up on October 14."*

#### Specific code path handling it
- **Natural Date Math:** [`apps/agent/src/agent/orchestrator.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/orchestrator.ts) (`parseReminderDate()`, `parseNaturalDate()`)
- **Reminders Index Query:** [`mcp-server/src/db/reminders.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/reminders.ts) (`getReminders()`)

---

## 3. System Architecture

The overall system architecture is organized into three decoupled tiers: Client Layer, Agent Orchestration Layer, and MCP Capability / Storage Layer.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   END-TO-END SYSTEM TOPOLOGY                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

 [ CLIENT TIER: Port 5173 ]
 ┌────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  React 19 + Vite 6 Ambient Web UI (apps/web)                                                   │
 │                                                                                                │
 │  ┌─────────────────────────┐ ┌───────────────────────────┐ ┌────────────────────────────────┐ │
 │  │ VoiceInput.tsx          │ │ App.tsx (Workspace Shell) │ │ ConfirmationPrompt.tsx         │ │
 │  │ Web Speech Recognition  │ │ 3-Panel State Management  │ │ Amber Blocking Modal           │ │
 │  │ Interim Transcript Flow │ │ (Chat, Context, Actions)  │ │ (role="alertdialog")           │ │
 │  └─────────────────────────┘ └─────────────┬─────────────┘ └────────────────────────────────┘ │
 │  ┌─────────────────────────┐               │               ┌────────────────────────────────┐ │
 │  │ Conversation.tsx        │               │               │ audio.ts (Audio Engine)        │ │
 │  │ Typing indicators &     │               │               │ Web Audio API Thinking Chime   │ │
 │  │ Latency Phase Badges    │               │               │ SpeechSynthesis Voice Feedback │ │
 │  └─────────────────────────┘               │               └────────────────────────────────┘ │
 └────────────────────────────────────────────┼──────────────────────────────────────────────────┘
                 │                            │                                │
                 │ JSON HTTP POST /api/chat   │ JSON HTTP POST /api/chat       │
                 ▼                            ▼                                ▼
 [ AGENT ORCHESTRATION TIER: Port 3000 ]
 ┌────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  Node.js + TypeScript Orchestration Engine (apps/agent)                                        │
 │                                                                                                │
 │  ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ Orchestrator Runtime (apps/agent/src/agent/orchestrator.ts)                              │  │
 │  │  - Session Store: In-Memory Map<string, ConversationState> (30-minute TTL eviction)       │  │
 │  │  - Turn State Recorder & Conversation History Buffer                                      │  │
 │  │  - Relative Date Computation & Context Resolution                                         │  │
 │  └───────────────────────────────┬──────────────────────────────────────────────────────────┘  │
 │                                  │                                                             │
 │            ┌─────────────────────┴─────────────────────────────┐                               │
 │            ▼                                                   ▼                               │
 │  ┌──────────────────────────────────┐        ┌──────────────────────────────────────────────┐  │
 │  │ Intent Planner (planner.ts)      │        │ Safety Policy Engine (safety.ts)             │  │
 │  │  - Deterministic Affirm/Deny     │        │  - 4 Safety Levels (Read, Low, Comms, Irrev) │  │
 │  │  - Contact Clarification Bypass  │        │  - Regular Expression Matchers               │  │
 │  │  - Fallback: Bedrock/OpenAI JSON │        │  - Pre-execution Confirmation Validation     │  │
 │  └─────────────────┬────────────────┘        └──────────────────────────────────────────────┘  │
 │                    │                                                                           │
 │                    ▼                                                                           │
 │  ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ LLM Abstraction Layer (apps/agent/src/lib/llm/)                                          │  │
 │  │  - factory.ts / types.ts (ConverseParams, LlmProvider interface)                          │  │
 │  │  - bedrock.ts (BedrockRuntimeClient ConverseCommand - Claude Sonnet 3.5 / 4.6 profile)   │  │
 │  │  - openai.ts (OpenAI Chat Completions API adapter)                                       │  │
 │  └──────────────────────────────────────────────────────────────────────────────────────────┘  │
 │                                  │                                                             │
 │                                  ▼                                                             │
 │  ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ MCP Client Runtime (apps/agent/src/lib/mcp-client.ts)                                    │  │
 │  │  - Official @modelcontextprotocol/sdk Client                                              │  │
 │  │  - StreamableHTTPClientTransport connecting to http://localhost:3001/mcp                 │  │
 │  │  - Automatic reconnection & structuredContent unwrapping                                 │  │
 │  └───────────────────────────────┬──────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────┼─────────────────────────────────────────────────────────────┘
                                    │
                                    │ MCP Protocol over Streamable HTTP (POST /mcp)
                                    ▼
 [ CAPABILITY TIER: Port 3001 ]
 ┌────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  Model Context Protocol Server (mcp-server)                                                    │
 │                                                                                                │
 │  ┌──────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ HTTP Server Transport (mcp-server/src/server.ts)                                         │  │
 │  │  - Express Router (POST /mcp, GET /mcp, DELETE /mcp, GET /health)                           │  │
 │  │  - StreamableHTTPServerTransport ({ sessionIdGenerator: undefined })                     │  │
 │  │  - Fresh McpServer instantiated per request lifecycle (stateless execution)              │  │
 │  └───────────────────────────────┬──────────────────────────────────────────────────────────┘  │
 │                                  │                                                             │
 │  ┌───────────────────────────────┴──────────────────────────────────────────────────────────┐  │
 │  │ Tool Registry & Boundary Validators (mcp-server/src/build-server.ts)                      │  │
 │  │  - Zod Input & Output Schema Enforcement (mcp-server/src/schemas/tool-schemas.ts)        │  │
 │  │                                                                                          │  │
 │  │  ┌────────────────────────┐ ┌────────────────────────┐ ┌───────────────────────────────┐ │  │
 │  │  │ analyze_message        │ │ get_context            │ │ save_context                  │ │  │
 │  │  │ (Bedrock/Regex Extr.)  │ │ (KeyIndex GSI/Fuzzy)   │ │ (Fact Persistence)            │ │  │
 │  │  └────────────────────────┘ └────────────────────────┘ └───────────────────────────────┘ │  │
 │  │  ┌────────────────────────┐ ┌────────────────────────┐ ┌───────────────────────────────┐ │  │
 │  │  │ create_reminder        │ │ get_reminders          │ │ resolve_contact               │ │  │
 │  │  │ (StatusIndex Schedule) │ │ (StatusIndex Query)    │ │ (Relationship/Name Match)     │ │  │
 │  │  └────────────────────────┘ └────────────────────────┘ └───────────────────────────────┘ │  │
 │  │  ┌──────────────────────────────────────────────────┐  ┌───────────────────────────────┐ │  │
 │  │  │ draft_family_message                             │  │ send_family_message           │ │  │
 │  │  │ (UUID Token Generation, Status = 'draft')        │  │ (4-Guard Server-Side Gate)    │ │  │
 │  │  └──────────────────────────────────────────────────┘  └───────────────────────────────┘ │  │
 │  └───────────────────────────────┬──────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────┼─────────────────────────────────────────────────────────────┘
                                    │
                                    │ AWS SDK v3 Client Commands (PutCommand, QueryCommand, Update)
                                    ▼
 [ DATA PERSISTENCE TIER: AWS Cloud ]
 ┌────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  Amazon DynamoDB Tables (PAY_PER_REQUEST On-Demand Capacity)                                   │
 │                                                                                                │
 │  ┌───────────────────────────────┐  ┌───────────────────────────────────────────────────────┐  │
 │  │ independence-users            │  │ independence-context                                  │  │
 │  │ PK: userId                    │  │ PK: userId | SK: contextId                            │  │
 │  │ (User profiles & settings)    │  │ GSI: KeyIndex (PK: userId, SK: key) | TTL: expiresAt  │  │
 │  └───────────────────────────────┘  └───────────────────────────────────────────────────────┘  │
 │  ┌───────────────────────────────┐  ┌───────────────────────────────────────────────────────┐  │
 │  │ independence-reminders        │  │ independence-message-drafts                           │  │
 │  │ PK: userId | SK: reminderId   │  │ PK: userId | SK: draftId                              │  │
 │  │ GSI: StatusIndex (userId, stat)│ │ (Atomic conditional write status transitions)         │  │
 │  └───────────────────────────────┘  └───────────────────────────────────────────────────────┘  │
 │  ┌───────────────────────────────┐  ┌───────────────────────────────────────────────────────┐  │
 │  │ independence-contacts         │  │ independence-conversations                            │  │
 │  │ PK: userId | SK: contactId    │  │ PK: userId | SK: conversationId                       │  │
 │  │ GSI: RelationshipIndex        │  │ TTL: expiresAt (30-day cross-session history)         │  │
 │  └───────────────────────────────┘  └───────────────────────────────────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Why the Agent and MCP Server Are Separate Processes

1. **Security Isolation & Blast Radius Containment:**  
   The agent orchestrator operates directly on conversational input and interacts with large language models. LLMs are susceptible to adversarial prompt injection, jailbreaks, and hallucinations. If the agent process held database credentials directly, an injected prompt could trigger arbitrary table scans or unauthorized writes. In contrast, the MCP server runs in an isolated process with no access to LLM prompts, exposing only typed tools protected by Zod schemas and deterministic safety guards.

2. **Compliance with Amazon Alexa+ Platform Architecture:**  
   In Amazon's production Alexa+ ecosystem, Alexa+ acts as the core reasoning runtime and connects directly to developer-provided MCP servers over Streamable HTTP. Maintaining `apps/agent` and `mcp-server` as independent network processes guarantees that the MCP server is immediately ready for native Alexa+ registration without architectural rework.

3. **Stateless Scalability and Independent Deployment:**  
   The MCP server is completely stateless (`sessionIdGenerator: undefined`), allowing it to be packaged as a lightweight container and scaled horizontally on AWS Fargate or Amazon Bedrock AgentCore Runtime. The agent orchestrator, which handles conversational session state, can be scaled and updated independently.

---

### Why the Agent Never Touches DynamoDB Directly

The agent layer in `apps/agent` contains zero AWS SDK database dependencies. Direct database access from the agent is prohibited because:
- **State Machine Invariants:** Mutating message drafts from `draft` to `confirmed` to `sent` requires atomic DynamoDB `ConditionExpression`s. Placing this logic in `mcp-server/src/db/drafts.ts` ensures that no agent logic error can skip states or trigger duplicate sends.
- **Audit Logging and Provenance:** All database interactions are mediated by MCP tool calls, providing a structured, verifiable audit trail for every read and write.
- **Data Model Encapsulation:** The agent reasons in terms of domain intents (`resolve_contact`, `create_reminder`), completely decoupled from partition keys, sort keys, and GSI configurations.

---

### Swappable LLM Architecture (`apps/agent/src/lib/llm/`)

The agent isolates language model interactions behind a clean interface:

```typescript
// apps/agent/src/lib/llm/types.ts
export interface ConverseParams {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export type ProviderName = 'bedrock' | 'openai';

export interface LlmProvider {
  readonly name: ProviderName;
  converse(params: ConverseParams): Promise<string>;
  converseJson<T>(params: ConverseParams): Promise<T>;
}
```

The factory (`apps/agent/src/lib/llm/factory.ts`) initializes the active provider based on the `LLM_PROVIDER` environment variable:
- **Bedrock Provider (`bedrock.ts`):** Uses `@aws-sdk/client-bedrock-runtime` with the `us.anthropic.claude-sonnet-4-6` cross-region inference profile.
- **OpenAI Provider (`openai.ts`):** Uses OpenAI Chat Completions API with structured JSON output formatting.

---

### Port Map

| Service | Port | Protocol | Purpose |
|---|---|---|---|
| **Web Frontend** (`apps/web`) | `5173` | HTTP / WebSocket | User-facing simulated Alexa+ interface |
| **Agent Orchestrator** (`apps/agent`) | `3000` | HTTP REST (`POST /api/chat`) | Natural language reasoning & session management |
| **MCP Server** (`mcp-server`) | `3001` | Streamable HTTP (`POST /mcp`) | Capability exposure, input validation, tool execution |

---

## 4. The MCP Tool Surface

The server exposes 8 typed tools defined in `mcp-server/src/schemas/tool-schemas.ts` and registered in `mcp-server/src/build-server.ts`.

---

### 4.1 `analyze_message`

- **Purpose:** Extracts structured facts, entities, and an anti-hallucination question allow-list from unstructured text.
- **Implemented in:** [`mcp-server/src/tools/analyze-message.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/analyze-message.ts)
- **When Called:** When a user presents a message, bill, notice, or document snippet.

```typescript
// Input Schema (Zod)
export const AnalyzeMessageInput = z.object({
  content: z.string().min(1).describe("The raw text of the message or document to analyze"),
  source: z.string().describe('Where this content came from, e.g. "sms", "email", "uploaded_pdf"'),
});

// Output Schema (Zod)
export const AnalyzeMessageOutput = z.object({
  summary: z.string().describe("One-sentence plain-language summary"),
  facts: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).describe("Key facts extracted from the source"),
  entities: z.array(z.object({
    type: z.string().describe('e.g. "bill", "appointment", "deadline"'),
    key: z.string().describe('Stable identifier, e.g. "electricity_bill"'),
    data: z.record(z.string(), z.unknown()),
  })).describe("Structured entities suitable for save_context"),
  questionsAnswerableFromSource: z.array(z.string()).describe(
    "Questions the agent can answer using ONLY this source. Anything not listed here must not be guessed."
  ),
});
```

- **Guards & Validation:** Dispatches extraction to Amazon Bedrock Converse or OpenAI. If the LLM extraction provider encounters a network or parsing failure, it falls back to the deterministic bill extractor (`extractElectricityBill`).

---

### 4.2 `get_context`

- **Purpose:** Retrieves previously saved contextual facts for a user using exact key matching or semantic category search.
- **Implemented in:** [`mcp-server/src/tools/context.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/context.ts)
- **When Called:** When a user refers to past entities (e.g., *"that bill"*, *"the appointment I told you about"*).

```typescript
// Input Schema (Zod)
export const GetContextInput = z.object({
  userId: z.string().describe("The user whose context is being retrieved"),
  query: z.string().describe('Natural-language or key-based query, e.g. "electricity bill" or "that bill"'),
  type: z.string().min(1).max(40).optional().describe("Restrict search to a known context type"),
});

// Output Schema (Zod)
export const GetContextOutput = z.object({
  matches: z.array(z.object({
    contextId: z.string(),
    type: z.string(),
    key: z.string(),
    data: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
  })),
});
```

- **Guards & Validation:** 
  1. Executes a fast point lookup against the `KeyIndex` GSI using `(userId, normalizedKey)`.
  2. If no exact match is found, evaluates `HEURISTIC_TYPE_MAP` against the query string (mapping `"doctor"` → `"appointment"`, `"bill"` → `"bill"`) and retrieves recent items of that type.

---

### 4.3 `save_context`

- **Purpose:** Persists an authorized structured fact payload into DynamoDB for cross-conversation recall.
- **Implemented in:** [`mcp-server/src/tools/context.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/context.ts)
- **When Called:** Immediately following entity extraction in `UNDERSTAND_MESSAGE`.

```typescript
// Input Schema (Zod)
export const SaveContextInput = z.object({
  userId: z.string(),
  type: z.string().min(1).max(40).describe("Category of context"),
  key: z.string().min(1).describe('Stable identifier, e.g. "electricity_bill"'),
  data: z.record(z.string(), z.unknown()).describe("The authorized fact payload"),
  source: z.string().describe("Provenance, e.g. the originating message id"),
  ttlDays: z.number().int().positive().optional().describe("Optional expiry in days"),
});

// Output Schema (Zod)
export const SaveContextOutput = z.object({
  contextId: z.string(),
  saved: z.boolean(),
});
```

- **Guards & Validation:** Generates a unique UUID `contextId`. If `ttlDays` is supplied, calculates the epoch-second `expiresAt` attribute for DynamoDB automatic expiration.

---

### 4.4 `create_reminder`

- **Purpose:** Schedules a reminder tied to a specific date and an optional context record.
- **Implemented in:** [`mcp-server/src/tools/reminders.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/reminders.ts)
- **When Called:** When the user requests a reminder (e.g., *"Remind me on the 26th"*).

```typescript
// Input Schema (Zod)
export const CreateReminderInput = z.object({
  userId: z.string(),
  title: z.string().min(1),
  scheduledAt: z.string().describe("ISO 8601 datetime with timezone offset"),
  relatedContextId: z.string().optional(),
});

// Output Schema (Zod)
export const CreateReminderOutput = z.object({
  reminderId: z.string(),
  success: z.boolean(),
});
```

- **Guards & Validation:** Validates ISO 8601 formatting. Initializes reminder with `status: 'active'`.

---

### 4.5 `get_reminders`

- **Purpose:** Retrieves a user's active or past reminders filtered by status.
- **Implemented in:** [`mcp-server/src/tools/reminders.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/reminders.ts)
- **When Called:** When the user asks *"What reminders do I have?"* or *"What's coming up?"*

```typescript
// Input Schema (Zod)
export const GetRemindersInput = z.object({
  userId: z.string(),
  status: z.enum(["active", "completed", "cancelled"]).default("active"),
});

// Output Schema (Zod)
export const GetRemindersOutput = z.object({
  reminders: z.array(z.object({
    reminderId: z.string(),
    title: z.string(),
    scheduledAt: z.string(),
    status: z.string(),
  })),
});
```

- **Guards & Validation:** Queries the DynamoDB `StatusIndex` GSI on `(userId, status)` to avoid full table scans.

---

### 4.6 `resolve_contact`

- **Purpose:** Resolves a relationship word or name fragment to a stored contact record.
- **Implemented in:** [`mcp-server/src/tools/contacts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/contacts.ts)
- **When Called:** Before drafting any family communication.

```typescript
// Input Schema (Zod)
export const ResolveContactInput = z.object({
  userId: z.string(),
  reference: z.string().min(1).describe('Relationship word ("sister") or name fragment ("Priya")'),
});

// Output Schema (Zod)
export const ResolveContactOutput = z.object({
  found: z.boolean(),
  contact: z.object({
    contactId: z.string(),
    relationship: z.string(),
    displayName: z.string(),
    channel: z.string(),
    address: z.string(),
  }).optional(),
  suggestions: z.array(z.object({
    contactId: z.string(),
    relationship: z.string(),
    displayName: z.string(),
    channel: z.string(),
  })),
});
```

- **Guards & Validation:** 
  1. Strips framing prefixes (`my`, `our`, `the`).
  2. Queries `RelationshipIndex` GSI for exact relationship matches (`"daughter"`).
  3. Executes case-insensitive prefix and substring matching on `displayName`.
  4. If multiple matches or zero matches occur, returns `found: false` with candidate `suggestions`.

---

### 4.7 `draft_family_message`

- **Purpose:** Prepares a staged outgoing communication and returns a cryptographic confirmation token. **Does not send.**
- **Implemented in:** [`mcp-server/src/tools/messaging.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/messaging.ts)
- **When Called:** When the user indicates intent to notify or text a contact.

```typescript
// Input Schema (Zod)
export const DraftFamilyMessageInput = z.object({
  userId: z.string(),
  contactId: z.string().describe('The contactId returned by resolve_contact'),
  content: z.string().min(1).describe('The proposed message body'),
  relatedContextId: z.string().optional(),
});

// Output Schema (Zod)
export const DraftFamilyMessageOutput = z.object({
  draftId: z.string(),
  recipient: z.object({
    contactId: z.string(),
    relationship: z.string(),
    displayName: z.string(),
    channel: z.string(),
    address: z.string(),
  }),
  message: z.string(),
  requiresConfirmation: z.literal(true),
  confirmationToken: z.string(),
});
```

- **Guards & Validation:** Validates contact existence. Issues a cryptographic UUID token via `crypto.randomUUID()`, stores the token on the draft row in DynamoDB, and sets `status = 'draft'`.

---

### 4.8 `send_family_message`

- **Purpose:** Sends a previously drafted message after independently verifying confirmation tokens and draft status.
- **Implemented in:** [`mcp-server/src/tools/messaging.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/messaging.ts)
- **When Called:** Only after the user provides explicit verbal or UI confirmation.

```typescript
// Input Schema (Zod)
export const SendFamilyMessageInput = z.object({
  userId: z.string(),
  draftId: z.string(),
  confirmationToken: z.string().describe("The token issued when the draft was created"),
  userConfirmation: z.string().describe('The literal words the user used to confirm, e.g. "yes"'),
});

// Output Schema (Zod)
export const SendFamilyMessageOutput = z.object({
  sent: z.boolean(),
  draftId: z.string(),
  sentAt: z.string().optional(),
  rejectionReason: z.string().optional(),
});
```

- **Guards & Validation:** Evaluates 4 structural server-side guards. If any guard fails, returns `{ sent: false, rejectionReason }` without mutating database state.

---

## 5. The Safety Model

The system implements a **4-Level Safety Model** defined in [`apps/agent/src/agent/safety.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/safety.ts):

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            4-LEVEL SAFETY CLASSIFICATION                         │
├───────┬──────────────────┬─────────────────────────────┬─────────────────────────┤
│ Level │ Name             │ Tools                       │ Execution Behavior      │
├───────┼──────────────────┼─────────────────────────────┼─────────────────────────┤
│   1   │ READ             │ analyze_message, get_context│ Auto-execute            │
│       │                  │ get_reminders, resolve_cont.│                         │
├───────┼──────────────────┼─────────────────────────────┼─────────────────────────┤
│   2   │ LOW_RISK         │ save_context, create_remind.│ Execute and report      │
│       │                  │ draft_family_message        │ result in plain speech  │
├───────┼──────────────────┼─────────────────────────────┼─────────────────────────┤
│   3   │ EXTERNAL_COMMS   │ send_family_message         │ Draft → Require Explicit│
│       │                  │                             │ Confirmation → Send     │
├───────┼──────────────────┼─────────────────────────────┼─────────────────────────┤
│   4   │ IRREVERSIBLE     │ Financial transactions,     │ BLOCKED IN MVP          │
│       │                  │ data deletion               │ Simulated only          │
└───────┴──────────────────┴─────────────────────────────┴─────────────────────────┘
```

---

### The Three Independent Layers of Confirmation Gate Enforcement

External communications (Level 3) cannot be executed by an LLM decision alone. They are governed by three independent verification layers:

```
  USER SAYS "YES"
        │
        ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ LAYER 1: AGENT ORCHESTRATOR LAYER (apps/agent/src/agent/planner.ts)    │
 │ - Intercepts message if state.pendingConfirmation is set               │
 │ - Evaluates deterministic regex: isAffirmative() / isNegative()        │
 │ - LLM IS COMPLETELY BYPASSED — Immune to prompt injection              │
 └────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼ callTool('send_family_message', {...})
 ┌────────────────────────────────────────────────────────────────────────┐
 │ LAYER 2: MCP SERVER CAPABILITY BOUNDARY (mcp-server/src/tools/mess.)   │
 │ Server validates 4 non-LLM structural preconditions:                   │
 │  [Guard 1] Draft exists in DynamoDB for (userId, draftId)              │
 │  [Guard 2] Draft status is currently 'draft'                           │
 │  [Guard 3] confirmationToken matches via crypto.timingSafeEqual()      │
 │  [Guard 4] userConfirmation string is non-empty                        │
 └────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼ markConfirmed() & markSent()
 ┌────────────────────────────────────────────────────────────────────────┐
 │ LAYER 3: DYNAMODB STORAGE ENGINE (mcp-server/src/db/drafts.ts)         │
 │ Atomic ConditionExpressions on DynamoDB updates:                       │
 │  1. SET status = 'confirmed' WHERE status = 'draft'                    │
 │  2. SET status = 'sent' WHERE status = 'confirmed'                    │
 └────────────────────────────────────────────────────────────────────────┘
```

---

### Detailed Layer Specifications

#### Layer 1: Agent Orchestrator (Deterministic Regex Routing)
- **Location:** [`apps/agent/src/agent/planner.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/planner.ts) and [`apps/agent/src/agent/safety.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/agent/src/agent/safety.ts)
- **Logic:**
  ```typescript
  if (state.pendingConfirmation) {
    if (isAffirmative(message)) {
      return { intent: "CONFIRM_SEND", reasoning: "Pending confirmation affirmative", extractedReference: null };
    }
    if (isNegative(message)) {
      return { intent: "DENY_SEND", reasoning: "Pending confirmation declined", extractedReference: null };
    }
  }
  ```
- **Why it exists:** Prevents LLM misclassification or prompt injection attacks from fabricating user consent.
- **What breaks if missing:** An adversarial user or injected document payload could trick the LLM into returning `CONFIRM_SEND` even when the user said *"No, do not send that"*.

#### Layer 2: MCP Server Precondition Guards
- **Location:** [`mcp-server/src/tools/messaging.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/messaging.ts) and [`mcp-server/src/lib/confirmation.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/lib/confirmation.ts)
- **Logic:**
  ```typescript
  // Guard 1: Existence
  if (!draft) return reject(draftId, 'No draft found for this user and draftId.');

  // Guard 2: Status Check
  if (draft.status !== 'draft') return reject(draftId, `Draft is in status "${draft.status}" — cannot send.`);

  // Guard 3: Constant-Time Token Match
  if (!tokensMatch(draft.confirmationToken, confirmationToken)) {
    return reject(draftId, 'Confirmation token does not match the token issued for this draft.');
  }

  // Guard 4: Non-empty Confirmation String
  if (!userConfirmation || userConfirmation.trim().length === 0) {
    return reject(draftId, 'No user confirmation provided.');
  }
  ```
- **Why it exists:** Protects the database and messaging infrastructure against compromised or buggy agent processes.
- **What breaks if missing:** A rogue or buggy client could invoke `send_family_message` directly with fabricated parameters without ever calling `draft_family_message`.

#### Layer 3: Database Atomic Conditional Writes
- **Location:** [`mcp-server/src/db/drafts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/drafts.ts)
- **Logic:**
  ```typescript
  // Transition 1: draft -> confirmed
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId, draftId },
    UpdateExpression: 'SET #s = :next, confirmedAt = :now',
    ConditionExpression: '#s = :expected',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':next': 'confirmed', ':expected': 'draft', ':now': new Date().toISOString() },
  }));

  // Transition 2: confirmed -> sent
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId, draftId },
    UpdateExpression: 'SET #s = :next, sentAt = :now',
    ConditionExpression: '#s = :expected',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':next': 'sent', ':expected': 'confirmed', ':now': new Date().toISOString() },
  }));
  ```
- **Why it exists:** Eliminates race conditions and guarantees that a draft can never be sent more than once.
- **What breaks if missing:** Network retries or duplicate incoming HTTP requests could trigger multiple outbound messages for the same draft.

---

## 6. Data Model

The persistence layer uses 6 Amazon DynamoDB tables with on-demand capacity (`PAY_PER_REQUEST`).

---

### DynamoDB Table Specifications

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DYNAMODB DATA SCHEMAS                                         │
├──────────────────────────────┬──────────────────┬─────────────────┬────────────────┬─────────────┤
│ Table Name                   │ Partition Key    │ Sort Key        │ GSIs           │ TTL Field   │
├──────────────────────────────┼──────────────────┼─────────────────┼────────────────┼─────────────┤
│ independence-users           │ userId (S)       │ —               │ —              │ —           │
├──────────────────────────────┼──────────────────┼─────────────────┼────────────────┼─────────────┤
│ independence-context         │ userId (S)       │ contextId (S)   │ KeyIndex       │ expiresAt   │
├──────────────────────────────┼──────────────────┼─────────────────┼────────────────┼─────────────┤
│ independence-reminders       │ userId (S)       │ reminderId (S)  │ StatusIndex    │ —           │
├──────────────────────────────┼──────────────────┼─────────────────┼────────────────┼─────────────┤
│ independence-message-drafts  │ userId (S)       │ draftId (S)     │ —              │ —           │
├──────────────────────────────┼──────────────────┼─────────────────┼────────────────┼─────────────┤
│ independence-contacts        │ userId (S)       │ contactId (S)   │ Relations.Index│ —           │
├──────────────────────────────┼──────────────────┼─────────────────┼────────────────┼─────────────┤
│ independence-conversations   │ userId (S)       │ conversationId  │ —              │ expiresAt   │
└──────────────────────────────┴──────────────────┴─────────────────┴────────────────┴─────────────┘
```

---

### Detailed Table Specifications

#### 1. `independence-users`
- **Primary Key:** `userId` (String)
- **GSIs:** None | **TTL:** None
- **Schema Interface:**
  ```typescript
  export interface UserProfile {
    userId: string;
    displayName: string;
    timezone: string;
    preferences: Record<string, unknown>;
    createdAt: string;
  }
  ```
- **Written by:** [`mcp-server/src/db/users.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/users.ts) (`upsertUser()`, `ensureUser()`)
- **Purpose:** Stores user profiles, display names, and timezone preferences.

#### 2. `independence-context`
- **Primary Key:** `userId` (PK, String), `contextId` (SK, String, UUID)
- **GSIs:** `KeyIndex` (PK: `userId`, SK: `key`)
- **TTL Attribute:** `expiresAt` (Epoch seconds)
- **Schema Interface:**
  ```typescript
  export interface ContextRecord {
    userId: string;
    contextId: string;
    type: string;
    key: string;
    data: Record<string, unknown>;
    source: string;
    createdAt: string;
    expiresAt?: number;
  }
  ```
- **Written by:** [`mcp-server/src/db/contexts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/contexts.ts) (`saveContext()`)
- **Purpose:** Stores authorized extracted facts. `KeyIndex` enables $O(1)$ key lookups (e.g. `electricity_bill`).

#### 3. `independence-reminders`
- **Primary Key:** `userId` (PK, String), `reminderId` (SK, String, UUID)
- **GSIs:** `StatusIndex` (PK: `userId`, SK: `status`)
- **TTL Attribute:** None
- **Schema Interface:**
  ```typescript
  export interface ReminderRecord {
    userId: string;
    reminderId: string;
    title: string;
    scheduledAt: string;
    status: 'active' | 'completed' | 'cancelled';
    relatedContextId?: string;
    createdAt: string;
  }
  ```
- **Written by:** [`mcp-server/src/db/reminders.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/reminders.ts) (`createReminder()`, `cancelReminder()`)
- **Purpose:** Stores scheduled reminders. `StatusIndex` enables querying active reminders without table scans.

#### 4. `independence-message-drafts`
- **Primary Key:** `userId` (PK, String), `draftId` (SK, String, UUID)
- **GSIs:** None | **TTL Attribute:** None
- **Schema Interface:**
  ```typescript
  export interface MessageDraftRecord {
    userId: string;
    draftId: string;
    recipient: string;
    content: string;
    status: 'draft' | 'confirmed' | 'sent' | 'cancelled';
    relatedContextId?: string;
    confirmationToken?: string;
    createdAt: string;
    confirmedAt?: string;
    sentAt?: string;
  }
  ```
- **Written by:** [`mcp-server/src/db/drafts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/drafts.ts) (`createDraft()`, `markConfirmed()`, `markSent()`)
- **Purpose:** Manages the state machine for outgoing family communications.

#### 5. `independence-contacts`
- **Primary Key:** `userId` (PK, String), `contactId` (SK, String, UUID)
- **GSIs:** `RelationshipIndex` (PK: `userId`, SK: `relationship`)
- **TTL Attribute:** None
- **Schema Interface:**
  ```typescript
  export interface ContactRecord {
    userId: string;
    contactId: string;
    relationship: string;
    displayName: string;
    channel: string;
    address: string;
    createdAt: string;
  }
  ```
- **Written by:** [`mcp-server/src/db/contacts.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/contacts.ts) (`saveContact()`)
- **Purpose:** Resolves natural language references (`"daughter"`, `"sister"`, `"Priya"`) to verified communication channels and addresses.

#### 6. `independence-conversations`
- **Primary Key:** `userId` (PK, String), `conversationId` (SK, String, UUID)
- **GSIs:** None | **TTL Attribute:** `expiresAt` (Epoch seconds, 30-day retention)
- **Schema Interface:**
  ```typescript
  export interface ConversationRecord {
    userId: string;
    conversationId: string;
    recentTurns: Array<{ role: 'user' | 'agent'; text: string; at: string }>;
    activeContextIds: string[];
    createdAt: string;
    updatedAt: string;
    expiresAt?: number;
  }
  ```
- **Written by:** [`mcp-server/src/db/conversations.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/db/conversations.ts) (`appendTurn()`, `setActiveContexts()`)
- **Purpose:** Persists historical conversation transcripts across browser sessions.

---

## 6A Proactive Assistance

The agent is not purely reactive. It initiates a briefing when there is
something worth saying — an appointment today, a bill due tomorrow, a
reminder coming up.

### Local implementation

The agent exposes `POST /api/proactive/morning`, which:

1. Reads active reminders from `independence-reminders`
2. Reads recent contexts from `independence-context`
3. Filters for items due today or tomorrow
4. Skips anything flagged as high-risk
5. Returns a plain-language briefing, or `{ speak: false }` if there is
   nothing to report

The web UI calls this endpoint on page load, once per day per browser
session. The briefing renders as a card above the conversation until the
user dismisses it.

### Production path

In production, the trigger is Amazon EventBridge firing at 08:00 local
time, invoking a Lambda that calls the same endpoint. The Lambda's
response is delivered to the user's Alexa device as an agent-initiated
turn.

    EventBridge (08:00 daily)
        │
        ▼
    Lambda → POST /api/proactive/morning
        │
        ▼
    Alexa device or web UI

The endpoint, the data sources, and the briefing logic are identical
between local and production. Only the trigger changes.

### Design principle

Reactive agents require the user to remember to ask. For adults who find
digital services difficult, remembering to ask is part of the problem.
A proactive agent removes that burden — and it is what makes the product
feel like a companion rather than a tool.

### Silence is a feature

The agent does not speak when there is nothing to say. The endpoint
returns `{ speak: false }` and the UI shows no card. A briefing that
fires every day with "You have nothing scheduled" would train the user
to ignore it. The briefing appears only when it has content.

## 7. Request Lifecycle — One Worked Example

Below is the complete trace of the Hero Electricity Bill Scenario across the entire stack.

---

### Turn 1: Understanding the Message

#### 1. User Utterance
```text
"Alexa, I got a message from the electricity company. I don't understand it."
```

#### 2. Sequence of Function Calls
```
Web UI (App.tsx:submit)
  │ POST /api/chat { userId: "demo-user", conversationId: "conv-101", message: "..." }
  ▼
Agent Orchestrator (orchestrator.ts:handleMessage)
  │ recordTurn(state, "user", message)
  ▼
Planner (planner.ts:plan)
  │ converseJson({ system: PLANNER_SYSTEM_PROMPT, messages: [...] })
  │ Returns: { intent: "UNDERSTAND_MESSAGE", reasoning: "User received a confusing bill", extractedReference: null }
  ▼
Orchestrator (orchestrator.ts:handleUnderstand)
  │ callTool("analyze_message", { content: userMessage, source: "user_message" })
  │ Direct message has no entities -> falls back to getCurrentMessage() demo fixture
  │ callTool("analyze_message", { content: "Electricity bill of ₹1,842.\nPayment due October 15.", source: "demo_fixture" })
  ▼
MCP Server (tools/analyze-message.ts)
  │ extractFacts(content) -> returns { summary: "...", facts: [...], entities: [{ type: "bill", key: "electricity_bill", data: { provider: "Electricity Company", amount: 1842, dueDate: "2026-10-15", currency: "INR" } }], questionsAnswerableFromSource: ["What is the amount?", "When is it due?"] }
  ▼
Orchestrator (orchestrator.ts:handleUnderstand)
  │ callTool("save_context", { userId: "demo-user", type: "bill", key: "electricity_bill", data: {...}, source: "demo_fixture" })
  ▼
MCP Server (db/contexts.ts:saveContext)
  │ PutCommand -> independence-context { contextId: "ctx-991", key: "electricity_bill", ... }
  ▼
Orchestrator (orchestrator.ts:handleUnderstand)
  │ converse({ system: RESPONSE_SYSTEM_PROMPT, ... })
  │ Returns: "It says your electricity bill is ₹1,842 and payment is due October 15."
```

#### 3. State After Turn 1
- `state.activeContext`: `{ contextId: "ctx-991", type: "bill", key: "electricity_bill", data: { amount: 1842, dueDate: "2026-10-15", provider: "Electricity Company", currency: "INR" } }`
- `state.pendingConfirmation`: `null`
- `state.recentTurns`: `2 turns`

---

### Turn 2: Follow-up Question (Strict Anti-Hallucination)

#### 1. User Utterance
```text
"What happens if I don't pay it?"
```

#### 2. Sequence of Function Calls
```
Planner (planner.ts:plan)
  │ LLM identifies activeContext -> Returns: { intent: "FOLLOW_UP", reasoning: "User asking consequence of non-payment" }
  ▼
Orchestrator (orchestrator.ts:handleFollowUp)
  │ Evaluates state.activeContext
  │ converse({
  │   system: RESPONSE_SYSTEM_PROMPT,
  │   messages: [{ role: "user", content: "Context data: {...}\nUser question: What happens if I don't pay it?\nAnswer strictly from context. If not in context, say so plainly." }]
  │ })
  │ Returns: "The message doesn't say what happens after the deadline. I don't want to guess."
```

#### 3. State After Turn 2
- Context remains `electricity_bill` (`ctx-991`). No database writes occurred.

---

### Turn 3: Creating a Reminder

#### 1. User Utterance
```text
"Remind me on the 10th."
```

#### 2. Sequence of Function Calls
```
Planner (planner.ts:plan)
  │ Returns: { intent: "CREATE_REMINDER", extractedReference: null }
  ▼
Orchestrator (orchestrator.ts:handleCreateReminder)
  │ resolveContext("demo-user", null, state.activeContext) -> returns activeContext (ctx-991)
  │ parseReminderDate("Remind me on the 10th.", ctx)
  │   - Extracts day: 10
  │   - Anchors to context date month (October 2026)
  │   - Constructs: "2026-10-10T09:00:00.000Z"
  │ deriveReminderTitle(ctx) -> "Pay Electricity Company bill"
  │ callTool("create_reminder", { userId: "demo-user", title: "Pay Electricity Company bill", scheduledAt: "2026-10-10T09:00:00.000Z", relatedContextId: "ctx-991" })
  ▼
MCP Server (db/reminders.ts:createReminder)
  │ PutCommand -> independence-reminders { reminderId: "rem-441", status: "active", ... }
  ▼
Orchestrator
  │ Returns: "Done. I'll remind you on October 10."
```

#### 3. State After Turn 3
- `actions`: `[{ type: "reminder_created", summary: "Reminder created for October 10" }]`

---

### Turn 4: Drafting Family Message (Confirmation Gate Stops Flow)

#### 1. User Utterance
```text
"And tell my daughter about it."
```

#### 2. Sequence of Function Calls
```
Planner (planner.ts:plan)
  │ Returns: { intent: "DRAFT_MESSAGE", extractedReference: "it" }
  ▼
Orchestrator (orchestrator.ts:handleDraftMessage)
  │ resolveContext("demo-user", "it", state.activeContext) -> returns activeContext (ctx-991)
  │ extractRecipient("And tell my daughter about it.") -> returns "daughter"
  │ callTool("resolve_contact", { userId: "demo-user", reference: "daughter" })
  ▼
MCP Server (tools/contacts.ts:resolve_contact)
  │ QueryCommand on RelationshipIndex (userId="demo-user", relationship="daughter")
  │ Returns: { found: true, contact: { contactId: "cont-001", relationship: "daughter", displayName: "Priya Sharma", channel: "whatsapp", address: "+91 98765 43210" } }
  ▼
Orchestrator (orchestrator.ts:draftToContact)
  │ composeMessageFromContext(ctx) -> "My electricity bill is ₹1,842 and it's due October 15."
  │ callTool("draft_family_message", { userId: "demo-user", contactId: "cont-001", content: "...", relatedContextId: "ctx-991" })
  ▼
MCP Server (tools/messaging.ts:draft_family_message)
  │ token = issueConfirmationToken() -> "e8b2c4d1-819a-4e2a-9f5b-112233445566"
  │ drafts.createDraft(...) -> PutCommand independence-message-drafts { draftId: "draft-771", status: "draft" }
  │ drafts.attachConfirmationToken(...) -> UpdateCommand (attaches token to draft row)
  │ Returns: { draftId: "draft-771", recipient: {...}, message: "...", requiresConfirmation: true, confirmationToken: "e8b2c4d1..." }
  ▼
Orchestrator
  │ Stores in state.pendingConfirmation: { draftId: "draft-771", confirmationToken: "e8b2c4d1...", recipient: {...}, message: "..." }
  │ STOPS EXECUTION. Returns output with pendingConfirmation object.
  │ Reply: "I can send Priya Sharma a whatsapp message saying: \"My electricity bill is ₹1,842 and it's due October 15.\" Should I send it?"
```

#### 3. State After Turn 4
- `state.pendingConfirmation`: Populated with draft metadata and token.
- Web UI renders the blocking **Amber Confirmation Dialog**.

---

### Turn 5: User Confirms Send (Triggering Send Pipeline)

#### 1. User Utterance
```text
"Yes."
```

#### 2. Sequence of Function Calls
```
Planner (planner.ts:plan)
  │ state.pendingConfirmation is NOT null
  │ isAffirmative("Yes.") === true
  │ SHORT-CIRCUIT: Returns { intent: "CONFIRM_SEND", reasoning: "Pending confirmation affirmative", extractedReference: null }
  │ (NO LLM CALL MADE)
  ▼
Orchestrator (orchestrator.ts:handleConfirmSend)
  │ callTool("send_family_message", {
  │   userId: "demo-user",
  │   draftId: "draft-771",
  │   confirmationToken: "e8b2c4d1-819a-4e2a-9f5b-112233445566",
  │   userConfirmation: "Yes."
  │ })
  ▼
MCP Server (tools/messaging.ts:send_family_message)
  │ Guard 1: getDraft("demo-user", "draft-771") -> Found!
  │ Guard 2: draft.status === "draft" -> Valid!
  │ Guard 3: tokensMatch(draft.confirmationToken, providedToken) -> timingSafeEqual MATCH!
  │ Guard 4: userConfirmation ("Yes.") -> Non-empty!
  │ markConfirmed("demo-user", "draft-771") -> UpdateCommand (SET status='confirmed' WHERE status='draft')
  │ markSent("demo-user", "draft-771") -> UpdateCommand (SET status='sent' WHERE status='confirmed')
  │ Returns: { sent: true, draftId: "draft-771", sentAt: "2026-09-30T22:30:00Z" }
  ▼
Orchestrator
  │ state.pendingConfirmation = null
  │ Returns: "Done. Marked as sent to Priya Sharma over whatsapp."
```

---

### Turn 6: Two Days Later (Cross-Conversation Retrieval)

#### 1. User Utterance (In a New Session `conv-999`)
```text
"What was that bill I was worried about yesterday?"
```

#### 2. Sequence of Function Calls
```
Planner (planner.ts:plan)
  │ Returns: { intent: "RETRIEVE_CONTEXT", extractedReference: "that bill" }
  ▼
Orchestrator (orchestrator.ts:handleRetrieveContext)
  │ resolveContext("demo-user", "that bill", null)
  │ callTool("get_context", { userId: "demo-user", query: "that bill" })
  ▼
MCP Server (tools/context.ts:get_context)
  │ 1. Exact match "that_bill" -> Not found
  │ 2. Heuristic type inference: /bill/ -> type = "bill"
  │ 3. contexts.findRecentByType("demo-user", "bill", 5)
  │    QueryCommand on independence-context (userId="demo-user", FilterExpression="type = :t")
  │    Returns [ { contextId: "ctx-991", type: "bill", key: "electricity_bill", data: { amount: 1842, dueDate: "2026-10-15" } } ]
  ▼
Orchestrator
  │ state.activeContext = retrievedContext (ctx-991)
  │ converse({ system: RESPONSE_SYSTEM_PROMPT, messages: [...] })
  │ Returns: "It was your electricity bill for ₹1,842, due October 15."
```

---

## 8. Memory and State

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            MEMORY & RETENTION TIERS                              │
├──────────────────────┬────────────────────────┬──────────────────────────────────┤
│ Tier                 │ Mechanism              │ Lifecycle / Expiration           │
├──────────────────────┼────────────────────────┼──────────────────────────────────┤
│ Ephemeral Dialog     │ In-Memory Map in       │ 30-minute idle TTL               │
│ State                │ apps/agent             │ (periodic sweep every 5m)        │
├──────────────────────┼────────────────────────┼──────────────────────────────────┤
│ Historical Turns     │ DynamoDB               │ 30-day retention                 │
│                      │ independence-convers.  │ (DynamoDB TTL `expiresAt`)       │
├──────────────────────┼────────────────────────┼──────────────────────────────────┤
│ Authorized Facts     │ DynamoDB               │ Indefinite retention             │
│ & Entities           │ independence-context   │ (or custom `ttlDays`)            │
├──────────────────────┼────────────────────────┼──────────────────────────────────┤
│ Reminders & Outbound │ DynamoDB               │ Permanent audit record           │
│ Draft State Machine  │ reminders & drafts     │                                  │
└──────────────────────┴────────────────────────┴──────────────────────────────────┘
```

---

### In-Memory Dialog State

The agent process maintains an in-memory `Map<string, ConversationState>` for active sessions:

```typescript
// apps/agent/src/models/schemas.ts
export interface ConversationState {
  conversationId: string;
  userId: string;
  recentTurns: Array<{ role: 'user' | 'agent'; text: string; at: string }>;
  activeContext: ContextMatch | null;
  pendingConfirmation: PendingConfirmation | null;
  pendingReminderMessage: string | null;
  pendingContactClarification: PendingContactClarification | null;
  createdAt: string;
  updatedAt: string;
}
```

A periodic sweep evicts conversations older than 30 minutes:
```typescript
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of conversations) {
    if (new Date(s.updatedAt).getTime() < cutoff) {
      conversations.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();
```

---

### Cross-Conversation Memory Mechanism

Cross-conversation recall operates without keeping conversational memory open:
1. When a new session begins, `state.activeContext` is `null`.
2. When the user asks *"What was that bill?"*, `planner.ts` extracts the reference `"that bill"` with intent `RETRIEVE_CONTEXT`.
3. `resolveContext()` calls MCP `get_context(userId, "that bill")`.
4. `get_context` applies `HEURISTIC_TYPE_MAP` to map `"bill"` to the `bill` category and queries DynamoDB `independence-context` for the most recent entity of type `bill`.
5. The retrieved item is loaded into `state.activeContext` for the current conversation, restoring full conversational context seamlessly across session boundaries.

---

## 9. The Frontend

The web application ([`apps/web`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web)) is built with React 19 and Vite 6, providing a simulated Alexa+ ambient desktop experience.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                FRONTEND LAYOUT MAP                                │
├──────────────────────────────────────────────────────────────────────────────────┤
│ SYSTEM HEADER: Status [PROCESSING / READY] · Connection Indicator · Nav Tabs     │
├───────────────────────────────┬──────────────────────────┬───────────────────────┤
│ PANEL 1: CONVERSATION         │ PANEL 2: CONTEXT / MEMORY│ PANEL 3: ACTIONS LIST │
│  - Chronological Turn Stream  │  - Active Card Widget    │  - Completed Step Log │
│  - Voice Input (Web Speech)   │  - Badge / Provider Name │  - Context Saved      │
│  - Amber Confirmation Dialog  │  - Amount / Due Date     │  - Reminders Set      │
│    [Yes, send it] [Cancel]    │  - Source Traceability   │  - Message Sent       │
└───────────────────────────────┴──────────────────────────┴───────────────────────┘
```

---

### 1. Three-Panel Layout
- **Conversation Panel ([`Conversation.tsx`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web/src/components/Conversation.tsx)):** Displays user and agent messages with typographic distinction, typing indicators, and embedded error banners.
- **Context Panel ([`ContextPanel.tsx`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web/src/components/ContextPanel.tsx)):** Displays the active entity stored in DynamoDB (e.g. Bill Badge, ₹1,842 due date, source provenance string).
- **Actions Panel ([`ActionsPanel.tsx`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web/src/components/ActionsPanel.tsx)):** Real-time timeline log of completed MCP tool executions (`Understood`, `Reminder set`, `Draft prepared`, `Message sent`).

---

### 2. The Amber Confirmation Prompt ([`ConfirmationPrompt.tsx`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web/src/components/ConfirmationPrompt.tsx))
When a Level 3 action is proposed, the UI renders a modal dialog box with `role="alertdialog"`:
- **Visual Distinction:** Warm amber/gold border and icon (`⏸`), visually signaling a pause in autonomy.
- **Content Display:** Displays recipient name, channel badge (`via whatsapp · +91 98765...`), and an exact blockquote of the draft message.
- **Interactive Controls:** Explicit **"Yes, send it"** and **"No, cancel"** buttons that trigger deterministic responses back to the agent orchestrator.

---

### 3. Voice Input via Web Speech API ([`VoiceInput.tsx`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web/src/components/VoiceInput.tsx))
Provides hands-free voice interaction utilizing `window.SpeechRecognition` or `window.webkitSpeechRecognition`:
- Configured for `en-IN` (Indian English) and standard English locales.
- Supports real-time interim transcript streaming directly into the command console.
- Automatically handles microphone permissions and speech termination events.

---

### 4. Audio Feedback & Perceptual Latency Masking Engine ([`audio.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web/src/lib/audio.ts))
Because multi-step LLM extraction and DynamoDB persistence require 1.0–1.8 seconds per turn, the web interface implements an ambient acoustic and visual latency masking system:
- **Phase State Machine:** `ProcessingPhase` tracks conversational progression through `'idle'` → `'submitted'` → `'masking'`.
- **Latency Threshold Gate (`MASK_THRESHOLD_MS = 600`):** If the backend does not return within 600ms, the frontend automatically initiates dual-channel feedback to reassure the user:
  1. **Web Audio API Thinking Chime (`playThinkingChime()`):** A soft, synthesized two-tone sine chime (720Hz ramping to 540Hz over 180ms with exponential gain envelope) generated dynamically without external media asset dependencies.
  2. **Conversational Voice Acknowledgement (`speak("One moment.")`):** Initiated 150ms after the chime via `SpeechSynthesisUtterance`, providing immediate ambient confirmation that the agent is actively processing the request.
  3. **Visual Typing State ([`Conversation.tsx`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/apps/web/src/components/Conversation.tsx)):** Renders animated triple dots accompanied by an italicized `working…` label during the masking phase.
- **Immediate Cancellation:** The instant the agent HTTP response arrives, `stopSpeaking()` immediately cancels any active speech synthesis and clears the masking timer, ensuring zero conversational delay.

---

## 9A APL Mapping — How the UI Would Render on Echo Show

The web UI is a React application running in a browser. For Echo Show
devices, the same agent responses would render through Alexa Presentation
Language (APL), Amazon's JSON-based declarative UI framework.

Both clients consume the same `ContextMatch`, `PendingConfirmation`, and
`AgentAction[]` data from the agent. Only the rendering layer differs.

### Component mapping

| Web UI | APL equivalent |
|---|---|
| Three-panel grid | Container with `direction: "row"`, collapsing to `"column"` on narrow viewports |
| Conversation transcript | Sequence with `scrollDirection: "vertical"` |
| Context panel | Container with Text elements, or the AlexaDetail template |
| Actions log | AlexaTextList |
| Amber confirmation prompt | Custom Container with two TouchWrapper buttons |
| Voice input button | Not needed — Echo Show has far-field microphones |
| Text composer | EditText, or voice on touch-only devices |

### The confirmation gate on Echo Show

The confirmation screen is the product's most safety-critical UI. On Echo
Show it renders with:

- 120px-tall touch targets (Amazon's minimum is 48×48px)
- Text contrast ratios above 4.5:1
- `accessibilityLabel` on every interactive element for VoiceView
- Voice-only completion — the user can say "yes" or "no" without touching
- No flashing or blinking motion, per Amazon accessibility guidance

### A visual preview

A web page rendering the confirmation, context, and briefing screens at
Echo Show dimensions is available at:

    /?view=apl                  → confirmation screen
    /?view=apl&variant=context  → context card
    /?view=apl&variant=briefing → morning briefing

This is a design preview, not a real APL renderer. It exists so the
layouts can be reviewed and screenshotted before an Echo Show device is
available for testing.

### Production path

Connecting an Echo Show requires:

1. Registering the MCP server as an Alexa+ add-on (partner-only access today)
2. Adding `Alexa.Presentation.APL.RenderDocument` directives to the Alexa
   skill's response layer
3. Uploading the APL documents and data sources
4. Testing on an Echo Show with VoiceView enabled

The agent, MCP server, and data model do not change. The APL client is a
parallel rendering target, like the web UI.


## 10. What's Real vs. Simulated

| Component | Status | Implementation Notes |
|---|---|---|
| **MCP Server Runtime** | **REAL** | Streamable HTTP (`@modelcontextprotocol/sdk`), stateless transport on port `3001`. Fully spec-compliant. |
| **MCP Tool Surface** | **REAL** | 8 registered tools with Zod input/output validation, error handling, and structured content return. |
| **Amazon DynamoDB Storage** | **REAL** | 6 live DynamoDB tables on AWS using `@aws-sdk/lib-dynamodb` with GSIs, conditional expressions, and TTL. |
| **LLM Reasoning & Extraction** | **REAL** | AWS Bedrock (`us.anthropic.claude-sonnet-4-6`) and OpenAI runtime adapters for intent classification and response generation. |
| **Contact Resolution Engine** | **REAL** | Full database query and heuristic fallback engine resolving relationship words to stored contacts. |
| **Draft State Machine & Guards** | **REAL** | Server-issued UUID tokens, `crypto.timingSafeEqual`, and conditional DynamoDB write expressions. |
| **External Message Delivery** | **SIMULATED** | Draft lifecycle records message status as `sent` in DynamoDB, but no live WhatsApp Business or Twilio SMS API is invoked in MVP. |
| **Alexa+ MCP Toolkit Binding** | **SIMULATED** | Amazon Alexa+ MCP Toolkit is partner-restricted. A simulated React UI connects to the real MCP server over Streamable HTTP. |

---

## 11. Extension Paths

1. **Real Messaging Delivery (WhatsApp Business API & Twilio SMS):**  
   [`mcp-server/src/tools/messaging.ts`](file:///H:/htdocs/meeting2action-alexa-agent/elder-s-alexa-project/mcp-server/src/tools/messaging.ts) already receives resolved contact phone numbers and communication channel identifiers. Replacing the final `markSent()` step with a Twilio or WhatsApp Business SDK call requires under 20 lines of code without changing tool schemas.

2. **Email Ingestion via Gmail OAuth / Microsoft Graph API:**  
   `analyze_message` accepts raw text and a `source` string. An external ingestion worker can poll IMAP/OAuth mailboxes, extract email body content, and pass messages to `analyze_message` automatically.

3. **Proactive Scheduled Reminders via AWS EventBridge:**  
   When `create_reminder` records a timestamp in DynamoDB, it can simultaneously emit an Amazon EventBridge scheduled rule to trigger an outbound push notification or Alexa proactive announcement at the designated time.

4. **MCP Apps Interactive Screen Cards:**  
   Because the MCP server produces structured JSON entities (`structuredContent`), it is directly compatible with the upcoming MCP Apps UI specification for rendering interactive native cards on Amazon Echo Show smart displays.

5. **Caregiver Escalation with Tiered Consent:**  
   The safety architecture can be extended by adding a `caregiverConsentRequired` flag on high-value contexts, triggering a secondary confirmation token dispatch to a designated guardian contact before execution.

6. **Mobile Application via React Native:**  
   The REST/JSON interface exposed by `apps/agent` and the Streamable HTTP interface of `mcp-server` allow mobile clients to bind to the orchestrator using standard HTTP fetch mechanisms.

---

## 12. Known Limitations

1. **Extraction Latency & Perceptual Mitigation:**  
   Two sequential LLM calls (Planner intent classification + Response natural language generation) introduce approximately 1.0–1.8 seconds of end-to-end turn latency. The web client mitigates user friction using an acoustic Web Audio API chime and speech synthesis acknowledgement triggered when processing exceeds 600ms (`MASK_THRESHOLD_MS`).
2. **Volatile In-Memory Dialog State:**  
   Active turn buffers and pending confirmation tokens reside in Node.js process memory; an ungraceful container restart during a pending confirmation requires the user to repeat their request.
3. **Simulated Outbound Telephony:**  
   The MVP records outbound sends in the database without connecting to external carrier SMS aggregators.
4. **Partner-Restricted Alexa+ Native Hosting:**  
   Direct deployment to Amazon Echo hardware is subject to Amazon's closed beta partner rollout.
5. **Single-Tenant Demo Context:**  
   The MVP operates on a default `demo-user` profile without multi-tenant OAuth 2.1 authentication.
6. **Pre-Seeded Contacts Database:**  
   Contact records are seeded via database scripts (`infrastructure/scripts/seed-contacts.ts`) rather than synced via real-time phone contact book permissions.

---

## 13. Glossary

- **Model Context Protocol (MCP):** An open, standardized protocol created by Anthropic that standardizes how AI applications expose tools, resources, and contextual prompts to language models.
- **Streamable HTTP:** The modern, spec-compliant transport mechanism for MCP (spec `2025-11-25`), replacing legacy HTTP+SSE by supporting bidirectional streaming over standard HTTP POST/GET endpoints.
- **Zod Schema:** A TypeScript-first schema declaration and validation library used in the MCP server to guarantee compile-time and runtime type safety for tool inputs and outputs.
- **Conditional Write (`ConditionExpression`):** An atomic database feature in Amazon DynamoDB that guarantees an update or put operation succeeds only if specific attribute conditions evaluate to true, eliminating concurrency race conditions.
- **Global Secondary Index (GSI):** An auxiliary DynamoDB index with a partition key and sort key that can be different from those on the base table, enabling fast queries across non-primary attributes.
- **Time-to-Live (TTL):** An automated DynamoDB feature that periodically purges expired items from tables based on an epoch-second timestamp without consuming provisioned write throughput.
- **Safety Guard:** A deterministic, non-LLM validation check executed at the server capability boundary that verifies preconditions before allowing a sensitive operation to proceed.
- **Confirmation Token:** A cryptographically random, server-issued UUID generated when a draft is created, required by the MCP server to validate that an execution call directly corresponds to an authorized draft.
- **Draft Lifecycle:** The formal state machine (`draft` → `confirmed` → `sent`) governing outbound messages, enforced by DynamoDB conditional expressions to prevent duplicate or unauthorized transmissions.

---

### Reminder Lifecycle

Reminders deduplicate on `(userId, relatedContextId)`. If a user asks
for a reminder about the same context twice, the second request updates
the existing reminder's scheduled time rather than creating a new row.

Reminders have three states:
- `active` — scheduled for the future, will fire
- `completed` — the user acknowledged it
- `cancelled` — the user cancelled it

A reminder whose `scheduledAt` is in the past but still in `active`
status is a "missed reminder." It is excluded from the morning briefing
and shown separately via the `list_missed_reminders` tool when the user
asks "what did I miss?"

Reminders completed or cancelled more than 90 days ago are removed by
DynamoDB TTL. No manual cleanup is required.

---

*Authored for the Amazon Developer Hackathon 2026 — Alexa+ Track.*
