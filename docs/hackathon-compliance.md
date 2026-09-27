# Hackathon Compliance

Rule-by-rule status for the Build, Ship, Shape: Amazon Developer Hackathon.

## Track entry

| Requirement                  | Status | Evidence                                                               |
| ---------------------------- | ------ | ---------------------------------------------------------------------- |
| Alexa+ Track                 | ✅      | This is the track we submit under                                      |
| Not a generic chatbot        | ✅      | Agent orchestrates MCP tools; it is not a Q&A loop                     |
| Addresses a real problem     | ✅      | Voice-first help for adults who find digital services hard to navigate |
| Uses MCP for core capability | ✅      | 7 tools, all invoked at runtime                                        |

## Alexa+ MCP requirements

| Requirement                      | Status | Where                                                                                   |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| MCP spec 2025-11-25 or later     | ✅      | `mcp-server/src/server.ts`                                                              |
| Streamable HTTP transport        | ✅      | `StreamableHTTPServerTransport`, not SSE                                                |
| Server used at runtime           | ✅      | Agent calls it on every request                                                         |
| Publicly reachable when required | ✅      | Local in dev, AgentCore-ready for deploy                                                |
| No obsolete HTTP+SSE transport   | ✅      | SSE-only removed in MCP 2025-11-25                                                      |
| Correct MCP protocol version     | ✅      | Negotiated via `initialize` handshake                                                   |
| Tool schemas valid               | ✅      | Zod schemas serialize to JSON Schema                                                    |
| Tool descriptions clear          | ✅      | Every tool description states when to use it and what constraints apply                 |
| Authentication implemented       | ⚠️     | Not implemented in MVP. Required before production integration.                         |
| Remote endpoint tested           | ⚠️     | Tested locally via MCP Inspector. AgentCore deployment is documented but not performed. |

The two warnings are honest scope limits. OAuth is a production requirement,
not a hackathon requirement. The demo runs over `localhost` and MCP Inspector
has validated the protocol behavior.

## AWS Builder Mini Challenge

| Requirement                  | Status | Evidence                                                                                                    |
| ---------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Meaningful AWS service usage | ✅      | DynamoDB for state, Bedrock for reasoning                                                                   |
| Not decorative               | ✅      | DynamoDB conditional writes implement the safety model; Bedrock or OpenAI handles extraction and generation |
| Documented integration       | ✅      | `docs/aws.md`                                                                                               |

Bedrock is a swappable component behind the `LlmProvider` interface. The
DynamoDB integration is not swappable — it is load-bearing for the safety
model.

## Safety requirements

| Requirement                                              | Status | Where                                                       |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| External comms require confirmation                      | ✅      | Four server-side guards + deterministic agent routing       |
| Financial actions not silently executed                  | ✅      | Level-4 actions simulated only                              |
| No unnecessary sensitive data                            | ✅      | Contexts expire via TTL; only authorized facts stored       |
| Agent does not invent document information               | ✅      | `questionsAnswerableFromSource` allow-list; Test F enforces |
| User understands what will happen before external action | ✅      | Confirmation prompt shows exact message and recipient       |

## Alexa+ policy

| Policy                                     | Status | Note                                                                |
| ------------------------------------------ | ------ | ------------------------------------------------------------------- |
| Data minimization                          | ✅      | TTL on contexts and conversations                                   |
| Explicit handling of sensitive information | ✅      | Only user-authorized facts are saved                                |
| Accurate functionality claims              | ✅      | `docs/alexa-integration-status.md` states what is real vs simulated |
| Clear brand relationship                   | ✅      | Not claimed as endorsed or reviewed by Amazon                       |
| No placeholder/test content in product     | ✅      | Test fixtures isolated under `demo/fixtures/`                       |
| Source attribution where appropriate       | ✅      | Extracted facts carry a `source` field                              |

## Pre-submission checklist

* [ ] Run `npm test` — all suites pass
* [ ] Run the full hero workflow end-to-end via web UI
* [ ] Verify `README.md` reflects the current ports and env vars
* [ ] Record the 3-minute demo video
* [ ] Screenshots for the repository and Devpost
* [ ] Confirm the Devpost category and any updated rules
* [ ] Ensure `.env` is not committed; `.env.example` is
* [ ] Confirm the LICENSE file is present at the root

## Rules to re-verify before submitting

Rules and deadlines change. Before submitting, confirm against the official
Devpost page:

* Submission deadline
* Any revised Alexa+ Track rules
* Required deliverables (video length, repository access)
* Whether a working demo URL is required

---