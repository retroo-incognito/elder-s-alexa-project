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

**Tone & Pacing:** Empathetic, deliberate, authoritative. Speak like you're telling a real story to the judges.

**Narration (Voiceover):**

> *(Gentle, deliberate pace)*
> "Modern technology makes a dangerous assumption: it assumes everyone can effortlessly decipher a confusing electricity bill, track obscure deadlines, and navigate complex app screens.
>
> But for millions of older adults living independently, that assumption creates genuine anxiety. A single confusing message turns into a wall between them and everyday life.
>
> We built the **Alexa+ Everyday Independence Agent** to tear that wall down."

**Do not:** Show architecture diagrams yet. Show a logo or title card for no more than 2–3 seconds.

---

## SCENE 2 — The Product (0:20 – 0:35)

**On screen:** Cut to the clean web UI (`localhost:5173`). Highlight the 3-panel layout: Left (Conversation Stream), Center (Persistent Context Card), Right (Verified Actions Log).

**Tone & Pacing:** Clear, confident, energetic.

**Narration (Voiceover):**

> *(Crisp, confident)*
> "This is the Everyday Independence Agent. Built specifically for Alexa+, it connects directly to a spec-compliant Model Context Protocol server over Streamable HTTP.
>
> But here's what sets it apart from ordinary voice assistants: it maintains persistent contextual memory across conversations in DynamoDB, it knows who your family is, and most importantly—it enforces a deterministic, code-level safety gate before anything ever leaves the room."

---

## SCENE 3 — Understand (0:35 – 0:55)

**Action on screen:** Click microphone or type in the composer:

```text
I got a message from the electricity company. I dont understand it.
```

*(Optional: paste the sample bill text if using full SMS format)*

**Narration (Voiceover while typing / sending):**

> *(Conversational, relatable)*
> "Imagine an elderly parent opens a text from their power board. It's packed with tariff codes and disconnection warnings, and they’re worried. Instead of getting stuck in a mobile app, they just say: *'I got a message from the electricity company. I don't understand it.'*"

**Wait for agent response (pause 1–2 seconds as UI updates).**

**Point cursor on screen:** Context panel shows ₹1,842 and the due date. Actions panel shows "Understood".

**Narration (Voiceover as response appears):**

> *(Pointing out the result)*
> "Look at what happens instantly. Behind the scenes, the orchestrator called the MCP tool `analyze_message`. It didn't dump a wall of text. It extracted the exact facts that matter—the bill is ₹1,842, due on September 28th—and saved them straight into DynamoDB as persistent memory. Then, it explains it back in calm, human terms."

---

## SCENE 4 — Answer (0:55 – 1:10)

**Action on screen:** Type or speak into composer:

```text
What happens if I dont pay it?
```

**Narration (Voiceover while typing):**

> "Naturally, anxiety kicks in. The user asks: *'What happens if I don't pay it?'*"

**Wait for agent response (pause 1 second).**

**Narration (Voiceover as response appears):**

> *(Emphasize anti-hallucination)*
> "Now watch this—this is crucial. Most AI models would try to guess or hallucinate scary penalties. But our agent refuses to guess: *'The message doesn't say what happens after the deadline. I don't want to guess.'*
>
> It stays strictly grounded in verified facts. When you're building for vulnerable users, preventing panic through anti-hallucination discipline isn't an afterthought—it's everything."

---

## SCENE 5 — Remember and Plan (1:10 – 1:25)

**Action on screen:** Type or speak into composer:

```text
Remind me in 1 minute.
```

*(Note: In daily usage, the user might say 'Remind me on the 26th'. For this live demo, '1 minute' showcases the real-time AWS pipeline!)*

**Narration (Voiceover while typing):**

> "Next, they want to stay ahead of the due date without the mental stress: *'Remind me in 1 minute.'*"

**Wait for reply.** Actions panel updates with "Reminder set".

**Narration (Voiceover as reminder confirms):**

> "Notice it didn't just set a disconnected alarm. It bound this scheduled reminder directly to the bill's context in DynamoDB and registered it with AWS EventBridge Scheduler. When the reminder fires, it remembers the full context—so the user never has to wonder what it was for."

---

## SCENE 6 — Confirm (1:25 – 1:50)

**Action on screen:** Type or speak into composer:

```text
And tell my daughter about it.
```

**Narration (Voiceover while typing):**

> "Now the user asks for family support: *'And tell my daughter about it.'*"

**The amber confirmation card slides in. Pause for 2 full seconds of silence to let judges see the card.**

**Narration (Voiceover pointing to the amber card):**

> *(Deliberate pause, then speak with weight)*
> "Watch what happens here. The agent resolves 'my daughter' to Priya Sharma's verified WhatsApp contact and stages the draft message. But notice: it completely stops. It does NOT send."

**Pause 1 second.**

**Narration (Voiceover highlighting the safety gate):**

> "This amber card is our three-layer safety gate. External messages have real-world consequences, so the AI is physically locked down. The LLM cannot bypass this, and nothing leaves the device without human authorization."

**Action on screen:** Click **"Yes, send it"** (or speak *"Yes"*).

**Narration (Voiceover as message sends):**

> *(Punchy technical flex)*
> "The moment I confirm, the MCP server independently validates a cryptographic confirmation token before dispatching. The model can't skip this gate, and drafts cannot be replayed. Safety here isn't just a system prompt—it is hard-enforced in code on both sides."

---

## SCENE 7 — The AWS Pipeline (1:50 – 2:05)

**Action on screen:** Cut to the email inbox tab (Gmail). The SNS reminder email is visible.

**Narration (Voiceover on email tab):**

> *(Paced, clear delivery)*
> "And right on cue, exactly one minute later, the background pipeline fires. AWS EventBridge Scheduler triggered an AWS Lambda function, updated DynamoDB, and delivered this alert through Amazon SNS. Right into our inbox."

**Action on screen:** Cut back to the web UI tab. The notification card is visible at the top of the interface.

**Narration (Voiceover back on web UI):**

> "And right back on the Alexa+ screen, the incoming reminder card displays automatically—closing the proactive loop without the user ever having to ask."

---

## SCENE 8 — Memory Across Conversations (2:05 – 2:20)

**Action on screen:** Click **"New conversation"** button in the header. (Workspace resets; prior chat disappears).

**Type or speak into composer:**

```text
What was that bill I was worried about yesterday?
```

**Narration (Voiceover while clicking and typing):**

> "Now let's test real-world memory. I'll hit 'New Conversation'. The screen resets; the chat is completely gone. Now listen to how humans actually speak: *'What was that bill I was worried about yesterday?'*"

**Wait for reply.** The Context panel repopulates with the electricity bill card.

**Narration (Voiceover as context restores):**

> *(Warm, impressed tone)*
> "Look at that. The agent immediately pulls the electricity bill back up from DynamoDB. It understands vague human phrases like 'that bill' across separate days and sessions. That's persistent ambient memory that genuinely supports independent living."

---

## SCENE 9 — It Generalizes (2:20 – 2:35)

**Action on screen:** Click **"New conversation"**. Type or speak into composer:

```text
I got this from my doctor: Appointment confirmed with Dr. Meera on 12 November at 4:30 PM at City Clinic, Room 3. I dont understand it.
```

**Narration (Voiceover while typing):**

> "And this isn't hardcoded just for utility bills. Let's give it something completely different—a specialist clinic appointment."

**Wait for reply.** Context panel shows the appointment entity (Doctor, Date, Time, Room).

**Narration (Voiceover as appointment card appears):**

> "Instantly, the extraction pipeline identifies Dr. Meera, the date, the time, and the clinic room. Whether it's medical notices, utility bills, or bank alerts, the pipeline remains identical: Understand, Ground in fact, Remember, and Safely Act."

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

> *(Authoritative engineering focus)*
> "Under the hood, our architecture strictly decouples reasoning from capability. The conversational agent handles intent and relative dates, then communicates with our standalone MCP Server over Streamable HTTP—the exact transport required by Alexa+.
>
> The AI decides *what* to request, but the MCP server independently validates all schemas and enforces safety policies. No direct database access—ensuring complete security isolation."

---

## SCENE 11 — Closing (2:50 – 3:00)

**Action on screen:** Return to the live web UI. Show the conversation and populated context panel.

**Tone & Pacing:** Warm, inspiring, impactful.

**Narration (Voiceover):**

> *(Heartfelt and hard-hitting)*
> "The Alexa+ Everyday Independence Agent isn't just another conversational chatbot. It is a protective ambient companion built for real people dealing with digital overload.
>
> We don't force people to learn complicated apps. We make technology adapt to the way humans naturally ask for help.
>
> Thank you."

**Fade to black.** End card: Project Name: **Alexa+ Everyday Independence Agent**, Team: **Suraj Thapa & Kapish Bisht**, GitHub URL.

---

## Backup — 60-second version

If a shorter cut is needed (e.g. strict 1-minute limit):

1. **0:00–0:10 — Problem Statement:**
   > *"Modern apps assume you can read dense notices, navigate screens, and juggle deadlines. For millions of older adults, that creates anxiety. The Alexa+ Everyday Independence Agent removes that wall."*

2. **0:10–0:25 — Understand the Bill:**
   > *(Type bill message)* *"The agent extracts verified facts—₹1,842 due September 28th—saves them into persistent DynamoDB memory, and explains everything in plain, reassuring language with zero hallucinations."*

3. **0:25–0:50 — The Confirmation Gate:**
   > *(Type 'Tell my daughter about it')* *"When asked to notify family, it resolves Priya on WhatsApp and stages the draft—but stops dead in its tracks. Nothing leaves the device without human confirmation. Code enforces the safety gate, not the LLM."*

4. **0:50–1:00 — Closing Line:**
   > *"Built on the Model Context Protocol over Streamable HTTP, we make digital technology adapt to the way people naturally ask for help."*

---

## Q&A — if judges ask

**"Is this real Alexa+ integration?"**
> "Yes, our MCP server is 100% real and spec-compliant. Alexa+'s MCP Toolkit is partner-restricted today, so we built a voice-first ambient UI that connects to the server over Streamable HTTP. Swapping this for production Alexa+ is literally just a registration step, not an architectural rewrite."

**"How do you prevent prompt injection?"**
> "We don't rely on the LLM to police itself. We use two deterministic layers: first, an inbound regex scanner cleans input before it ever touches the model. Second, when a confirmation is pending, a deterministic gate evaluates the user's 'yes' or 'no'. The LLM never even sees the confirmation turn, so it's impossible to prompt-inject through it."

**"What's simulated vs what's real?"**
> "Only final outbound SMS/WhatsApp carrier dispatch. Everything else—Claude Sonnet extraction via Bedrock, persistent DynamoDB state, contact resolution, the EventBridge reminder pipeline, and our cryptographic confirmation token validation—is completely live and real."

**"What AWS services did you use?"**
> "DynamoDB for six tables of persistent memory, Amazon Bedrock running Claude Sonnet for extraction and reasoning, and an EventBridge Scheduler + Lambda + SNS pipeline for proactive reminders. All provisioned cleanly with AWS CDK."

**"Could this work for other domains?"**
> "Absolutely. The extraction pipeline is completely domain-agnostic. We demonstrated a utility bill and a doctor's appointment, but municipal circulars, tax forms, or bank notices work out-of-the-box with the exact same memory and safety guarantees."

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