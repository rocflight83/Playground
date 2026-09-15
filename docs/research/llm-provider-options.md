# LLM provider options for the study-plan app

Research for GitHub issue #13 (wayfinder map #12). Checked against primary
sources on 2026-09-15. Prices and limits change; every number below carries
its source so it can be re-verified.

Scope: a single-user local Node/TypeScript web app that (a) generates a
14-session study plan, sourcing materials from the live web, and (b) replaces
one session or material on request. The claude.ai consumer subscription cannot
back a third-party app; the Claude API (API-key billing), OpenAI's API, and
xAI's API can. This note surfaces facts only; it does not pick a provider.

## Summary table

| | Claude API (Anthropic) | OpenAI API | xAI API |
|---|---|---|---|
| Server-side web search | Yes: `web_search_*` tool on `/v1/messages`; $10 / 1k searches | Yes: `web_search` tool on Responses API; $10 / 1k calls | Yes: `web_search` tool on `/v1/responses`; $5 / 1k calls |
| Server-side URL fetch | Yes: separate `web_fetch_*` tool, no per-call charge (tokens only); only URLs already in the conversation; PDFs supported | Folded into web search: `open_page` / `find_in_page` actions on reasoning models; billed as search actions | Folded into web search: `browse_page` / `open_page` / `open_page_with_find`, billed under the web-search SKU |
| Domain filtering | `allowed_domains` or `blocked_domains` (one, not both) | up to 100 `allowed_domains` or 100 `blocked_domains` | max 5 `allowed_domains` or 5 `excluded_domains` (one, not both) |
| Mid-tier model (list price in/out per MTok) | Sonnet 5: $2 / $10 | gpt-5.6-terra: $2 / $12 | grok-4.3: $1.25 / $2.50 |
| Top-tier model | Opus 5: $5 / $25 | gpt-5.6-sol: $4 / $20 | grok-4.6: $2 / $6 |
| Frontier tier (for reference) | Fable 5.1: $10 / $50 | gpt-6-astra: $10 / $50 | (none above grok-4.6) |
| Full plan, tokens only, mid-tier (40K in / 15K out) | ~$0.23 | ~$0.26 | ~$0.09 |
| Full plan, tokens only, top-tier | ~$0.58 | ~$0.46 | ~$0.17 |
| Add 15 searches per plan | +$0.15 | +$0.15 | +$0.075 |
| Session replacement, tokens only, mid / top (10K in / 3K out) | $0.05 / $0.125 | $0.056 / $0.10 | $0.02 / $0.038 |
| Entry-tier rate limits (top-tier model) | Start tier: 1,000 RPM, 2M input TPM, 400K output TPM; $500/mo spend cap | Tier 1 ($5 paid): 500 RPM, 500K TPM; $100/mo usage cap | Tier 0 ($0 spend): 150 RPS, 50M TPM (grok-4.6); grok-4.3: 37 RPS, 10M TPM |
| Official Node/TS SDK | `@anthropic-ai/sdk` 0.125.0, MIT, ~29.7M weekly downloads | `openai` 7.15.0, Apache-2.0, ~29.5M weekly downloads | None first-party; docs point to `openai` with `baseURL: https://api.x.ai/v1` or Vercel `@ai-sdk/xai` 4.0.58 (~2.0M weekly) |

Cost cells are arithmetic on list prices with the ticket's token assumptions;
see "Cost estimates" for the ranges and what they leave out.

## 1. Web search / URL fetch tooling

The sourcing step needs the model to (a) find candidate materials and (b) read
a specific page to confirm what it is. All three providers run this server-side
(the app never executes a tool loop for it), but the shapes differ.

### Claude API

- Two distinct server tools, both declared in `tools` on `POST /v1/messages`
  and executed by Anthropic; results arrive as content blocks in the same
  response. No client-side loop. [web-search], [web-fetch]
- Web search: versions `web_search_20250305` (basic), `web_search_20260209`
  (adds dynamic filtering, where Claude runs code that filters results before
  they enter context), `web_search_20260318` (adds `response_inclusion`).
  Optional `max_uses`, `allowed_domains` or `blocked_domains` (not both),
  `user_location`. Results carry `url`, `title`, `page_age`, and
  `encrypted_content` that must be echoed back on later turns; citations are
  always on. Errors are returned in-band with HTTP 200. Organization admins can
  disable web search in the Console; if disabled, the request fails with a
  400. [web-search]
- Web fetch: versions `web_fetch_20250910`, `_20260209`, `_20260309`
  (`use_cache`), `_20260318` (`response_inclusion`). Returns full page text
  or base64 PDF as a `document` block; optional `citations`,
  `max_content_tokens`, `max_uses`, domain filters. Security constraint: it
  only fetches URLs that already appeared in user messages, client tool
  results, or earlier search/fetch results, never URLs Claude itself invented
  or URLs only in the system prompt. Does not render JavaScript. [web-fetch]
- Combined search then fetch in one request is a documented pattern.
  [web-fetch]
- Pricing: web search $10 per 1,000 searches plus tokens; a search that errors
  is not billed. Web fetch has no per-call charge, only the fetched content's
  input tokens (docs cite ~2,500 tokens for a 10 kB page, ~25,000 for a 100 kB
  page). Code execution used by dynamic filtering is free when paired with
  these tools. [pricing-anthropic]
- Availability: Claude API first-party (and Claude Platform on AWS / Foundry);
  web fetch is not on Bedrock or Vertex. [web-fetch]

### OpenAI API

- `web_search` is a built-in tool of the Responses API (`web_search_preview`
  is the legacy variant). Chat Completions only gets search through dedicated
  search models (`gpt-5-search-api`; the `gpt-4o-*-search-preview` models are
  deprecated). [openai-websearch]
- Supported on the current Responses models including `gpt-6-astra` and
  `gpt-5.5`; not supported on `gpt-5` at `minimal` reasoning, and `gpt-5.4`
  with reasoning effort `none` is documented as lower quality.
  [openai-websearch]
- On reasoning models the tool can also `open_page` and `find_in_page`, so
  reading a specific result is possible inside the same tool; there is no
  separate fetch-by-URL tool. Whether the model will open a user-supplied URL
  is not documented explicitly. [openai-websearch]
- Controls: `search_context_size` (`low`/`medium`/`high`), `user_location`,
  and up to 100 `allowed_domains` or 100 `blocked_domains`. Responses include
  `url_citation` annotations (start/end index, URL, title); OpenAI's terms
  require inline citations be visible and clickable. [openai-websearch]
- Pricing: "$10.00 / 1k calls + Search content tokens billed at model rates".
  The guide says "Search actions incur a tool call cost", so `open_page` /
  `find_in_page` actions appear to be billed as calls too; the docs do not
  break this down further. Rate limits for the tool are the underlying model's.
  [openai-pricing], [openai-websearch]

### xAI API

- Server-side tools run on the Responses API (`POST /v1/responses`, which is
  OpenAI-Responses-compatible). The web-search family is `web_search`,
  `web_search_with_snippets`, `browse_page`, `open_page`,
  `open_page_with_find`; there are also `x_search` tools, `code_execution`,
  `collections_search`, image/video viewing, and MCP passthrough. Page
  browsing is therefore available but bundled into web search, not a separate
  fetch tool. [xai-tools]
- Documented on `grok-4.6`. Filters: at most 5 `allowed_domains` or 5
  `excluded_domains`, not both. Citations come back in a `citations` field.
  [xai-websearch]
- Billing: only successful executions are billed; usage reports
  `server_side_tool_usage` as a map such as
  `{'SERVER_SIDE_TOOL_WEB_SEARCH': 2}`. `browse_page` and `open_page` are
  classified under `SERVER_SIDE_TOOL_WEB_SEARCH`, so each page open is a
  billable web-search call. [xai-tools]
- Pricing: web search $5 per 1k calls; X search $5 per 1k calls (changing on
  2026-09-21 to $5 per 1k posts fetched and $10 per 1k profiles fetched);
  code execution $5 per 1k; collections search $2.50 per 1k; file attachments
  $10 per 1k. [xai-pricing]

## 2. Cost estimates

Assumptions from the ticket: one full plan is ~30-50K input tokens and ~15K
output tokens; one single-session replacement is ~10K in and ~3K out. Tool
calls are priced separately. Prompt caching and batch discounts are ignored
(they only lower these numbers). All figures are USD at list price.

### Tokens only, full plan (input range 30K-50K, midpoint 40K; output 15K)

| Provider | Model | Tier | In / Out per MTok | Full plan at 40K in | Range (30K-50K in) |
|---|---|---|---|---|---|
| Anthropic | claude-sonnet-5 | mid | $2 / $10 | $0.23 | $0.21-$0.25 |
| Anthropic | claude-opus-5 | top | $5 / $25 | $0.575 | $0.525-$0.625 |
| Anthropic | claude-fable-5-1 | frontier | $10 / $50 | $1.15 | $1.05-$1.25 |
| OpenAI | gpt-5.6-terra | mid | $2 / $12 | $0.26 | $0.24-$0.28 |
| OpenAI | gpt-5.6-sol | top | $4 / $20 | $0.46 | $0.42-$0.50 |
| OpenAI | gpt-6-astra | frontier | $10 / $50 | $1.15 | $1.05-$1.25 |
| xAI | grok-4.3 | mid | $1.25 / $2.50 | $0.0875 | $0.075-$0.10 |
| xAI | grok-4.6 | top | $2 / $6 | $0.17 | $0.15-$0.19 |

Sources: [pricing-anthropic], [openai-pricing], [xai-pricing]. Tier labels
are this note's, chosen so that "top" is each provider's flagship general
model and "frontier" is the $10/$50 tier that Anthropic and OpenAI both sell
above it; xAI has no equivalent. OpenAI's models page describes gpt-6-astra as
"our most capable model" and gpt-5.6-sol as the "flagship model for complex
professional work" [openai-models]; xAI calls grok-4.6 "the most intelligent
and fastest model we've built" [xai-models].

### Tokens only, single-session replacement (10K in, 3K out)

| Model | Cost |
|---|---|
| claude-sonnet-5 | $0.05 |
| claude-opus-5 | $0.125 |
| claude-fable-5-1 | $0.25 |
| gpt-5.6-terra | $0.056 |
| gpt-5.6-sol | $0.10 |
| gpt-6-astra | $0.25 |
| grok-4.3 | $0.02 |
| grok-4.6 | $0.038 |

### Tool-call surcharge

Per search (or page open where that counts as a search action):
Anthropic $0.010, OpenAI $0.010, xAI $0.005. Anthropic web fetch: $0.

| Scenario | Anthropic | OpenAI | xAI |
|---|---|---|---|
| Full plan, 15 searches | +$0.15 | +$0.15 | +$0.075 |
| Full plan, 15 searches + 14 page reads | +$0.15 (fetch free) | +$0.29 if each open is a billed action | +$0.145 |
| Replacement, 2 searches + 1 page read | +$0.02 | +$0.03 | +$0.015 |

### What the estimates leave out

- Fetched page content enters the context as input tokens on every provider
  (Anthropic quotes ~2,500 tokens for an average 10 kB page). Reading 14
  pages could add ~35K input tokens on top of the ticket's 30-50K, roughly
  doubling the input side. Anthropic's `max_content_tokens` and dynamic
  filtering, and OpenAI's `search_context_size`, exist to cap this.
- Token counts are tokenizer-specific. Anthropic notes that Claude 4.7 and
  later (including Opus 5 and Sonnet 5) use a tokenizer producing roughly 30%
  more tokens for the same text than Sonnet 4.6 and earlier
  [pricing-anthropic]; the same prompt will not count the same across
  providers.
- Reasoning/thinking tokens are billed as output on all three providers and
  are not in the 15K / 3K output assumption.
- Long-context surcharges: xAI doubles prices at >=200K-token prompts
  [xai-pricing]; OpenAI charges 2x input and 1.5x output above 272K on
  gpt-6-astra [openai-astra]; Anthropic bills the full 1M window at standard
  rates [pricing-anthropic]. None applies at the ticket's sizes.
- Prompt caching lowers repeated-prefix input costs: Anthropic cache reads
  are 0.1x base (0.025x on Fable 5.1), writes 1.25x (5 min) or 2x (1 h)
  [pricing-anthropic]; OpenAI cached input is 0.1x [openai-pricing]; xAI
  cached input is $0.20-$0.50 per MTok depending on model [xai-pricing].
  For a per-session replacement that resends the whole plan, this is the
  dominant lever.
- Anthropic's Batch API halves token prices but is asynchronous
  [pricing-anthropic]; not applicable to an interactive request.

## 3. Rate limits at entry tiers

### Claude API

- Tiers: Start, Build, Scale, Custom, assigned automatically from usage
  history. New organizations "may start in the Evaluation tier, with limits
  below the standard limits" until history is established; those lower
  limits are not published. [anthropic-ratelimits]
- Monthly spend caps: Start $500, Build $1,000, Scale $200,000. Hitting the
  cap returns 429 with `error_code: enforced_spend_limit_reached` and no
  `retry-after`. [anthropic-ratelimits]
- Start tier per-model limits (RPM / input TPM / output TPM): Opus 5 and
  Sonnet 5 each 1,000 / 2,000,000 / 400,000 (separate buckets); Haiku 4.5 the
  same; Fable 5.x 1,000 / 500,000 / 100,000. Build tier raises Opus/Sonnet to
  5,000 / 5,000,000 / 1,000,000. [anthropic-ratelimits]
- Cache reads do not count toward input TPM, so caching raises effective
  throughput. [anthropic-ratelimits]
- New users get "a small amount of free credits" (amount unspecified).
  [pricing-anthropic]

### OpenAI API

- Tiers by cumulative payment: Free ($100/mo usage limit, allowed
  geographies), Tier 1 $5 paid ($100/mo), Tier 2 $50 paid ($500/mo), Tier 3
  $100 paid ($1,000/mo), Tier 4 $250 paid ($5,000/mo), Tier 5 $1,000 paid
  ($200,000/mo). Promotion is automatic. [openai-ratelimits]
- Per-model limits for gpt-6-astra, gpt-5.6-sol and gpt-5.6-terra are
  identical: Tier 1 500 RPM / 500,000 TPM / 1,500,000 batch queue; Tier 2
  5,000 RPM / 1,000,000 TPM; Tier 3 5,000 / 2,000,000; Tier 4 10,000 /
  4,000,000; Tier 5 15,000 / 40,000,000. Context window 1,050,000, max output
  128,000. [openai-astra], [openai-sol], [openai-terra]
- Web search shares the underlying model's limits. [openai-websearch]

### xAI API

- Per-model limits on requests per second and tokens per minute, scaling
  with a tier set by cumulative spend since 2026-01-01; tiers never downgrade.
  Thresholds: Tier 0 $0 (default), Tier 1 $50, Tier 2 $250, Tier 3 $1,000,
  Tier 4 $5,000, Enterprise on request. [xai-ratelimits]
- Published Tier 0 limits: grok-4.6 and grok-4.5 150 RPS and 50M TPM;
  grok-4.3 37 RPS and 10M TPM. Higher limits can be requested in the Console
  without extra spend. The per-second limit is derived as RPM / 60.
  [xai-ratelimits]
- No monthly spend cap is documented on the rate-limits page.

## 4. Node/TypeScript SDK maturity

Numbers from the npm registry and GitHub API on 2026-09-15.

| | `@anthropic-ai/sdk` | `openai` | xAI |
|---|---|---|---|
| First-party TS SDK | Yes | Yes | No. Official SDK is Python only (`xai-org/xai-sdk-python`, 574 stars). Docs recommend `openai` with `baseURL: "https://api.x.ai/v1"` or Vercel `@ai-sdk/xai` [xai-quickstart] |
| Latest version / published | 0.125.0 / 2026-09-10 | 7.15.0 / 2026-09-10 | `@ai-sdk/xai` 4.0.58 / 2026-09-11 (maintained by Vercel, not xAI) |
| License | MIT | Apache-2.0 | Apache-2.0 (`@ai-sdk/xai`) |
| Weekly npm downloads (2026-09-05 to 09-11) | 29.7M | 29.5M | 2.0M (`@ai-sdk/xai`) |
| GitHub | anthropics/anthropic-sdk-typescript, 2,116 stars, created 2023-01, last push 2026-09-10 | openai/openai-node, 11,175 stars, created 2021-12, last push 2026-09-15 | vercel/ai monorepo |
| Server-tool typing | Web search / web fetch tool params and result blocks typed in the SDK; docs show TS examples [web-search], [web-fetch] | Responses API `web_search` tool and `url_citation` annotations typed | Via `openai` Responses types (xAI is Responses-compatible) or `xai.responses('grok-4.6')` in the AI SDK [xai-quickstart] |
| Agent-loop helpers | Beta tool runner (`client.beta.messages.toolRunner`, `betaZodTool`) | Responses API handles built-in tools server-side; Agents SDK is a separate package | Not first-party |

Observations, not judgments:

- Anthropic's package is still 0.x semver despite a three-year history and
  parity downloads with OpenAI's; both ship a release within the same week.
- With xAI the app would depend on either OpenAI's client pointed at a
  compatible endpoint (feature coverage follows what xAI mirrors of the
  Responses API) or a third-party abstraction layer (Vercel AI SDK).
- The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is a different
  product from `@anthropic-ai/sdk`; it is not needed to call web search/fetch.

## Caveats

- Prices, model line-ups and tier tables were read on 2026-09-15 and change
  frequently; xAI already announces a pricing change effective 2026-09-21.
- Could not verify: the exact limits of Anthropic's unpublished "Evaluation
  tier" for brand-new organizations; whether OpenAI bills `open_page` /
  `find_in_page` as separate $0.01 calls or only the initiating search (the
  guide says only "search actions incur a tool call cost"); whether OpenAI's
  or xAI's search tool will open a URL the user pasted, rather than one the
  model found; xAI's per-model rate limits beyond the three models shown on
  the rate-limits page.
- OpenAI's Free tier "$100/month" figure is quoted as the docs render it and
  was not cross-checked elsewhere.
- Token-count assumptions come from the ticket, not from measurement; a
  `count_tokens` call against a real prompt on each provider would tighten
  the cost figures.

## Sources

- [pricing-anthropic] https://platform.claude.com/docs/en/about-claude/pricing
- [anthropic-ratelimits] https://platform.claude.com/docs/en/api/rate-limits
- [web-search] https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- [web-fetch] https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
- [openai-pricing] https://developers.openai.com/api/docs/pricing
- [openai-models] https://developers.openai.com/api/docs/models
- [openai-astra] https://developers.openai.com/api/docs/models/gpt-6-astra
- [openai-sol] https://developers.openai.com/api/docs/models/gpt-5.6-sol
- [openai-terra] https://developers.openai.com/api/docs/models/gpt-5.6-terra
- [openai-websearch] https://developers.openai.com/api/docs/guides/tools-web-search
- [openai-ratelimits] https://developers.openai.com/api/docs/guides/rate-limits
- [xai-pricing] https://docs.x.ai/developers/pricing
- [xai-models] https://docs.x.ai/developers/models
- [xai-websearch] https://docs.x.ai/developers/tools/web-search
- [xai-tools] https://docs.x.ai/developers/tools/tool-usage-details
- [xai-ratelimits] https://docs.x.ai/docs/key-information/consumption-and-rate-limits
- [xai-quickstart] https://docs.x.ai/developers/quickstart
- npm registry: https://registry.npmjs.org and https://api.npmjs.org/downloads/point/last-week/<pkg>
- GitHub repos: anthropics/anthropic-sdk-typescript, openai/openai-node, xai-org/xai-sdk-python
