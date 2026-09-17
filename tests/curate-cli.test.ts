import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlanData, Session } from '../src/plan-types'
import { generatePlan } from '../src/generate'
import type { DropAsKnownRequest, RedoSessionRequest, SwapMaterialRequest } from '../src/curation'
import type { FetchLike, ReplacementCandidate } from '../src/verification'
import { fixturePlan } from './fixtures/plan-fixture'

const okResponse = () => ({ ok: true, status: 200, text: async () => 'placeholder body' })
const baseFetch: FetchLike = async () => okResponse()
const noReplacement: () => Promise<ReplacementCandidate | null> = async () => null
const fixedClock = () => '2026-02-01T00:00:00.000Z'

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
        verification: { status: 'verified-by-status', checkedAt: null },
      },
    ],
    selfCheck: 'Can I structure a project as importable modules under a package?',
    estimatedTime: 60,
    highFrequencyUnits: ['module structure', 'packaging'],
    encodingHook: 'A package is a directory with an __init__.py; a module is a file in it.',
  }
}

interface CliResult {
  status: number | null
  stdout: string
  stderr: string
}

function runCurateCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', 'scripts/curate.ts', ...args],
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

describe('curate CLI', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'study-plan-curate-cli-'))
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('applies a redo-session request and prints a JSON summary with intent and sessionNumber', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const planDir = generated.planDir
    const replacement = replacementSession3()
    const request: RedoSessionRequest = {
      intent: 'redo-session',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 3,
      replacement,
    }
    const requestPath = join(baseDir, 'request.json')
    await writeFile(requestPath, JSON.stringify(request, null, 2), 'utf8')

    const result = await runCurateCli([planDir, requestPath], process.cwd())
    expect(result.status).toBe(0)
    const summary = JSON.parse(result.stdout) as {
      ok: boolean
      planDir: string
      planPath: string
      htmlPath: string
      intent: string
      sessionNumber: number
      unresolved: unknown[]
    }
    expect(summary.ok).toBe(true)
    expect(summary.intent).toBe('redo-session')
    expect(summary.sessionNumber).toBe(3)
    expect(summary.planDir).toBe(planDir)
    expect(summary.planPath).toBe(generated.planPath)
    expect(summary.htmlPath).toBe(generated.htmlPath)
    // No neighbouring directory was created.
    const siblings = await readdir(baseDir)
    expect(siblings.filter((name) => name.startsWith('python-programming'))).toEqual([
      'python-programming',
    ])
  })

  it('prints a refused shape with stage when the request is refused at the request stage', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const planDir = generated.planDir
    // Drop session 6 (consolidation) — request-stage refusal.
    const replacement = replacementSession3()
    replacement.number = 6
    const request: DropAsKnownRequest = {
      intent: 'drop-as-known',
      at: '2026-02-10T00:00:00.000Z',
      sessionNumber: 6,
      known: 'X',
      knownSummary: 'Y',
      replacement,
    }
    const requestPath = join(baseDir, 'request.json')
    await writeFile(requestPath, JSON.stringify(request, null, 2), 'utf8')

    const result = await runCurateCli([planDir, requestPath], process.cwd())
    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as {
      ok: boolean
      refused?: string[]
      stage?: string
    }
    expect(payload.ok).toBe(false)
    expect(payload.stage).toBe('request')
    expect(payload.refused ?? []).toEqual(expect.arrayContaining([expect.stringMatching(/consolidation/i)]))
  })

  it('fills in `at` when the request omits it', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const planDir = generated.planDir
    const replacement = replacementSession3()
    const request = {
      intent: 'redo-session',
      sessionNumber: 3,
      replacement,
    }
    const requestPath = join(baseDir, 'request.json')
    await writeFile(requestPath, JSON.stringify(request, null, 2), 'utf8')

    const result = await runCurateCli([planDir, requestPath], process.cwd())
    expect(result.status).toBe(0)
    const summary = JSON.parse(result.stdout) as { ok: boolean; intent: string; sessionNumber: number }
    expect(summary.ok).toBe(true)
    expect(summary.intent).toBe('redo-session')
    expect(summary.sessionNumber).toBe(3)
  })

  it('exits non-zero with a usage message when the argument count is wrong', async () => {
    const noArgs = await runCurateCli([], process.cwd())
    expect(noArgs.status).toBe(2)
    expect(noArgs.stderr + noArgs.stdout).toContain('Usage:')
    expect(noArgs.stderr + noArgs.stdout).toContain('<request.json>')

    const onlyDir = await runCurateCli([baseDir], process.cwd())
    expect(onlyDir.status).toBe(2)
  })

  it('exits non-zero with a JSON error when the directory has no plan.json', async () => {
    const emptyDir = join(baseDir, 'empty')
    await mkdir(emptyDir, { recursive: true })
    const requestPath = join(baseDir, 'request.json')
    await writeFile(requestPath, JSON.stringify({ intent: 'redo-session' }), 'utf8')

    const result = await runCurateCli([emptyDir, requestPath], process.cwd())
    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toContain('plan.json')
  })

  it('exits non-zero with a JSON error when the request looks like HTML', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const htmlPath = join(baseDir, 'request.html')
    await writeFile(htmlPath, '<!DOCTYPE html><html><body>not a request</body></html>', 'utf8')

    const result = await runCurateCli([generated.planDir, htmlPath], process.cwd())
    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toMatch(/HTML/i)
  })

  it('exits non-zero when the request is missing an intent', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const requestPath = join(baseDir, 'request.json')
    await writeFile(requestPath, JSON.stringify({ sessionNumber: 3 }), 'utf8')

    const result = await runCurateCli([generated.planDir, requestPath], process.cwd())
    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toMatch(/intent/i)
  })

  it('exits non-zero when the request JSON is malformed', async () => {
    const generated = await generatePlan(fixturePlan, baseDir, {
      fetch: baseFetch,
      searchReplacement: noReplacement,
      now: fixedClock,
    })
    const requestPath = join(baseDir, 'request.json')
    await writeFile(requestPath, '{ not valid json', 'utf8')

    const result = await runCurateCli([generated.planDir, requestPath], process.cwd())
    expect(result.status).toBe(1)
    const payload = JSON.parse(result.stdout) as { ok: boolean; error?: string }
    expect(payload.ok).toBe(false)
    expect(payload.error ?? '').toMatch(/JSON/i)
  })
})
