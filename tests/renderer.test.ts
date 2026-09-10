import { JSDOM } from 'jsdom'
import type { PlanData } from '../src/plan-types'
import { renderPlan } from '../src/renderer'
import { fixturePlan } from './fixtures/plan-fixture'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

function load(html: string): JSDOM {
  return new JSDOM(html, { runScripts: 'dangerously' })
}

function structure(html: string): Document {
  return new JSDOM(html).window.document
}

describe('fixture plan exercises every part of the data model', () => {
  it('carries full meta, scope note, stakes and DISSS preamble', () => {
    expect(fixturePlan.meta.subject).toBeTruthy()
    expect(fixturePlan.meta.targetCapability).toBeTruthy()
    expect(fixturePlan.meta.currentLevel).toBeTruthy()
    expect(fixturePlan.meta.hoursPerDay).toBeGreaterThan(0)
    expect(fixturePlan.meta.generatedAt).toBeTruthy()
    expect(fixturePlan.scopeNote).toBeTruthy()
    expect(fixturePlan.stakes).toBeTruthy()
    expect(fixturePlan.disssPreamble.deconstruction).toBeTruthy()
    expect(fixturePlan.disssPreamble.selectionRationale).toBeTruthy()
    expect(fixturePlan.disssPreamble.cutList).toBeTruthy()
    expect(fixturePlan.disssPreamble.sequencingRationale).toBeTruthy()
  })

  it('has 14 numbered sessions partitioned in order across 3 phases', () => {
    const numbers = fixturePlan.sessions.map((s) => s.number)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    const phased = fixturePlan.phases.flatMap((p) => p.sessions)
    expect(phased).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(fixturePlan.phases.length).toBe(3)
    for (const phase of fixturePlan.phases) {
      expect(phase.title).toBeTruthy()
    }
  })

  it('exercises materials with durations, source types, a paid flag with price, and every verification state', () => {
    const allMaterials = fixturePlan.sessions.flatMap((s) => s.materials)
    for (const m of allMaterials) {
      expect(m.estimatedDuration).toBeGreaterThan(0)
      expect(['preferred', 'off-list']).toContain(m.sourceType)
      expect(m.verification.status).toBeTruthy()
    }
    const statuses = new Set(allMaterials.map((m) => m.verification.status))
    expect(statuses).toContain('verified-by-status')
    expect(statuses).toContain('verified-by-content')
    expect(statuses).toContain('replaced-after-failure')
    expect(statuses).toContain('unresolved-after-retries')
    const paid = allMaterials.filter((m) => m.paid)
    expect(paid.length).toBe(1)
    expect(paid[0].price).toBeGreaterThan(0)
  })

  it('keeps every session completable with a free path and records an outlier story with a citation', () => {
    for (const session of fixturePlan.sessions) {
      expect(session.materials.some((m) => !m.paid)).toBe(true)
      expect(session.selfCheck).toBeTruthy()
      expect(session.artifactOneLiner).toBeTruthy()
    }
    const story = fixturePlan.phases.find((p) => p.outlierStory)?.outlierStory
    expect(story?.citation).toBeTruthy()
  })
})

describe('rendering produces a complete, self-contained document', () => {
  it('returns a full HTML document', () => {
    const html = renderPlan(fixturePlan)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<html')
    expect(html).toContain('<head>')
    expect(html).toContain('<body>')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('references no external stylesheet, script or font', () => {
    const html = renderPlan(fixturePlan)
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script[^>]*\bsrc\s*=/i)
    expect(html).not.toMatch(/@import/i)
    expect(html).not.toMatch(/@font-face/i)
    expect(html).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//i)
    expect(html).not.toMatch(/<iframe/i)
  })

  it('gives wide content its own scroll container and prevents horizontal page scroll', () => {
    const css = renderPlan(fixturePlan).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
    expect(css).toMatch(/overflow-x:\s*hidden/)
    expect(css).toMatch(/overflow-x:\s*auto/)
    expect(css).toMatch(/overflow-wrap:\s*break-word/)
  })
})

describe('the page reads as a study plan', () => {
  it('shows the scope note prominently near the top', () => {
    const html = renderPlan(fixturePlan)
    const doc = structure(html)
    expect(doc.querySelector('.scope-note')?.textContent).toContain(fixturePlan.scopeNote!)
    expect(html.indexOf('scope-note')).toBeLessThan(html.indexOf('class="session"'))
  })

  it('omits the scope note when the targets do not diverge', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.scopeNote
    const doc = structure(renderPlan(plan))
    expect(doc.querySelector('.scope-note')).toBeNull()
    expect(doc.body.textContent).not.toContain(fixturePlan.scopeNote!)
  })

  it('renders a stakes field near the top', () => {
    const html = renderPlan(fixturePlan)
    const doc = structure(html)
    const stakes = doc.getElementById('stakes')
    expect(stakes).not.toBeNull()
    expect(stakes?.tagName).toBe('INPUT')
    expect(html.indexOf('id="stakes"')).toBeLessThan(html.indexOf('class="session"'))
  })

  it('renders the DISSS preamble including the cut list and the ordering rationale', () => {
    const html = renderPlan(fixturePlan)
    expect(html).toContain(fixturePlan.disssPreamble.deconstruction)
    expect(html).toContain(fixturePlan.disssPreamble.selectionRationale)
    expect(html).toContain(fixturePlan.disssPreamble.cutList)
    expect(html).toContain(fixturePlan.disssPreamble.sequencingRationale)
  })

  it('separates sessions into their phases with phase bands', () => {
    const doc = structure(renderPlan(fixturePlan))
    const bands = Array.from(doc.querySelectorAll('.phase-band'))
    expect(bands.length).toBe(fixturePlan.phases.length)
    for (const phase of fixturePlan.phases) {
      expect(doc.body.textContent).toContain(phase.title)
    }
  })
})

describe('sessions render as collapsed rows that expand on click', () => {
  it('shows all 14 sessions in order as collapsed rows with number, title, artifact and checkbox', () => {
    const doc = structure(renderPlan(fixturePlan))
    const rows = Array.from(doc.querySelectorAll('.session'))
    expect(rows.length).toBe(14)
    expect(rows.map((r) => Number(r.getAttribute('data-session')))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ])
    for (const session of fixturePlan.sessions) {
      const row = doc.querySelector(`.session[data-session="${session.number}"]`)!
      const summary = row.querySelector('.session-summary')!
      expect(summary.querySelector('.session-number')?.textContent).toBe(String(session.number))
      expect(summary.querySelector('.session-title')?.textContent).toBe(session.title)
      expect(summary.querySelector('.session-artifact')?.textContent).toBe(session.artifactOneLiner)
      expect(summary.querySelector('input[type="checkbox"]')).not.toBeNull()
      expect((row.querySelector('.session-detail') as HTMLElement).hidden).toBe(true)
    }
  })

  it('expands a session on click to reveal materials, durations, self-check and notes, and collapses again', () => {
    const dom = load(renderPlan(fixturePlan))
    const doc = dom.window.document
    const row = doc.querySelector('.session[data-session="1"]')!
    const summary = row.querySelector('.session-summary') as HTMLElement
    const detail = row.querySelector('.session-detail') as HTMLElement

    summary.click()
    expect(detail.hidden).toBe(false)
    expect(detail.querySelector('.material-link')).not.toBeNull()
    expect(detail.textContent).toContain('30 min')
    expect(detail.textContent).toContain(fixturePlan.sessions[0].selfCheck)
    expect(detail.querySelector('textarea')).not.toBeNull()

    summary.click()
    expect(detail.hidden).toBe(true)
  })

  it('does not expand when the checkbox is clicked, and toggles the checkbox instead', () => {
    const dom = load(renderPlan(fixturePlan))
    const doc = dom.window.document
    const row = doc.querySelector('.session[data-session="1"]')!
    const detail = row.querySelector('.session-detail') as HTMLElement
    const checkbox = row.querySelector('.session-summary input[type="checkbox"]') as HTMLInputElement

    checkbox.click()
    expect(checkbox.checked).toBe(true)
    expect(detail.hidden).toBe(true)
  })

  it('shows a paid material with its price', () => {
    const html = renderPlan(fixturePlan)
    expect(html).toMatch(/\$29/)
    expect(html).toMatch(/paid/i)
  })
})

describe('the renderer is a pure, deterministic function of the plan data', () => {
  it('produces identical output for the same fixture rendered twice', () => {
    expect(renderPlan(fixturePlan)).toBe(renderPlan(fixturePlan))
  })

  it('produces identical output for a structurally equal but distinct plan object', () => {
    expect(renderPlan(clonePlan(fixturePlan))).toBe(renderPlan(fixturePlan))
  })

  it('does not persist checkbox or notes state across reloads (inert in this ticket)', () => {
    const html = renderPlan(fixturePlan)
    const first = load(html)
    const box = first.window.document.querySelector(
      '.session[data-session="1"] input[type="checkbox"]'
    ) as HTMLInputElement
    box.checked = true

    const second = load(html)
    const reloaded = second.window.document.querySelector(
      '.session[data-session="1"] input[type="checkbox"]'
    ) as HTMLInputElement
    expect(reloaded.checked).toBe(false)
  })

  it('escapes hand-edited content so a plan re-renders safely', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions[0].title = '<img src=x onerror=alert(1)>'
    const html = renderPlan(plan)
    expect(html).toContain('&lt;img')
    expect(html).not.toMatch(/<img\b/i)
    expect(html).not.toContain('<img src=x')
  })
})
