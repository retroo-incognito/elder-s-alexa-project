# Friction Log — Alexa+ Everyday Independence Agent

Documented friction encountered while building for the Amazon
Developer Hackathon 2026. Each entry includes the specific task,
expected vs. actual result, severity, workaround, and an actionable
suggestion.

---

## 1. Bedrock model retired mid-project

**Task attempted:** Call Bedrock Converse API to extract structured facts.

**Steps taken:** Used `anthropic.claude-3-5-sonnet-20241022-v2:0` as the model ID per AWS's default documentation.

**Expected:** Structured extraction response.

**Actual:** `ValidationException: This model version has reached the end of its life. Please refer to the AWS documentation for more details.`

**Severity:** Critical — blocked the entire reasoning path.

**Workaround:** Replaced with `us.anthropic.claude-sonnet-4-6` (cross-region inference profile). Built a provider abstraction so the agent can switch between Bedrock and OpenAI via one environment variable.

**Suggestion:** AWS's example code and tutorials should link to the model lifecycle page next to every model ID they cite. A check against the model's EOL date when the user first calls Converse would surface this immediately.

---

## 2. `.env` not loaded from monorepo root

**Task attempted:** Start the MCP server from `mcp-server/`.

**Steps taken:** Standard `import 'dotenv/config'`.

**Expected:** `.env` at the repository root loaded.

**Actual:** `Invalid environment configuration: { OPENAI_API_KEY: ['Required'] }` and `injected env (0) from .env` in the startup log.

**Severity:** High.

**Workaround:** Load `.env` with an explicit path (`loadEnv({ path: resolve(__dirname, '../../.env') })`) in both services.

**Suggestion:** Document the npm workspaces gotcha — each workspace runs with its own `cwd`, so a single root `.env` requires explicit loading. A note in the MCP SDK docs or a built-in `find-env` helper would prevent this for every monorepo project.

---

## 3. MCP stateless mode broken by the SDK's own example guard

**Task attempted:** Serve MCP over Streamable HTTP in stateless mode.

**Steps taken:** Copied the SDK's stateful-mode example, changed `sessionIdGenerator` to `undefined`.

**Expected:** Tool calls succeed after `initialize`.

**Actual:** Every tool call rejected with `Bad Request: no session ID and body is not an initialize request`. The stateful example's guard (`!sessionId && !isInitializeRequest(req.body)`) rejects legitimate requests because the server never issues a session ID in stateless mode.

**Severity:** Critical — blocked all tool invocations.

**Workaround:** Removed the guard entirely.

**Suggestion:** The SDK's `StreamableHTTPServerTransport` should detect the missing `sessionIdGenerator` and either skip the guard or emit a warning at construction time. Better: publish a stateless example that doesn't carry stateful assumptions.

---

## 4. CDK Lambda deployment — TypeScript source in the asset package

**Task attempted:** Deploy a TypeScript Lambda handler via CDK `Code.fromAsset`.

**Steps taken:** Pointed `code` at the handler directory.

**Expected:** Lambda runs.

**Actual:** Every invocation failed with `Runtime.ImportModuleError: Cannot find module 'index'`. The Lambda runtime looks for `index.js`; the directory contained `index.ts`.

**Severity:** High — silent failure until inspected in CloudWatch.

**Workaround:** Added a build step (`npx tsc`) and copied `package.json` and `node_modules` into `dist/`, then pointed `Code.fromAsset` at `dist/`.

**Suggestion:** `Code.fromAsset` should warn when the directory contains `.ts` files but no compiled `.js` entrypoint. The CDK examples for TypeScript Lambdas should show the `dist/` pattern explicitly, not `index.js` next to `index.ts`.

---

## 5. `ts-node` and modern module resolution

**Task attempted:** Switch CDK's tsconfig to `module: Node16, moduleResolution: Node16` per TypeScript 6's deprecation warnings.

**Steps taken:** Applied the modern settings, added `.js` extensions to relative imports.

**Expected:** `npx cdk deploy` works.

**Actual:** `Cannot find module '../lib/reminder-stack.js'` — `ts-node` can't resolve `.js` extensions back to `.ts` files without extra ESM loader configuration.

**Severity:** Medium.

**Workaround:** Reverted to `module: CommonJS, moduleResolution: node10` with `ignoreDeprecations: "6.0"`. This is what the `aws-cdk-lib@2.272.0` package itself uses.

**Suggestion:** CDK's `cdk.json` template should default to a `tsc && node dist/bin/app.js` invocation instead of `ts-node`, which works cleanly with modern module resolution. The `ts-node --prefer-ts-exts` shortcut is convenient but blocks the migration.

---

## 6. Timezone bug in natural-language date parsing

**Task attempted:** "Remind me the day before" on an appointment scheduled for 12 November.

**Steps taken:** `new Date("12 November")` for parsing, then `.setUTCDate(date - 1)` for the offset.

**Expected:** 11 November.

**Actual:** 10 November — one day early. `new Date("12 November")` parses at local midnight (IST); the subsequent UTC manipulation lands on the previous calendar day when the machine is east of UTC.

**Severity:** Medium — subtle, only manifest on non-UTC machines.

**Workaround:** Wrote `parseNaturalDate()` to construct dates explicitly with `Date.UTC(year, monthIndex, day, 9, 0, 0, 0)` instead of relying on `new Date(string)`.

**Suggestion:** A "timezone-safe date parsing" section in the MCP or Alexa docs would help. The general rule — never use `new Date("natural string")` for date math — is not widely documented.

---

## 7. Two schedulers racing on the same conditional write

**Task attempted:** Fire reminders via EventBridge Scheduler + Lambda, while a local interval scheduler runs in the agent for demo purposes.

**Steps taken:** Both scheduled correctly at `scheduledAt`.

**Expected:** Lambda marks fired and publishes to SNS.

**Actual:** Lambda threw `ConditionalCheckFailedException` because the local scheduler had already set `firedAt` in the millisecond before. The Lambda never reached its SNS publish, so no email was delivered.

**Severity:** High — silently broke delivery while the DynamoDB row looked correct.

**Workaround:** Disabled the local scheduler when both `REMINDER_HANDLER_ARN` and `SCHEDULER_ROLE_ARN` are configured, so only one writer ever touches `firedAt`.

**Suggestion:** The AWS scheduling docs would benefit from an explicit "avoid overlapping writers" note when recommending conditional writes for idempotency. The failure mode is easy to miss because the reminder *looks* like it fired.

---

## 8. SNS email subscription is unconfirmed by default

**Task attempted:** Deliver reminder emails via SNS.

**Steps taken:** Subscribed an email to the topic in the CDK stack.

**Expected:** Emails arrive.

**Actual:** Nothing arrives. `aws sns list-subscriptions-by-topic` shows `SubscriptionArn: PendingConfirmation` — the recipient must click a confirmation link in a separate email, which is easy to miss in a spam filter.

**Severity:** Medium — no error is raised; the pipeline silently stops at delivery.

**Workaround:** Subscribed manually via CLI and confirmed the link.

**Suggestion:** For transactional email to a specific user (not fanout), Amazon SES is the correct service. SNS's per-recipient confirmation is designed for fanout to internal consumers (SQS queues, Lambda functions), not for user-facing notifications. A comparison table in the SNS docs would save projects from using SNS for the wrong job.

---

## 9. `save_context` rejected the extractor's own output

**Task attempted:** Save an event context produced by the generic extractor.

**Steps taken:** Called `save_context` with `type: "event"`.

**Expected:** Stored.

**Actual:** `MCP error -32602: Input validation error: Invalid option: expected one of "bill"|"appointment"|"document"|"general" at type`. The Zod schema for `save_context` enforced a fixed enum that predated the generic extractor.

**Severity:** High — every non-bill/non-appointment message failed silently.

**Workaround:** Widened the `type` field to `z.string().min(1).max(40)`.

**Suggestion:** When a schema field is meant to be open (entity type), document the reasoning next to the schema definition. Enums are attractive for type safety but become a trap when the input space grows. A `z.string()` with a `.describe()` listing example values gets both benefits.

---

## 10. The agent's activity log returned stale entries

**Task attempted:** Answer "What have you done today?" with recent activity.

**Steps taken:** Filtered events by "last 24 hours."

**Expected:** Only today's activity.

**Actual:** Yesterday's test entries appeared alongside today's because "last 24 hours" spans yesterday evening when the current time is early in the day.

**Severity:** Low — cosmetic, but visible in the demo.

**Workaround:** Changed the filter to "since midnight local time."

**Suggestion:** Not a platform issue, but worth noting for other hackathon teams: "recent" filters based on rolling windows should almost always be "since midnight" for human-facing output. A rolling window is correct for logs, not for the user's mental model of "today."

---

## Overall observations

- **AWS's documentation is strong for the happy path, weaker for lifecycle and configuration edge cases.** Model retirement, SNS subscription confirmation, and the monorepo `.env` path are all documented *somewhere* but not surfaced at the point of first failure.
- **CDK's TypeScript story needs a build-step primer.** The `ts-node` shortcut and the `Code.fromAsset` packaging behavior are both sources of silent failures that only surface in CloudWatch.
- **MCP's stateless mode deserves a first-class example.** The current SDK examples assume stateful mode and don't flag the differences.

None of these were blockers for the final submission. All required workarounds that are now documented in the project's own `docs/` folder for the next team that tries this.