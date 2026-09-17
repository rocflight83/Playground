export interface Material {
  title: string
  url: string
  sourceType: 'preferred' | 'practitioner' | 'off-list'
  estimatedDuration: number
  paid: boolean
  price?: number
  verification: VerificationRecord
}

/**
 * The bases `VerificationRecord.measuredBy` may carry. Verification writes the
 * field when `measureConsumptionMinutes` returned a result; hand-edited plans
 * may set it too, but the validator enforces both-or-neither.
 */
export type MeasurementBasis = 'video-metadata' | 'stated-read-time' | 'word-count'

export interface VerificationRecord {
  status: 'verified-by-status' | 'verified-by-content' | 'replaced-after-failure' | 'unresolved-after-retries'
  checkedAt: string | null
  /** Consumption time in minutes, measured from the body verification fetched.
   *  Set by verification when a measurement is possible; both this and
   *  `measuredBy` are present together or not at all. */
  measuredDuration?: number
  /** Basis of the measurement, set together with `measuredDuration`. */
  measuredBy?: MeasurementBasis
}

export interface DeliverableField {
  /**
   * Stable join key for the learner's saved answer: the page stores the
   * value under `<session number>/<id>`, and the app's store will do the
   * same. A slug (`^[a-z0-9]+(-[a-z0-9]+)*$`), unique within the session.
   * Changing an id orphans the saved answer, so the skill keeps ids
   * meaningful (`alpha-source`, not `field-1`).
   */
  id: string
  /** Noun phrase the learner sees as the field's heading, e.g. "Who pays the premium". */
  label: string
  /**
   * The question the field answers, shown as guidance inside the empty
   * field. Written so a one-paragraph answer is complete.
   */
  prompt: string
  /** `line` renders a single-line input (a title, a verdict, a number); `paragraph` renders a textarea. */
  kind: 'line' | 'paragraph'
}

export interface DeliverableTemplate {
  fields: DeliverableField[]
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
  /**
   * Optional deliverable template: an outline the learner fills in on the
   * page rather than a binary self-check over a built artifact. Present
   * only when the artifact is written; omit for built artifacts so the
   * session renders exactly as before.
   */
  deliverableTemplate?: DeliverableTemplate
}

export interface Phase {
  title: string
  sessions: number[]
  outlierStory?: OutlierStory
}

export interface OutlierStory {
  person: string
  approach: string
  principle: string
  citation: string
  /**
   * Set by verification, never the user's to write. Carries the same shape as
   * a material's verification so a rotted citation can be surfaced in the
   * page with the same warning affordance.
   */
  verification?: VerificationRecord
}

export type CurationIntent = 'drop-as-known' | 'swap-material' | 'redo-session'

export interface CurationRecord {
  intent: CurationIntent
  sessionNumber: number
  at: string
  /** drop-as-known: the learner's words. */
  known?: string
  /** drop-as-known: the intelligence's restatement, in the voice of currentLevel. */
  knownSummary?: string
  /** swap-material (reason path) and redo-session. */
  reason?: string
  /** swap-material (url path): the learner-supplied URL. */
  suppliedUrl?: string
  /** What was replaced, verbatim, so a later undo can restore it. Exactly one is set. */
  replacedSession?: Session
  replacedMaterial?: Material
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
  /**
   * Append-only history of applied curations. Each record carries the session
   * or material it replaced so a later undo can restore it. The renderer
   * ignores this field; the page does not draw it. Validation checks the
   * structure only — the sprint-frame invariants the records are tested
   * against already live in `validatePlan`.
   */
  curationLog?: CurationRecord[]
}

/**
 * The session numbers reserved for consolidation (catch-up / spaced-review) slots.
 *
 * `.claude/skills/study-plan/SKILL.md` states this policy in prose, because a
 * prompt cannot import a constant. Change either of the policy constants here
 * and that file needs the same edit.
 */
export const CONSOLIDATION_SLOTS: ReadonlySet<number> = new Set([6, 11])

/**
 * Minimum number of fields a deliverable template may carry. One field is a
 * notes box, which the session already has; the lower bound makes the
 * template an outline rather than a single answer.
 *
 * `.claude/skills/study-plan/SKILL.md` states this policy in prose, because a
 * prompt cannot import a constant. Change either of the policy constants here
 * and that file needs the same edit.
 */
export const MIN_DELIVERABLE_FIELDS = 2

/**
 * Maximum number of fields a deliverable template may carry. More than eight
 * is an essay outline, and the skill should split the artifact or drop the
 * template.
 *
 * `.claude/skills/study-plan/SKILL.md` states this policy in prose, because a
 * prompt cannot import a constant. Change either of the policy constants here
 * and that file needs the same edit.
 */
export const MAX_DELIVERABLE_FIELDS = 8

/** The consolidation slots as prose, so error messages and docs cannot drift from the policy. */
export function consolidationSlotsDescription(): string {
  return [...CONSOLIDATION_SLOTS].sort((a, b) => a - b).join(' and ')
}

/**
 * Marker a drop-as-known curation appends to `meta.currentLevel` so the
 * learner's stated knowledge is recorded in the plan. The exact prefix is
 * the contract the skill reads back; both sides of the seam state it in
 * prose for the same reason CONSOLIDATION_SLOTS does. Change the constant
 * and `.claude/skills/study-plan/SKILL.md` needs the same edit.
 */
export const ALREADY_KNOWN_MARKER = '\n\nAlready known: '

/**
 * A unit must be drilled in at least this many sessions for the plan to
 * satisfy CAFE's repetition requirement: the highest-frequency minimal
 * effective units recur across sessions rather than being touched once.
 */
export const MIN_REPEATED_UNIT_SESSIONS = 3

/**
 * The maximum number of distinct URLs any single publisher may supply to a
 * plan. Enforced by `validatePlan`. The publisher is the registrable domain
 * (see `publisherKey` in `src/publisher.ts`); video hosts whose URL does not
 * name the channel return `null` and are skipped.
 *
 * `.claude/skills/study-plan/SKILL.md` states this policy in prose, because a
 * prompt cannot import a constant. Change either of the policy constants here
 * and that file needs the same edit.
 */
export const MAX_URLS_PER_PUBLISHER = 4

/**
 * Warn when the estimated duration and the measured duration differ by more
 * than this ratio. Reading speed varies ±50% between learners and between a
 * skim and a careful read; a 2× band lets every honest estimate through and
 * still catches the ticket's case (60 stated vs 15 measured is 4×).
 *
 * `.claude/skills/study-plan/SKILL.md` states this policy in prose, because a
 * prompt cannot import a constant. Change either of the policy constants here
 * and that file needs the same edit.
 */
export const DURATION_MISMATCH_RATIO = 2

/**
 * Warn when the gap between the estimate and the measurement exceeds this
 * many minutes. Without an absolute floor, a 3-minute page estimated at 8
 * minutes would warn, and the noise would train the skill to ignore the
 * list. Ten minutes is the smallest gap that changes a session's artifact
 * budget in a way the learner would notice.
 */
export const DURATION_MISMATCH_MIN_MINUTES = 10

/**
 * A single implementation of the "far off" test the renderer and the verifier
 * both call, so the page and the JSON summary cannot disagree. Both directions
 * warn: an overstated estimate hides artifact time, an understated one blows
 * the session budget. The check is `max(a, b) / min(a, b) > RATIO && |a − b| > MIN`.
 */
export function isDurationMismatch(stated: number, measured: number): boolean {
  if (stated <= 0 || measured <= 0) return false
  const lo = Math.min(stated, measured)
  const hi = Math.max(stated, measured)
  if (hi / lo <= DURATION_MISMATCH_RATIO) return false
  return hi - lo > DURATION_MISMATCH_MIN_MINUTES
}
