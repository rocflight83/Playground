/**
 * The provider-neutral seam for whatever produces plan prose and replacement
 * sessions / materials — the `/study-plan` skill today, the Claude-API
 * adapter in #19. The Planner never trusts an `unknown` answer until
 * `validatePlan` (or the merged-plan validation) has accepted it. The
 * `ScriptedIntelligence` adapter below records every call so tests can
 * reason about what the Planner did with the work, not how it called the
 * network.
 */
import type { Material, PlanData, Session } from '../plan-types.ts'

export interface PlanBrief {
  subject: string
  currentLevel: string
  hoursPerDay: number
  targetCapability: string
}

/**
 * What's wrong with the previous attempt, so the next attempt can repair
 * instead of guessing. `previous` is the raw JSON the intelligence returned
 * on the last round; `validationErrors` are the structural errors
 * `validatePlan` raised against it.
 */
export interface IntelligenceRepair {
  previous: unknown
  validationErrors: string[]
}

/**
 * Context the Planner builds for the intelligence when a learner wants to
 * replace one session — drop-as-known or redo-session. The three computed
 * fields (droppedUnits, atRiskUnits, extendedCurrentLevel) are what #25
 * says the shell computes for the prompt.
 */
export interface ReplaceSessionContext {
  plan: PlanData
  sessionNumber: number
  intent: 'drop-as-known' | 'redo-session'
  /** drop-as-known only: the learner's own words about what they already know. */
  known?: string
  /** redo-session only: what was wrong. */
  reason?: string
  /** The session's own `highFrequencyUnits` — what would be lost. */
  droppedUnits: string[]
  /** Units whose count across the other sessions is below the repetition floor. */
  atRiskUnits: string[]
  /** The new `currentLevel` after the drop is applied. */
  extendedCurrentLevel: string
}

/** Context the Planner builds for the intelligence when a learner wants to swap one material. */
export interface ReplaceMaterialContext {
  plan: PlanData
  session: Session
  material: Material
  /** swap-material reason path: why the current material is wrong. */
  by: { reason: string } | { url: string }
  /** Minutes remaining in the session's budget after the swap. */
  remainingMinutes: number
}

export interface Intelligence {
  /** Full plan from a brief. `repair` is set on repair rounds. */
  generatePlan(brief: PlanBrief, repair?: IntelligenceRepair): Promise<unknown>
  /** drop-as-known / redo-session. Returns the replacement session and,
   * for drop-as-known, the one-or-two-sentence restatement of `known`
   * that the Planner will append to `currentLevel`. */
  replaceSession(ctx: ReplaceSessionContext): Promise<{ session: unknown; knownSummary?: string }>
  /** swap-material, either path. */
  replaceMaterial(ctx: ReplaceMaterialContext): Promise<unknown>
  /** verifyPlan's searchReplacement: one better URL for a dead slot, or null. */
  findReplacementUrl(material: Material, concept: string): Promise<string | null>
}

interface ScriptedQueueEntry<T> {
  answer?: T
  /** When set, the call throws this error instead of resolving. */
  throw?: unknown
}

type ScriptedAnswer<T> = T | ScriptedQueueEntry<T> | { throw: unknown }

function normalizeScripted<T>(entry: ScriptedAnswer<T>): ScriptedQueueEntry<T> {
  if (entry && typeof entry === 'object' && 'throw' in entry && !('answer' in entry)) {
    return { throw: (entry as { throw: unknown }).throw }
  }
  if (entry && typeof entry === 'object' && 'answer' in entry) {
    return entry as ScriptedQueueEntry<T>
  }
  return { answer: entry as T }
}

/**
 * Test-only intelligence adapter. Each method takes the next entry from its
 * queue; entries may be plain answers, `{ answer }` objects, or `{ throw }`
 * objects. Every call is recorded so a test can assert on sequence.
 */
export class ScriptedIntelligence implements Intelligence {
  readonly calls: { method: keyof Intelligence; args: unknown[] }[] = []
  private readonly plans: ScriptedQueueEntry<unknown>[] = []
  private readonly sessions: ScriptedQueueEntry<{ session: unknown; knownSummary?: string }>[] = []
  private readonly materials: ScriptedQueueEntry<unknown>[] = []
  private readonly replacementUrls: ScriptedQueueEntry<string | null>[] = []

  enqueuePlan(answer: ScriptedAnswer<unknown>): this {
    this.plans.push(normalizeScripted(answer))
    return this
  }

  enqueueSession(answer: ScriptedAnswer<{ session: unknown; knownSummary?: string }>): this {
    this.sessions.push(normalizeScripted(answer))
    return this
  }

  enqueueMaterial(answer: ScriptedAnswer<unknown>): this {
    this.materials.push(normalizeScripted(answer))
    return this
  }

  enqueueReplacementUrl(answer: ScriptedAnswer<string | null>): this {
    this.replacementUrls.push(normalizeScripted(answer))
    return this
  }

  async generatePlan(brief: PlanBrief, repair?: IntelligenceRepair): Promise<unknown> {
    this.calls.push({ method: 'generatePlan', args: [brief, repair] })
    if (this.plans.length === 0) {
      throw new Error('ScriptedIntelligence: no queued generatePlan answer')
    }
    return resolveScripted(this.plans.shift()!)
  }

  async replaceSession(ctx: ReplaceSessionContext): Promise<{ session: unknown; knownSummary?: string }> {
    this.calls.push({ method: 'replaceSession', args: [ctx] })
    if (this.sessions.length === 0) {
      throw new Error('ScriptedIntelligence: no queued replaceSession answer')
    }
    return resolveScripted(this.sessions.shift()!)
  }

  async replaceMaterial(ctx: ReplaceMaterialContext): Promise<unknown> {
    this.calls.push({ method: 'replaceMaterial', args: [ctx] })
    if (this.materials.length === 0) {
      throw new Error('ScriptedIntelligence: no queued replaceMaterial answer')
    }
    return resolveScripted(this.materials.shift()!)
  }

  async findReplacementUrl(material: Material, concept: string): Promise<string | null> {
    this.calls.push({ method: 'findReplacementUrl', args: [material, concept] })
    if (this.replacementUrls.length === 0) {
      throw new Error('ScriptedIntelligence: no queued findReplacementUrl answer')
    }
    return resolveScripted(this.replacementUrls.shift()!)
  }
}

async function resolveScripted<T>(entry: ScriptedQueueEntry<T>): Promise<T> {
  if (entry.throw !== undefined) throw entry.throw
  return entry.answer as T
}

/**
 * Thrown by an intelligence that has no provider behind it. The Planner
 * turns it into a `failed` job carrying this message, so the app runs —
 * plan list, live page, progress, export, import and verify jobs — before
 * a real adapter exists (ticket 19).
 */
export class IntelligenceUnavailableError extends Error {
  constructor(message = 'no provider configured; see ticket 19') {
    super(message)
    this.name = 'IntelligenceUnavailableError'
  }
}

/**
 * The intelligence the app wires when `STUDY_PLAN_INTELLIGENCE=scripted`
 * (the default): every generate / replace call fails with
 * `IntelligenceUnavailableError`; `findReplacementUrl` answers `null` so a
 * verify job can still run and record a dead link as unresolved.
 */
export class UnavailableIntelligence implements Intelligence {
  async generatePlan(): Promise<unknown> {
    throw new IntelligenceUnavailableError()
  }

  async replaceSession(): Promise<{ session: unknown; knownSummary?: string }> {
    throw new IntelligenceUnavailableError()
  }

  async replaceMaterial(): Promise<unknown> {
    throw new IntelligenceUnavailableError()
  }

  async findReplacementUrl(): Promise<string | null> {
    return null
  }
}
