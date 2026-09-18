// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { ScriptedIntelligence, UnavailableIntelligence } from '../src/app/intelligence'
import { MemoryPlanStore } from '../src/app/plan-store'
import { Planner, type Job } from '../src/app/planner'
import { createApp } from '../src/app/server'
import type { PlanData, Session } from '../src/plan-types'
import { renderPlan } from '../src/renderer'
import type { FetchLike } from '../src/verification'
import { fixturePlan } from './fixtures/plan-fixture'

const FIXTURE_ID = 'python-programming'
const LIVE = { js: '/* live layer */', css: '.live-toggle{}' }

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

/** Every URL is live; non-preferred materials get a body that passes content check. */
function buildEchoingFetch(plan: PlanData): FetchLike {
  const materialByUrl = new Map(plan.sessions.flatMap((s) => s.materials.map((m) => [m.url, m])))
  return async (url) => {
    const material = materialByUrl.get(url)
    if (material && material.sourceType !== 'preferred') {
      return { ok: true, status: 200, text: async () => `${material.title}, with worked examples.` }
    }
    return { ok: true, status: 200, text: async () => 'placeholder body' }
  }
}

function replacementSession(sessionNumber: number): Session {
  return {
    number: sessionNumber,
    title: `Replacement ${sessionNumber}`,
    artifactOneLiner: 'A different artifact for the same target',
    materials: [
      {
        title: 'Replacement material',
        url: 'https://example.com/replacement',
        sourceType: 'preferred',
        estimatedDuration: 10,
        paid: false,
        verification: { status: 'verified-by-status', checkedAt: null },
      },
    ],
    selfCheck: 'Can I do the new artifact?',
    estimatedTime: 60,
    highFrequencyUnits: ['module structure', 'packaging'],
  }
}

let server: Server | undefined

interface Harness {
  base: string
  store: MemoryPlanStore
  intelligence: ScriptedIntelligence
  planner: Planner
}

async function start(seed: PlanData | null = clonePlan(fixturePlan)): Promise<Harness> {
  const store = new MemoryPlanStore()
  if (seed) {
    const id = await store.create(seed)
    await store.write(id, seed)
  }
  const intelligence = new ScriptedIntelligence()
  const planner = new Planner({ store, intelligence, fetch: buildEchoingFetch(seed ?? fixturePlan) })
  server = createServer(createApp({ planner, store, live: LIVE }))
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { base: `http://127.0.0.1:${port}`, store, intelligence, planner }
}

afterEach(async () => {
  if (!server) return
  const s = server
  server = undefined
  await new Promise<void>((resolve) => s.close(() => resolve()))
})

async function postJson(url: string, body: unknown, method = 'POST'): Promise<Response> {
  return fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function waitForTerminal(base: string, jobId: string): Promise<Job> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const job = (await (await fetch(`${base}/api/jobs/${jobId}`)).json()) as Job
    if (job.stage === 'applied' || job.stage === 'refused' || job.stage === 'failed') return job
    if (Date.now() > deadline) throw new Error(`job ${jobId} did not finish: ${job.stage}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('pages', () => {
  it('Scenario 1: GET / lists the fixture plan with its subject and a link to its live page', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const body = await res.text()
    expect(body).toContain(fixturePlan.meta.subject)
    expect(body).toContain(`href="/plans/${FIXTURE_ID}"`)
    expect(body).toContain(`/plans/${FIXTURE_ID}/export`)
    expect(body).toContain('0 / 14')
  })

  it('GET / counts sessions done from the stored progress', async () => {
    const { base, store } = await start()
    await store.writeProgress(FIXTURE_ID, { checkboxes: { 1: true, 4: true, 9: false } })
    const body = await (await fetch(`${base}/`)).text()
    expect(body).toContain('2 / 14')
  })

  it('Scenario 2: GET /plans/:id is renderPlan(plan) with the live layer spliced in before the page script', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/plans/${FIXTURE_ID}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    const page = renderPlan(fixturePlan)
    const scriptAt = page.lastIndexOf('<script>')
    const head = page.slice(0, scriptAt)
    const tail = page.slice(scriptAt)
    expect(body.startsWith(head)).toBe(true)
    expect(body.endsWith(tail)).toBe(true)
    const layer = body.slice(head.length, body.length - tail.length)
    expect(layer).toMatch(
      /^<script id="live-progress" type="application\/json">\{.*\}<\/script><link rel="stylesheet" href="\/live.css"><script src="\/live.js"><\/script>$/
    )
  })

  it('the live page embeds the stored progress and escapes `<` inside it', async () => {
    const { base, store } = await start()
    await store.writeProgress(FIXTURE_ID, { notes: { 2: '</script><b>' }, checkboxes: { 2: true } })
    const body = await (await fetch(`${base}/plans/${FIXTURE_ID}`)).text()
    const match = body.match(/<script id="live-progress" type="application\/json">(.*?)<\/script>/)
    expect(match).not.toBeNull()
    expect(match![1]).not.toContain('</script>')
    expect(JSON.parse(match![1])).toEqual({ notes: { 2: '</script><b>' }, checkboxes: { 2: true } })
  })

  it('GET /plans/:id for an unknown plan is a text 404', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/plans/nope`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/plain')
  })

  it('Scenario 3: GET /plans/:id/export is byte-identical to renderPlan(plan) with an attachment header', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/plans/${FIXTURE_ID}/export`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="${FIXTURE_ID}.html"`
    )
    expect(await res.text()).toBe(renderPlan(fixturePlan))
  })

  it('serves live.js and live.css from the injected strings', async () => {
    const { base } = await start()
    const js = await fetch(`${base}/live.js`)
    expect(js.headers.get('content-type')).toContain('javascript')
    expect(await js.text()).toBe(LIVE.js)
    const css = await fetch(`${base}/live.css`)
    expect(css.headers.get('content-type')).toContain('text/css')
    expect(await css.text()).toBe(LIVE.css)
  })
})

describe('plans API', () => {
  it('GET /api/plans lists summaries; GET /api/plans/:id returns the PlanData', async () => {
    const { base } = await start()
    const list = (await (await fetch(`${base}/api/plans`)).json()) as { id: string; subject: string }[]
    expect(list.map((p) => p.id)).toEqual([FIXTURE_ID])
    expect(list[0].subject).toBe(fixturePlan.meta.subject)
    const plan = (await (await fetch(`${base}/api/plans/${FIXTURE_ID}`)).json()) as PlanData
    expect(plan).toEqual(fixturePlan)
  })

  it('unknown API routes and plans answer JSON errors, never HTML', async () => {
    const { base } = await start()
    const missing = await fetch(`${base}/api/plans/nope`)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toContain('application/json')
    expect(await missing.json()).toHaveProperty('error')
    const unknown = await fetch(`${base}/api/what`)
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toHaveProperty('error')
  })

  it('Scenario 4: POST /api/plans/import rejects an invalid document with validationErrors and accepts the fixture', async () => {
    const { base } = await start(null)
    const broken = clonePlan(fixturePlan)
    broken.sessions.pop()
    const bad = await postJson(`${base}/api/plans/import`, broken)
    expect(bad.status).toBe(400)
    const badBody = (await bad.json()) as { validationErrors: string[] }
    expect(badBody.validationErrors.length).toBeGreaterThan(0)
    expect((await (await fetch(`${base}/api/plans`)).json()) as unknown[]).toEqual([])

    const good = await postJson(`${base}/api/plans/import`, fixturePlan)
    expect(good.status).toBe(201)
    expect(await good.json()).toEqual({ id: FIXTURE_ID })
    const list = (await (await fetch(`${base}/api/plans`)).json()) as { id: string }[]
    expect(list.map((p) => p.id)).toEqual([FIXTURE_ID])
    expect(await (await fetch(`${base}/plans/${FIXTURE_ID}/export`)).text()).toBe(
      renderPlan(fixturePlan)
    )
  })

  it('malformed JSON and oversized bodies are 400 and 413', async () => {
    const { base } = await start()
    const malformed = await fetch(`${base}/api/plans/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toHaveProperty('error')
    const huge = await fetch(`${base}/api/plans/${FIXTURE_ID}/progress`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"pad":"' + 'x'.repeat(2 * 1024 * 1024 + 1) + '"}',
    })
    expect(huge.status).toBe(413)
  })

  it('POST /api/plans validates the brief and hands it to the planner as a job', async () => {
    const { base, intelligence } = await start()
    const bad = await postJson(`${base}/api/plans`, { subject: 'X' })
    expect(bad.status).toBe(400)
    intelligence.enqueuePlan({ throw: new Error('no provider configured; set XAI_API_KEY (see #30)') })
    const res = await postJson(`${base}/api/plans`, {
      subject: 'Rust',
      currentLevel: 'Beginner',
      hoursPerDay: 2,
      targetCapability: 'Write a CLI',
    })
    expect(res.status).toBe(202)
    const { jobId } = (await res.json()) as { jobId: string }
    const job = await waitForTerminal(base, jobId)
    expect(job.kind).toBe('generate')
    expect(job.stage).toBe('failed')
    expect(job.result).toEqual({ error: 'no provider configured; set XAI_API_KEY (see #30)' })
  })
})

describe('jobs API', () => {
  it('Scenario 5: a curation runs to applied, the plan shows the replacement and one log record; a second request while pending is 409', async () => {
    const { base, intelligence } = await start()
    // Hold the intelligence until the busy check has been made.
    let release: (value: { session: Session; knownSummary: string }) => void = () => {}
    const gate = new Promise<{ session: Session; knownSummary: string }>((resolve) => {
      release = resolve
    })
    intelligence.enqueueSession({ answer: gate as unknown as { session: Session } })

    const request = {
      intent: 'drop-as-known',
      sessionNumber: 3,
      known: 'I already write functions and modules fluently',
    }
    const first = await postJson(`${base}/api/plans/${FIXTURE_ID}/curations`, request)
    expect(first.status).toBe(202)
    const { jobId } = (await first.json()) as { jobId: string }
    expect(typeof jobId).toBe('string')

    const second = await postJson(`${base}/api/plans/${FIXTURE_ID}/curations`, request)
    expect(second.status).toBe(409)
    expect(await second.json()).toHaveProperty('error')
    const verify = await fetch(`${base}/api/plans/${FIXTURE_ID}/verify`, { method: 'POST' })
    expect(verify.status).toBe(409)

    const pending = (await (await fetch(`${base}/api/jobs/${jobId}`)).json()) as Job
    expect(['requested', 'sourcing']).toContain(pending.stage)

    release({ session: replacementSession(3), knownSummary: 'Functions and modules are familiar.' })
    const job = await waitForTerminal(base, jobId)
    expect(job.stage).toBe('applied')

    const plan = (await (await fetch(`${base}/api/plans/${FIXTURE_ID}`)).json()) as PlanData
    expect(plan.sessions.find((s) => s.number === 3)!.title).toBe('Replacement 3')
    expect(plan.curationLog).toHaveLength(1)
    expect(plan.curationLog![0].replacedSession!.title).toBe(fixturePlan.sessions[2].title)

    const jobs = (await (await fetch(`${base}/api/plans/${FIXTURE_ID}/jobs`)).json()) as Job[]
    expect(jobs.map((j) => j.id)).toEqual([jobId])
  })

  it("GET /api/plans/:id/jobs lists the plan's jobs newest first", async () => {
    const { base, planner } = await start()
    const older = planner.verify(FIXTURE_ID)
    await waitForTerminal(base, older.id)
    const newer = planner.verify(FIXTURE_ID)
    await waitForTerminal(base, newer.id)
    const jobs = (await (await fetch(`${base}/api/plans/${FIXTURE_ID}/jobs`)).json()) as Job[]
    expect(jobs.map((j) => j.id)).toEqual([newer.id, older.id])
  })

  it('a malformed curation request is 400 and an unknown job is 404', async () => {
    const { base } = await start()
    const bad = await postJson(`${base}/api/plans/${FIXTURE_ID}/curations`, { intent: 'nope' })
    expect(bad.status).toBe(400)
    const missing = await fetch(`${base}/api/jobs/nope`)
    expect(missing.status).toBe(404)
  })
})

describe('without a provider (STUDY_PLAN_INTELLIGENCE=scripted)', () => {
  it('generate and curate jobs fail with the "no provider configured" message; verify still runs', async () => {
    const store = new MemoryPlanStore()
    const seed = clonePlan(fixturePlan)
    await store.write(await store.create(seed), seed)
    const planner = new Planner({ store, intelligence: new UnavailableIntelligence(), fetch: buildEchoingFetch(seed) })
    server = createServer(createApp({ planner, store, live: LIVE }))
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const generate = await postJson(`${base}/api/plans`, {
      subject: 'Rust',
      currentLevel: 'Beginner',
      hoursPerDay: 2,
      targetCapability: 'Write a CLI',
    })
    const generateJob = await waitForTerminal(base, ((await generate.json()) as { jobId: string }).jobId)
    expect(generateJob.stage).toBe('failed')
    expect(generateJob.result).toEqual({ error: 'no provider configured; set XAI_API_KEY (see #30)' })

    const curate = await postJson(`${base}/api/plans/${FIXTURE_ID}/curations`, {
      intent: 'redo-session',
      sessionNumber: 2,
    })
    const curateJob = await waitForTerminal(base, ((await curate.json()) as { jobId: string }).jobId)
    expect(curateJob.stage).toBe('failed')
    expect(curateJob.result).toEqual({ error: 'no provider configured; set XAI_API_KEY (see #30)' })

    const verify = await fetch(`${base}/api/plans/${FIXTURE_ID}/verify`, { method: 'POST' })
    expect(verify.status).toBe(202)
    const verifyJob = await waitForTerminal(base, ((await verify.json()) as { jobId: string }).jobId)
    expect(verifyJob.stage).toBe('applied')
  })
})

describe('progress API', () => {
  it('Scenario 6: PUT then GET round-trips; a non-object body is 400', async () => {
    const { base } = await start()
    const progress = { checkboxes: { 1: true }, notes: { 1: 'first' } }
    const put = await postJson(`${base}/api/plans/${FIXTURE_ID}/progress`, progress, 'PUT')
    expect(put.status).toBe(204)
    const got = await fetch(`${base}/api/plans/${FIXTURE_ID}/progress`)
    expect(got.status).toBe(200)
    expect(await got.json()).toEqual(progress)

    for (const body of [[1, 2], 'text', null, 42]) {
      const res = await postJson(`${base}/api/plans/${FIXTURE_ID}/progress`, body, 'PUT')
      expect(res.status).toBe(400)
    }
    expect(await (await fetch(`${base}/api/plans/${FIXTURE_ID}/progress`)).json()).toEqual(progress)
  })

  it('progress for an unknown plan is 404', async () => {
    const { base } = await start()
    expect((await fetch(`${base}/api/plans/nope/progress`)).status).toBe(404)
    expect((await postJson(`${base}/api/plans/nope/progress`, {}, 'PUT')).status).toBe(404)
  })
})
