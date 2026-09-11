import { access, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { ValidationFailedError, type FileSystemAdapter } from './generate.ts'
import type { PlanData, Session } from './plan-types.ts'
import { renderPlan } from './renderer.ts'
import { validatePlan } from './validation.ts'
import type { VerificationReport, VerifyPlanOptions } from './verification.ts'
import { verifyPlan } from './verification.ts'

export interface MaintenanceResult {
  planDir: string
  planPath: string
  htmlPath: string
  plan: PlanData
  report: VerificationReport
}

export interface MaintenanceOptions extends VerifyPlanOptions {
  fs?: FileSystemAdapter
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
        await rename(temporaryPaths[index], files[index].path)
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
 * The write gate is strict: no file is written until the merged plan
 * validates before the network call, the verified merged plan validates
 * again, and the replacement's number matches the request.
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

  const fs = options.fs ?? nodeFileSystem
  const planPath = join(planDir, 'plan.json')
  const htmlPath = join(planDir, 'index.html')

  const raw = await fs.readFile(planPath)
  const original = JSON.parse(raw) as PlanData

  const inputErrors = validatePlan(original)
  if (inputErrors.length > 0) throw new ValidationFailedError(inputErrors)

  const merged: PlanData = {
    ...original,
    sessions: original.sessions.map((session) =>
      session.number === sessionNumber ? replacement : session
    ),
  }

  const mergedErrors = validatePlan(merged)
  if (mergedErrors.length > 0) throw new ValidationFailedError(mergedErrors)

  const { plan: verified, report } = await verifyPlan(merged, {
    ...options,
    keepOutlierStoriesOnFailure: true,
    sessionNumbers: [sessionNumber],
  })

  const verifiedErrors = validatePlan(verified)
  if (verifiedErrors.length > 0) throw new ValidationFailedError(verifiedErrors)

  await writeMaintenanceFiles(fs, planPath, htmlPath, JSON.stringify(verified, null, 2), renderPlan(verified))

  return { planDir, planPath, htmlPath, plan: verified, report }
}
