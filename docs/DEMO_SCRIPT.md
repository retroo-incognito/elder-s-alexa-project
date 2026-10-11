# Demo Video Script — Alexa+ Everyday Independence Agent

**Target runtime:** 3:00
**Recording:** 1080p, 30fps, browser window only
**Setup:** Three terminals running. Web UI open at localhost:5173.

---

## Before recording

- [ ] Both services running (`mcp-server`, `apps/agent`, `apps/web`)
- [ ] Browser at 1400×900, zoom 100%
- [ ] Bookmarks bar hidden (Ctrl+Shift+B)
- [ ] Other tabs closed
- [ ] Web UI on a fresh conversation
- [ ] Email inbox open in a second tab (for the SNS proof moment)
- [ ] Run once through the full flow — warm the LLM cache
- [ ] Have a demo bill ready to paste

---

## SCENE 1 — The Problem (0:00 – 0:20)

**On screen:** Static title card or a blurred photo of a utility bill.

**Narration:**

> "Everyday digital services assume you can read a complex message,
> understand a deadline, and act on it — often within minutes.
>
> For millions of adults, that assumption creates a wall between what
> they want to do and what the interface allows.
>
> We built an agent that removes that wall."

**Do not:** Show architecture. Show a logo for more than 2 seconds.

---

## SCENE 2 — The Product (0:20 – 0:35)

**On screen:** Cut to the web UI. Three panels visible.

**Narration:**

> "This is the Everyday Independence Agent. It runs on the Model
> Context Protocol — the same open standard Alexa+ uses for add-ons.
>
> It does three things no chatbot does: it remembers what matters, it
> resolves who you mean, and it stops before doing anything that leaves
> the room."

---

## SCENE 3 — Understand (0:35 – 0:55)

**Type in composer:**


## I got a message from the electricity company. I dont understand it.


**Narration while typing:**

> "A user has received a bill they don't understand."

**Wait for reply, then pause for 2 seconds.**

**Narration:**

> "The agent read the message, extracted the amount and the deadline,
> and saved them as persistent context. Structured facts — not a summary."

**Point out on screen:** Context panel shows ₹1,842 and the due date. Actions panel shows "Understood".

---

## SCENE 4 — Answer (0:55 – 1:10)

**Type:**


## What happens if I dont pay it?

**Narration:**

> "When the user asks a follow-up, the agent answers only from what the
> message actually says."

**Wait for reply.**

**Narration:**

> "If the answer isn't in the source, it says so. It does not guess.
> That's the difference between help and harm."

---

## SCENE 5 — Remember and Plan (1:10 – 1:25)

**Type:**

## Remind me in 1 minute.

**Narration:**

> "Now the user wants a reminder."

**Wait for reply.** Actions panel shows "Reminder set".

**Narration:**

> "The reminder is tied to the bill. When it fires, the user will see
> the original context — not a bare string."

---

## SCENE 6 — Confirm (1:25 – 1:50)

**Type:**

## And tell my daughter about it.

**Narration:**

> "The user wants to tell their daughter."

**The amber confirmation card slides in. Pause for 2 full seconds.**

**Narration:**

> "The agent resolves 'my daughter' against a real contacts table —
> Priya Sharma, WhatsApp, with her phone number. Then it drafts the
> message. But it does not send."

**Pause.**

**Narration:**

> "This is the confirmation gate. Nothing leaves the device until the
> user says yes — and when they do, the server independently validates
> the confirmation before anything is sent."

**Click "Yes, send it".**

**Narration:**

> "The model can't skip this step. The draft can't be resent. The
> safety gate isn't a suggestion — it's enforced on both sides."

---

## SCENE 7 — The AWS Pipeline (1:50 – 2:05)

**Cut to the email inbox tab. The SNS email is visible.**

**Narration:**

> "A minute later, the reminder fires. AWS EventBridge Scheduler
> invoked a Lambda, which marked the reminder as fired and published
> to SNS. The user gets an email — without ever asking again."

**Cut back to the web UI. The notification card is visible at the top.**

> "The web UI shows the same notification in-app."

---

## SCENE 8 — Memory Across Conversations (2:05 – 2:20)

**Click "New conversation" in the header.**

**Type:**

## What was that bill I was worried about yesterday?

**Narration:**

> "New conversation. Nothing on screen. The user refers to a bill they
> never named."

**Wait for reply. The Context panel repopulates.**

**Narration:**

> "The agent resolves 'that bill' against DynamoDB — the same
> persistent state that saved it minutes ago. That's what makes it
> useful over time."

---

## SCENE 9 — It Generalizes (2:20 – 2:35)

**New conversation. Type:**

## I got this from my doctor: Appointment confirmed with Dr. Meera on 12 November at 4:30 PM at City Clinic, Room 3. I dont understand it.


**Narration:**

> "The agent isn't hardcoded for bills. Any message — a doctor's
> appointment, a school notice, a bank statement — extracts into the
> same structured shape."

**Wait for reply. Context panel shows the appointment card.**

**Narration:**

> "Different message. Different fields. Same pipeline: understand,
> remember, act, confirm."

---

## SCENE 10 — Architecture (2:35 – 2:50)

**Cut to a simple diagram:**

## Alexa+ / Web UI → Agent → MCP Server → Tools → DynamoDB + Bedrock

**Narration:**

> "The conversational layer talks to an agent that classifies intent
> and sequences tool calls. The agent reaches a real MCP server over
> Streamable HTTP — the transport Alexa+ requires — with fourteen
> typed tools.
>
> The agent and the server are separate processes. The agent decides
> what to do. The server decides whether it's allowed. Neither trusts
> the other."

---

## SCENE 11 — Closing (2:50 – 3:00)

**Return to the web UI. The conversation and context panel visible.**

**Narration:**

> "The product isn't a smarter chatbot. It's a layer that sits between
> a person and the services that assume too much.
>
> The goal isn't to teach people how to use more interfaces. It's to
> make digital services adapt to the way people naturally ask for help."

**Fade to black.** End card: project name, Suraj & Kapish, GitHub URL.

---

## Backup — 60-second version

If a shorter cut is needed:

1. **0:00–0:10** — Problem statement (Scene 1, compressed)
2. **0:10–0:25** — Understand the bill (Scene 3)
3. **0:25–0:50** — The confirmation gate (Scene 6) — this is the whole story
4. **0:50–1:00** — Closing line

Cut everything else.

---

## Q&A — if judges ask

**"Is this real Alexa+ integration?"**
> "The MCP server is real and spec-compliant. Alexa+'s MCP Toolkit is
> partner-restricted today, so we built a simulated voice-first UI that
> connects to the same MCP server over Streamable HTTP. Swapping it for
> real Alexa+ is a registration step, not an architectural change."

**"How do you prevent prompt injection?"**
> "Two layers. First, a deterministic regex scanner runs before the LLM
> — it can't be injected. Second, when a confirmation is pending, a
> regex decides yes or no, not the model. The LLM never sees the message
> in that state."

**"What's simulated?"**
> "Message delivery. The draft lifecycle records the send, but no SMS or
> WhatsApp API is called. Everything else — extraction, memory, contact
> resolution, the safety gate — is real."

**"What AWS services did you use?"**
> "DynamoDB for six tables of persistent state. Bedrock for extraction
> and reasoning. EventBridge Scheduler, Lambda, and SNS for the reminder
> delivery pipeline. Everything is defined as CDK code."

**"Could this work for a different domain?"**
> "The extraction pipeline is generic — it handles bills, appointments,
> events, notices. The safety model and memory layer are domain-agnostic.
> The only domain-specific piece is the entity schema, and that's driven
> by the extraction prompt."

---

## What to have open

| Screen | Purpose |
|---|---|
| Browser tab 1 — localhost:5173 | Main demo |
| Browser tab 2 — Gmail inbox | SNS proof shot |
| Terminal 1 — mcp-server | Optional, if you want to show logs |
| Terminal 2 — agent | Optional |
| File — this script | Read from here |

Close everything else. No Slack, no Discord, no stray Chrome windows.

---

## Recording tips

- **Record in one take.** Judges don't penalize a natural pause.
- **Speak slower than feels natural.** Demo narration is always too fast.
- **Wait for the UI to update before talking over it.** Give the
  confirmation card two seconds of silence.
- **Don't narrate the architecture before the product.** Judges may stop
  watching at 3:00. The product is the first 2:35.
- **Upload to YouTube unlisted at 1080p.** Paste that link in Devpost.

---

*Suraj & Kapish — Amazon Developer Hackathon 2026*