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

**On screen:** Static title card or a blurred photo/mockup of a confusing utility bill and SMS notification.

**Tone & Pacing:** Empathetic, deliberate, authoritative.

**Narration (Voiceover):**

> "Everyday digital services make a dangerous assumption: they assume you can effortlessly parse a confusing utility bill or clinic SMS, track down an obscure deadline, navigate complex multi-screen apps, and act on it—often within minutes.
>
> For millions of adults—particularly older adults or anyone managing cognitive fatigue—that assumption creates an insurmountable wall between what they want to accomplish and what digital interfaces demand.
>
> We built the **Alexa+ Everyday Independence Agent** to tear that wall down."

**Do not:** Show architecture diagrams yet. Show a logo or title card for no more than 2–3 seconds.

---

## SCENE 2 — The Product (0:20 – 0:35)

**On screen:** Cut to the clean web UI (`localhost:5173`). Highlight the 3-panel layout: Left (Conversation Stream), Center (Persistent Context Card), Right (Verified Actions Log).

**Tone & Pacing:** Clear, confident, enthusiastic.

**Narration (Voiceover):**

> "This is the Everyday Independence Agent. Built specifically for the Alexa+ hackathon track, it connects directly to a spec-compliant Model Context Protocol server over Streamable HTTP.
>
> It does three things no traditional chatbot can do: it maintains persistent contextual memory across conversations in DynamoDB, it resolves real-world contacts like family members, and it enforces a strict, non-LLM confirmation gate before anything ever leaves the room."

---

## SCENE 3 — Understand (0:35 – 0:55)

**Action on screen:** Click microphone or type in the composer:

```text
I got a message from the electricity company. I dont understand it.
```

*(Optional: paste the sample bill text if using full SMS format)*

**Narration (Voiceover while typing / sending):**

> "Let's walk through a real-world scenario. An older adult living independently receives an alarming message from their regional power board filled with account numbers, due dates, and disconnection warnings. Instead of getting stuck in a mobile portal, they simply speak to Alexa: *'I got a message from the electricity company. I don't understand it.'*"

**Wait for agent response (pause 1–2 seconds as UI updates).**

**Point cursor on screen:** Context panel shows ₹1,842 and the due date. Actions panel shows "Understood".

**Narration (Voiceover as response appears):**

> "Notice what happened instantly. The orchestrator invoked the MCP tool `analyze_message`. Rather than dumping an unstructured summary, it extracted verified facts—the bill amount of ₹1,842 and the September 28 deadline—and saved them directly to Amazon DynamoDB as persistent context. It explains everything in calm, plain language."

---

## SCENE 4 — Answer (0:55 – 1:10)

**Action on screen:** Type or speak into composer:

```text
What happens if I dont pay it?
```

**Narration (Voiceover while typing):**

> "Now, the user asks a natural follow-up question driven by anxiety: *'What happens if I don't pay it?'*"

**Wait for agent response (pause 1 second).**

**Narration (Voiceover as response appears):**

> "Watch how the agent responds. Because disconnection penalties were not detailed in the original message, the agent refuses to speculate. It answers plainly: *'The message doesn't say what happens after the deadline. I don't want to guess.'*
>
> It strictly grounds its answers on verified source facts. That anti-hallucination discipline is the critical difference between helping someone and causing panic."

---

## SCENE 5 — Remember and Plan (1:10 – 1:25)

**Action on screen:** Type or speak into composer:

```text
Remind me in 1 minute.
```

*(Note: In daily usage, the user might say 'Remind me on the 26th'. For this live demo, '1 minute' showcases the real-time AWS pipeline!)*

**Narration (Voiceover while typing):**

> "Now the user wants to stay on top of the deadline without stressing: *'Remind me in 1 minute.'*"

**Wait for reply.** Actions panel updates with "Reminder set".

**Narration (Voiceover as reminder confirms):**

> "The orchestrator doesn't just record a detached string of text. It links this scheduled reminder directly to the active bill context in DynamoDB and registers it with AWS EventBridge Scheduler. When this reminder fires, it will carry the full context of the bill, so the user never has to wonder what it was for."

---

## SCENE 6 — Confirm (1:25 – 1:50)

**Action on screen:** Type or speak into composer:

```text
And tell my daughter about it.
```

**Narration (Voiceover while typing):**

> "Next, the user asks to loop in family for support: *'And tell my daughter about it.'*"

**The amber confirmation card slides in. Pause for 2 full seconds of silence to let judges see the card.**

**Narration (Voiceover pointing to the amber card):**

> "Watch what happens here. The agent calls `resolve_contact` to look up 'my daughter' against our contacts table—resolving Priya Sharma with her verified WhatsApp number. It calls `draft_family_message` to stage the update. But it deliberately halts and does NOT send."

**Pause 1 second.**

**Narration (Voiceover highlighting the safety gate):**

> "This is our asymmetric, three-layer safety gate. External communications carry real-world consequences, so nothing leaves the device without explicit, verified user authorization. The LLM cannot bypass this, and the amber dialog blocks execution."

**Action on screen:** Click **"Yes, send it"** (or speak *"Yes"*).

**Narration (Voiceover as message sends):**

> "When the user confirms, the MCP server independently validates the confirmation token using constant-time verification before dispatching. The model cannot skip this gate, and drafts cannot be replayed. Safety isn't just a prompt instruction—it is enforced deterministically on both sides."

---

## SCENE 7 — The AWS Pipeline (1:50 – 2:05)

**Action on screen:** Cut to the email inbox tab (Gmail). The SNS reminder email is visible.

**Narration (Voiceover on email tab):**

> "Right on schedule, exactly one minute later, the reminder fires in the background. AWS EventBridge Scheduler invoked an AWS Lambda function, updating the status in DynamoDB and publishing the alert through Amazon SNS. The user's notification arrives automatically."

**Action on screen:** Cut back to the web UI tab. The notification card is visible at the top of the interface.

**Narration (Voiceover back on web UI):**

> "And right inside our ambient Alexa+ interface, the incoming reminder card displays seamlessly—closing the proactive loop without the user having to re-prompt."

---

## SCENE 8 — Memory Across Conversations (2:05 – 2:20)

**Action on screen:** Click **"New conversation"** button in the header. (Workspace resets; prior chat disappears).

**Type or speak into composer:**

```text
What was that bill I was worried about yesterday?
```

**Narration (Voiceover while clicking and typing):**

> "Now let's test cross-session memory. We click 'New Conversation'. The screen is blank, and the prior chat is gone. The user casually asks: *'What was that bill I was worried about yesterday?'*"

**Wait for reply.** The Context panel repopulates with the electricity bill card.

**Narration (Voiceover as context restores):**

> "Notice how the agent instantly recalls the electricity bill from DynamoDB. It resolves ambiguous natural references like 'that bill' across days and sessions. This is persistent ambient context that genuinely supports independent living over time."

---

## SCENE 9 — It Generalizes (2:20 – 2:35)

**Action on screen:** Click **"New conversation"**. Type or speak into composer:

```text
I got this from my doctor: Appointment confirmed with Dr. Meera on 12 November at 4:30 PM at City Clinic, Room 3. I dont understand it.
```

**Narration (Voiceover while typing):**

> "The system isn't hardcoded for utility bills. Let's provide an entirely different domain—a specialist clinic appointment notification."

**Wait for reply.** Context panel shows the appointment entity (Doctor, Date, Time, Room).

**Narration (Voiceover as appointment card appears):**

> "Instantly, the extraction pipeline identifies the physician, date, time, and room location, saving the new structured entity. Whether it's medical notices, utility bills, municipal circulars, or bank alerts, the pipeline remains identical: Understand, Ground, Remember, and Safely Act."

---

## SCENE 10 — Architecture (2:35 – 2:50)

**Action on screen:** Cut to the clean architecture diagram or slide:

```text
Alexa+ Ambient UI (React 19) ──▶ Agent Orchestrator (Node.js) ──▶ MCP Server (Streamable HTTP)
                                                                            │
                                     ┌──────────────────────────────────────┴─────────────────┐
                                     ▼                                                        ▼
                        Amazon Bedrock (Claude Sonnet)                              AWS DynamoDB + EventBridge
```

**Narration (Voiceover):**

> "Under the hood, our architecture strictly decouples reasoning from capability. The conversational agent handles intent classification and relative date math, then communicates with our standalone MCP Server over Streamable HTTP—the exact transport required by Alexa+.
>
> The agent decides what to request, but the MCP server independently validates all schemas and enforces safety policies. Direct database access is prohibited, ensuring complete security isolation."

---

## SCENE 11 — Closing (2:50 – 3:00)

**Action on screen:** Return to the live web UI. Show the conversation and populated context panel.

**Tone & Pacing:** Warm, inspiring, concluding.

**Narration (Voiceover):**

> "The Alexa+ Everyday Independence Agent isn't just another conversational chatbot. It is a protective ambient layer designed for real people dealing with everyday digital overload.
>
> It doesn't force people to learn complicated interfaces—it makes technology adapt to the way people naturally ask for help.
>
> Thank you."

**Fade to black.** End card: Project Name: **Alexa+ Everyday Independence Agent**, Team: **Suraj Thapa & Kapish Bisht**, GitHub URL.

---

## Backup — 60-second version

If a shorter cut is needed (e.g. strict 1-minute limit):

1. **0:00–0:10 — Problem Statement:**
   > *"Everyday digital services assume you can read complex messages, navigate apps, and remember deadlines. For millions of adults, that creates a wall. The Alexa+ Everyday Independence Agent removes that wall."*

2. **0:10–0:25 — Understand the Bill:**
   > *(Type bill message)* *"The agent extracts verified facts—₹1,842 due September 28—into persistent DynamoDB memory, explaining it in plain language with strict anti-hallucination grounding."*

3. **0:25–0:50 — The Confirmation Gate:**
   > *(Type 'Tell my daughter about it')* *"When asked to notify family, the agent resolves Priya on WhatsApp, drafts the message, but stops. Nothing leaves the device without verified user authorization. Our 3-layer safety gate enforces deterministic confirmation on both sides."*

4. **0:50–1:00 — Closing Line:**
   > *"Running on the Model Context Protocol over Streamable HTTP, we make digital services adapt to the way people naturally ask for help."*

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