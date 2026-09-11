import { JSDOM } from 'jsdom'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlanData, Session } from '../src/plan-types'
import { type FileSystemAdapter, ValidationFailedError, generatePlan } from '../src/generate'
import { redoSession, reverifyPlanDir } from '../src/maintenance'
import type { FetchLike, ReplacementCandidate } from '../src/verification'
import { fixturePlan } from './fixtures/plan-fixture'

class MemoryFileSystem implements FileSystemAdapter {
  files = new Map<string, string>()
  createdDirs: string[] = []
  failOnWrite: string | null = null

  async exists(path: string): Promise<boolean> {
    return this.createdDirs.includes(path) || this.files.has(path)
  }

  async mkdir(path: string): Promise<void> {
    this.createdDirs.push(path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    if (this.failOnWrite !== null && path.endsWith(this.failOnWrite)) {
      throw new Error(`Simulated write failure for ${path}`)
    }
    this.files.set(path, content)
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`No file at ${path}`)
    return content
  }

  read(path: string): string {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`No file at ${path}`)
    return content
  }
}

const okResponse = (text = 'placeholder body') => ({ ok: true, status: 200, text: async () => text })
const notFoundResponse = () => ({ ok: false, status: 404, text: async () => '' })
const baseFetch: FetchLike = async () => okResponse()
const noReplacement: () => Promise<ReplacementCandidate | null> = async () => null
const fixedClock = () => '2026-02-01T00:00:00.000Z'
const laterClock = () => '2026-02-15T12:00:00.000Z'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

/** Assert a path ends with the given segments, whichever separator the platform used. */
function expectPathEndsWith(actual: string, ...segments: string[]): void {
  expect(actual.split(/[\\/]/).slice(-segments.length)).toEqual(segments)
}

async function seedPlanDir(planDir: string, plan: PlanData, fs: MemoryFileSystem): Promise<void> {
  await fs.mkdir(planDir)
  await fs.writeFile(join(planDir, 'plan.json'), JSON.stringify(plan, null, 2))
  await fs.writeFile(join(planDir, 'index.html'), '<!DOCTYPE html><html><body>seeded</body></html>')
}

describe('reverifyPlanDir', () => {
  it('reads plan.json, re-verifies every material URL, refreshes timestamps, and rewrites both files in place', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    const seenUrls: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      seenUrls.push(url)
      return okResponse()
    }

    const result = await reverifyPlanDir(planDir, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: laterClock,
      fs,
    })

    expectPathEndsWith(result.planDir, 'python-programming')
    expectPathEndsWith(result.planPath, 'python-programming', 'plan.json')
    expectPathEndsWith(result.htmlPath, 'python-programming', 'index.html')
    expect(result.planDir).toBe(planDir)
    // The expected URL count: one per material plus one outlier-story citation.
    const expectedUrls = fixturePlan.sessions.flatMap((s) => s.materials.map((m) => m.url))
    expectedUrls.push(fixturePlan.phases[0].outlierStory!.citation)
    expect(seenUrls.sort()).toEqual(expectedUrls.sort())
    // The two existing files were rewritten in place — no other files appeared.
    expect(fs.files.has(join(planDir, 'plan.json'))).toBe(true)
    expect(fs.files.has(join(planDir, 'index.html'))).toBe(true)
    expect(fs.files.size).toBe(2)
    expect(fs.createdDirs).toEqual([planDir])

    // Timestamps refreshed to the later clock value.
    const planJson = fs.read(result.planPath)
    expect(planJson).toContain(laterClock())
  })

  it('keeps an unresolved material in plan.json with its original title and URL and shows the warning in the rendered session', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    // Force one material to fail verification by making its URL the dead one.
    // Title and URL are taken from the plan data we just seeded so we can
    // confirm they survive in the rewritten file unchanged.
    const target = plan.sessions[0].materials[0]
    const originalTitle = target.title
    const originalUrl = target.url
    const deadUrl = 'https://example.com/dead'
    target.url = deadUrl

    await seedPlanDir(planDir, plan, fs)

    const fetchImpl: FetchLike = async (url) => {
      if (url === deadUrl) return notFoundResponse()
      return okResponse()
    }
    const searchReplacement: () => Promise<ReplacementCandidate | null> = async () => null

    const result = await reverifyPlanDir(planDir, {
      fetch: fetchImpl,
      searchReplacement,
      anchorUrls: [],
      now: laterClock,
      fs,
    })

    // The plan data still carries the unresolved material with the same title
    // and URL the plan went in with — visibility of rot, not silent deletion.
    const written = JSON.parse(fs.read(result.planPath)) as PlanData
    const slot = written.sessions[0].materials[0]
    expect(slot.title).toBe(originalTitle)
    expect(slot.url).toBe(deadUrl)
    expect(slot.verification.status).toBe('unresolved-after-retries')
    expect(slot.verification.checkedAt).toBeNull()
    // Other fields on the slot are unchanged too.
    expect(slot.sourceType).toBe(target.sourceType)
    expect(slot.estimatedDuration).toBe(target.estimatedDuration)

    // The rendered page carries the warning tag on session 1 only.
    const html = fs.read(result.htmlPath)
    const doc = new JSDOM(html).window.document
    const session1 = doc.querySelector('.session[data-session="1"]')!
    expect(session1.querySelector('.session-warning')).not.toBeNull()
    expect(doc.querySelectorAll('.session-warning')).toHaveLength(1)
    // The unresolved URL is still surfaced on the page as a link, not hidden.
    expect(html).toContain(deadUrl)
  })

  it('changes only verification records and timestamps when re-verifying a healthy plan', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    // Stale timestamps to be replaced by fixedClock() in the next run.
    for (const session of plan.sessions) {
      for (const material of session.materials) {
        material.verification = { status: 'verified-by-status', checkedAt: '2026-01-01T00:00:00.000Z' }
      }
    }
    await seedPlanDir(planDir, plan, fs)

    const result = await reverifyPlanDir(planDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      anchorUrls: [],
      now: fixedClock,
      fs,
    })

    const written = JSON.parse(fs.read(result.planPath)) as PlanData
    // Subject, meta, scope note, DISSS preamble, stakes, and session content
    // other than verification are unchanged. Phases are compared excluding
    // outlier-story verification, which verifyPlan populates fresh.
    expect(written.meta).toEqual(plan.meta)
    expect(written.scopeNote).toBe(plan.scopeNote)
    expect(written.disssPreamble).toEqual(plan.disssPreamble)
    expect(written.stakes).toBe(plan.stakes)
    const phasesProjection = (phases: typeof written.phases) =>
      phases.map((p) => ({
        title: p.title,
        sessions: p.sessions,
        outlierStory: p.outlierStory
          ? { person: p.outlierStory.person, approach: p.outlierStory.approach, principle: p.outlierStory.principle, citation: p.outlierStory.citation }
          : undefined,
      }))
    expect(phasesProjection(written.phases)).toEqual(phasesProjection(plan.phases))
    // Compare each session's non-verification content. Materials' titles, URLs,
    // source types, durations, paid flags, and prices are untouched.
    expect(written.sessions.map((s) => ({ number: s.number, title: s.title, artifactOneLiner: s.artifactOneLiner, selfCheck: s.selfCheck, estimatedTime: s.estimatedTime, highFrequencyUnits: s.highFrequencyUnits, encodingHook: s.encodingHook, consolidation: s.consolidation, materials: s.materials.map((m) => ({ title: m.title, url: m.url, sourceType: m.sourceType, estimatedDuration: m.estimatedDuration, paid: m.paid, price: m.price })) })))
      .toEqual(plan.sessions.map((s) => ({ number: s.number, title: s.title, artifactOneLiner: s.artifactOneLiner, selfCheck: s.selfCheck, estimatedTime: s.estimatedTime, highFrequencyUnits: s.highFrequencyUnits, encodingHook: s.encodingHook, consolidation: s.consolidation, materials: s.materials.map((m) => ({ title: m.title, url: m.url, sourceType: m.sourceType, estimatedDuration: m.estimatedDuration, paid: m.paid, price: m.price })) })))
    // Verification records refreshed: every material now carries the new timestamp.
    for (const session of result.plan.sessions) {
      for (const material of session.materials) {
        expect(material.verification.checkedAt).toBe(fixedClock())
      }
    }
  })

  it('rejects invalid input before any fetch and before either file is written', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    // @ts-expect-error deliberately malformed for the test
    delete plan.meta.subject
    await seedPlanDir(planDir, plan, fs)
    const originalPlanJson = fs.read(join(planDir, 'plan.json'))
    const originalHtml = fs.read(join(planDir, 'index.html'))
    const writeKeysBefore = new Set(fs.files.keys())

    let fetchCalls = 0
    const fetchImpl: FetchLike = async () => {
      fetchCalls += 1
      return okResponse()
    }

    await expect(
      reverifyPlanDir(planDir, {
        fetch: fetchImpl,
        searchReplacement: noReplacement,
        now: fixedClock,
        fs,
      })
    ).rejects.toBeInstanceOf(ValidationFailedError)

    expect(fetchCalls).toBe(0)
    expect(fs.read(join(planDir, 'plan.json'))).toBe(originalPlanJson)
    expect(fs.read(join(planDir, 'index.html'))).toBe(originalHtml)
    expect(new Set(fs.files.keys())).toEqual(writeKeysBefore)
  })

  it('does not mutate the plan.json it was given', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    const originalJson = fs.read(join(planDir, 'plan.json'))
    const before = JSON.stringify(plan)

    await reverifyPlanDir(planDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs,
    })

    expect(JSON.stringify(plan)).toBe(before)
    // The on-disk file is refreshed, but the original pre-write content is not
    // what the in-memory `plan` variable referred to — we just need to ensure
    // we never silently edited the caller's object.
    expect(originalJson).toContain(fixturePlan.meta.subject)
  })

  it('refuses to take a directory without plan.json', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/empty-dir'
    await fs.mkdir(planDir)

    await expect(
      reverifyPlanDir(planDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
        fs,
      })
    ).rejects.toThrow(/plan\.json/)
  })

  it('preserves the directory name rather than suffixing -2', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    await seedPlanDir(planDir, clonePlan(fixturePlan), fs)

    const result = await reverifyPlanDir(planDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
      fs,
    })

    expect(result.planDir).toBe(planDir)
    expectPathEndsWith(result.planDir, 'python-programming')
    // No neighbouring directory was created.
    expect(fs.createdDirs).toEqual([planDir])
  })

  it('surfaces a second-write failure and does not silently leave a half-rewritten plan directory', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    // The seam writes plan.json first, then index.html. Make the second
    // write fail so we can confirm the error propagates and no neighbouring
    // directory is allocated.
    fs.failOnWrite = 'index.html'

    await expect(
      reverifyPlanDir(planDir, {
        fetch: baseFetch,
        searchReplacement: noReplacement,
        now: fixedClock,
        fs,
      })
    ).rejects.toThrow(/index\.html/)
    // The spec accepts a half-rewritten directory so long as the error is
    // surfaced and no replacement directory is created. The important
    // guarantee is that no -2 / replacement directory was created.
    expect(fs.files.size).toBe(2)
    expect(fs.createdDirs).toEqual([planDir])
  })

  it('keeps an outlier story whose citation has rotted, with the citation link visible on the page', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    const deadCitation = 'https://example.com/dead-citation'
    const originalStory = plan.phases[0].outlierStory!
    originalStory.citation = deadCitation
    await seedPlanDir(planDir, plan, fs)

    const fetchImpl: FetchLike = async (url) => {
      if (url === deadCitation) return notFoundResponse()
      return okResponse()
    }
    const searchReplacement: () => Promise<ReplacementCandidate | null> = async () => null

    const result = await reverifyPlanDir(planDir, {
      fetch: fetchImpl,
      searchReplacement,
      anchorUrls: [],
      now: fixedClock,
      fs,
    })

    const written = JSON.parse(fs.read(result.planPath)) as PlanData
    const keptStory = written.phases[0].outlierStory
    expect(keptStory).toBeDefined()
    expect(keptStory?.person).toBe(originalStory.person)
    expect(keptStory?.approach).toBe(originalStory.approach)
    expect(keptStory?.principle).toBe(originalStory.principle)
    expect(keptStory?.citation).toBe(deadCitation)
    // The story's citation is recorded as unresolved so the page can warn.
    expect(keptStory?.verification?.status).toBe('unresolved-after-retries')

    // The page surfaces both the story and a visible warning next to the
    // broken citation, so rot is announced rather than papered over.
    const html = fs.read(result.htmlPath)
    expect(html).toContain(deadCitation)
    expect(html).toContain(originalStory.person)
    const doc = new JSDOM(html).window.document
    const story = doc.querySelector('.outlier-story')
    expect(story).not.toBeNull()
    const warning = story?.querySelector('.outlier-story-warning')
    expect(warning?.textContent ?? '').toMatch(/unverified|unresolved|citation/i)
  })
})

describe('end-to-end demo: re-verification updates an on-disk plan directory in place', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'study-plan-verify-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  // The end-to-end demo runs against the real filesystem with the default
  // adapter: its purpose is to confirm that re-verification lands back in the
  // same directory the generator chose, with both files updated. An
  // in-memory adapter cannot show directory layout.
  it('the directory chosen by the generator is updated, not renamed, when re-verified', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const planDir = generated.planDir
    const planPath = generated.planPath
    const htmlPath = generated.htmlPath
    const planPathBefore = await readFile(planPath, 'utf8')

    const result = await reverifyPlanDir(planDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: laterClock,
    })

    expect(result.planDir).toBe(planDir)
    // The directory name is unchanged.
    expect(join(baseDir, planDir.split(/[\\/]/).pop()!)).toBe(planDir)
    // Both files exist on disk under the original names.
    await expect(readFile(planPath, 'utf8')).resolves.toBeDefined()
    await expect(readFile(htmlPath, 'utf8')).resolves.toBeDefined()
    // The verification timestamps refreshed.
    const planPathAfter = await readFile(planPath, 'utf8')
    expect(planPathAfter).not.toBe(planPathBefore)
    expect(planPathAfter).toContain(laterClock())
  })
})

/**
 * Build a session whose data differs from the fixture's session 3 in every
 * field the redo is allowed to change. Materials carry `verification`
 * placeholders that the seam must overwrite, never preserve.
 */
function replacementSession3(): Session {
  return {
    number: 3,
    title: 'Functions and Modules — revised',
    artifactOneLiner: 'Build a callable library module from scratch',
    materials: [
      {
        title: 'Real Python - Modules and Packages',
        url: 'https://realpython.com/python-modules-packages/',
        sourceType: 'preferred',
        estimatedDuration: 30,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: '2025-01-01T00:00:00.000Z' },
      },
      {
        title: 'Python Modules and Packages - Imports',
        url: 'https://docs.python.org/3/tutorial/modules.html',
        sourceType: 'preferred',
        estimatedDuration: 20,
        paid: false,
        verification: { status: 'verified-by-content', checkedAt: '2025-01-01T00:00:00.000Z' },
      },
    ],
    selfCheck: 'Can I structure a project as importable modules under a package?',
    estimatedTime: 60,
    highFrequencyUnits: ['module structure', 'packaging'],
    encodingHook: 'A package is a directory with an __init__.py; a module is a file in it.',
  }
}

describe('redoSession', () => {
  it('replaces only the targeted session, leaves every other plan field equal after JSON parsing', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    const originalJson = fs.read(join(planDir, 'plan.json'))

    const replacement = replacementSession3()
    const result = await redoSession(planDir, 3, replacement, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: laterClock,
      fs,
    })

    const written = JSON.parse(fs.read(result.planPath)) as PlanData

    // The directory was reused, not suffixed.
    expect(result.planDir).toBe(planDir)
    expectPathEndsWith(result.planDir, 'python-programming')
    expect(result.htmlPath).toBe(join(planDir, 'index.html'))

    // Session 3 carries the replacement's data, with verification timestamps
    // refreshed by the verification step.
    const newSession3 = written.sessions.find((s) => s.number === 3)!
    expect(newSession3.title).toBe(replacement.title)
    expect(newSession3.artifactOneLiner).toBe(replacement.artifactOneLiner)
    expect(newSession3.selfCheck).toBe(replacement.selfCheck)
    expect(newSession3.estimatedTime).toBe(replacement.estimatedTime)
    expect(newSession3.highFrequencyUnits).toEqual(replacement.highFrequencyUnits)
    expect(newSession3.encodingHook).toBe(replacement.encodingHook)
    expect(newSession3.consolidation).toBe(replacement.consolidation)
    expect(newSession3.materials).toHaveLength(replacement.materials.length)
    for (const material of newSession3.materials) {
      expect(material.verification.checkedAt).toBe(laterClock())
    }

    // Every other session's parsed data is exactly what we seeded: equal
    // objects, unchanged verification timestamps.
    const expectedSessions = clonePlan(plan).sessions.map((session) =>
      session.number === 3 ? newSession3 : session
    )
    expect(written.sessions).toEqual(expectedSessions)

    // Top-level plan fields are equal after JSON parsing. The whole point of
    // single-session redo is that nothing else shifts.
    const projection = (p: PlanData) => ({
      meta: p.meta,
      scopeNote: p.scopeNote,
      disssPreamble: p.disssPreamble,
      stakes: p.stakes,
      phases: p.phases.map((phase) => ({
        title: phase.title,
        sessions: phase.sessions,
        outlierStory: phase.outlierStory
          ? { person: phase.outlierStory.person, approach: phase.outlierStory.approach, principle: phase.outlierStory.principle, citation: phase.outlierStory.citation }
          : undefined,
      })),
    })
    expect(projection(written)).toEqual(projection(plan))

    // The on-disk plan.json was rewritten.
    expect(fs.read(result.planPath)).not.toBe(originalJson)
  })

  it('fetches only the replacement session\'s material URLs and refreshes its verification records', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)

    const seenUrls: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      seenUrls.push(url)
      return okResponse()
    }
    const replacement = replacementSession3()
    const result = await redoSession(planDir, 3, replacement, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: laterClock,
      fs,
    })

    expect(seenUrls.sort()).toEqual(replacement.materials.map((m) => m.url).sort())

    const written = JSON.parse(fs.read(result.planPath)) as PlanData
    const newSession3 = written.sessions.find((s) => s.number === 3)!
    for (const material of newSession3.materials) {
      expect(material.verification.checkedAt).toBe(laterClock())
    }
  })

  it('keeps a replacement material whose URL fails with unresolved-after-retries and the rendered session warning', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)

    const replacement = replacementSession3()
    const deadUrl = replacement.materials[0].url
    const deadTitle = replacement.materials[0].title

    const fetchImpl: FetchLike = async (url) => (url === deadUrl ? notFoundResponse() : okResponse())
    const searchReplacement: () => Promise<ReplacementCandidate | null> = async () => null

    const result = await redoSession(planDir, 3, replacement, {
      fetch: fetchImpl,
      searchReplacement,
      anchorUrls: [],
      now: laterClock,
      fs,
    })

    const written = JSON.parse(fs.read(result.planPath)) as PlanData
    const slot = written.sessions.find((s) => s.number === 3)!.materials[0]
    expect(slot.title).toBe(deadTitle)
    expect(slot.url).toBe(deadUrl)
    expect(slot.verification.status).toBe('unresolved-after-retries')
    expect(slot.verification.checkedAt).toBeNull()

    const html = fs.read(result.htmlPath)
    const doc = new JSDOM(html).window.document
    const session3 = doc.querySelector('.session[data-session="3"]')!
    expect(session3.querySelector('.session-warning')).not.toBeNull()
    expect(html).toContain(deadUrl)
  })

  it('does not fetch or re-timestamp the other thirteen sessions', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    // Stale verification timestamps so any unintended refresh is visible.
    const staleTimestamp = '2025-01-01T00:00:00.000Z'
    const staleRecord = { status: 'verified-by-status' as const, checkedAt: staleTimestamp }
    for (const session of plan.sessions) {
      for (const material of session.materials) material.verification = staleRecord
    }
    await seedPlanDir(planDir, plan, fs)

    const seenUrls: string[] = []
    const fetchImpl: FetchLike = async (url) => {
      seenUrls.push(url)
      return okResponse()
    }
    const replacement = replacementSession3()

    await redoSession(planDir, 3, replacement, {
      fetch: fetchImpl,
      searchReplacement: noReplacement,
      now: laterClock,
      fs,
    })

    // Only the replacement's URLs were fetched.
    expect(seenUrls.sort()).toEqual(replacement.materials.map((m) => m.url).sort())

    const written = JSON.parse(fs.read(join(planDir, 'plan.json'))) as PlanData
    // Every non-targeted session's verification record is exactly what was
    // seeded — same timestamp, same status.
    for (const session of written.sessions) {
      if (session.number === 3) continue
      for (const material of session.materials) {
        expect(material.verification).toEqual(staleRecord)
      }
    }
  })

  it('rejects a replacement whose number does not match before any fetch or write', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    const planBefore = fs.read(join(planDir, 'plan.json'))
    const htmlBefore = fs.read(join(planDir, 'index.html'))
    const filesBefore = new Set(fs.files.keys())

    let fetchCalls = 0
    const fetchImpl: FetchLike = async () => {
      fetchCalls += 1
      return okResponse()
    }
    const replacement = replacementSession3()
    replacement.number = 4

    await expect(
      redoSession(planDir, 3, replacement, {
        fetch: fetchImpl,
        searchReplacement: noReplacement,
        now: fixedClock,
        fs,
      })
    ).rejects.toThrow(/number/i)

    expect(fetchCalls).toBe(0)
    expect(fs.read(join(planDir, 'plan.json'))).toBe(planBefore)
    expect(fs.read(join(planDir, 'index.html'))).toBe(htmlBefore)
    expect(new Set(fs.files.keys())).toEqual(filesBefore)
  })

  it('rejects a replacement that makes the plan invalid before any write, leaving both files untouched', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    const planBefore = fs.read(join(planDir, 'plan.json'))
    const htmlBefore = fs.read(join(planDir, 'index.html'))
    const filesBefore = new Set(fs.files.keys())

    let fetchCalls = 0
    const fetchImpl: FetchLike = async () => {
      fetchCalls += 1
      return okResponse()
    }

    const replacement = replacementSession3()
    // Knock the replacement's estimatedTime above the hoursPerDay budget so
    // validation rejects it once it's spliced into the merged plan.
    replacement.estimatedTime = plan.meta.hoursPerDay * 60 + 30

    await expect(
      redoSession(planDir, 3, replacement, {
        fetch: fetchImpl,
        searchReplacement: noReplacement,
        now: fixedClock,
        fs,
      })
    ).rejects.toBeInstanceOf(ValidationFailedError)

    expect(fetchCalls).toBe(0)
    expect(fs.read(join(planDir, 'plan.json'))).toBe(planBefore)
    expect(fs.read(join(planDir, 'index.html'))).toBe(htmlBefore)
    expect(new Set(fs.files.keys())).toEqual(filesBefore)
  })

  it('writes a page whose session 3 carries the replacement artifact, self-check, and materials, with no stale target-session content', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    const replacement = replacementSession3()
    const oldTitle = plan.sessions.find((s) => s.number === 3)!.title
    const oldArtifact = plan.sessions.find((s) => s.number === 3)!.artifactOneLiner
    const oldSelfCheck = plan.sessions.find((s) => s.number === 3)!.selfCheck
    const oldMaterialTitle = plan.sessions.find((s) => s.number === 3)!.materials[0].title

    const result = await redoSession(planDir, 3, replacement, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: laterClock,
      fs,
    })

    const html = fs.read(result.htmlPath)
    const doc = new JSDOM(html).window.document
    const session3 = doc.querySelector('.session[data-session="3"]')!
    expect(session3.querySelector('.session-title')?.textContent).toBe(replacement.title)
    expect(session3.querySelector('.session-artifact')?.textContent?.trim()).toBe(
      replacement.artifactOneLiner
    )
    expect(session3.querySelector('.self-check')?.textContent ?? '').toContain(replacement.selfCheck)
    for (const material of replacement.materials) {
      expect(session3.textContent ?? '').toContain(material.title)
      expect(html).toContain(material.url)
    }
    // The old session 3 fields are gone from the page.
    expect(session3.querySelector('.session-title')?.textContent).not.toBe(oldTitle)
    expect(session3.querySelector('.session-artifact')?.textContent?.trim()).not.toBe(oldArtifact)
    expect(session3.querySelector('.self-check')?.textContent ?? '').not.toContain(oldSelfCheck)
    // The old session 3's unique material title is gone — the material was
    // replaced, not silently merged.
    expect(session3.textContent ?? '').not.toContain(oldMaterialTitle)
    // Other sessions survive the redo. Session 1's title is a stable, distinctive
    // string and would only be absent if the page were partially re-rendered.
    const session1 = doc.querySelector('.session[data-session="1"]')!
    expect(session1.querySelector('.session-title')?.textContent).toBe('Python Syntax Basics')
  })

  it('preserves session-number progress keying: a re-rendered page restores checkbox and notes state for the same session number', async () => {
    const fs = new MemoryFileSystem()
    const planDir = '/plans/python-programming'
    const plan = clonePlan(fixturePlan)
    await seedPlanDir(planDir, plan, fs)
    const replacement = replacementSession3()

    const result = await redoSession(planDir, 3, replacement, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: laterClock,
      fs,
    })

    // Load the post-redo HTML into a fresh DOM whose localStorage already
    // carries state keyed by session number 3 (the same number the
    // replacement preserved). The page's restoration script reads from
    // studyPlanProgress and applies it to elements whose data-session="3".
    const restoredDoc = new JSDOM(fs.read(result.htmlPath), {
      runScripts: 'dangerously',
      url: 'http://localhost/',
      beforeParse(window) {
        window.localStorage.setItem(
          'studyPlanProgress',
          JSON.stringify({ checkboxes: { '3': true }, notes: { '3': 'looked good' } })
        )
      },
    }).window.document

    const restoredCheck = restoredDoc.querySelector('.session-check[data-session="3"]') as HTMLInputElement
    const restoredNotes = restoredDoc.querySelector('.notes-area[data-session="3"]') as HTMLTextAreaElement
    expect(restoredCheck.checked).toBe(true)
    expect(restoredNotes.value).toBe('looked good')
    // Other sessions keep their unchecked default — the stored state did not
    // bleed onto them.
    const session4Check = restoredDoc.querySelector('.session-check[data-session="4"]') as HTMLInputElement
    expect(session4Check.checked).toBe(false)
  })
})

interface CliResult {
  status: number | null
  stdout: string
  stderr: string
}

/**
 * Run the verify CLI as a real subprocess against the real filesystem. This
 * mirrors what `npm run verify -- <planDir>` does and is the only seam that
 * observes CLI argument handling and process exit codes.
 */
function runVerifyCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', 'scripts/verify.ts', ...args],
      { cwd, env: process.env, windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.on('error', reject)
  })
}

/**
 * Run the redo CLI as a real subprocess. The replacement JSON file is
 * written into `cwd` and removed afterwards so each test starts clean.
 */
function runRedoCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', 'scripts/redo.ts', ...args],
      { cwd, env: process.env, windowsHide: true }
    )
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.on('error', reject)
  })
}

describe('verify CLI', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'study-plan-cli-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('prints a JSON summary pointing at the existing directory and updates both files in place', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const planDir = generated.planDir
    const planBefore = await readFile(generated.planPath, 'utf8')

    const result = await runVerifyCli([planDir], process.cwd())

    expect(result.status).toBe(0)
    const summary = JSON.parse(result.stdout) as { ok: boolean; planDir: string; planPath: string; htmlPath: string }
    expect(summary.ok).toBe(true)
    expect(summary.planDir).toBe(planDir)
    expect(summary.planPath).toBe(generated.planPath)
    expect(summary.htmlPath).toBe(generated.htmlPath)
    // The directory was updated in place — no neighbouring -2 directory.
    const siblings = await readdir(baseDir)
    expect(siblings.filter((name) => name.startsWith('python-programming'))).toEqual(['python-programming'])
    // The plan data changed.
    const planAfter = await readFile(generated.planPath, 'utf8')
    expect(planAfter).not.toBe(planBefore)
  }, 30000)

  it('exits non-zero with a usage message when no plan directory is supplied', async () => {
    const result = await runVerifyCli([], process.cwd())
    expect(result.status).toBe(2)
    expect(result.stderr + result.stdout).toContain('Usage:')
    expect(result.stderr + result.stdout).toContain('<planDir>')
  })

  it('exits non-zero with a usage message when extra arguments are supplied', async () => {
    const result = await runVerifyCli(['first-dir', 'unexpected-extra'], process.cwd())
    expect(result.status).toBe(2)
    expect(result.stderr + result.stdout).toContain('Usage:')
    expect(result.stderr + result.stdout).toContain('<planDir>')
  })

  it('exits non-zero when the supplied directory has no plan.json', async () => {
    const emptyDir = join(baseDir, 'empty')
    await mkdir(emptyDir, { recursive: true })

    const result = await runVerifyCli([emptyDir], process.cwd())

    expect(result.status).toBe(1)
    // A JSON error shape rather than a raw stack trace, so the skill can act.
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toContain('plan.json')
  })
})

describe('redo CLI', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'study-plan-redo-cli-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  async function writeReplacementFile(planDir: string): Promise<string> {
    const replacement = replacementSession3()
    const path = join(planDir, 'replacement.json')
    await writeFile(path, JSON.stringify(replacement, null, 2), 'utf8')
    return path
  }

  it('rewrites both files in place and prints a JSON summary pointing at the existing directory', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const planDir = generated.planDir
    const planBefore = await readFile(generated.planPath, 'utf8')
    const htmlBefore = await readFile(generated.htmlPath, 'utf8')
    const replacementPath = await writeReplacementFile(baseDir)

    const result = await runRedoCli([planDir, '3', replacementPath], process.cwd())

    expect(result.status).toBe(0)
    const summary = JSON.parse(result.stdout) as {
      ok: boolean
      planDir: string
      planPath: string
      htmlPath: string
      unresolved: Array<{ status: string }>
    }
    expect(summary.ok).toBe(true)
    expect(summary.planDir).toBe(planDir)
    expect(summary.planPath).toBe(generated.planPath)
    expect(summary.htmlPath).toBe(generated.htmlPath)
    // The CLI ran against the real web, so unresolved may be non-empty for
    // off-list URLs; the shape and target are what matter.
    expect(Array.isArray(summary.unresolved)).toBe(true)
    expect(summary.unresolved.every((entry) => typeof entry.status === 'string')).toBe(true)
    // The directory was updated in place — no neighbouring -2 directory.
    const siblings = await readdir(baseDir)
    expect(siblings.filter((name) => name.startsWith('python-programming'))).toEqual(['python-programming'])
    // The plan data and the rendered page actually changed.
    const planAfter = await readFile(generated.planPath, 'utf8')
    const htmlAfter = await readFile(generated.htmlPath, 'utf8')
    expect(planAfter).not.toBe(planBefore)
    expect(htmlAfter).not.toBe(htmlBefore)
    // The redo's replacement title is in the rewritten page; the old one is gone.
    expect(htmlAfter).toContain('Functions and Modules — revised')
    expect(htmlAfter).not.toContain('Functions and Modules<')
  }, 30000)

  it('exits non-zero with a usage message when the argument count is wrong', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })

    // No args at all.
    const noArgs = await runRedoCli([], process.cwd())
    expect(noArgs.status).toBe(2)
    expect(noArgs.stderr + noArgs.stdout).toContain('Usage:')
    expect(noArgs.stderr + noArgs.stdout).toContain('<replacement.json>')

    // Only the plan directory.
    const onlyDir = await runRedoCli([generated.planDir], process.cwd())
    expect(onlyDir.status).toBe(2)
    expect(onlyDir.stderr + onlyDir.stdout).toContain('Usage:')

    // Plan dir and session number but no replacement path.
    const onlyThree = await runRedoCli([generated.planDir, '3'], process.cwd())
    expect(onlyThree.status).toBe(2)
    expect(onlyThree.stderr + onlyThree.stdout).toContain('Usage:')
  })

  it('exits non-zero with a JSON error when the supplied directory has no plan.json', async () => {
    const emptyDir = join(baseDir, 'empty')
    await mkdir(emptyDir, { recursive: true })
    const replacementPath = await writeReplacementFile(baseDir)

    const result = await runRedoCli([emptyDir, '3', replacementPath], process.cwd())

    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toContain('plan.json')
  })

  it('exits non-zero with a JSON error when the replacement file looks like HTML', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const htmlPath = join(baseDir, 'replacement.html')
    await writeFile(htmlPath, '<!DOCTYPE html><html><body>not a session</body></html>', 'utf8')

    const result = await runRedoCli([generated.planDir, '3', htmlPath], process.cwd())

    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toMatch(/HTML/i)
  })

  it('exits non-zero with a JSON error when the replacement session number does not match the requested one', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const replacement = replacementSession3()
    replacement.number = 4
    const replacementPath = join(baseDir, 'replacement.json')
    await writeFile(replacementPath, JSON.stringify(replacement, null, 2), 'utf8')

    const planBefore = await readFile(generated.planPath, 'utf8')
    const htmlBefore = await readFile(generated.htmlPath, 'utf8')

    const result = await runRedoCli([generated.planDir, '3', replacementPath], process.cwd())

    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toMatch(/number/i)
    // No write happened: both files on disk are untouched.
    const planAfter = await readFile(generated.planPath, 'utf8')
    const htmlAfter = await readFile(generated.htmlPath, 'utf8')
    expect(planAfter).toBe(planBefore)
    expect(htmlAfter).toBe(htmlBefore)
  })

  it('exits non-zero with a JSON error when the sessionNumber argument is not an integer 1-14', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const replacementPath = await writeReplacementFile(baseDir)

    const notANumber = await runRedoCli([generated.planDir, 'three', replacementPath], process.cwd())
    expect(notANumber.status).toBe(1)
    const notANumberPayload = JSON.parse(notANumber.stdout) as { ok: boolean; error?: string }
    expect(notANumberPayload.ok).toBe(false)
    expect(notANumberPayload.error ?? '').toMatch(/sessionNumber/i)

    const outOfRange = await runRedoCli([generated.planDir, '0', replacementPath], process.cwd())
    expect(outOfRange.status).toBe(1)

    const wayOutOfRange = await runRedoCli([generated.planDir, '15', replacementPath], process.cwd())
    expect(wayOutOfRange.status).toBe(1)
  })

  it('exits non-zero with a JSON error when plan.json is malformed JSON, instead of a raw stack trace', async () => {
    const planDir = join(baseDir, 'broken')
    await mkdir(planDir, { recursive: true })
    await writeFile(join(planDir, 'plan.json'), '{ not valid json', 'utf8')
    const replacementPath = await writeReplacementFile(baseDir)

    const result = await runRedoCli([planDir, '3', replacementPath], process.cwd())

    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toMatch(/plan\.json/)
    expect(payload.error ?? '').toMatch(/JSON/i)
  })
})
