/**
 * Curation: the learner-initiated change to a plan that replaces one session
 * or one material while leaving the sprint frame intact. The shell exposes
 * the apply seam (`applyCuration`), the maintenance seam (`curatePlanDir`
 * in `src/maintenance.ts`), and the command (`npm run curate`). The request
 * types live here because they are the module's interface, not plan data.
 *
 * Every request carries the replacement already produced: sourcing is
 * judgement work and stays with the intelligence (the `/study-plan` skill
 * today, the app's replacement prompt later). Verification placeholders on
 * the replacement are `{ status: 'verified-by-status', checkedAt: null }`
 * and are overwritten by verification.
 */
import { ALREADY_KNOWN_MARKER, CONSOLIDATION_SLOTS, consolidationSlotsDescription } from './plan-types.ts'
import type { Material, PlanData, Session } from './plan-types.ts'
import type { CurationRecord } from './plan-types.ts'
import { validatePlan } from './validation.ts'
import type { VerificationReport, VerifyPlanOptions } from './verification.ts'
import { verifyPlan } from './verification.ts'

interface CurationRequestBase {
  /** ISO timestamp supplied by the caller; recorded on the log entry. */
  at: string
}

export interface DropAsKnownRequest extends CurationRequestBase {
  intent: 'drop-as-known'
  sessionNumber: number
  /** The learner's own words about what they already know. Logged verbatim. */
  known: string
  /** The intelligence's one-or-two-sentence restatement of `known`, written in
   * the voice of `currentLevel`. Appended to it. */
  knownSummary: string
  /** Same number as `sessionNumber`; advances the target instead of re-teaching
   * `known`. */
  replacement: Session
}

export interface SwapMaterialRequest extends CurationRequestBase {
  intent: 'swap-material'
  sessionNumber: number
  /** The url of the material being swapped out, as it appears in the plan. */
  materialUrl: string
  /** Exactly one of the two paths. */
  by: { reason: string } | { url: string }
  /** Always free. On the url path its `url` equals `by.url`. */
  replacement: Material
}

export interface RedoSessionRequest extends CurationRequestBase {
  intent: 'redo-session'
  sessionNumber: number
  /** Optional: what was wrong. Logged; not applied anywhere. */
  reason?: string
  /** Same number as `sessionNumber`. */
  replacement: Session
}

export type CurationRequest = DropAsKnownRequest | SwapMaterialRequest | RedoSessionRequest

/**
 * The shell never writes a half-curated plan: the gate is input validates,
 * merged validates, verified validates, both files written atomically. Pending
 * is therefore a property of the request, not of the plan, and the shell
 * exposes it only as a result. The lifecycle an app draws is
 * `requested -> sourcing -> verifying -> applied | refused`; sourcing happens
 * before the shell is called and verifying inside it.
 */
export type CurationOutcome =
  | { status: 'applied'; plan: PlanData; report: VerificationReport; record: CurationRecord }
  | { status: 'refused'; reasons: string[]; stage: 'request' | 'merged-plan' | 'verification' }

/**
 * Carried by the shell's `applyCuration` so callers see every refusal reason
 * at once rather than one per round. `stage` names the gate the refusal
 * happened at: a `request`-stage refusal never reaches the network, a
 * `merged-plan`-stage refusal never validates, and a `verification`-stage
 * refusal is a learner-supplied URL that did not pass content verification.
 */
export class CurationRefusedError extends Error {
  readonly reasons: string[]
  readonly stage: 'request' | 'merged-plan' | 'verification'

  constructor(reasons: string[], stage: 'request' | 'merged-plan' | 'verification') {
    super(`Curation refused (${stage}): ${reasons.join('; ')}`)
    this.name = 'CurationRefusedError'
    this.reasons = reasons
    this.stage = stage
  }
}

/**
 * Deep-clone a plan via JSON so the caller's object is never mutated. The
 * shell's renderer and validator both treat the input as immutable data.
 */
function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

function findSession(plan: PlanData, number: number): Session {
  const session = plan.sessions.find((s) => s.number === number)
  if (!session) throw new Error(`plan has no session ${number}`)
  return session
}

function invalidSessionNumber(number: number): string | null {
  return Number.isInteger(number) && number >= 1 && number <= 14
    ? null
    : `sessionNumber (${number}) must be an integer from 1 through 14`
}

function dropAsKnown(plan: PlanData, request: DropAsKnownRequest): PlanData {
  const reasons: string[] = []
  const invalidNumber = invalidSessionNumber(request.sessionNumber)
  if (invalidNumber) reasons.push(`drop-as-known: ${invalidNumber}`)
  if (CONSOLIDATION_SLOTS.has(request.sessionNumber)) {
    reasons.push(
      `session ${request.sessionNumber} is a consolidation slot (${consolidationSlotsDescription()}) and cannot be dropped as known — use redo-session to rewrite a bad consolidation`
    )
  }
  if (request.knownSummary.trim() === '') {
    reasons.push('drop-as-known: knownSummary is required and must not be empty')
  }
  if (request.replacement.number !== request.sessionNumber) {
    reasons.push(
      `drop-as-known: replacement.number (${request.replacement.number}) must equal sessionNumber (${request.sessionNumber})`
    )
  }
  if (reasons.length > 0) throw new CurationRefusedError(reasons, 'request')

  const originalSession = findSession(plan, request.sessionNumber)
  const next = clonePlan(plan)
  const sessions = next.sessions.map((s) => (s.number === request.sessionNumber ? request.replacement : s))
  const currentLevel = plan.meta.currentLevel + ALREADY_KNOWN_MARKER + request.knownSummary
  const record: CurationRecord = {
    intent: 'drop-as-known',
    sessionNumber: request.sessionNumber,
    at: request.at,
    known: request.known,
    knownSummary: request.knownSummary,
    replacedSession: JSON.parse(JSON.stringify(originalSession)) as Session,
  }
  return {
    ...next,
    sessions,
    meta: { ...next.meta, currentLevel },
    curationLog: [...(plan.curationLog ?? []), record],
  }
}

function swapMaterial(plan: PlanData, request: SwapMaterialRequest): PlanData {
  const reasons: string[] = []
  const invalidNumber = invalidSessionNumber(request.sessionNumber)
  if (invalidNumber) throw new CurationRefusedError([`swap-material: ${invalidNumber}`], 'request')
  const session = findSession(plan, request.sessionNumber)
  const occurrences = session.materials.filter((m) => m.url === request.materialUrl).length
  if (occurrences === 0) {
    reasons.push(
      `swap-material: material '${request.materialUrl}' not found in session ${request.sessionNumber}`
    )
  } else if (occurrences > 1) {
    reasons.push(
      `swap-material: material '${request.materialUrl}' appears ${occurrences} times in session ${request.sessionNumber}; the plan must be repaired before it can be curated`
    )
  }
  if (request.replacement.paid) {
    reasons.push('swap-material: curation never introduces a paid material; paid: false is required')
  }
  if ('url' in request.by && request.replacement.url !== request.by.url) {
    reasons.push(
      `swap-material: on the url path, replacement.url (${request.replacement.url}) must equal by.url (${request.by.url})`
    )
  }
  // Budget: replacement.estimatedDuration must fit the remaining minutes.
  if (occurrences === 1) {
    const otherMinutes = session.materials
      .filter((m) => m.url !== request.materialUrl)
      .reduce((sum, m) => sum + (typeof m.estimatedDuration === 'number' ? m.estimatedDuration : 0), 0)
    const remaining = session.estimatedTime - otherMinutes
    if (request.replacement.estimatedDuration > remaining) {
      reasons.push(
        `swap-material: replacement estimatedDuration (${request.replacement.estimatedDuration} min) exceeds the session's remaining budget (${remaining} min)`
      )
    }
  }
  if (reasons.length > 0) throw new CurationRefusedError(reasons, 'request')

  const originalMaterial = session.materials.find((m) => m.url === request.materialUrl)!
  const next = clonePlan(plan)
  const sessions = next.sessions.map((s) => {
    if (s.number !== request.sessionNumber) return s
    return {
      ...s,
      materials: s.materials.map((m) => (m.url === request.materialUrl ? request.replacement : m)),
    }
  })
  const record: CurationRecord = {
    intent: 'swap-material',
    sessionNumber: request.sessionNumber,
    at: request.at,
    replacedMaterial: JSON.parse(JSON.stringify(originalMaterial)) as Material,
  }
  if ('reason' in request.by) record.reason = request.by.reason
  if ('url' in request.by) record.suppliedUrl = request.by.url
  return {
    ...next,
    sessions,
    curationLog: [...(plan.curationLog ?? []), record],
  }
}

function redoSessionShell(plan: PlanData, request: RedoSessionRequest): PlanData {
  const reasons: string[] = []
  const invalidNumber = invalidSessionNumber(request.sessionNumber)
  if (invalidNumber) reasons.push(`redo-session: ${invalidNumber}`)
  if (request.replacement.number !== request.sessionNumber) {
    reasons.push(
      `redo-session: replacement.number (${request.replacement.number}) must equal sessionNumber (${request.sessionNumber})`
    )
  }
  if (reasons.length > 0) throw new CurationRefusedError(reasons, 'request')

  const originalSession = findSession(plan, request.sessionNumber)
  const next = clonePlan(plan)
  const sessions = next.sessions.map((s) => (s.number === request.sessionNumber ? request.replacement : s))
  const record: CurationRecord = {
    intent: 'redo-session',
    sessionNumber: request.sessionNumber,
    at: request.at,
    replacedSession: JSON.parse(JSON.stringify(originalSession)) as Session,
  }
  if (request.reason !== undefined) record.reason = request.reason
  return {
    ...next,
    sessions,
    curationLog: [...(plan.curationLog ?? []), record],
  }
}

/**
 * Apply one curation to a plan. Pure: no I/O, no `Date`, no randomness —
 * `at` comes in on the request. Throws `CurationRefusedError` with every
 * refusal reason and the stage it happened at:
 *
 * - `request`: structural / frame issues (number mismatch, paid replacement,
 *   consolidation-slot drop, budget exceeded, material not found). Nothing
 *   was changed on disk.
 * - `merged-plan`: the merged plan failed `validatePlan`. Nothing was written
 *   (the caller is `curatePlanDir`, which reads, applies, validates, then
 *   either validates-again-and-writes or throws).
 * - `verification`: reserved for the maintenance seam, where a learner-
 *   supplied URL fails content verification. The pure apply layer cannot
 *   reach this stage.
 *
 * The input plan is never mutated. The original session or material that was
 * replaced is preserved verbatim on the appended log record, so a later undo
 * can restore it.
 */
export function applyCuration(plan: PlanData, request: CurationRequest): PlanData {
  const next: PlanData =
    request.intent === 'drop-as-known'
      ? dropAsKnown(plan, request)
      : request.intent === 'swap-material'
        ? swapMaterial(plan, request)
        : redoSessionShell(plan, request)

  const mergedErrors = validatePlan(next)
  if (mergedErrors.length > 0) {
    throw new CurationRefusedError(mergedErrors, 'merged-plan')
  }
  return next
}

/**
 * Surface the structural refusals a curation request would raise at the
 * `request` stage, without mutating the plan. The Planner calls this before
 * the intelligence so a frame-level problem (consolidation-slot drop, invalid
 * session number, replacement-number mismatch) refuses without an expensive
 * network round. Replacement-content checks (paid replacement, knownSummary
 * emptiness, budget overflow, material URL not in session) require the
 * replacement itself and are surfaced by `applyCuration` once the
 * intelligence has produced one.
 *
 * Implementation: applies the request with a placeholder replacement that's
 * structurally valid for its intent (correct number, no paid flag, free
 * material, non-empty knownSummary). Any `CurationRefusedError` raised at
 * stage `request` is reported as reasons; any other stage means a frame
 * check uncovered nothing and the request is structurally clear.
 */
export function checkCurationRequest(plan: PlanData, request: CurationRequest): string[] {
  const placeholder = placeholderRequest(request)
  try {
    applyCuration(plan, placeholder)
    return []
  } catch (err) {
    if (err instanceof CurationRefusedError && err.stage === 'request') {
      return err.reasons
    }
    return []
  }
}

/**
 * Build a copy of the request whose replacement-shaped fields are filled
 * with a structurally-valid placeholder. The placeholder matches
 * `sessionNumber` and carries no paid material, an empty knownSummary, and a
 * reasonable budget — i.e. it satisfies the checks that do not depend on
 * what the intelligence will eventually return, so any remaining refusal is
 * one of the frame checks the caller wants to surface.
 */
function placeholderRequest(request: CurationRequest): CurationRequest {
  const at = request.at
  const sessionNumber = request.sessionNumber
  if (request.intent === 'redo-session') {
    return {
      intent: 'redo-session',
      at,
      sessionNumber,
      replacement: placeholderSessionFor(sessionNumber),
    }
  }
  if (request.intent === 'drop-as-known') {
    return {
      intent: 'drop-as-known',
      at,
      sessionNumber,
      known: request.known,
      knownSummary: 'placeholder knownSummary',
      replacement: placeholderSessionFor(sessionNumber),
    }
  }
  // swap-material: keep `by` (the chosen path governs which refusal reasons
  // apply) and use its url as the placeholder so the url-path equality check
  // passes. The placeholder material is otherwise minimal and free.
  const placeholderUrl = 'url' in request.by ? request.by.url : 'https://placeholder.invalid/frame-check'
  return {
    intent: 'swap-material',
    at,
    sessionNumber,
    materialUrl: request.materialUrl,
    by: request.by,
    replacement: placeholderMaterial(placeholderUrl),
  }
}

function placeholderMaterial(url: string): Material {
  return {
    title: 'placeholder material',
    url,
    sourceType: 'preferred',
    estimatedDuration: 1,
    paid: false,
    verification: { status: 'verified-by-status', checkedAt: null },
  }
}

function placeholderSessionFor(sessionNumber: number): Session {
  return {
    number: sessionNumber,
    title: 'placeholder session',
    artifactOneLiner: 'placeholder artifact',
    materials: [placeholderMaterial('https://placeholder.invalid/frame-check')],
    selfCheck: 'placeholder self-check',
    estimatedTime: 60,
    highFrequencyUnits: [],
  }
}

/**
 * Apply one curation, verify what changed, validate the result. The
 * filesystem-free heart of curation mode. `src/maintenance.ts` is this
 * function plus the two-file write; the Planner (issue 17) calls it
 * directly so the curation log record, verification report, and refused
 * outcome stay in one place.
 */
export interface CuratePlanOptions extends VerifyPlanOptions {}

export async function curatePlan(
  plan: PlanData,
  request: CurationRequest,
  options: CuratePlanOptions
): Promise<CurationOutcome> {
  const inputErrors = validatePlan(plan)
  if (inputErrors.length > 0) {
    return { status: 'refused', reasons: inputErrors, stage: 'request' }
  }

  let merged: PlanData
  try {
    merged = applyCuration(plan, request)
  } catch (err) {
    if (err instanceof CurationRefusedError) {
      return { status: 'refused', reasons: err.reasons, stage: err.stage }
    }
    throw err
  }

  const verifyOpts: VerifyPlanOptions = {
    ...options,
    keepOutlierStoriesOnFailure: true,
  }
  if (request.intent === 'swap-material' && 'url' in request.by) {
    verifyOpts.noSubstitution = true
    verifyOpts.sessionNumbers = [request.sessionNumber]
    verifyOpts.materialUrls = [request.replacement.url]
    verifyOpts.forceContentCheckUrls = [request.replacement.url]
  } else if (request.intent === 'swap-material') {
    verifyOpts.sessionNumbers = [request.sessionNumber]
    verifyOpts.materialUrls = [request.replacement.url]
  } else {
    verifyOpts.sessionNumbers = [request.sessionNumber]
  }

  const { plan: verified, report } = await verifyPlan(merged, verifyOpts)

  if (
    request.intent === 'swap-material' &&
    'url' in request.by &&
    report.outcomes.some((outcome) => outcome.status === 'unresolved-after-retries')
  ) {
    const failedUrl = request.replacement.url
    return {
      status: 'refused',
      stage: 'verification',
      reasons: [`<${failedUrl}> could not be verified: unresolved-after-retries`],
    }
  }

  const verifiedErrors = validatePlan(verified)
  if (verifiedErrors.length > 0) {
    return { status: 'refused', reasons: verifiedErrors, stage: 'verification' }
  }

  const record = verified.curationLog?.[verified.curationLog.length - 1]
  if (!record) {
    return {
      status: 'refused',
      stage: 'request',
      reasons: ['curation produced no log record; the request did not change the plan'],
    }
  }

  return { status: 'applied', plan: verified, report, record }
}
