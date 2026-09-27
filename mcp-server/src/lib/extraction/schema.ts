import * as z from "zod/v4";

export const FactSchema = z.object({
  label: z.string().describe('Short label, e.g. "Amount" or "Due date".'),
  value: z.string().describe("The value as written or rendered."),
});

export const EntitySchema = z.object({
  type: z
    .string()
    .describe(
      "Short category: bill, appointment, statement, notice, event, " +
        "delivery, subscription, insurance, circular, or similar.",
    ),
  key: z
    .string()
    .describe(
      "Stable snake_case identifier, e.g. electricity_bill, " +
        "dr_meera_appointment, school_circular.",
    ),
  data: z
    .string()
    .describe(
      "A JSON-encoded object of extracted fields. Use field names that " +
        "match the content: amount, currency, dueDate, provider, " +
        "doctorName, appointmentDate, appointmentTime, location, " +
        "trackingNumber, premium, policyNumber, etc. Values must be " +
        "string, number, or boolean. Example: " +
        '{"provider":"Electricity Company","amount":1842,"currency":"INR","dueDate":"2026-10-15"}',
    ),
});

export const ExtractionSchema = z.object({
  summary: z
    .string()
    .describe(
      "One or two plain-language sentences explaining what this message is.",
    ),
  facts: z
    .array(FactSchema)
    .describe("Key facts a person would want to know at a glance."),
  entities: z
    .array(EntitySchema)
    .describe(
      "Structured records for persistent context. Most messages produce " +
        "one entity; a message covering two separate matters produces two.",
    ),
  questionsAnswerableFromSource: z
    .array(z.string())
    .describe(
      "Questions whose answers appear literally in the source. This " +
        "becomes an allow-list: the agent may answer only these and must " +
        "say the source does not cover anything else. Be strict.",
    ),
});

export type RawExtraction = z.infer<typeof ExtractionSchema>;

export const EXTRACTION_SYSTEM_PROMPT = `
You analyze messages and documents that a person has received and does not
understand. Your job is to extract what matters, in plain language.

Identify the entity type from these examples:
- Utility bill → type "bill", key "<provider>_bill"
- Medical appointment → type "appointment", key "<doctor>_appointment"
- Bank statement → type "statement", key "<bank>_statement"
- Government notice → type "notice", key "<department>_notice"
- Event invitation → type "event", key "<event_name>"
- Delivery notification → type "delivery", key "<carrier>_delivery"
- Insurance renewal → type "insurance", key "<policy>_renewal"
- School circular → type "circular", key "<school>_circular"
- Subscription notice → type "subscription", key "<service>_subscription"

Use your judgement for anything not listed. The key must be stable snake_case.

Extract only what is literally present in the message. Do not infer, complete,
or add information that is not written. If the message does not state a
deadline, do not supply one. If it does not name a provider, do not guess.

The 'data' field of each entity is a JSON-encoded string. Build it with the
field names that match the content — do not force a bill's shape onto an
appointment. For an appointment use doctorName, appointmentDate,
appointmentTime, location. For a delivery use carrier, trackingNumber, eta.
For a bill use provider, amount, currency, dueDate.

For questionsAnswerableFromSource, list only questions whose answers are
actually contained in the message. This list becomes the agent's grounding
boundary — anything not on it will be answered with "the message doesn't say."
Be strict. It is better to leave a question off the list than to include one
the source cannot answer.

The user's input may wrap the actual message in conversational framing,
for example:
  "I got this from my doctor: <the appointment text> I don't understand it."
  "Here is the message: <message text>"
  "Can you explain this? <message text>"

In such cases, extract from the underlying message text, not the framing.
The framing tells you where the message came from, not what it says.

If the input contains no actual message content — only a reference like
"I got a message from the electricity company. I don't understand it." —
return empty entities and an empty facts array. Do not invent content.
`.trim();

/**
 * Converts the model's output into the shape the tool returns.
 * Handles the JSON-string-to-object conversion for `data`.
 */
export function normalizeExtraction(raw: RawExtraction): {
  summary: string;
  facts: Array<{ label: string; value: string }>;
  entities: Array<{
    type: string;
    key: string;
    data: Record<string, unknown>;
  }>;
  questionsAnswerableFromSource: string[];
} {
  const entities = raw.entities.map((e) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(e.data) as Record<string, unknown>;
    } catch {
      data = { raw: e.data };
    }
    return { type: e.type, key: e.key, data };
  });

  return {
    summary: raw.summary,
    facts: raw.facts,
    entities,
    questionsAnswerableFromSource: raw.questionsAnswerableFromSource,
  };
}
