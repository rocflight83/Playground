export interface Material {
  title: string
  url: string
  sourceType: 'preferred' | 'off-list'
  estimatedDuration: number
  paid: boolean
  price?: number
  verification: VerificationRecord
}

export interface VerificationRecord {
  status: 'verified-by-status' | 'verified-by-content' | 'replaced-after-failure' | 'unresolved-after-retries'
  checkedAt: string | null
}

export interface Session {
  number: number
  title: string
  artifactOneLiner: string
  materials: Material[]
  selfCheck: string
  estimatedTime: number
  /**
   * CAFE — the minimal effective units this session drills, named as they are
   * in the DISSS deconstruction. The highest-frequency units recur across
   * sessions; `validatePlan` enforces that at least one does.
   */
  highFrequencyUnits: string[]
  /** CAFE — a mnemonic or framing that makes this session's material stick. Present only where the material benefits. */
  encodingHook?: string
  /** True for the sessions in `CONSOLIDATION_SLOTS`, which are catch-up / spaced-review slots. */
  consolidation?: boolean
}

export interface Phase {
  title: string
  sessions: number[]
  outlierStory?: {
    person: string
    approach: string
    principle: string
    citation: string
  }
}

export interface PlanData {
  meta: {
    subject: string
    targetCapability: string
    /**
     * The reachable version of `targetCapability`, present only when the two
     * diverge. Travels with `scopeNote`: validation rejects one without the
     * other, and rejects an honestTarget identical to targetCapability.
     */
    honestTarget?: string
    hoursPerDay: number
    currentLevel: string
    generatedAt: string
  }
  /** Plain statement of the reframing, rendered at the top. Present iff `meta.honestTarget` is. */
  scopeNote?: string
  disssPreamble: {
    deconstruction: string
    selectionRationale: string
    cutList: string
    sequencingRationale: string
  }
  stakes: string
  phases: Phase[]
  sessions: Session[]
}

/**
 * The session numbers reserved for consolidation (catch-up / spaced-review) slots.
 *
 * `.claude/skills/study-plan/SKILL.md` states this policy in prose, because a
 * prompt cannot import a constant. Change either of the policy constants here
 * and that file needs the same edit.
 */
export const CONSOLIDATION_SLOTS: ReadonlySet<number> = new Set([6, 11])

/** The consolidation slots as prose, so error messages and docs cannot drift from the policy. */
export function consolidationSlotsDescription(): string {
  return [...CONSOLIDATION_SLOTS].sort((a, b) => a - b).join(' and ')
}

/**
 * A unit must be drilled in at least this many sessions for the plan to
 * satisfy CAFE's repetition requirement: the highest-frequency minimal
 * effective units recur across sessions rather than being touched once.
 */
export const MIN_REPEATED_UNIT_SESSIONS = 3
