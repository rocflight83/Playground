/**
 * The xAI adapter for the `Intelligence` seam: the `openai` client pointed
 * at `https://api.x.ai/v1`, Responses API, server-side `web_search` and
 * `x_search` tools, structured output. Ticket 19 (#30) records the
 * decisions; the short form:
 *
 *   - Prompt boundary is the four files in `prompts/`: `policy.md` plus the
 *     call's duty file are the `instructions`; the call-specific context is
 *     one user message whose text is JSON. No prompt prose lives here.
 *   - The JSON schema in `text.format` is a shape hint for the model, not a
 *     gate. Answers are returned as `unknown`; `validatePlan` in the Planner
 *     is the only truth.
 *   - `store: false` on every request; repair rounds resend the previous
 *     attempt and its errors as a further user message.
 *   - The tool budget is one combined cap per call. xAI's request field is
 *     `max_turns` (an upper bound on agentic turns, each of which may hold
 *     several tool calls), so the cap also travels in the user JSON's
 *     `budget` and `onUsage` reports the actual count.
 *   - The adapter never verifies links. It may search and open pages to
 *     choose materials; `verifyPlan` in the Planner is the only verification.
 *
 * The client is injected and typed to the sliver this module uses, so a
 * test passes a plain object and the real `OpenAI` instance satisfies it
 * structurally. xAI-only request fields (`max_turns`) and usage fields
 * (`server_side_tool_usage_details`) are not in the `openai` typings; they
 * are read and written through the narrow types below, in one place.
 */
import type OpenAI from 'openai'
import type { Material } from '../plan-types.ts'
import {
  IntelligenceError,
  type Intelligence,
  type IntelligenceRepair,
  type PlanBrief,
  type ReplaceMaterialContext,
  type ReplaceSessionContext,
} from './intelligence.ts'
import { PLAN_SCHEMAS, type PlanSchemaName } from './plan-schema.ts'
import type { Prompts } from './prompts.ts'

/** The request the adapter builds. The `openai` typings cover all of it except `max_turns`. */
export interface XaiRequest {
  model: string
  instructions: string
  input: { role: 'user'; content: string }[]
  tools: { type: 'web_search' | 'x_search' }[]
  text: { format: { type: 'json_schema'; name: string; schema: Record<string, unknown>; strict: boolean } }
  store: false
  max_turns: number
}

/** The slice of the Responses API answer the adapter reads. */
export interface XaiResponse {
  status?: string
  incomplete_details?: { reason?: string } | null
  output_text?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    input_tokens_details?: { cached_tokens?: number }
    /** Current API reference: `{ web_search_calls: n, x_search_calls: n, … }`. */
    server_side_tool_usage_details?: Record<string, number>
    /** Older shape: `{ SERVER_SIDE_TOOL_WEB_SEARCH: n, … }`. */
    server_side_tool_usage?: Record<string, number>
  }
}

/** What `OpenAI` provides and a test fakes: `client.responses.create`. */
export interface XaiClient {
  responses: { create(params: XaiRequest): Promise<XaiResponse> }
}

/**
 * The one place the `openai` typings are widened to xAI's surface: the
 * `x_search` tool and `max_turns` are not in `ResponseCreateParams`, and
 * `server_side_tool_usage_details` is not in `ResponseUsage`. Everything
 * downstream speaks `XaiClient`.
 */
export function xaiClientOf(openai: OpenAI): XaiClient {
  return openai as unknown as XaiClient
}

export interface XaiUsage {
  call: 'generatePlan' | 'replaceSession' | 'replaceMaterial' | 'findReplacementUrl'
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  /** Server-side tool calls by kind, e.g. `{ web_search: 12, x_search: 3 }`. */
  toolCalls: Record<string, number>
  ms: number
}

export interface XaiIntelligenceOptions {
  client: XaiClient
  prompts: Prompts
  /** Default `grok-4.6` for both. */
  models?: { generate?: string; replace?: string }
  /** Combined cap on server-tool calls per call kind. Defaults 30 / 8 / 3. */
  maxToolCalls?: { generate?: number; replace?: number; findUrl?: number }
  /** Where `x_search` is offered: generate + replaceMaterial (default), every sourcing call, or never. */
  xSearch?: 'generate' | 'sourcing' | 'off'
  /** Ask the model to adhere to the schema strictly. Default false. */
  strictSchema?: boolean
  onUsage?: (usage: XaiUsage) => void
  /** Injected clock for the `ms` figure; defaults to `Date.now`. */
  now?: () => number
}

export const XAI_DEFAULT_MODEL = 'grok-4.6'
const DEFAULT_MAX_TOOL_CALLS = { generate: 30, replace: 8, findUrl: 3 } as const

/** Travels in the user JSON so the model sees the cap the request also carries as `max_turns`. */
type Budget = { maxToolCalls: number }

export function createXaiIntelligence(opts: XaiIntelligenceOptions): Intelligence {
  const models = {
    generate: opts.models?.generate ?? XAI_DEFAULT_MODEL,
    replace: opts.models?.replace ?? XAI_DEFAULT_MODEL,
  }
  const caps = { ...DEFAULT_MAX_TOOL_CALLS, ...opts.maxToolCalls }
  const xSearch = opts.xSearch ?? 'generate'
  const strict = opts.strictSchema ?? false
  const now = opts.now ?? (() => Date.now())

  /** Per call kind: which duty file, model, schema and cap, and whether `x_search` is offered (decision 7). */
  const calls: Record<XaiUsage['call'], CallSpec> = {
    generatePlan: {
      duty: opts.prompts.generate,
      model: models.generate,
      format: 'plan',
      cap: caps.generate,
      xSearch: xSearch !== 'off',
    },
    replaceSession: {
      duty: opts.prompts.replaceSession,
      model: models.replace,
      format: 'session_replacement',
      cap: caps.replace,
      xSearch: xSearch === 'sourcing',
    },
    replaceMaterial: {
      duty: opts.prompts.replaceMaterial,
      model: models.replace,
      format: 'material',
      cap: caps.replace,
      xSearch: xSearch !== 'off',
    },
    findReplacementUrl: {
      duty: opts.prompts.replaceMaterial,
      model: models.replace,
      format: 'replacement_url',
      cap: caps.findUrl,
      xSearch: xSearch === 'sourcing',
    },
  }

  /**
   * One request. `context` becomes the user message (with the call's
   * `budget` added); `followUps` become further user messages, in order.
   */
  async function call(kind: XaiUsage['call'], context: object, followUps: unknown[] = []): Promise<unknown> {
    const spec = calls[kind]
    const budget: Budget = { maxToolCalls: spec.cap }
    const tools: XaiRequest['tools'] = [{ type: 'web_search' }]
    if (spec.xSearch) tools.push({ type: 'x_search' })
    const request: XaiRequest = {
      model: spec.model,
      instructions: `${opts.prompts.policy}\n\n${spec.duty}`,
      input: [{ ...context, budget }, ...followUps].map((m) => ({ role: 'user', content: JSON.stringify(m) })),
      tools,
      text: { format: { type: 'json_schema', name: spec.format, schema: PLAN_SCHEMAS[spec.format], strict } },
      store: false,
      max_turns: spec.cap,
    }
    const started = now()
    const response = await opts.client.responses.create(request)
    const ms = now() - started
    opts.onUsage?.(usageOf(kind, spec.model, response, ms))
    return parseAnswer(response)
  }

  return {
    async generatePlan(brief: PlanBrief, repair?: IntelligenceRepair): Promise<unknown> {
      return call('generatePlan', { brief }, repair ? [{ repair }] : [])
    },

    async replaceSession(ctx: ReplaceSessionContext): Promise<{ session: unknown; knownSummary?: string }> {
      const answer = (await call('replaceSession', ctx)) as { session?: unknown; knownSummary?: unknown } | null
      const session = answer && typeof answer === 'object' ? answer.session : undefined
      const knownSummary = typeof answer?.knownSummary === 'string' ? answer.knownSummary : undefined
      return knownSummary === undefined ? { session } : { session, knownSummary }
    },

    async replaceMaterial(ctx: ReplaceMaterialContext): Promise<unknown> {
      return call('replaceMaterial', ctx)
    },

    async findReplacementUrl(material: Material, concept: string): Promise<string | null> {
      const answer = (await call('findReplacementUrl', { intent: 'find-replacement-url', concept, material })) as
        | { url?: unknown }
        | null
      const url = answer && typeof answer === 'object' ? answer.url : undefined
      return typeof url === 'string' && url.length > 0 ? url : null
    },
  }
}

interface CallSpec {
  duty: string
  model: string
  format: PlanSchemaName
  cap: number
  xSearch: boolean
}

function parseAnswer(response: XaiResponse): unknown {
  if (response.status === 'incomplete') {
    const reason = response.incomplete_details?.reason ?? 'unknown'
    throw new IntelligenceError(`xAI response incomplete: ${reason}`)
  }
  const text = response.output_text ?? ''
  if (text.trim().length === 0) throw new IntelligenceError('xAI response had unparseable output: empty output_text')
  try {
    return JSON.parse(text)
  } catch {
    throw new IntelligenceError('xAI response had unparseable output: output_text is not JSON')
  }
}

function usageOf(call: XaiUsage['call'], model: string, response: XaiResponse, ms: number): XaiUsage {
  const usage = response.usage ?? {}
  return {
    call,
    model,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    toolCalls: toolCallsOf(usage),
    ms,
  }
}

/**
 * Normalise either usage shape to `{ web_search: n, x_search: n, … }`:
 * `web_search_calls` → `web_search`; `SERVER_SIDE_TOOL_WEB_SEARCH` → `web_search`.
 */
function toolCallsOf(usage: NonNullable<XaiResponse['usage']>): Record<string, number> {
  const source = usage.server_side_tool_usage_details ?? usage.server_side_tool_usage ?? {}
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(source)) {
    if (typeof count !== 'number') continue
    const name = key.replace(/^SERVER_SIDE_TOOL_/, '').replace(/_calls$/, '').toLowerCase()
    out[name] = (out[name] ?? 0) + count
  }
  return out
}
