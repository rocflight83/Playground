import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PlanData } from './plan-types'
import { renderPlan } from './renderer'
import { slugify } from './slug'
import { validatePlan } from './validation'
import type { FetchLike, SearchReplacement, VerificationReport } from './verification'
import { verifyPlan } from './verification'

export interface FileSystemAdapter {
  mkdir(path: string): Promise<void>
  writeFile(path: string, content: string): Promise<void>
}

const nodeFileSystem: FileSystemAdapter = {
  mkdir: async (path) => {
    await mkdir(path, { recursive: true })
  },
  writeFile: async (path, content) => {
    await writeFile(path, content, 'utf8')
  },
}

export interface GenerateOptions {
  fetch: FetchLike
  searchReplacement: SearchReplacement
  now?: () => string
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

  const slug = slugify(plan.meta.subject)
  const planDir = join(baseDir, slug)
  const planPath = join(planDir, 'plan.json')
  const htmlPath = join(planDir, 'index.html')

  const fs = opts.fs ?? nodeFileSystem
  await fs.mkdir(planDir)
  await fs.writeFile(planPath, JSON.stringify(verified, null, 2))
  await fs.writeFile(htmlPath, renderPlan(verified))

  return { planDir, planPath, htmlPath, plan: verified, report }
}