/**
 * Redo mode: take an existing plan directory, splice in one replacement
 * session identified by its number, verify only that session's links, and
 * re-render the page in place. The other thirteen sessions, browser progress,
 * stakes, and the directory name all stay untouched.
 *
 * Usage: node --experimental-strip-types scripts/redo.ts <planDir> <sessionNumber> <replacement.json>
 *
 * The replacement must be a Session JSON document (see Session in
 * src/plan-types.ts) whose `number` equals the requested session number.
 * HTML is not accepted: the deterministic shell only ever works from
 * structured plan data.
 *
 * Link replacement is deliberately absent: re-sourcing a dead link is
 * judgement work, so an unverifiable replacement slot is reported here and
 * re-sourced by the skill, which then re-runs the command.
 */
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ValidationFailedError } from '../src/generate.ts'
import { redoSession } from '../src/maintenance.ts'
import type { Session } from '../src/plan-types.ts'

async function main(): Promise<void> {
  const [planDir, sessionNumberArg, replacementPath] = process.argv.slice(2)
  if (!planDir || !sessionNumberArg || !replacementPath) {
    console.error(
      'Usage: node --experimental-strip-types scripts/redo.ts <planDir> <sessionNumber> <replacement.json>'
    )
    process.exitCode = 2
    return
  }

  const sessionNumber = Number(sessionNumberArg)
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 14) {
    console.log(
      JSON.stringify(
        { ok: false, error: `sessionNumber must be an integer between 1 and 14, received '${sessionNumberArg}'` },
        null,
        2
      )
    )
    process.exitCode = 1
    return
  }

  // Fail early with a JSON error if the supplied path is not a directory
  // containing plan.json — same shape as the verify CLI, so the skill can
  // act without parsing a stack trace.
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

  // The replacement is structured plan data, never HTML. A document whose
  // first non-whitespace character is '<' is the wrong file.
  let raw: string
  try {
    raw = await readFile(replacementPath, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(JSON.stringify({ ok: false, error: `cannot read ${replacementPath}: ${message}` }, null, 2))
    process.exitCode = 1
    return
  }
  if (/^\s*</.test(raw)) {
    console.log(
      JSON.stringify(
        { ok: false, error: `${replacementPath} looks like HTML; redo expects a Session JSON document` },
        null,
        2
      )
    )
    process.exitCode = 1
    return
  }

  let replacement: Session
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.log(JSON.stringify({ ok: false, validationErrors: ['replacement must be a JSON object'] }, null, 2))
      process.exitCode = 1
      return
    }
    replacement = parsed as Session
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.log(JSON.stringify({ ok: false, error: `${replacementPath} is not valid JSON: ${message}` }, null, 2))
    process.exitCode = 1
    return
  }

  if (typeof replacement.number !== 'number') {
    console.log(
      JSON.stringify({ ok: false, error: 'replacement.number is required and must be a number' }, null, 2)
    )
    process.exitCode = 1
    return
  }
  if (replacement.number !== sessionNumber) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: `replacement session number ${replacement.number} does not match requested ${sessionNumber}; ` +
            'the session number is what preserves browser progress and must not change',
        },
        null,
        2
      )
    )
    process.exitCode = 1
    return
  }

  try {
    const { planDir: dir, planPath, htmlPath, report } = await redoSession(planDir, sessionNumber, replacement, {
      fetch,
      searchReplacement: async () => null,
    })
    const unresolved = report.outcomes.filter((o) => o.status === 'unresolved-after-retries')
    console.log(JSON.stringify({ ok: true, planDir: dir, planPath, htmlPath, unresolved }, null, 2))
  } catch (err) {
    if (err instanceof ValidationFailedError) {
      console.log(JSON.stringify({ ok: false, validationErrors: err.errors }, null, 2))
      process.exitCode = 1
      return
    }
    if (err instanceof SyntaxError) {
      console.log(
        JSON.stringify({ ok: false, error: `${planDir}/plan.json is not valid JSON: ${err.message}` }, null, 2)
      )
      process.exitCode = 1
      return
    }
    throw err
  }
}

await main()
