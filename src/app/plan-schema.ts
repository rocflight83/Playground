/**
 * JSON schemas for the intelligence's structured output — a *shape hint
 * for the model*, not a gate. `validatePlan` stays the only truth; the
 * adapter returns the parsed answer as `unknown` regardless of what the
 * schema promised.
 *
 * Hand-written once, mirroring `src/plan-types.ts`. When that file gains
 * or loses a field this file changes with it; `tests/plan-schema.test.ts`
 * walks a fixture plan and fails on any key the schema does not name.
 * The shapes also satisfy xAI's strict-mode rules (explicit
 * `additionalProperties`, ≤64 properties per object, ≤256 array items)
 * so `strictSchema` can be switched on without edits.
 */

export type JsonSchema = Record<string, unknown>

const verificationRecord: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      enum: ['verified-by-status', 'verified-by-content', 'replaced-after-failure', 'unresolved-after-retries'],
    },
    checkedAt: { type: ['string', 'null'] },
    measuredDuration: { type: 'number' },
    measuredBy: { type: 'string', enum: ['video-metadata', 'stated-read-time', 'word-count'] },
  },
  required: ['status', 'checkedAt'],
}

const material: JsonSchema = {
  title: 'material',
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    url: { type: 'string' },
    sourceType: { type: 'string', enum: ['preferred', 'practitioner', 'off-list'] },
    estimatedDuration: { type: 'number' },
    paid: { type: 'boolean' },
    price: { type: 'number' },
    verification: verificationRecord,
  },
  required: ['title', 'url', 'sourceType', 'estimatedDuration', 'paid', 'verification'],
}

const deliverableField: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    prompt: { type: 'string' },
    kind: { type: 'string', enum: ['line', 'paragraph'] },
  },
  required: ['id', 'label', 'prompt', 'kind'],
}

const session: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    number: { type: 'integer' },
    title: { type: 'string' },
    artifactOneLiner: { type: 'string' },
    materials: { type: 'array', items: material, maxItems: 256 },
    selfCheck: { type: 'string' },
    estimatedTime: { type: 'number' },
    highFrequencyUnits: { type: 'array', items: { type: 'string' }, maxItems: 256 },
    encodingHook: { type: 'string' },
    consolidation: { type: 'boolean' },
    deliverableTemplate: {
      type: 'object',
      additionalProperties: false,
      properties: { fields: { type: 'array', items: deliverableField, maxItems: 256 } },
      required: ['fields'],
    },
  },
  required: ['number', 'title', 'artifactOneLiner', 'materials', 'selfCheck', 'estimatedTime', 'highFrequencyUnits'],
}

const outlierStory: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    person: { type: 'string' },
    approach: { type: 'string' },
    principle: { type: 'string' },
    citation: { type: 'string' },
    verification: verificationRecord,
  },
  required: ['person', 'approach', 'principle', 'citation'],
}

const phase: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    sessions: { type: 'array', items: { type: 'integer' }, maxItems: 256 },
    outlierStory,
  },
  required: ['title', 'sessions'],
}

const curationRecord: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['drop-as-known', 'swap-material', 'redo-session'] },
    sessionNumber: { type: 'integer' },
    at: { type: 'string' },
    known: { type: 'string' },
    knownSummary: { type: 'string' },
    reason: { type: 'string' },
    suppliedUrl: { type: 'string' },
    replacedSession: session,
    replacedMaterial: material,
  },
  required: ['intent', 'sessionNumber', 'at'],
}

const plan: JsonSchema = {
  title: 'plan',
  type: 'object',
  additionalProperties: false,
  properties: {
    meta: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subject: { type: 'string' },
        targetCapability: { type: 'string' },
        honestTarget: { type: 'string' },
        hoursPerDay: { type: 'number' },
        currentLevel: { type: 'string' },
        generatedAt: { type: 'string' },
      },
      required: ['subject', 'targetCapability', 'hoursPerDay', 'currentLevel', 'generatedAt'],
    },
    scopeNote: { type: 'string' },
    disssPreamble: {
      type: 'object',
      additionalProperties: false,
      properties: {
        deconstruction: { type: 'string' },
        selectionRationale: { type: 'string' },
        cutList: { type: 'string' },
        sequencingRationale: { type: 'string' },
      },
      required: ['deconstruction', 'selectionRationale', 'cutList', 'sequencingRationale'],
    },
    stakes: { type: 'string' },
    phases: { type: 'array', items: phase, maxItems: 256 },
    sessions: { type: 'array', items: session, maxItems: 256 },
    curationLog: { type: 'array', items: curationRecord, maxItems: 256 },
  },
  required: ['meta', 'disssPreamble', 'stakes', 'phases', 'sessions'],
}

/** `{ session, knownSummary? }` — what `Intelligence.replaceSession` returns. */
const sessionReplacement: JsonSchema = {
  title: 'session_replacement',
  type: 'object',
  additionalProperties: false,
  properties: {
    session,
    knownSummary: { type: 'string', description: 'Required for drop-as-known; absent for redo-session.' },
  },
  required: ['session'],
}

/** `{ url: string | null }` — what `Intelligence.findReplacementUrl` returns. */
const replacementUrl: JsonSchema = {
  title: 'replacement_url',
  type: 'object',
  additionalProperties: false,
  properties: { url: { type: ['string', 'null'] } },
  required: ['url'],
}

/** Keyed by the `text.format.name` each call sends. */
export const PLAN_SCHEMAS = {
  plan,
  session_replacement: sessionReplacement,
  material,
  replacement_url: replacementUrl,
} as const

export type PlanSchemaName = keyof typeof PLAN_SCHEMAS
