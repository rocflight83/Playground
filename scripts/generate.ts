/**
 * The deterministic half of `/study-plan`: take the plan data the skill wrote,
 * validate it, verify every link against the live web, and write the plan
 * directory. Prints a JSON summary on stdout so the skill can act on it.
 *
 * Usage: node --experimental-strip-types scripts/generate.ts <plan.json> [baseDir]
 *
 * Link replacement is deliberately absent: searching for a substitute source
 * is judgement work, so an unverifiable slot is reported here and re-sourced
 * by the skill, which then re-runs this command.
 */
import { readFile } from 'node:fs/promises'
import type { PlanData } from '../src/plan-types.ts'
import { ValidationFailedError, generatePlan } from '../src/generate.ts'

async function main(): Promise<void> {
  const [planPath, baseDir = 'plans'] = process.argv.slice(2)
  if (!planPath) {
    console.error('Usage: node --experimental-strip-types scripts/generate.ts <plan.json> [baseDir]')
    process.exitCode = 2
    return
  }

  const plan = JSON.parse(await readFile(planPath, 'utf8')) as PlanData

  try {
    const { planDir, planPath: written, htmlPath, report } = await generatePlan(plan, baseDir, {
      fetch,
      searchReplacement: async () => null,
    })
    const unresolved = report.outcomes.filter((o) => o.status === 'unresolved-after-retries')
    console.log(
      JSON.stringify(
        {
          ok: true,
          planDir,
          planPath: written,
          htmlPath,
          unresolved,
          durationWarnings: report.durationWarnings,
        },
        null,
        2
      )
    )
  } catch (err) {
    if (err instanceof ValidationFailedError) {
      console.log(JSON.stringify({ ok: false, validationErrors: err.errors }, null, 2))
      process.exitCode = 1
      return
    }
    throw err
  }
}

await main()
