/**
 * The Planner owns the in-flight workflows: `generate`, `curate`, and
 * `verify`. It is the only module with a workflow — the store persists, the
 * intelligence sources, the Planner orchestrates. The shell's seams
 * (`validatePlan`, `verifyPlan`, `renderPlan`, `applyCuration`, `curatePlan`)
 * are reused; the Planner never re-implements them.
 *
 * Jobs are kept in memory. A single in-flight job per plan is enforced
 * (`PlanBusyError`). Terminal jobs are retained for the process lifetime so
 * the API surface can render their result without holding the response
 * stream open for the whole workflow.
 *
 * The Planner's `fetch` is wrapped in `withLimits` so the verifier cannot
 * exhaust the network or hang indefinitely on a dead host. The shell's
 * `verifyPlan` is unchanged; the limits live in the caller.
 */
import { ALREADY_KNOWN_MARKER, MIN_REPEATED_UNIT_SESSIONS } from '../plan-types.ts'
import type { CurationRecord } from '../plan-types.ts'
import type { Material, PlanData, Session } from '../plan-types.ts'
import {
  CurationRequest,
  checkCurationRequest,
  curatePlan,
  type CuratePlanOptions,
  type CurationOutcome,
} from '../curation.ts'
import { validatePlan } from '../validation.ts'
import type { FetchLike, VerificationReport, VerifyPlanOptions } from '../verification.ts'
import { verifyPlan } from '../verification.ts'
import type { PlanStore, Progress } from './plan-store.ts'
import {
  type Intelligence,
  type PlanBrief,
  type ReplaceSessionContext,
} from './intelligence.ts'
import { LimitedFetch, withLimits } from './limits.ts'

export type JobKind = 'generate' | 'curate' | 'verify'

/**
 * Workflow stages a job passes through. `requested` is the entry point;
 * the Planner picks up the work on the next microtask. `sourcing` runs the
 * intelligence; `verifying` runs the verifier. A terminal stage is one of
 * `applied`, `refused`, or `failed` and the job is retained for the
 * lifetime of the process.
 */
export type JobStage =
  | 'requested'
  | 'sourcing'
  | 'verifying'
  | 'applied'
  | 'refused'
  | 'failed'

export interface AppliedResult {
  planId: string
  report: VerificationReport
  record?: CurationRecord
}
export interface RefusedResult {
  reasons: string[]
  stage: 'request' | 'merged-plan' | 'verification'
}
export interface FailedResult {
  error: string
}

export type JobResult = AppliedResult | RefusedResult | FailedResult

export interface Job {
  id: string
  kind: JobKind
  planId: string | null
  stage: JobStage
  startedAt: string
  updatedAt: string
  result?: JobResult
}

export class PlanBusyError extends Error {
  readonly planId: string
  constructor(planId: string) {
    super(`Plan ${planId} already has an in-flight job`)
    this.name = 'PlanBusyError'
    this.planId = planId
  }
}

const MAX_GENERATE_REPAIRS = 2
const DEFAULT_FETCH_TIMEOUT_MS = 15_000
const DEFAULT_FETCH_CONCURRENCY = 4

export interface PlannerDeps {
  store: PlanStore
  intelligence: Intelligence
  /** The fetcher for verification. The Planner wraps it in `withLimits` so
   * the verifier cannot exhaust the network or hang on a dead host. */
  fetch: FetchLike
  now?: () => string
  ids?: () => string
  fetchTimeoutMs?: number
  fetchConcurrency?: number
  /** Reserved for a future per-plan progress flush; the page's localStorage
   * is the only writer of progress today. */
  progress?: Progress
}

/**
 * A curate request as the Planner's caller passes it. The caller does not
 * supply a replacement (a `drop-as-known` does not yet have a knownSummary
 * either) — those fields arrive from the intelligence. The Planner builds
 * a full `CurationRequest` once the intelligence has returned.
 */
export type CurateCallerRequest =
  | {
      intent: 'drop-as-known'
      sessionNumber: number
      known: string
    }
  | {
      intent: 'swap-material'
      sessionNumber: number
      materialUrl: string
      by: { reason: string } | { url: string }
      replacement: Material
    }
  | {
      intent: 'redo-session'
      sessionNumber: number
      reason?: string
      replacement: Session
    }

export class Planner {
  private readonly jobEntries = new Map<string, Job>()
  private readonly inFlightByPlan = new Map<string, string>()
  private readonly store: PlanStore
  private readonly intelligence: Intelligence
  private readonly fetch: FetchLike
  private readonly now: () => string
  private readonly ids: () => string

  constructor(deps: PlannerDeps) {
    this.store = deps.store
    this.intelligence = deps.intelligence
    this.now = deps.now ?? (() => new Date().toISOString())
    this.ids = deps.ids ?? defaultIdGenerator()
    const timeoutMs = deps.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
    const concurrency = deps.fetchConcurrency ?? DEFAULT_FETCH_CONCURRENCY
    this.fetch = limitFetch(deps.fetch, timeoutMs, concurrency)
  }

  generate(brief: PlanBrief): Job {
    const job = this.createJob('generate', null)
    // The contract says generate returns at once at stage 'requested'. Yield
    // once so the caller sees the initial stage before the workflow begins
    // its sourcing round.
    queueMicrotask(() => {
      void this.runGenerate(job, brief)
    })
    return job
  }

  verify(planId: string): Job {
    if (this.inFlightByPlan.has(planId)) throw new PlanBusyError(planId)
    const job = this.createJob('verify', planId)
    this.inFlightByPlan.set(planId, job.id)
    void this.runVerify(job, planId)
    return job
  }

  curate(planId: string, request: CurateCallerRequest): Job {
    if (this.inFlightByPlan.has(planId)) throw new PlanBusyError(planId)
    const job = this.createJob('curate', planId)
    this.inFlightByPlan.set(planId, job.id)
    void this.runCurate(job, planId, request)
    return job
  }

  job(id: string): Job | undefined {
    return this.jobEntries.get(id)
  }

  jobs(planId?: string): Job[] {
    const all = [...this.jobEntries.values()]
    if (!planId) return all
    return all.filter((j) => j.planId === planId)
  }

  private createJob(kind: JobKind, planId: string | null): Job {
    const job: Job = {
      id: this.ids(),
      kind,
      planId,
      stage: 'requested',
      startedAt: this.now(),
      updatedAt: this.now(),
    }
    this.jobEntries.set(job.id, job)
    return job
  }

  private setStage(job: Job, stage: JobStage, result?: JobResult): void {
    job.stage = stage
    job.updatedAt = this.now()
    if (result) job.result = result
    if ((stage === 'applied' || stage === 'refused' || stage === 'failed') && job.planId) {
      this.inFlightByPlan.delete(job.planId)
    }
  }

  private async runGenerate(job: Job, brief: PlanBrief): Promise<void> {
    try {
      this.setStage(job, 'sourcing')
      const searchReplacement = this.buildSearchReplacement()
      let lastErrors: string[] = []
      let lastAttempt: unknown = null
      for (let round = 0; round <= MAX_GENERATE_REPAIRS; round++) {
        const repair =
          round === 0
            ? undefined
            : { previous: lastAttempt, validationErrors: lastErrors }
        let answer: unknown
        try {
          answer = await this.intelligence.generatePlan(brief, repair)
        } catch (err) {
          this.setStage(job, 'failed', { error: errorMessage(err) })
          return
        }
        lastAttempt = answer
        const validation = validatePlan(answer as PlanData)
        if (validation.length === 0) {
          const plan = answer as PlanData
          let verifyResult: { plan: PlanData; report: VerificationReport }
          try {
            verifyResult = await verifyPlan(plan, {
              fetch: this.fetch,
              searchReplacement,
            })
          } catch (err) {
            this.setStage(job, 'failed', { error: errorMessage(err) })
            return
          }
          const postValidate = validatePlan(verifyResult.plan)
          if (postValidate.length > 0) {
            lastErrors = postValidate
            continue
          }
          try {
            const id = await this.store.create(verifyResult.plan)
            await this.store.write(id, verifyResult.plan)
            this.setStage(job, 'applied', { planId: id, report: verifyResult.report })
            return
          } catch (err) {
            this.setStage(job, 'failed', { error: errorMessage(err) })
            return
          }
        }
        lastErrors = validation
      }
      this.setStage(job, 'failed', {
        error: `plan failed validation after ${MAX_GENERATE_REPAIRS + 1} attempts: ${lastErrors.join('; ')}`,
      })
    } catch (err) {
      this.setStage(job, 'failed', { error: errorMessage(err) })
    }
  }

  private async runVerify(job: Job, planId: string): Promise<void> {
    try {
      this.setStage(job, 'verifying')
      const plan = await this.store.read(planId)
      const searchReplacement = this.buildSearchReplacement()
      const { plan: verified, report } = await verifyPlan(plan, {
        fetch: this.fetch,
        keepOutlierStoriesOnFailure: true,
        searchReplacement,
      })
      const errors = validatePlan(verified)
      if (errors.length > 0) {
        this.setStage(job, 'failed', { error: errors.join('; ') })
        return
      }
      await this.store.write(planId, verified)
      this.setStage(job, 'applied', { planId, report })
    } catch (err) {
      this.setStage(job, 'failed', { error: errorMessage(err) })
    }
  }

  /**
   * Build the verifier's `searchReplacement` callback backed by the
   * intelligence. The verifier passes only `(concept, excluded)` today;
   * the planner forwards to `findReplacementUrl` with a stub material whose
   * title is the concept. A real provider can ignore the stub and use the
   * concept directly, so the surface stays stable when the shell grows a
   * third `material` argument.
   */
  private buildSearchReplacement() {
    return async (concept: string, _excluded: string[]): Promise<Material | null> => {
      const stub: Material = {
        title: concept,
        url: '',
        sourceType: 'off-list',
        estimatedDuration: 1,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      }
      const url = await this.intelligence.findReplacementUrl(stub, concept)
      if (url === null) return null
      return {
        title: concept,
        url,
        sourceType: 'off-list',
        estimatedDuration: 1,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      }
    }
  }

  private async runCurate(job: Job, planId: string, request: CurateCallerRequest): Promise<void> {
    try {
      this.setStage(job, 'sourcing')
      const plan = await this.store.read(planId)

      // Frame check first — refuse before any intelligence call.
      const stagedRequest = stageCurationRequest(plan, request, this.now())
      const frameReasons = checkCurationRequest(plan, stagedRequest)
      if (frameReasons.length > 0) {
        this.setStage(job, 'refused', { reasons: frameReasons, stage: 'request' })
        return
      }

      // Sourcing: ask the intelligence for the replacement.
      const sourcingResult = await this.sourcingCall(plan, request)
      const finalRequest = assembleCurationRequest(plan, request, this.now(), sourcingResult)

      const opts: CuratePlanOptions = {
        fetch: this.fetch,
        searchReplacement: () => Promise.resolve(null),
      }
      const outcome = await curatePlan(plan, finalRequest, opts)
      if (outcome.status === 'refused') {
        this.setStage(job, 'refused', { reasons: outcome.reasons, stage: outcome.stage })
        return
      }
      await this.store.write(planId, outcome.plan)
      const result: AppliedResult = { planId, report: outcome.report, record: outcome.record }
      this.setStage(job, 'applied', result)
    } catch (err) {
      this.setStage(job, 'failed', { error: errorMessage(err) })
    }
  }

  private async sourcingCall(
    plan: PlanData,
    request: CurateCallerRequest
  ): Promise<CurateSourcingResult> {
    if (request.intent === 'swap-material') {
      // For swap-material, the caller supplies the replacement material
      // (either a learner's URL or a reason). The intelligence is never
      // consulted; the frame check has already validated the request shape.
      return { material: request.replacement }
    }
    const session = plan.sessions.find((s) => s.number === request.sessionNumber)
    if (!session) throw new Error(`plan has no session ${request.sessionNumber}`)
    const droppedUnits = [...session.highFrequencyUnits]
    const atRiskUnits = computeAtRiskUnits(plan, request.sessionNumber)
    const extendedCurrentLevel =
      request.intent === 'drop-as-known'
        ? plan.meta.currentLevel + ALREADY_KNOWN_MARKER + '…'
        : plan.meta.currentLevel
    const ctx: ReplaceSessionContext = {
      plan,
      sessionNumber: request.sessionNumber,
      intent: request.intent,
      ...(request.intent === 'drop-as-known' ? { known: request.known } : {}),
      ...(request.intent === 'redo-session' && request.reason !== undefined
        ? { reason: request.reason }
        : {}),
      droppedUnits,
      atRiskUnits,
      extendedCurrentLevel,
    }
    const result = await this.intelligence.replaceSession(ctx)
    return {
      session: result.session as Session,
      knownSummary: result.knownSummary,
    }
  }
}

interface CurateSourcingResult {
  material?: Material
  session?: Session
  knownSummary?: string
}

/**
 * Build a placeholder `CurationRequest` whose replacement-shaped fields are
 * filled with structurally-valid placeholders. Used to drive the frame
 * check before the intelligence runs. See `checkCurationRequest` in
 * `src/curation.ts` for the contract.
 */
function stageCurationRequest(
  plan: PlanData,
  request: CurateCallerRequest,
  at: string
): CurationRequest {
  if (request.intent === 'swap-material') {
    return {
      intent: 'swap-material',
      at,
      sessionNumber: request.sessionNumber,
      materialUrl: request.materialUrl,
      by: request.by,
      replacement: placeholderMaterial('url' in request.by ? request.by.url : undefined),
    }
  }
  if (request.intent === 'drop-as-known') {
    return {
      intent: 'drop-as-known',
      at,
      sessionNumber: request.sessionNumber,
      known: request.known,
      knownSummary: 'placeholder knownSummary',
      replacement: placeholderSession(request.sessionNumber),
    }
  }
  return {
    intent: 'redo-session',
    at,
    sessionNumber: request.sessionNumber,
    ...(request.reason !== undefined ? { reason: request.reason } : {}),
    replacement: request.replacement,
  }
}

/**
 * Build the full `CurationRequest` once the intelligence has returned the
 * replacement. The caller's `replacement` on a drop-as-known is empty (it
 * arrives from the intelligence); a swap-material's call-time replacement
 * is the learner-supplied material; a redo-session's is the caller's.
 */
function assembleCurationRequest(
  _plan: PlanData,
  request: CurateCallerRequest,
  at: string,
  sourcing: CurateSourcingResult
): CurationRequest {
  void _plan
  if (request.intent === 'swap-material') {
    if (!sourcing.material) throw new Error('intelligence did not return a material replacement')
    return {
      intent: 'swap-material',
      at,
      sessionNumber: request.sessionNumber,
      materialUrl: request.materialUrl,
      by: request.by,
      replacement: sourcing.material,
    }
  }
  if (request.intent === 'drop-as-known') {
    if (!sourcing.session) throw new Error('intelligence did not return a session replacement')
    return {
      intent: 'drop-as-known',
      at,
      sessionNumber: request.sessionNumber,
      known: request.known,
      knownSummary: sourcing.knownSummary ?? '',
      replacement: sourcing.session,
    }
  }
  if (!sourcing.session) throw new Error('intelligence did not return a session replacement')
  return {
    intent: 'redo-session',
    at,
    sessionNumber: request.sessionNumber,
    ...(request.reason !== undefined ? { reason: request.reason } : {}),
    replacement: sourcing.session,
  }
}

function placeholderSession(sessionNumber: number): Session {
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

function placeholderMaterial(url?: string): Material {
  return {
    title: 'placeholder material',
    url: url ?? 'https://placeholder.invalid/frame-check',
    sourceType: 'preferred',
    estimatedDuration: 1,
    paid: false,
    verification: { status: 'verified-by-status', checkedAt: null },
  }
}

function computeAtRiskUnits(plan: PlanData, excludeSessionNumber: number): string[] {
  const counts = new Map<string, number>()
  for (const session of plan.sessions) {
    if (session.number === excludeSessionNumber) continue
    for (const unit of new Set(session.highFrequencyUnits ?? [])) {
      counts.set(unit, (counts.get(unit) ?? 0) + 1)
    }
  }
  const atRisk: string[] = []
  for (const [unit, count] of counts.entries()) {
    if (count < MIN_REPEATED_UNIT_SESSIONS) atRisk.push(unit)
  }
  return atRisk
}

/**
 * Wrap a `FetchLike` in `withLimits`. The shell's `FetchLike` is single-
 * argument; `withLimits` speaks `(url, signal?)`. The adapter bridges the
 * two without losing the Response shape the verifier expects.
 */
function limitFetch(impl: FetchLike, timeoutMs: number, concurrency: number): FetchLike {
  const adapter: LimitedFetch = async (url, signal) => {
    if (signal?.aborted) throw new Error('aborted')
    return (await impl(url)) as unknown as Response
  }
  const wrapped = withLimits(adapter, { timeoutMs, concurrency })
  return async (url) => {
    const response = (await wrapped(url)) as unknown as ReturnType<FetchLike>
    return response
  }
}

function defaultIdGenerator(): () => string {
  let counter = 0
  return () => `${Date.now().toString(36)}-${(counter += 1).toString(36)}`
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
