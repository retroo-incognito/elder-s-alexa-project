# Privacy and Data Retention

## What is stored

| Data | Table | Retention |
|---|---|---|
| Extracted facts (bills, appointments) | `independence-context` | 30 days (TTL) |
| User profile and timezone | `independence-users` | Indefinite |
| Contacts (name, channel, address) | `independence-contacts` | Indefinite |
| Reminders | `independence-reminders` | Indefinite; 90-day TTL after completion |
| Draft messages | `independence-message-drafts` | Indefinite audit trail |
| Recent conversation turns | `independence-conversations` | 30 days (TTL) |

**Nothing else is stored.** No raw message text beyond what the extractor
returned. No session logs beyond what the agent writes on each turn.

## What is not stored

- Original message text: kept only in the in-memory conversation state,
  lost on process restart
- LLM prompts and completions: not persisted anywhere
- Voice recordings: never sent to the server; the Web Speech API
  transcribes locally in the browser

## User control

- **Inspect:** the Context panel shows the currently active fact with
  its source. The Actions panel shows the timeline of actions taken.
- **Delete:** the user can say "Forget the electricity bill" and the
  row is hard-deleted from DynamoDB.
- **Ask:** "What have you done today?" returns a voice-readable summary
  of recent actions from the last 24 hours.

## Data minimization

The `save_context` tool accepts only the fields the extractor produces.
For a bill, that's provider, amount, currency, and dueDate. Account
numbers, card numbers, and other sensitive identifiers are not extracted
by default — the extraction prompt does not ask for them.

If a user pastes a message containing an account number, the extractor
may capture it as a `data` field. Users can say "forget that" to remove
the record immediately.

## Consent for family sharing

The confirmation gate *is* the consent mechanism. Every outbound message
requires:
1. The draft to be shown to the user with recipient, channel, and body
2. The user to explicitly confirm with "yes" or by clicking a button
3. The server to independently validate the confirmation

No message is ever sent based on an LLM's assertion of consent.