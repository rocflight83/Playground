import type { PlanData } from '../src/plan-types'
import { PLAN_SCHEMAS } from '../src/app/plan-schema'
import { fixturePlan } from './fixtures/plan-fixture'

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  maxItems?: number
  required?: string[]
  additionalProperties?: boolean
  anyOf?: JsonSchema[]
  enum?: unknown[]
}

/** Every key of `value`, recursively, must be named by `schema` at the same path. */
function missingKeys(schema: JsonSchema, value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    if (!schema.items) return [`${path}[] (schema has no items)`]
    return value.flatMap((item, i) => missingKeys(schema.items!, item, `${path}[${i}]`))
  }
  if (value && typeof value === 'object') {
    const props = schema.properties ?? {}
    return Object.entries(value).flatMap(([key, child]) => {
      const next = `${path}.${key}`
      if (!(key in props)) return [next]
      return missingKeys(props[key], child, next)
    })
  }
  return []
}

/** xAI's strict-mode rules: explicit additionalProperties, ≤64 properties, ≤256 items. */
function strictViolations(schema: JsonSchema, path = '$'): string[] {
  const out: string[] = []
  if (schema.properties) {
    if (schema.additionalProperties === undefined) out.push(`${path}: additionalProperties not explicit`)
    const names = Object.keys(schema.properties)
    if (names.length > 64) out.push(`${path}: ${names.length} properties`)
    for (const name of names) out.push(...strictViolations(schema.properties[name], `${path}.${name}`))
  }
  if (schema.items) {
    if (!(typeof schema.maxItems === 'number' && schema.maxItems <= 256)) out.push(`${path}: array without maxItems ≤ 256`)
    out.push(...strictViolations(schema.items, `${path}[]`))
  }
  for (const [i, alt] of (schema.anyOf ?? []).entries()) out.push(...strictViolations(alt, `${path}|${i}`))
  return out
}

/** A plan carrying every optional field the types declare, so the drift test covers them all. */
function maximalPlan(): PlanData {
  const plan = JSON.parse(JSON.stringify(fixturePlan)) as PlanData
  const material = plan.sessions[0].materials[0]
  material.verification.measuredDuration = 12
  material.verification.measuredBy = 'word-count'
  plan.phases[0].outlierStory!.verification = { status: 'verified-by-status', checkedAt: null }
  plan.curationLog = [
    {
      intent: 'swap-material',
      sessionNumber: 1,
      at: '2026-01-06T00:00:00.000Z',
      reason: 'too dense',
      suppliedUrl: 'https://example.com/x',
      replacedMaterial: material,
    },
    {
      intent: 'drop-as-known',
      sessionNumber: 2,
      at: '2026-01-06T00:00:00.000Z',
      known: 'k',
      knownSummary: 'ks',
      replacedSession: plan.sessions[1],
    },
  ]
  return plan
}

describe('PLAN_SCHEMAS (scenario 10)', () => {
  it('plan names every key of the fixture plan and every optional field, recursively', () => {
    expect(missingKeys(PLAN_SCHEMAS.plan as JsonSchema, fixturePlan)).toEqual([])
    expect(missingKeys(PLAN_SCHEMAS.plan as JsonSchema, maximalPlan())).toEqual([])
  })

  it('session_replacement wraps a session and an optional knownSummary; material is a material', () => {
    const plan = maximalPlan()
    expect(
      missingKeys(PLAN_SCHEMAS.session_replacement as JsonSchema, {
        session: plan.sessions[0],
        knownSummary: 'x',
      })
    ).toEqual([])
    expect(missingKeys(PLAN_SCHEMAS.material as JsonSchema, plan.sessions[0].materials[0])).toEqual([])
    expect(missingKeys(PLAN_SCHEMAS.replacement_url as JsonSchema, { url: null })).toEqual([])
  })

  it("every schema satisfies xAI's strict rules so strictSchema can be switched on", () => {
    for (const [name, schema] of Object.entries(PLAN_SCHEMAS)) {
      expect(strictViolations(schema as JsonSchema), name).toEqual([])
    }
  })
})
