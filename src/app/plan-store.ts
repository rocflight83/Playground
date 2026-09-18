/**
 * The Planner's persistence seam. `PlanStore.write` validates, renders and
 * writes `plan.json` and `index.html` together — the only way a plan lands
 * on disk in the app, so half-written directories cannot exist. `create`
 * only allocates the directory and writes the initial `plan.json`; the
 * renderer is paid for only when content actually changes.
 *
 * Two adapters: a `FilePlanStore` for production (writes to disk under a
 * `baseDir`) and a `MemoryPlanStore` for tests. A hosted version swaps the
 * adapter (blob/DB), not the interface. The `FileSystemAdapter` is the one
 * `generatePlan` already uses, lifted into a shared type so both seams can
 * be exercised against the same in-memory fs in tests.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ValidationFailedError } from '../generate.ts'
import type { PlanData } from '../plan-types.ts'
import { renderPlan } from '../renderer.ts'
import { slugify } from '../slug.ts'
import { validatePlan } from '../validation.ts'

export interface PlanSummary {
  id: string
  subject: string
  generatedAt: string
  sessionsCount: number
}

export type Progress = Record<string, unknown>

/**
 * The minimum filesystem surface the store needs. `generatePlan` already
 * uses the same shape; reusing it keeps the in-memory test adapter single.
 */
export interface FileSystemAdapter {
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  writeFile(path: string, content: string): Promise<void>
  readFile(path: string): Promise<string>
  /**
   * List the immediate entries of a directory, each tagged with whether it
   * is a directory. Optional: a store on a real filesystem can fall back to
   * `node:fs/promises`'s `readdir`; a store on an in-memory adapter needs it
   * explicitly.
   */
  readdir?(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  writeFilesAtomically?(files: Array<{ path: string; content: string }>): Promise<void>
}

/**
 * Optional test-only hooks a fs adapter may expose so `FilePlanStore` can be
 * asserted on without coupling the production adapter to test code. Real
 * filesystems do not implement them.
 */
interface TestFileSystemHooks {
  wasFileRead(path: string): boolean
  totalWrites(): number
  lastReadFile(path: string): string
}

export class PlanNotFoundError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`plan not found: ${id}`)
    this.name = 'PlanNotFoundError'
    this.id = id
  }
}

export interface PlanStore {
  list(): Promise<PlanSummary[]>
  read(id: string): Promise<PlanData>
  /** Allocate the id from `slugify(plan.meta.subject)`, suffixing `-2`, `-3` …
   * like `generatePlan`. Returns the id. */
  create(plan: PlanData): Promise<string>
  /** Validate, render, write `plan.json` and `index.html` together. Throws
   *  `ValidationFailedError` and writes nothing then. */
  write(id: string, plan: PlanData): Promise<void>
  readProgress(id: string): Promise<Progress>
  writeProgress(id: string, progress: Progress): Promise<void>
}

async function freeId(fs: FileSystemAdapter, baseDir: string, slug: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const candidate = join(baseDir, attempt === 1 ? slug : `${slug}-${attempt}`)
    if (!(await fs.exists(candidate))) return candidate
  }
}

function summaryOf(id: string, plan: PlanData): PlanSummary {
  return {
    id,
    subject: plan.meta.subject,
    generatedAt: plan.meta.generatedAt,
    sessionsCount: plan.sessions.length,
  }
}

/**
 * In-memory plan store. Every plan is kept as the parsed JSON object it was
 * created or written with, deep-cloned on the way in so a later mutation of
 * the caller's object cannot change the store. Renders are stored beside the
 * plan data so a read does not re-render on every test.
 */
export class MemoryPlanStore implements PlanStore {
  private readonly plans = new Map<string, { plan: PlanData; html: string; progress: Progress }>()

  async list(): Promise<PlanSummary[]> {
    return [...this.plans.entries()]
      .map(([id, entry]) => summaryOf(id, entry.plan))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  async read(id: string): Promise<PlanData> {
    const entry = this.plans.get(id)
    if (!entry) throw new PlanNotFoundError(id)
    return JSON.parse(JSON.stringify(entry.plan)) as PlanData
  }

  async create(plan: PlanData): Promise<string> {
    const baseSlug = slugify(plan.meta.subject)
    let id = baseSlug
    let suffix = 2
    while (this.plans.has(id)) {
      id = `${baseSlug}-${suffix}`
      suffix += 1
    }
    this.plans.set(id, {
      plan: JSON.parse(JSON.stringify(plan)) as PlanData,
      html: '',
      progress: {},
    })
    return id
  }

  async write(id: string, plan: PlanData): Promise<void> {
    const errors = validatePlan(plan)
    if (errors.length > 0) throw new ValidationFailedError(errors)
    const entry = this.plans.get(id)
    if (!entry) throw new PlanNotFoundError(id)
    entry.plan = JSON.parse(JSON.stringify(plan)) as PlanData
    entry.html = renderPlan(plan)
  }

  async readProgress(id: string): Promise<Progress> {
    const entry = this.plans.get(id)
    if (!entry) throw new PlanNotFoundError(id)
    return JSON.parse(JSON.stringify(entry.progress)) as Progress
  }

  async writeProgress(id: string, progress: Progress): Promise<void> {
    const entry = this.plans.get(id)
    if (!entry) throw new PlanNotFoundError(id)
    entry.progress = JSON.parse(JSON.stringify(progress)) as Progress
  }

  /** Test-only seam: the rendered page the store would write for `id`. */
  htmlFor(id: string): string {
    const entry = this.plans.get(id)
    if (!entry) throw new PlanNotFoundError(id)
    return entry.html
  }
}

const defaultProgress = (): Progress => ({})

/**
 * Filesystem-backed plan store. The base directory holds one subdirectory
 * per plan, named for the plan's slug, containing:
 *
 * - `plan.json`  — the plan data
 * - `index.html` — the rendered self-contained export, rewritten on every write
 * - `progress.json` — the learner's progress, opaque to the server
 *
 * `create` allocates the directory and seeds `plan.json`; the initial index
 * page is rendered on `write` (which is also when the page first goes live,
 * since no one edits `plan.json` between `create` and `write` in the Planner).
 */
export class FilePlanStore implements PlanStore {
  private readonly baseDir: string
  private readonly fs: FileSystemAdapter

  constructor(baseDir: string, options: { fs?: FileSystemAdapter } = {}) {
    this.baseDir = baseDir
    this.fs = options.fs ?? nodeFileSystem
  }

  async list(): Promise<PlanSummary[]> {
    const entries = await this.readdirEntries(this.baseDir)
    const summaries: PlanSummary[] = []
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const planPath = join(this.baseDir, entry.name, 'plan.json')
      if (!(await this.fs.exists(planPath))) continue
      try {
        const raw = await this.fs.readFile(planPath)
        const plan = JSON.parse(raw) as PlanData
        summaries.push(summaryOf(entry.name, plan))
      } catch {
        // Skip directories whose plan.json cannot be read; the listing only
        // surfaces entries the store would be able to open.
      }
    }
    summaries.sort((a, b) => a.id.localeCompare(b.id))
    return summaries
  }

  private async readdirEntries(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    if (this.fs.readdir) return this.fs.readdir(path)
    const { readdir } = await import('node:fs/promises')
    const raw = await readdir(path, { withFileTypes: true })
    return raw.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }))
  }

  async read(id: string): Promise<PlanData> {
    const planPath = join(this.baseDir, id, 'plan.json')
    if (!(await this.fs.exists(planPath))) throw new PlanNotFoundError(id)
    const raw = await this.fs.readFile(planPath)
    return JSON.parse(raw) as PlanData
  }

  async create(plan: PlanData): Promise<string> {
    const baseSlug = slugify(plan.meta.subject)
    const planDir = await freeId(this.fs, this.baseDir, baseSlug)
    const id = planDir.split(/[\\/]/).pop()!
    await this.fs.mkdir(planDir)
    await this.fs.writeFile(join(planDir, 'plan.json'), JSON.stringify(plan, null, 2))
    return id
  }

  async write(id: string, plan: PlanData): Promise<void> {
    const errors = validatePlan(plan)
    if (errors.length > 0) throw new ValidationFailedError(errors)
    const planPath = join(this.baseDir, id, 'plan.json')
    const htmlPath = join(this.baseDir, id, 'index.html')
    if (!(await this.fs.exists(planPath))) throw new PlanNotFoundError(id)
    const html = renderPlan(plan)
    if (this.fs.writeFilesAtomically) {
      await this.fs.writeFilesAtomically([
        { path: planPath, content: JSON.stringify(plan, null, 2) },
        { path: htmlPath, content: html },
      ])
      return
    }
    await this.fs.writeFile(planPath, JSON.stringify(plan, null, 2))
    await this.fs.writeFile(htmlPath, html)
  }

  async readProgress(id: string): Promise<Progress> {
    const path = join(this.baseDir, id, 'progress.json')
    if (!(await this.fs.exists(path))) return defaultProgress()
    const raw = await this.fs.readFile(path)
    if (raw.trim() === '') return defaultProgress()
    return JSON.parse(raw) as Progress
  }

  async writeProgress(id: string, progress: Progress): Promise<void> {
    const path = join(this.baseDir, id, 'progress.json')
    await this.fs.writeFile(path, JSON.stringify(progress, null, 2))
  }

  /**
   * Test seams. Adapters that implement `TestFileSystemHooks` expose the
   * underlying reads and writes so assertions can prove the gate held. A
   * real filesystem returns `false` from `wasFileRead` and `0` from
   * `totalWrites` — the surface is meaningless against real files but
   * does not throw.
   */
  wasFileRead(path: string): boolean {
    const hooks = this.fs as FileSystemAdapter & Partial<TestFileSystemHooks>
    return hooks.wasFileRead?.(path) ?? false
  }

  totalWrites(): number {
    const hooks = this.fs as FileSystemAdapter & Partial<TestFileSystemHooks>
    return hooks.totalWrites?.() ?? 0
  }

  lastReadFile(path: string): string {
    const hooks = this.fs as FileSystemAdapter & Partial<TestFileSystemHooks>
    if (hooks.lastReadFile) return hooks.lastReadFile(path)
    return ''
  }
}

/**
 * The Node-default adapter. `generatePlan` uses a slightly different one
 * (it does not implement `writeFilesAtomically`), so we keep a dedicated
 * copy that exposes the test hooks only when wired to one.
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
  mkdir: async (path) => {
    await mkdir(path, { recursive: true })
  },
  writeFile: async (path, content) => {
    await writeFile(path, content, 'utf8')
  },
  readFile: async (path) => readFile(path, 'utf8'),
}
