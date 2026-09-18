/**
 * The provider dry run (#30, step 7): one plan generation and two
 * curations end to end through the Planner against the live xAI API,
 * with cost, latency and fit printed per step and the decision-8
 * tripwires evaluated at the end.
 *
 * Usage: npm run dry-run -- <subject> <level> <hours> <target>
 *
 * Runs the Planner directly (no server), against `plans/` like any
 * generate. Needs `XAI_API_KEY` (env or `.env`). Every call also lands in
 * `plans/.usage.log`. Tripwire (d) — quality of practitioner materials —
 * is the human's to judge from the live page.
 */
import { FilePlanStore } from '../src/app/plan-store.ts'
import { Planner, type Job } from '../src/app/planner.ts'
import type { XaiUsage } from '../src/app/intelligence-xai.ts'
import type { MaterialVerificationOutcome, VerificationOutcome } from '../src/verification.ts'
import { pickIntelligence } from './wire-intelligence.ts'

/** List prices from #13's research, checked 2026-09-15. */
const RATES = {
  asOf: '2026-09-15',
  model: 'grok-4.6',
  inputPerMTok: 2,
  outputPerMTok: 6,
  /** Cached input, xAI: $0.20–$0.50 per MTok by model; the upper figure is used. */
  cachedInputPerMTok: 0.5,
  webSearchPerCall: 0.005,
  /** Per call today; per post fetched from 2026-09-21. */
  xSearchPerCall: 0.005,
} as const

/** Decision 8's thresholds. */
const TRIPWIRES = { maxRepairRounds: 2, maxUnresolvedSessions: 3, maxGenerateCostUsd: 1.0 } as const

interface StepSummary {
  name: string
  ms: number
  calls: number
  /** generatePlan calls in this step; repair rounds = this − 1 (tripwire a). */
  generatePlanCalls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  toolCalls: Record<string, number>
  costUsd: number
  outcome: string
  unresolved: number
  /** Distinct sessions with an unresolved material — tripwire (b) counts sessions. */
  unresolvedSessions: number
  refusalReasons: string[]
  error?: string
}

function costOf(usage: XaiUsage[]): number {
  let usd = 0
  for (const u of usage) {
    const uncached = Math.max(0, u.inputTokens - u.cacheReadTokens)
    usd += (uncached * RATES.inputPerMTok + u.cacheReadTokens * RATES.cachedInputPerMTok + u.outputTokens * RATES.outputPerMTok) / 1_000_000
    for (const [kind, n] of Object.entries(u.toolCalls)) {
      if (kind === 'web_search') usd += n * RATES.webSearchPerCall
      else if (kind === 'x_search') usd += n * RATES.xSearchPerCall
    }
  }
  return usd
}

function sumToolCalls(usage: XaiUsage[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const u of usage) {
    for (const [kind, n] of Object.entries(u.toolCalls)) out[kind] = (out[kind] ?? 0) + n
  }
  return out
}

function isMaterialOutcome(o: VerificationOutcome): o is MaterialVerificationOutcome {
  return o.kind === 'material'
}

async function waitForTerminal(job: Job): Promise<void> {
  while (job.stage === 'requested' || job.stage === 'sourcing' || job.stage === 'verifying') {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

function summarise(name: string, job: Job, usage: XaiUsage[], ms: number): StepSummary {
  const result = job.result
  const report = result && 'report' in result ? result.report : undefined
  const unresolvedSessions = new Set(
    (report?.outcomes ?? [])
      .filter(isMaterialOutcome)
      .filter((o) => o.status === 'unresolved-after-retries')
      .map((o) => o.sessionNumber)
  ).size
  return {
    name,
    ms,
    calls: usage.length,
    generatePlanCalls: usage.filter((u) => u.call === 'generatePlan').length,
    inputTokens: usage.reduce((s, u) => s + u.inputTokens, 0),
    outputTokens: usage.reduce((s, u) => s + u.outputTokens, 0),
    cacheReadTokens: usage.reduce((s, u) => s + u.cacheReadTokens, 0),
    toolCalls: sumToolCalls(usage),
    costUsd: costOf(usage),
    outcome: job.stage,
    unresolved: report?.unresolvedCount ?? 0,
    unresolvedSessions,
    refusalReasons: result && 'reasons' in result ? result.reasons : [],
    ...(result && 'error' in result ? { error: result.error } : {}),
  }
}

function printStep(step: StepSummary): void {
  console.log(`\n== ${step.name} ==`)
  console.log(`  outcome:      ${step.outcome}${step.error ? ` — ${step.error}` : ''}`)
  console.log(`  wall time:    ${(step.ms / 1000).toFixed(1)} s over ${step.calls} call(s)`)
  console.log(`  tokens:       in ${step.inputTokens} (cached ${step.cacheReadTokens}) / out ${step.outputTokens}`)
  console.log(`  tool calls:   ${JSON.stringify(step.toolCalls)}`)
  console.log(`  list price:   $${step.costUsd.toFixed(4)}`)
  console.log(`  unresolved:   ${step.unresolved} material(s) across ${step.unresolvedSessions} session(s)`)
  if (step.refusalReasons.length > 0) console.log(`  refusals:     ${step.refusalReasons.join(' | ')}`)
}

async function main(): Promise<void> {
  const [subject, currentLevel, hoursArg, targetCapability] = process.argv.slice(2)
  const hoursPerDay = Number(hoursArg)
  if (!subject || !currentLevel || !targetCapability || !(hoursPerDay > 0)) {
    console.error('Usage: npm run dry-run -- <subject> <level> <hours> <target>')
    process.exitCode = 2
    return
  }

  const usage: XaiUsage[] = []
  const intelligence = await pickIntelligence(process.env, (u) => usage.push(u))
  const store = new FilePlanStore('plans')
  const planner = new Planner({ store, intelligence, fetch })
  const steps: StepSummary[] = []

  async function step(name: string, start: () => Job): Promise<Job> {
    usage.length = 0
    const started = Date.now()
    const job = start()
    await waitForTerminal(job)
    const summary = summarise(name, job, [...usage], Date.now() - started)
    steps.push(summary)
    printStep(summary)
    return job
  }

  console.log(`Dry run: ${RATES.model} at list prices of ${RATES.asOf}; usage log in plans/.usage.log`)

  const generateJob = await step('generate', () => planner.generate({ subject, currentLevel, hoursPerDay, targetCapability }))
  if (generateJob.stage !== 'applied' || !generateJob.result || !('planId' in generateJob.result)) {
    console.log('\nGenerate did not apply; the curation steps need a plan and were skipped.')
    printTripwires(steps)
    process.exitCode = 1
    return
  }
  const planId = generateJob.result.planId
  console.log(`  plan:         plans/${planId}/`)

  await step('drop-as-known session 3', () =>
    planner.curate(planId, {
      intent: 'drop-as-known',
      sessionNumber: 3,
      known: 'I already know what session 3 covers; I have done this before.',
    })
  )

  const plan = await store.read(planId)
  const session4 = plan.sessions.find((s) => s.number === 4)
  const material = session4?.materials[0]
  if (!material) {
    console.log('\nSession 4 has no material to swap; step skipped.')
  } else {
    await step(`swap-material session 4 (${material.url})`, () =>
      planner.curate(planId, {
        intent: 'swap-material',
        sessionNumber: 4,
        materialUrl: material.url,
        by: { reason: 'want a practitioner take' },
      })
    )
  }

  printTripwires(steps)
}

function printTripwires(steps: StepSummary[]): void {
  const generate = steps[0]
  const repairRounds = Math.max(0, generate.generatePlanCalls - 1)
  // The Planner stops after `maxRepairRounds` repairs, so a generate that
  // exhausted them without applying *needed* more than the cap.
  const a =
    generate.outcome === 'applied'
      ? repairRounds > TRIPWIRES.maxRepairRounds
      : generate.generatePlanCalls > TRIPWIRES.maxRepairRounds
  const b = generate.unresolvedSessions > TRIPWIRES.maxUnresolvedSessions
  const c = generate.costUsd > TRIPWIRES.maxGenerateCostUsd
  console.log('\n== Decision-8 tripwires (any one fired → build #29) ==')
  console.log(`  (a) repair rounds needed ${generate.outcome === 'applied' ? repairRounds : `>${repairRounds} (never passed)`} > ${TRIPWIRES.maxRepairRounds}: ${a ? 'FIRED' : 'ok'}`)
  console.log(`  (b) sessions with an unresolved material ${generate.unresolvedSessions} > ${TRIPWIRES.maxUnresolvedSessions}: ${b ? 'FIRED' : 'ok'}`)
  console.log(`  (c) generate cost $${generate.costUsd.toFixed(4)} > $${TRIPWIRES.maxGenerateCostUsd.toFixed(2)}: ${c ? 'FIRED' : 'ok'}`)
  console.log('  (d) practitioner-material quality: curate once from the live page and judge')
  console.log(`  total list price this run: $${steps.reduce((s, x) => s + x.costUsd, 0).toFixed(4)}`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
