import type { Material, PlanData, VerificationRecord } from './plan-types.ts'

const MAX_REPLACEMENT_ATTEMPTS = 2

export interface FetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}

export type FetchLike = (url: string) => Promise<FetchResponse>

export interface ReplacementCandidate {
  title: string
  url: string
  sourceType: Material['sourceType']
}

export type SearchReplacement = (
  concept: string,
  excludedUrls: string[]
) => Promise<ReplacementCandidate | null>

export interface VerifyPlanOptions {
  fetch: FetchLike
  searchReplacement: SearchReplacement
  /** URLs (as they appear in the input plan) of the plan's anchor resources — the
   *  three-to-five materials the plan leans on most. These are content-verified
   *  regardless of source tier. Defaults to the highest-estimatedDuration
   *  materials when omitted; pass this to override with a more informed
   *  generation-time selection. */
  anchorUrls?: Iterable<string>
  now?: () => string
  /**
   * When true, an outlier story whose citation cannot be verified is kept
   * in the plan with `verification.status = 'unresolved-after-retries'`
   * instead of being removed. Defaults to false (remove) so generate-mode
   * callers keep the existing behaviour: a story without a working citation
   * is dropped, the skill re-sources, the cycle re-runs. Maintenance mode
   * passes true so a rotted citation does not silently delete a story the
   * learner has already been reading.
   */
  keepOutlierStoriesOnFailure?: boolean
}

export interface MaterialVerificationOutcome {
  kind: 'material'
  sessionNumber: number
  materialTitle: string
  url: string
  status: VerificationRecord['status']
  attempts: number
}

export interface OutlierStoryVerificationOutcome {
  kind: 'outlier-story'
  phaseIndex: number
  citation: string
  status: 'verified-by-status' | 'unresolved-after-retries'
}

export type VerificationOutcome = MaterialVerificationOutcome | OutlierStoryVerificationOutcome

type MaterialVerificationDetails = Omit<MaterialVerificationOutcome, 'kind' | 'sessionNumber'>

export interface VerificationReport {
  outcomes: VerificationOutcome[]
  unresolvedCount: number
}

function requiresContentCheck(sourceType: Material['sourceType'], isAnchor: boolean): boolean {
  return sourceType === 'off-list' || isAnchor
}

function pageCoversConcept(text: string, concept: string): boolean {
  const words = concept
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3)
  if (words.length === 0) return true
  const lower = text.toLowerCase()
  const matched = words.filter((w) => lower.includes(w))
  return matched.length / words.length >= 0.5
}

interface Candidate {
  title: string
  url: string
  sourceType: Material['sourceType']
}

interface CheckResult {
  status: VerificationRecord['status'] | 'failed'
  candidate: Candidate
}

async function checkCandidate(
  candidate: Candidate,
  isAnchor: boolean,
  attempts: number,
  concept: string,
  fetchImpl: FetchLike
): Promise<CheckResult> {
  let response: FetchResponse
  try {
    response = await fetchImpl(candidate.url)
  } catch {
    // An unreachable host is a verification failure, not an exception that
    // aborts the run.
    return { status: 'failed', candidate }
  }

  if (!response.ok) {
    return { status: 'failed', candidate }
  }

  if (!requiresContentCheck(candidate.sourceType, isAnchor)) {
    return { status: attempts === 0 ? 'verified-by-status' : 'replaced-after-failure', candidate }
  }

  let text: string
  try {
    text = await response.text()
  } catch {
    return { status: 'failed', candidate }
  }

  if (!pageCoversConcept(text, concept)) {
    return { status: 'failed', candidate }
  }

  return { status: attempts === 0 ? 'verified-by-content' : 'replaced-after-failure', candidate }
}

async function verifyMaterial(
  material: Material,
  isAnchor: boolean,
  opts: VerifyPlanOptions
): Promise<{ material: Material; outcome: MaterialVerificationDetails }> {
  const concept = material.title
  const triedUrls: string[] = []
  let candidate: Candidate = { title: material.title, url: material.url, sourceType: material.sourceType }
  let attempts = 0

  for (;;) {
    triedUrls.push(candidate.url)
    const result = await checkCandidate(candidate, isAnchor, attempts, concept, opts.fetch)

    if (result.status !== 'failed') {
      const now = (opts.now ?? (() => new Date().toISOString()))()
      return {
        material: {
          ...material,
          title: candidate.title,
          url: candidate.url,
          sourceType: candidate.sourceType,
          verification: { status: result.status, checkedAt: now },
        },
        outcome: { materialTitle: candidate.title, url: candidate.url, status: result.status, attempts },
      }
    }

    if (attempts >= MAX_REPLACEMENT_ATTEMPTS) break

    const replacement = await opts.searchReplacement(concept, triedUrls)
    if (!replacement) break

    candidate = replacement
    attempts += 1
  }

  return {
    material: {
      ...material,
      verification: { status: 'unresolved-after-retries', checkedAt: null },
    },
    outcome: {
      materialTitle: material.title,
      url: material.url,
      status: 'unresolved-after-retries',
      attempts,
    },
  }
}

const MAX_DEFAULT_ANCHORS = 5

/**
 * The plan's three-to-five anchor resources default to the materials with the
 * greatest time investment — the ones a session leans on most heavily — so
 * that "anchors are content-verified regardless of tier" holds even when the
 * caller has no more informed selection to supply.
 */
function selectDefaultAnchors(plan: PlanData): string[] {
  const all = plan.sessions.flatMap((session, sessionIndex) =>
    session.materials.map((material, materialIndex) => ({ material, sessionIndex, materialIndex }))
  )
  all.sort((a, b) => {
    if (b.material.estimatedDuration !== a.material.estimatedDuration) {
      return b.material.estimatedDuration - a.material.estimatedDuration
    }
    if (a.sessionIndex !== b.sessionIndex) return a.sessionIndex - b.sessionIndex
    return a.materialIndex - b.materialIndex
  })
  return all.slice(0, Math.min(MAX_DEFAULT_ANCHORS, all.length)).map((entry) => entry.material.url)
}

/**
 * Verify every material in a plan against injected fetch and replacement-search
 * dependencies. Returns a new plan with refreshed verification records (the
 * input plan is not mutated) plus a report of every outcome.
 */
export async function verifyPlan(
  plan: PlanData,
  opts: VerifyPlanOptions
): Promise<{ plan: PlanData; report: VerificationReport }> {
  const anchorUrls = new Set(opts.anchorUrls ?? selectDefaultAnchors(plan))
  const sessionResults = await Promise.all(
    plan.sessions.map(async (session) => {
      const results = await Promise.all(
        session.materials.map(async (material) => {
          const isAnchor = anchorUrls.has(material.url)
          return verifyMaterial(material, isAnchor, opts)
        })
      )
      return {
        session: { ...session, materials: results.map((result) => result.material) },
        outcomes: results.map((result) => ({ kind: 'material' as const, sessionNumber: session.number, ...result.outcome })),
      }
    })
  )
  const outcomes: VerificationOutcome[] = sessionResults.flatMap((result) => result.outcomes)
  const sessions = sessionResults.map((result) => result.session)

  const verifiedPhases = await Promise.all(
    plan.phases.map(async (phase, phaseIndex) => {
      const story = phase.outlierStory
      if (!story) return phase

      let healthy = false
      try {
        healthy = (await opts.fetch(story.citation)).ok
      } catch {
        healthy = false
      }

      const now = (opts.now ?? (() => new Date().toISOString()))()
      const storyWithVerification = {
        ...story,
        verification: {
          status: healthy ? ('verified-by-status' as const) : ('unresolved-after-retries' as const),
          checkedAt: healthy ? now : null,
        },
      }

      outcomes.push({
        kind: 'outlier-story',
        phaseIndex,
        citation: story.citation,
        status: healthy ? 'verified-by-status' : 'unresolved-after-retries',
      })

      if (healthy) {
        return { ...phase, outlierStory: storyWithVerification }
      }
      if (opts.keepOutlierStoriesOnFailure) {
        return { ...phase, outlierStory: storyWithVerification }
      }
      const { outlierStory: _removedStory, ...phaseWithoutStory } = phase
      return phaseWithoutStory
    })
  )

  const unresolvedCount = outcomes.filter((o) => o.status === 'unresolved-after-retries').length

  return {
    plan: { ...plan, phases: verifiedPhases, sessions },
    report: { outcomes, unresolvedCount },
  }
}
