import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PlanData } from './plan-types.ts'
import { renderPlan } from './renderer.ts'
import { slugify } from './slug.ts'
import { validatePlan } from './validation.ts'
import type { VerificationReport, VerifyPlanOptions } from './verification.ts'
import { verifyPlan } from './verification.ts'

export interface FileSystemAdapter {
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  writeFile(path: string, content: string): Promise<void>
}

const nodeFileSystem: FileSystemAdapter = {
  exists: async (path) => {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  },
  mkdir: async (path) => {
    await mkdir(path, { recursive: true })
  },
  writeFile: async (path, content) => {
    await writeFile(path, content, 'utf8')
  },
}

/**
 * Generation is verification plus a place to put the result, so it takes the
 * verification options as they are rather than restating them.
 */
export interface GenerateOptions extends VerifyPlanOptions {
  fs?: FileSystemAdapter
}

export interface GenerateResult {
  /** Absolute path of the directory the plan was written into. */
  planDir: string
  /** Absolute path of the written plan data file. */
  planPath: string
  /** Absolute path of the rendered HTML page. */
  htmlPath: string
  /** The verified plan, with refreshed verification records. */
  plan: PlanData
  /** The verification report produced for this run. */
  report: VerificationReport
}

export class ValidationFailedError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(`Plan validation failed: ${errors.join('; ')}`)
    this.name = 'ValidationFailedError'
    this.errors = errors
  }
}

/**
 * Find the first directory name under `baseDir` that is not already taken,
 * starting at the bare slug and then suffixing `-2`, `-3`, and so on. Plans
 * accumulate: regenerating the same subject never overwrites an earlier plan
 * along with whatever progress the learner recorded against it.
 */
async function freeDirectory(fs: FileSystemAdapter, baseDir: string, slug: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const candidate = join(baseDir, attempt === 1 ? slug : `${slug}-${attempt}`)
    if (!(await fs.exists(candidate))) return candidate
  }
}

/**
 * Generate mode: take a plan document produced by the generator (the
 * skill's prompt), validate its invariants, verify every link, and write
 * the plan data plus a rendered self-contained HTML page into a directory
 * named for the subject. Refuses to write any file when validation fails,
 * so an underspecified or structurally invalid plan never reaches the
 * learner.
 */
export async function generatePlan(
  plan: PlanData,
  baseDir: string,
  opts: GenerateOptions
): Promise<GenerateResult> {
  const errors = validatePlan(plan)
  if (errors.length > 0) throw new ValidationFailedError(errors)

  const { plan: verified, report } = await verifyPlan(plan, opts)

  const fs = opts.fs ?? nodeFileSystem
  const planDir = await freeDirectory(fs, baseDir, slugify(plan.meta.subject))
  const planPath = join(planDir, 'plan.json')
  const htmlPath = join(planDir, 'index.html')

  await fs.mkdir(planDir)
  await fs.writeFile(planPath, JSON.stringify(verified, null, 2))
  await fs.writeFile(htmlPath, renderPlan(verified))

  return { planDir, planPath, htmlPath, plan: verified, report }
}