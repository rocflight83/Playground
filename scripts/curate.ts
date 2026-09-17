/**
 * Curation mode: apply one curation (drop-as-known, swap-material, or
 * redo-session) to an existing plan directory, verify only what changed,
 * and write the result back into the same directory in place. The other
 * thirteen sessions, browser progress, and the directory name all stay
 * untouched.
 *
 * Usage: node --experimental-strip-types scripts/curate.ts <planDir> <request.json>
 *
 * The request is a single CurationRequest object: { intent, at?, ... }. The
 * `at` field is the only piece of state the script owns; when omitted, the
 * current time is filled in (the only non-pure step, and the only reason the
 * shell cannot apply the curation itself from the skill's prompt). HTML is
 * rejected with a JSON error.
 *
 * Link replacement is deliberately absent on the reason path: an unverifiable
 * replacement slot is reported here and re-sourced by the skill, which then
 * re-runs the command. On the swap-material url path, an unverifiable
 * learner-supplied URL is a refusal — `searchReplacement` is never consulted.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ValidationFailedError } from '../src/generate.ts'
import { curatePlanDir } from '../src/maintenance.ts'
import type { CurationRequest } from '../src/curation.ts'

function isCurationIntent(value: unknown): value is CurationRequest['intent'] {
  return value === 'drop-as-known' || value === 'swap-material' || value === 'redo-session'
}

async function main(): Promise<void> {
  const [planDir, requestPath] = process.argv.slice(2)
  if (!planDir || !requestPath) {
    console.error(
      'Usage: node --experimental-strip-types scripts/curate.ts <planDir> <request.json>'
    )
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
        JSON.stringify(
          { ok: false, error: `${planDir} is not a directory containing plan.json` },
          null,
          2
        )
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

  // The request is structured data, never HTML. A document whose first
  // non-whitespace character is '<' is the wrong file.
  let raw: string
  try {
    raw = await readFile(requestPath, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(JSON.stringify({ ok: false, error: `cannot read ${requestPath}: ${message}` }, null, 2))
    process.exitCode = 1
    return
  }
  if (/^\s*</.test(raw)) {
    console.log(
      JSON.stringify(
        { ok: false, error: `${requestPath} looks like HTML; curate expects a CurationRequest JSON document` },
        null,
        2
      )
    )
    process.exitCode = 1
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(JSON.stringify({ ok: false, error: `${requestPath} is not valid JSON: ${message}` }, null, 2))
    process.exitCode = 1
    return
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.log(JSON.stringify({ ok: false, error: 'request must be a JSON object' }, null, 2))
    process.exitCode = 1
    return
  }

  const obj = parsed as { intent?: unknown; at?: unknown }
  if (!isCurationIntent(obj.intent)) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error:
            "request.intent must be 'drop-as-known', 'swap-material' or 'redo-session'",
        },
        null,
        2
      )
    )
    process.exitCode = 1
    return
  }

  const request = parsed as CurationRequest
  if (typeof request.at !== 'string') {
    request.at = new Date().toISOString()
  }

  try {
    const result = await curatePlanDir(planDir, request, {
      fetch,
      searchReplacement: async () => null,
    })
    if (result.outcome.status === 'refused') {
      console.log(
        JSON.stringify(
          {
            ok: false,
            refused: result.outcome.reasons,
            stage: result.outcome.stage,
          },
          null,
          2
        )
      )
      process.exitCode = 1
      return
    }
    const unresolved = result.outcome.report.outcomes.filter(
      (o) => o.status === 'unresolved-after-retries'
    )
    console.log(
      JSON.stringify(
        {
          ok: true,
          planDir: result.planDir,
          planPath: result.planPath,
          htmlPath: result.htmlPath,
          intent: result.outcome.record.intent,
          sessionNumber: result.outcome.record.sessionNumber,
          unresolved,
          durationWarnings: result.outcome.report.durationWarnings,
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
    if (err instanceof SyntaxError) {
      console.log(
        JSON.stringify(
          { ok: false, error: `${planDir}/plan.json is not valid JSON: ${err.message}` },
          null,
          2
        )
      )
      process.exitCode = 1
      return
    }
    throw err
  }
}

await main()
