import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ValidationFailedError, type FileSystemAdapter } from './generate.ts'
import type { PlanData } from './plan-types.ts'
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
    throw new Error('reverifyPlanDir does not create directories; pass an existing plan directory')
  },
  writeFile: async (path, content) => {
    const { writeFile: write } = await import('node:fs/promises')
    await write(path, content, 'utf8')
  },
  readFile: async (path) => readFile(path, 'utf8'),
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

  await fs.writeFile(planPath, JSON.stringify(verified, null, 2))
  await fs.writeFile(htmlPath, renderPlan(verified))

  return { planDir, planPath, htmlPath, plan: verified, report }
}