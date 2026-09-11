import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import type { PlanData } from '../src/plan-types'
import { generatePlan, ValidationFailedError, type FileSystemAdapter } from '../src/generate'
import type { FetchLike, ReplacementCandidate } from '../src/verification'
import { fixturePlan } from './fixtures/plan-fixture'
import { nicheFixturePlan } from './fixtures/niche-plan-fixture'

class MemoryFileSystem implements FileSystemAdapter {
  files = new Map<string, string>()
  createdDirs: Array<string> = []

  async exists(path: string): Promise<boolean> {
    return this.createdDirs.includes(path)
  }

  async mkdir(path: string): Promise<void> {
    this.createdDirs.push(path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  read(path: string): string {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`No file at ${path}`)
    return content
  }
}

const okResponse = (text = 'placeholder body') => ({ ok: true, status: 200, text: async () => text })
const fetchImpl: FetchLike = async () => okResponse()
const noReplacement: () => Promise<ReplacementCandidate | null> = async () => null
const fixedClock = () => '2026-02-01T00:00:00.000Z'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

/** Assert a path ends with the given segments, whichever separator the platform used. */
function expectPathEndsWith(actual: string, ...segments: string[]): void {
  expect(actual.split(/[\\/]/).slice(-segments.length)).toEqual(segments)
}

describe('generatePlan', () => {
  it('writes the plan and the rendered page into a directory named for the subject', async () => {
    const fs = new MemoryFileSystem()
    const result = await generatePlan(fixturePlan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs,
    })

    expectPathEndsWith(result.planDir, 'python-programming')
    expectPathEndsWith(result.planPath, 'python-programming', 'plan.json')
    expectPathEndsWith(result.htmlPath, 'python-programming', 'index.html')
    expect(fs.createdDirs.some((d) => d.endsWith('python-programming'))).toBe(true)
    expect(fs.files.has(result.planPath)).toBe(true)
    expect(fs.files.has(result.htmlPath)).toBe(true)
  })

  it('derives different directory names from different subjects so plans accumulate without collision', async () => {
    const a = await generatePlan(fixturePlan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs: new MemoryFileSystem(),
    })
    const otherPlan = clonePlan(fixturePlan)
    otherPlan.meta.subject = 'Rust Programming'
    const b = await generatePlan(otherPlan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs: new MemoryFileSystem(),
    })

    expect(a.planDir).not.toBe(b.planDir)
    expectPathEndsWith(a.planDir, 'python-programming')
    expectPathEndsWith(b.planDir, 'rust-programming')
  })

  it('writes a second plan for the same subject beside the first instead of overwriting it', async () => {
    const fs = new MemoryFileSystem()
    const opts = { fetch: fetchImpl, searchReplacement: noReplacement, now: fixedClock, fs }

    const first = await generatePlan(fixturePlan, '/plans', opts)
    const second = await generatePlan(fixturePlan, '/plans', opts)
    const third = await generatePlan(fixturePlan, '/plans', opts)

    expectPathEndsWith(first.planDir, 'python-programming')
    expectPathEndsWith(second.planDir, 'python-programming-2')
    expectPathEndsWith(third.planDir, 'python-programming-3')

    // The first plan's files survive the later runs untouched.
    expect(fs.files.has(first.planPath)).toBe(true)
    expect(fs.files.has(second.planPath)).toBe(true)
    expect(first.planPath).not.toBe(second.planPath)
  })

  it('writes plan.json containing the (verified) plan data, not HTML', async () => {
    const fs = new MemoryFileSystem()
    const result = await generatePlan(fixturePlan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs,
    })

    const planJson = fs.read(result.planPath)
    const parsed = JSON.parse(planJson) as PlanData
    expect(parsed.meta.subject).toBe(fixturePlan.meta.subject)
    expect(parsed.sessions.length).toBe(14)
    expect(parsed.sessions[5].consolidation).toBe(true)
    expect(parsed.sessions[10].consolidation).toBe(true)
    expect(parsed.sessions[0].materials[0].verification).toBeTruthy()
    expect(planJson).not.toContain('<!DOCTYPE html>')
    expect(planJson).not.toContain('<html')
  })

  it('writes index.html that is a complete, self-contained HTML page rendering all 14 sessions', async () => {
    const fs = new MemoryFileSystem()
    const result = await generatePlan(fixturePlan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs,
    })

    const html = fs.read(result.htmlPath)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script[^>]*\bsrc\s*=/i)

    const doc = new JSDOM(html).window.document
    const sessionNumbers = Array.from(doc.querySelectorAll('.session')).map((el) =>
      Number(el.getAttribute('data-session'))
    )
    expect(sessionNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])

    const consolidationNumbers = Array.from(
      doc.querySelectorAll('.session[data-consolidation="true"]')
    ).map((el) => Number(el.getAttribute('data-session')))
    expect(consolidationNumbers.sort((a, b) => a - b)).toEqual([6, 11])
  })

  it('runs verification against every URL before writing and records the outcomes', async () => {
    const seenUrls: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      seenUrls.push(url)
      return okResponse()
    }

    const result = await generatePlan(fixturePlan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs: new MemoryFileSystem(),
    })

    const expectedUrls = fixturePlan.sessions.flatMap((s) => s.materials.map((m) => m.url))
    expectedUrls.push(fixturePlan.phases[0].outlierStory!.citation)
    expect(seenUrls.sort()).toEqual(expectedUrls.sort())
    expect(result.report.outcomes.length).toBe(expectedUrls.length)
    const validStatuses = new Set([
      'verified-by-status',
      'verified-by-content',
      'replaced-after-failure',
      'unresolved-after-retries',
    ])
    expect(result.report.outcomes.every((o) => validStatuses.has(o.status))).toBe(true)
  })

  it('refuses to write any file when validation fails and surfaces every error', async () => {
    const fs = new MemoryFileSystem()
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    delete plan.meta.subject
    plan.sessions = plan.sessions.slice(0, 13)

    await expect(
      generatePlan(plan, '/plans', {
        fetch: fetchImpl,
        searchReplacement: noReplacement,
        now: fixedClock,
        fs,
      })
    ).rejects.toThrow(ValidationFailedError)

    try {
      await generatePlan(plan, '/plans', {
        fetch: fetchImpl,
        searchReplacement: noReplacement,
        now: fixedClock,
        fs,
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationFailedError)
      const validationErr = err as ValidationFailedError
      expect(validationErr.errors).toContain('meta.subject is required')
      expect(
        validationErr.errors.some((e) => e.includes('exactly 14 sessions'))
      ).toBe(true)
    }

    expect(fs.files.size).toBe(0)
    expect(fs.createdDirs.length).toBe(0)
  })

  it('returns the verified plan in its result so a caller can inspect verification outcomes', async () => {
    const fs = new MemoryFileSystem()
    const result = await generatePlan(fixturePlan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs,
    })

    expect(result.plan.sessions.length).toBe(14)
    expect(result.plan.meta.subject).toBe(fixturePlan.meta.subject)
    for (const session of result.plan.sessions) {
      for (const material of session.materials) {
        expect(material.verification).toBeTruthy()
      }
    }
  })

  it('does not mutate the plan it is given', async () => {
    const fs = new MemoryFileSystem()
    const plan = clonePlan(fixturePlan)
    const before = JSON.stringify(plan)
    await generatePlan(plan, '/plans', {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs,
    })
    expect(JSON.stringify(plan)).toBe(before)
  })
})

describe('end-to-end demo: a well-served subject produces a usable site', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'study-plan-demo-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  // The demo runs against the real filesystem with the default adapter: the
  // point of the demo is that a plan directory a learner can open actually
  // lands on disk, which an in-memory adapter cannot show.
  it('Python (well-served by docs.python.org) writes a usable plan directory to disk', async () => {
    const result = await generatePlan(fixturePlan, baseDir, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    expectPathEndsWith(result.planDir, 'python-programming')

    const written = JSON.parse(await readFile(result.planPath, 'utf8')) as PlanData

    // Demo: durable-tier only. Python's docs.python.org is the canonical
    // preferred-tier source; this run should not have discovered any
    // off-list fallbacks.
    for (const session of written.sessions) {
      for (const material of session.materials) {
        expect(material.sourceType).toBe('preferred')
      }
    }

    // Demo: every session completable with free materials alone, and its
    // materials fit the budget it claims.
    for (const session of written.sessions) {
      expect(session.materials.some((m) => !m.paid)).toBe(true)
      const materialMinutes = session.materials.reduce((t, m) => t + m.estimatedDuration, 0)
      expect(materialMinutes).toBeLessThanOrEqual(session.estimatedTime)
      expect(session.estimatedTime).toBeLessThanOrEqual(written.meta.hoursPerDay * 60)
    }

    // Demo: CAFE — the highest-frequency units recur across the sprint.
    const sessionsPerUnit = new Map<string, number>()
    for (const session of written.sessions) {
      for (const unit of new Set(session.highFrequencyUnits)) {
        sessionsPerUnit.set(unit, (sessionsPerUnit.get(unit) ?? 0) + 1)
      }
    }
    expect(Math.max(...sessionsPerUnit.values())).toBeGreaterThanOrEqual(3)

    // Demo: consolidation slots at 6 and 11, identifiable as such.
    expect(written.sessions[5].consolidation).toBe(true)
    expect(written.sessions[10].consolidation).toBe(true)
    expect(written.sessions[0].consolidation).toBeFalsy()

    // Demo: the page read back off disk is genuinely usable — all 14
    // sessions in order, click-to-expand, no network reference at view time.
    const html = await readFile(result.htmlPath, 'utf8')
    expect(html).not.toMatch(/<link/i)
    expect(html).not.toMatch(/<script[^>]*src\s*=/i)
    const doc = new JSDOM(html, { runScripts: 'dangerously' }).window.document
    const rows = Array.from(doc.querySelectorAll('.session'))
    expect(rows.length).toBe(14)
    rows[1].querySelector('.session-summary')!.dispatchEvent(
      new (doc.defaultView as { MouseEvent: typeof MouseEvent }).MouseEvent('click')
    )
    const detail = rows[1].querySelector('.session-detail') as HTMLElement
    expect(detail.hidden).toBe(false)
  })

  it('a second run for the same subject lands beside the first on disk', async () => {
    const opts = { fetch: fetchImpl, searchReplacement: noReplacement, now: fixedClock }
    const first = await generatePlan(fixturePlan, baseDir, opts)
    const second = await generatePlan(fixturePlan, baseDir, opts)

    expectPathEndsWith(first.planDir, 'python-programming')
    expectPathEndsWith(second.planDir, 'python-programming-2')
    await expect(readFile(first.planPath, 'utf8')).resolves.toContain('"subject"')
    await expect(readFile(second.planPath, 'utf8')).resolves.toContain('"subject"')
  })

  // Issue 05 demo: a subject the durable tier cannot fully serve (no MIT
  // course on competitive barbecue). Under ticket 04 this plan would have
  // been refused at validation because every BBQ-specific material was
  // off-list. Under this ticket it lands on disk as a full, verified plan.
  it('Competition Barbecue (niche, mostly off-list) writes a usable plan directory to disk', async () => {
    const result = await generatePlan(nicheFixturePlan, baseDir, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    expectPathEndsWith(result.planDir, 'competition-barbecue-smoking')

    const written = JSON.parse(await readFile(result.planPath, 'utf8')) as PlanData

    // Demo: the niche subject is genuinely covered by off-list sources — the
    // ticket-04 gate would have rejected the same plan for sourceType. This
    // is the "thin or warning-marked before" half of the ticket's contrast:
    // the plan data could not have shipped under ticket 04.
    const sourceTypes = new Set(written.sessions.flatMap((s) => s.materials.map((m) => m.sourceType)))
    expect(sourceTypes.has('off-list')).toBe(true)

    // Demo: every session still completable from free materials alone, and
    // every paid item is recorded (here: zero, but the invariant holds).
    const paid = written.sessions.flatMap((s) => s.materials).filter((m) => m.paid)
    expect(paid.length).toBeLessThanOrEqual(1)
    for (const session of written.sessions) {
      expect(session.materials.some((m) => !m.paid)).toBe(true)
    }

    // Demo: the page read back off disk is genuinely usable — all 14
    // sessions in order, no network reference at view time.
    const html = await readFile(result.htmlPath, 'utf8')
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script[^>]*\bsrc\s*=/i)
    const doc = new JSDOM(html).window.document
    const sessionNumbers = Array.from(doc.querySelectorAll('.session')).map((el) =>
      Number(el.getAttribute('data-session'))
    )
    expect(sessionNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })
})
