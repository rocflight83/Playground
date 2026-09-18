import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import type { Job } from '../src/app/planner'
import type { Progress } from '../src/app/plan-store'
import { renderLivePage } from '../src/app/server'
import type { CurationRecord, PlanData } from '../src/plan-types'
import { fixturePlan } from './fixtures/plan-fixture'

const PLAN_ID = 'python-programming'
const LIVE_JS = readFileSync(resolve('src/app/live/live.js'), 'utf8')

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

interface RecordedRequest {
  method: string
  path: string
  body: unknown
}

interface StubbedApi {
  requests: RecordedRequest[]
  /** Scripted answers for `GET /api/jobs/:id`, consumed in order; the last one repeats. */
  jobStates: Partial<Job>[]
}

/**
 * Load the served page into jsdom the way the browser would see it — the
 * page's own script last — with `live.js` inlined (jsdom does not fetch
 * `<script src>` here) and `window.fetch` replaced by a recorder that
 * answers from the plan and the scripted job states.
 */
function loadLive(plan: PlanData, progress: Progress = {}, jobsOnLoad: Job[] = []) {
  const served = renderLivePage(plan, progress)
  expect(served).toContain('<script src="/live.js"></script>')
  const html = served
    .replace('<link rel="stylesheet" href="/live.css">', '')
    .replace('<script src="/live.js"></script>', () => '<script>' + LIVE_JS + '</script>')
  const api: StubbedApi = { requests: [], jobStates: [] }
  const answer = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: `http://127.0.0.1:4321/plans/${PLAN_ID}`,
    beforeParse(window) {
      ;(window as unknown as { fetch: unknown }).fetch = async (
        input: string,
        init: { method?: string; body?: string } = {}
      ) => {
        const method = init.method ?? 'GET'
        const path = new URL(input, 'http://127.0.0.1:4321').pathname
        api.requests.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined })
        if (method === 'GET' && path === `/api/plans/${PLAN_ID}`) return answer(200, plan)
        if (method === 'GET' && path === `/api/plans/${PLAN_ID}/jobs`) return answer(200, jobsOnLoad)
        if (method === 'PUT' && path === `/api/plans/${PLAN_ID}/progress`) return answer(204, null)
        if (method === 'POST' && path === `/api/plans/${PLAN_ID}/curations`) {
          return answer(202, { jobId: 'job-1' })
        }
        if (method === 'GET' && path.startsWith('/api/jobs/')) {
          const next = api.jobStates.length > 1 ? api.jobStates.shift()! : api.jobStates[0]
          if (!next) return answer(404, { error: 'no scripted job state' })
          return answer(200, { id: 'job-1', kind: 'curate', planId: PLAN_ID, ...next })
        }
        return answer(404, { error: `unexpected ${method} ${path}` })
      }
    },
  })
  return { dom, doc: dom.window.document, api }
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms))

function section(doc: Document, n: number): HTMLElement {
  return doc.querySelector(`.session[data-session="${n}"]`) as HTMLElement
}

function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const match = Array.from(root.querySelectorAll('button')).find(
    (b) => b.textContent!.trim() === text
  )
  if (!match) throw new Error(`no button "${text}"`)
  return match as HTMLButtonElement
}

function curate(dom: JSDOM): void {
  buttonByText(dom.window.document, 'Curate').click()
}

describe('live page: progress through the store (scenario 8)', () => {
  it('seeds from #live-progress so an embedded tick renders checked, and a new tick makes one debounced PUT', async () => {
    const { dom, doc, api } = loadLive(fixturePlan, { checkboxes: { 3: true } })
    const three = doc.querySelector('.session[data-session="3"] .session-check') as HTMLInputElement
    expect(three.checked).toBe(true)
    expect(dom.window.localStorage.getItem('studyPlanProgress')).toBeNull()

    const one = doc.querySelector('.session[data-session="1"] .session-check') as HTMLInputElement
    one.checked = true
    one.dispatchEvent(new dom.window.Event('change'))
    const five = doc.querySelector('.session[data-session="5"] .session-check') as HTMLInputElement
    five.checked = true
    five.dispatchEvent(new dom.window.Event('change'))

    const puts = () => api.requests.filter((r) => r.method === 'PUT')
    expect(puts()).toHaveLength(0)
    await settle(700)
    expect(puts()).toHaveLength(1)
    expect(puts()[0].path).toBe(`/api/plans/${PLAN_ID}/progress`)
    expect(puts()[0].body).toEqual({ checkboxes: { 1: true, 3: true, 5: true } })
    expect(dom.window.localStorage.getItem('studyPlanProgress')).toBeNull()
  })
})

describe('live page: curate mode (scenarios 9, 10)', () => {
  it('shows no rail until Curate is on, then one rail per session with drop disabled on sessions 6 and 11', () => {
    const { dom, doc } = loadLive(fixturePlan)
    expect(doc.querySelectorAll('.live-rail')).toHaveLength(0)
    curate(dom)
    expect(doc.querySelectorAll('.live-rail')).toHaveLength(14)
    for (const n of [6, 11]) {
      const drop = buttonByText(section(doc, n), '✓ I already know this')
      expect(drop.disabled).toBe(true)
      expect(drop.title).not.toBe('')
    }
    expect(buttonByText(section(doc, 1), '✓ I already know this').disabled).toBe(false)
    buttonByText(doc, 'Done curating').click()
    expect(doc.querySelectorAll('.live-rail')).toHaveLength(0)
  })

  it('the drop textarea gates the button at ten characters and submits drop-as-known with the text', async () => {
    const { dom, doc, api } = loadLive(fixturePlan)
    curate(dom)
    const two = section(doc, 2)
    buttonByText(two, '✓ I already know this').click()
    const textarea = two.querySelector('textarea[name="known"]') as HTMLTextAreaElement
    const drop = buttonByText(two, 'Drop and replace')
    expect(drop.disabled).toBe(true)
    textarea.value = '123456789'
    textarea.dispatchEvent(new dom.window.Event('input'))
    expect(drop.disabled).toBe(true)
    textarea.value = '1234567890'
    textarea.dispatchEvent(new dom.window.Event('input'))
    expect(drop.disabled).toBe(false)
    drop.click()
    await settle()
    const posts = api.requests.filter((r) => r.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(posts[0].path).toBe(`/api/plans/${PLAN_ID}/curations`)
    expect(posts[0].body).toEqual({ intent: 'drop-as-known', sessionNumber: 2, known: '1234567890' })
  })

  it('a swap chip posts swap-material by reason; a URL posts it by url', async () => {
    const { dom, doc, api } = loadLive(fixturePlan)
    curate(dom)
    const four = section(doc, 4)
    const firstUrl = fixturePlan.sessions[3].materials[0].url
    buttonByText(four, '⇄ Swap').click()
    buttonByText(four, 'too advanced').click()
    await settle()
    buttonByText(four, '⇄ Swap').click()
    const url = four.querySelector('input[name="url"]') as HTMLInputElement
    url.value = 'https://example.com/mine'
    buttonByText(four, 'Use it').click()
    await settle()
    const posts = api.requests.filter((r) => r.method === 'POST').map((r) => r.body)
    expect(posts).toEqual([
      { intent: 'swap-material', sessionNumber: 4, materialUrl: firstUrl, by: { reason: 'too advanced' } },
      { intent: 'swap-material', sessionNumber: 4, materialUrl: firstUrl, by: { url: 'https://example.com/mine' } },
    ])
  })

  it('re-plan posts redo-session with the optional reason', async () => {
    const { dom, doc, api } = loadLive(fixturePlan)
    curate(dom)
    const seven = section(doc, 7)
    buttonByText(seven, '↻ Re-plan').click()
    const reason = seven.querySelector('input[name="reason"]') as HTMLInputElement
    reason.value = 'wrong emphasis'
    buttonByText(seven, 'Re-plan this session').click()
    await settle()
    const posts = api.requests.filter((r) => r.method === 'POST').map((r) => r.body)
    expect(posts).toEqual([{ intent: 'redo-session', sessionNumber: 7, reason: 'wrong emphasis' }])
  })
})

describe('live page: "Previously:" folds (scenarios 11, 13)', () => {
  function withLog(records: CurationRecord[]): PlanData {
    const plan = clonePlan(fixturePlan)
    plan.curationLog = records
    return plan
  }

  it('shows one fold per record, on the right session, naming what was replaced', async () => {
    const oldSession = clonePlan(fixturePlan).sessions[4]
    oldSession.title = 'The session that was dropped'
    const oldMaterial = clonePlan(fixturePlan).sessions[8].materials[0]
    oldMaterial.title = 'The material that was swapped'
    const plan = withLog([
      { intent: 'drop-as-known', sessionNumber: 5, at: '2026-03-01T10:00:00.000Z', known: 'x', replacedSession: oldSession },
      { intent: 'swap-material', sessionNumber: 9, at: '2026-03-02T10:00:00.000Z', reason: 'too basic', replacedMaterial: oldMaterial },
    ])
    const { doc } = loadLive(plan)
    await settle()
    expect(section(doc, 5).textContent).toContain('Previously')
    expect(section(doc, 5).textContent).toContain('The session that was dropped')
    expect(section(doc, 9).textContent).toContain('The material that was swapped')
    expect(section(doc, 1).textContent).not.toContain('Previously')
    // Folds are part of reading mode: no Curate toggle was pressed above.
    expect(doc.querySelectorAll('.live-rail')).toHaveLength(0)
  })

  it('a swap by URL marks the row that now carries the supplied URL', async () => {
    const plan = withLog([])
    const target = plan.sessions[8].materials[0]
    const oldMaterial = { ...clonePlan(fixturePlan).sessions[8].materials[0], title: 'Old one', url: 'https://old.example/x' }
    plan.curationLog = [
      { intent: 'swap-material', sessionNumber: 9, at: '2026-03-02T10:00:00.000Z', suppliedUrl: target.url, replacedMaterial: oldMaterial },
    ]
    const { doc } = loadLive(plan)
    await settle()
    const row = Array.from(section(doc, 9).querySelectorAll('.material')).find((li) =>
      li.querySelector('.material-link')!.getAttribute('href') === target.url
    )!
    expect(row.textContent).toContain('Replaced')
    expect(row.textContent).toContain('Old one')
    expect(row.textContent).toContain(target.title)
  })

  it('renders a hostile replaced title as text, never as markup', async () => {
    const hostile = clonePlan(fixturePlan).sessions[1]
    hostile.title = '<img src=x onerror=alert(1)>'
    const plan = withLog([
      { intent: 'redo-session', sessionNumber: 2, at: '2026-03-01T10:00:00.000Z', replacedSession: hostile },
    ])
    const { doc } = loadLive(plan)
    await settle()
    const two = section(doc, 2)
    expect(two.querySelector('img')).toBeNull()
    expect(two.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('live page: the request tray (scenario 12)', () => {
  it('a job that becomes refused lists every reason and leaves the session unchanged', async () => {
    const { dom, doc, api } = loadLive(fixturePlan)
    api.jobStates = [
      { stage: 'sourcing' },
      { stage: 'refused', result: { reasons: ['reason one', 'reason two'], stage: 'verification' } },
    ]
    const before = section(doc, 3).querySelector('.session-detail')!.innerHTML
    curate(dom)
    const three = section(doc, 3)
    buttonByText(three, '↻ Re-plan').click()
    buttonByText(three, 'Re-plan this session').click()
    await settle()
    const tray = doc.querySelector('[aria-label="Curation requests"]') as HTMLElement
    expect(tray.hidden).toBe(false)
    expect(tray.textContent).toContain('sourcing')
    await settle(1700)
    expect(tray.textContent).toContain('refused')
    expect(tray.textContent).toContain('reason one')
    expect(tray.textContent).toContain('reason two')
    expect(tray.textContent).toContain('verification')
    // Leaving curate mode removes the controls; the session itself is as served.
    buttonByText(doc, 'Done curating').click()
    expect(section(doc, 3).querySelector('.session-detail')!.innerHTML).toBe(before)
    const polls = api.requests.filter((r) => r.path === '/api/jobs/job-1')
    expect(polls.length).toBeGreaterThanOrEqual(2)
  })

  it('jobs already on record for the plan appear in the tray on load, newest first', async () => {
    const jobs: Job[] = [
      { id: 'j2', kind: 'verify', planId: PLAN_ID, stage: 'applied', startedAt: 't', updatedAt: 't' },
      { id: 'j1', kind: 'curate', planId: PLAN_ID, stage: 'failed', startedAt: 't', updatedAt: 't', result: { error: 'no provider configured; set XAI_API_KEY (see #30)' } },
    ]
    const { doc } = loadLive(fixturePlan, {}, jobs)
    await settle()
    const tray = doc.querySelector('[aria-label="Curation requests"]') as HTMLElement
    expect(tray.hidden).toBe(false)
    const text = tray.textContent!
    expect(text.indexOf('Verify')).toBeLessThan(text.indexOf('Curate'))
    expect(text).toContain('no provider configured; set XAI_API_KEY (see #30)')
  })
})
