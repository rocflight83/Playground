import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { join } from 'node:path'
import { ValidationFailedError, type FileSystemAdapter } from './generate.ts'
import type { PlanData, Session } from './plan-types.ts'
import { renderPlan } from './renderer.ts'
import { validatePlan } from './validation.ts'
import type { VerificationReport, VerifyPlanOptions } from './verification.ts'
import { verifyPlan } from './verification.ts'
import {
  type CurationRequest,
  type CurationOutcome,
  curatePlan,
} from './curation.ts'
export type { CuratePlanOptions } from './curation.ts'

export interface MaintenanceResult {
  planDir: string
  planPath: string
  htmlPath: string
  plan: PlanData
  report: VerificationReport
}

/**
 * `curatePlanDir` returns the outcome of the curation rather than a
 * (plan, report) pair: a refused curation has nothing to put on disk, so the
 * caller needs the refusal reason and the stage it failed at. An applied
 * curation carries the new plan, the verification report, and the appended
 * log record.
 */
export interface CurateResult {
  planDir: string
  planPath: string
  htmlPath: string
  outcome: CurationOutcome
}

export interface MaintenanceOptions extends VerifyPlanOptions {
  fs?: FileSystemAdapter
}

const RENAME_RETRY_DELAYS_MS = [50, 100, 200, 400, 800]

/**
 * `rename` over an existing file fails with a transient EPERM/EBUSY on Windows
 * when another process (a sync client such as OneDrive, an antivirus scanner,
 * a browser with the page open) has the destination open at that instant.
 * Writing the temporary files is itself what wakes a sync client up, so the
 * race is reliably lost without a retry. A short backoff is the standard
 * remedy; any other error, or a lock that outlasts the schedule, propagates.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!transient || attempt >= RENAME_RETRY_DELAYS_MS.length) throw err
      await sleep(RENAME_RETRY_DELAYS_MS[attempt])
    }
  }
}

/**
 * Default filesystem adapter for maintenance. The seam never allocates a
 * directory, so the only operations it needs are read, write, and exists.
 */
const nodeFileSystem: FileSystemAdapter = {
  exists: async (path) => {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  },
  mkdir: async () => {
    throw new Error('maintenance seams do not create directories; pass an existing plan directory')
  },
  writeFile: async (path, content) => {
    const { writeFile: write } = await import('node:fs/promises')
    await write(path, content, 'utf8')
  },
  readFile: async (path) => readFile(path, 'utf8'),
  writeFilesAtomically: async (files) => {
    const temporaryPaths = files.map(({ path }) => `${path}.tmp-${randomUUID()}`)
    try {
      await Promise.all(files.map(({ content }, index) => writeFile(temporaryPaths[index], content, 'utf8')))
      for (let index = 0; index < files.length; index++) {
        await renameWithRetry(temporaryPaths[index], files[index].path)
      }
    } finally {
      await Promise.all(temporaryPaths.map((path) => unlink(path).catch(() => undefined)))
    }
  },
}

async function writeMaintenanceFiles(
  fs: FileSystemAdapter,
  planPath: string,
  htmlPath: string,
  planContent: string,
  htmlContent: string
): Promise<void> {
  // Keep both originals available so a failure in the second write does not
  // leave plan.json and index.html describing different plans.
  const originalPlan = await fs.readFile(planPath)
  const originalHtml = await fs.readFile(htmlPath)

  if (fs.writeFilesAtomically) {
    await fs.writeFilesAtomically([
      { path: planPath, content: planContent },
      { path: htmlPath, content: htmlContent },
    ])
    return
  }

  try {
    await fs.writeFile(planPath, planContent)
    await fs.writeFile(htmlPath, htmlContent)
  } catch (error) {
    try {
      await fs.writeFile(planPath, originalPlan)
      await fs.writeFile(htmlPath, originalHtml)
    } catch {
      // Preserve the original write error; adapters should make restoration
      // possible, and the first error is the one that explains the failure.
    }
    throw error
  }
}

/**
 * Verify mode: take an existing plan directory, re-check every URL against
 * the live web, and write the refreshed `plan.json` and `index.html` back
 * into the same directory. Dead links remain in the data with status
 * `unresolved-after-retries`; the rendered session keeps its warning. The
 * plan's directory name is never suffixed, so a learner's browser progress
 * (keyed by session number) survives untouched.
 *
 * The write gate is strict: no file is written until input validation,
 * verification, and output validation have all succeeded.
 */
export async function reverifyPlanDir(
  planDir: string,
  options: MaintenanceOptions
): Promise<MaintenanceResult> {
  const fs = options.fs ?? nodeFileSystem
  const planPath = join(planDir, 'plan.json')
  const htmlPath = join(planDir, 'index.html')

  const raw = await fs.readFile(planPath)
  const parsed = JSON.parse(raw) as PlanData

  const inputErrors = validatePlan(parsed)
  if (inputErrors.length > 0) throw new ValidationFailedError(inputErrors)

  const { plan: verified, report } = await verifyPlan(parsed, {
    ...options,
    keepOutlierStoriesOnFailure: true,
  })

  const outputErrors = validatePlan(verified)
  if (outputErrors.length > 0) throw new ValidationFailedError(outputErrors)

  await writeMaintenanceFiles(fs, planPath, htmlPath, JSON.stringify(verified, null, 2), renderPlan(verified))

  return { planDir, planPath, htmlPath, plan: verified, report }
}

/**
 * Curation mode: read an existing plan directory, apply one curation
 * (drop-as-known, swap-material, or redo-session), verify only what changed,
 * validate the result, and write both files in place. A refused curation
 * leaves the directory byte-identical: nothing on disk changes until the
 * merged plan validates, the verified plan validates again, and the
 * write succeeds atomically.
 *
 * The fs-free core of curation is `curatePlan` in `src/curation.ts`;
 * `curatePlanDir` is `curatePlan` plus the directory I/O. The Planner
 * (issue 17) calls `curatePlan` directly so it does not need a filesystem
 * adapter on the curation path.
 *
 * For `swap-material` on the url path, a learner-supplied URL that fails
 * verification is a refusal at stage `verification`, not an unresolved
 * slot: a URL the learner chose is either admitted as they chose it or
 * refused, and `searchReplacement` is never consulted.
 *
 * For `redo-session` and the reason path of `swap-material`, an
 * unverifiable replacement material is written with status
 * `unresolved-after-retries` and reported as unresolved — the existing
 * behaviour, lifted from `redoSession`.
 */
export async function curatePlanDir(
  planDir: string,
  request: CurationRequest,
  options: MaintenanceOptions
): Promise<CurateResult> {
  const fs = options.fs ?? nodeFileSystem
  const planPath = join(planDir, 'plan.json')
  const htmlPath = join(planDir, 'index.html')

  const raw = await fs.readFile(planPath)
  const original = JSON.parse(raw) as PlanData

  const outcome = await curatePlan(original, request, options)

  if (outcome.status === 'refused') {
    return { planDir, planPath, htmlPath, outcome }
  }

  await writeMaintenanceFiles(
    fs,
    planPath,
    htmlPath,
    JSON.stringify(outcome.plan, null, 2),
    renderPlan(outcome.plan)
  )

  return { planDir, planPath, htmlPath, outcome }
}

/**
 * Redo mode: replace one named session in an existing plan directory, then
 * verify only that session's material URLs and re-render the page in place.
 *
 * The replacement may change any session field — title, artifact, self-check,
 * materials, CAFE fields, consolidation flag — but the session **number**
 * must equal `sessionNumber`. Number is what preserves browser progress: the
 * page keys checkboxes, notes and stakes by it, so a replacement that keeps
 * the same number restores its learner's state on the next page load.
 *
 * Every other plan field is preserved. The other thirteen sessions' parsed
 * data, verification records and timestamps are not fetched or changed;
 * metadata, stakes, phases, DISSS preamble and the entire plan shape ride
 * through untouched. The directory name is never suffixed.
 *
 * This is a thin wrapper over `curatePlanDir`: same signature, same
 * behaviour, same `MaintenanceResult` shape the CLI and tests already use.
 * A redo-session intent cannot refuse after verification (the existing
 * behaviour writes an unverifiable material with a warning), so the wrapper
 * asserts the outcome was applied and unwraps it into the legacy shape.
 *
 * The replacement is structured JSON supplied by the skill. The deterministic
 * shell never invents titles, artifacts, prose, or sources.
 */
export async function redoSession(
  planDir: string,
  sessionNumber: number,
  replacement: Session,
  options: MaintenanceOptions
): Promise<MaintenanceResult> {
  if (replacement.number !== sessionNumber) {
    throw new Error(
      `replacement session number ${replacement.number} does not match requested ${sessionNumber}; ` +
        'the session number is what preserves browser progress and must not change'
    )
  }
  const at = options.now ? options.now() : new Date().toISOString()
  const result = await curatePlanDir(
    planDir,
    { intent: 'redo-session', at, sessionNumber, replacement },
    options
  )
  if (result.outcome.status === 'refused') {
    // A redo-session refuses at request or merged-plan stage (applyCuration
    // raises CurationRefusedError), not at verification. Surface the merged-
    // plan failures as the same ValidationFailedError they used to be so the
    // existing tests and CLI continue to see them.
    if (result.outcome.stage === 'merged-plan') {
      throw new ValidationFailedError(result.outcome.reasons)
    }
    throw new ValidationFailedError(result.outcome.reasons)
  }
  return {
    planDir: result.planDir,
    planPath: result.planPath,
    htmlPath: result.htmlPath,
    plan: result.outcome.plan,
    report: result.outcome.report,
  }
}
