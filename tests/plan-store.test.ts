import { describe, expect, it } from 'vitest'
import type { FileSystemAdapter } from '../src/app/plan-store'
import type { PlanData } from '../src/plan-types'
import { fixturePlan } from './fixtures/plan-fixture'
import { FilePlanStore, MemoryPlanStore, PlanNotFoundError } from '../src/app/plan-store'

/** Normalize a path to forward slashes so the in-memory fs is platform-neutral. */
function norm(p: string): string {
  return p.replace(/\\/g, '/')
}

function posixJoin(...parts: string[]): string {
  return norm(parts.join('/')).replace(/\/+/g, '/')
}

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

class InMemoryFileSystem implements FileSystemAdapter {
  files = new Map<string, string>()
  createdDirs: string[] = []
  readLog: string[] = []
  writeLog: string[] = []

  async exists(path: string): Promise<boolean> {
    const n = norm(path)
    return this.createdDirs.includes(n) || this.files.has(n)
  }

  async mkdir(path: string): Promise<void> {
    this.createdDirs.push(norm(path))
  }

  async writeFile(path: string, content: string): Promise<void> {
    const n = norm(path)
    this.writeLog.push(n)
    this.files.set(n, content)
  }

  async readFile(path: string): Promise<string> {
    const n = norm(path)
    this.readLog.push(n)
    const content = this.files.get(n)
    if (content === undefined) throw new Error(`No file at ${path}`)
    return content
  }

  async readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>> {
    const n = norm(path)
    const prefix = n + '/'
    const children = new Set<string>()
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue
      const tail = key.slice(prefix.length)
      if (!tail.includes('/')) continue
      children.add(tail.split('/')[0])
    }
    for (const dir of this.createdDirs) {
      if (!dir.startsWith(prefix)) continue
      const tail = dir.slice(prefix.length)
      if (!tail.includes('/')) continue
      children.add(tail.split('/')[0])
    }
    return [...children]
      .sort()
      .map((name) => {
        const childPath = `${n}/${name}`
        return { name, isDirectory: this.createdDirs.includes(childPath) }
      })
  }

  wasFileRead(path: string): boolean {
    return this.readLog.includes(norm(path))
  }

  totalWrites(): number {
    return this.writeLog.length
  }

  lastReadFile(path: string): string {
    return this.files.get(norm(path)) ?? ''
  }
}

describe('MemoryPlanStore', () => {
  it('lists the plans that have been created, with their subject and sessions count', async () => {
    const store = new MemoryPlanStore()
    const plan = clonePlan(fixturePlan)
    plan.meta.subject = 'Memory Listing Subject'
    const id = await store.create(plan)
    expect(id).toBe('memory-listing-subject')

    const summaries = await store.list()
    expect(summaries).toHaveLength(1)
    expect(summaries[0].id).toBe('memory-listing-subject')
    expect(summaries[0].subject).toBe('Memory Listing Subject')
    expect(summaries[0].sessionsCount).toBe(14)
    expect(summaries[0].generatedAt).toBe(plan.meta.generatedAt)
  })

  it('suffixes the id with -2 when the slug already exists, so regeneration never destroys progress', async () => {
    const store = new MemoryPlanStore()
    const a = clonePlan(fixturePlan)
    a.meta.subject = 'Python Programming'
    const idA = await store.create(a)
    expect(idA).toBe('python-programming')

    const b = clonePlan(fixturePlan)
    b.meta.subject = 'Python Programming'
    const idB = await store.create(b)
    expect(idB).toBe('python-programming-2')
  })

  it('reads back a created plan as deep-equal JSON', async () => {
    const store = new MemoryPlanStore()
    const plan = clonePlan(fixturePlan)
    plan.meta.subject = 'Read Back Plan'
    const id = await store.create(plan)
    const read = await store.read(id)
    expect(read).toEqual(plan)
  })

  it('throws PlanNotFoundError when reading a non-existent id', async () => {
    const store = new MemoryPlanStore()
    await expect(store.read('nope')).rejects.toBeInstanceOf(PlanNotFoundError)
  })

  it('write replaces the plan and renders the index.html so the on-disk page always matches plan.json', async () => {
    const store = new MemoryPlanStore()
    const plan = clonePlan(fixturePlan)
    plan.meta.subject = 'Write Renders Subject'
    const id = await store.create(plan)
    const next = clonePlan(fixturePlan)
    next.meta.subject = 'Write Renders Subject'
    next.sessions[0].title = 'Rewritten session 1'
    await store.write(id, next)
    const read = await store.read(id)
    expect(read.sessions[0].title).toBe('Rewritten session 1')
    expect(store.htmlFor(id)).toContain('Rewritten session 1')
  })

  it('readProgress returns {} when no progress has been written, and writeProgress persists a round-trip', async () => {
    const store = new MemoryPlanStore()
    const plan = clonePlan(fixturePlan)
    plan.meta.subject = 'Progress Memory Subject'
    const id = await store.create(plan)
    expect(await store.readProgress(id)).toEqual({})
    await store.writeProgress(id, { checkboxes: { '1': true }, notes: { '1': 'started' } })
    expect(await store.readProgress(id)).toEqual({ checkboxes: { '1': true }, notes: { '1': 'started' } })
  })
})

describe('FilePlanStore', () => {
  it('create allocates the slug-named directory and writes plan.json only (index.html is written by write)', async () => {
    const fs = new InMemoryFileSystem()
    const store = new FilePlanStore('/plans', { fs })
    const plan = clonePlan(fixturePlan)
    const id = await store.create(plan)
    expect(id).toBe('python-programming')

    const planPath = posixJoin('/plans', 'python-programming', 'plan.json')
    const htmlPath = posixJoin('/plans', 'python-programming', 'index.html')
    const planJson = JSON.parse(fs.files.get(planPath)!) as PlanData
    expect(planJson.meta.subject).toBe('Python Programming')
    // index.html is not written by create; only plan.json is.
    expect(fs.files.has(htmlPath)).toBe(false)
  })

  it('lists a directory holding only plan.json + index.html (the existing plan\'s shape)', async () => {
    const fs = new InMemoryFileSystem()
    const store = new FilePlanStore('/plans', { fs })
    const plan = clonePlan(fixturePlan)
    await store.create(plan)
    await store.write('python-programming', plan)
    const summaries = await store.list()
    expect(summaries).toHaveLength(1)
    expect(summaries[0].id).toBe('python-programming')
  })

  it('write renders index.html so it always matches plan.json', async () => {
    const fs = new InMemoryFileSystem()
    const store = new FilePlanStore('/plans', { fs })
    const plan = clonePlan(fixturePlan)
    await store.create(plan)
    const next = clonePlan(fixturePlan)
    next.sessions[0].title = 'Post-write title'
    await store.write('python-programming', next)
    const htmlPath = posixJoin('/plans', 'python-programming', 'index.html')
    const html = fs.files.get(htmlPath)!
    expect(html).toContain('Post-write title')
  })

  it('write throws ValidationFailedError and leaves both files untouched when the plan is invalid', async () => {
    const fs = new InMemoryFileSystem()
    const store = new FilePlanStore('/plans', { fs })
    const plan = clonePlan(fixturePlan)
    await store.create(plan)
    await store.write('python-programming', plan)

    const planPath = posixJoin('/plans', 'python-programming', 'plan.json')
    const htmlPath = posixJoin('/plans', 'python-programming', 'index.html')
    const originalPlan = fs.files.get(planPath)!
    const originalHtml = fs.files.get(htmlPath)!
    const totalWrites = fs.writeLog.length

    const next = clonePlan(fixturePlan)
    // Knock `subject` to an empty string so validatePlan fails.
    next.meta.subject = ''

    await expect(store.write('python-programming', next)).rejects.toThrow(/validation/i)
    expect(fs.files.get(planPath)).toBe(originalPlan)
    expect(fs.files.get(htmlPath)).toBe(originalHtml)
    // No extra writes happened (the write gate rejected before any flush).
    expect(fs.writeLog.length).toBe(totalWrites)
  })

  it('readProgress returns {} when no progress file exists; writeProgress persists it as JSON', async () => {
    const fs = new InMemoryFileSystem()
    const store = new FilePlanStore('/plans', { fs })
    const plan = clonePlan(fixturePlan)
    await store.create(plan)
    expect(await store.readProgress('python-programming')).toEqual({})
    await store.writeProgress('python-programming', { checkboxes: { '1': true } })
    expect(await store.readProgress('python-programming')).toEqual({ checkboxes: { '1': true } })
  })
})
