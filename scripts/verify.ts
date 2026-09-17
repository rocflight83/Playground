/**
 * Verify mode: take an existing plan directory and re-check every URL in it
 * against the live web. Fresh verification records and a re-rendered page are
 * written back into the same directory; the directory name is never suffixed,
 * so a learner's browser progress survives. Prints a JSON summary on stdout.
 *
 * Usage: node --experimental-strip-types scripts/verify.ts <planDir>
 *
 * Link replacement is deliberately absent: searching for a substitute source
 * is judgement work, so an unverifiable slot is reported here and re-sourced
 * by the skill, which then re-runs the command.
 */
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ValidationFailedError } from '../src/generate.ts'
import { reverifyPlanDir } from '../src/maintenance.ts'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const [planDir] = args
  if (args.length !== 1) {
    console.error('Usage: node --experimental-strip-types scripts/verify.ts <planDir>')
    process.exitCode = 2
    return
  }

  // Validate the argument identifies a directory containing plan.json so
  // failures here get the same JSON shape as validation failures, not a raw
  // ENOENT stack trace.
  try {
    const stats = await stat(planDir)
    if (!stats.isDirectory()) {
      console.log(
        JSON.stringify({ ok: false, error: `${planDir} is not a directory containing plan.json` }, null, 2)
      )
      process.exitCode = 1
      return
    }
    await stat(join(planDir, 'plan.json'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(JSON.stringify({ ok: false, error: `cannot read ${planDir}/plan.json: ${message}` }, null, 2))
    process.exitCode = 1
    return
  }

  try {
    const { planDir: dir, planPath, htmlPath, report } = await reverifyPlanDir(planDir, {
      fetch,
      searchReplacement: async () => null,
    })
    const unresolved = report.outcomes.filter((o) => o.status === 'unresolved-after-retries')
    console.log(
      JSON.stringify(
        {
          ok: true,
          planDir: dir,
          planPath,
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
