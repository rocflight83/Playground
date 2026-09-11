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
  /** True for sessions 6 and 11, which are catch-up / spaced-review slots. */
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
    honestTarget?: string
    hoursPerDay: number
    currentLevel: string
    generatedAt: string
  }
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

/** The session numbers reserved for consolidation (catch-up / spaced-review) slots. */
export const CONSOLIDATION_SLOTS: ReadonlySet<number> = new Set([6, 11])