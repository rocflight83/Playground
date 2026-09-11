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

// localStorage throws for the opaque origin `load()` uses above, so these tests
// give the page a real origin and can seed `studyPlanProgress` up front to
// simulate "the browser already has state when the page loads" (i.e. a reload).
function loadWithStorage(html: string, seed?: Record<string, unknown>): JSDOM {
  return new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.com/',
    beforeParse(window) {
      if (seed) window.localStorage.setItem('studyPlanProgress', JSON.stringify(seed))
    },
  })
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
    const main = doc.querySelector('.page')!
    const seq: (string | number)[] = []
    for (const el of Array.from(main.children)) {
      if (el.classList.contains('phase-band')) {
        seq.push(el.querySelector('.phase-title')!.textContent ?? '')
      } else if (el.classList.contains('session')) {
        seq.push(Number(el.getAttribute('data-session')))
      }
    }
    const expected: (string | number)[] = []
    for (const phase of fixturePlan.phases) {
      expected.push(phase.title, ...phase.sessions)
    }
    expect(seq).toEqual(expected)
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
    // Session 2, not 1: session 1 is the lowest unchecked session and is
    // already auto-expanded on load, which would make the first click below
    // collapse rather than expand it.
    const dom = load(renderPlan(fixturePlan))
    const doc = dom.window.document
    const row = doc.querySelector('.session[data-session="2"]')!
    const summary = row.querySelector('.session-summary') as HTMLElement
    const detail = row.querySelector('.session-detail') as HTMLElement

    summary.click()
    expect(detail.hidden).toBe(false)
    const link = detail.querySelector('.material-link')
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe(fixturePlan.sessions[1].materials[0].url)
    expect(detail.textContent).toContain('35 min')
    expect(detail.textContent).toContain(fixturePlan.sessions[1].selfCheck)
    expect(detail.querySelector('textarea')).not.toBeNull()

    summary.click()
    expect(detail.hidden).toBe(true)
  })

  it('does not expand when the checkbox is clicked, and toggles the checkbox instead', () => {
    // Session 2, not 1, for the same reason as above: session 1 starts expanded.
    const dom = load(renderPlan(fixturePlan))
    const doc = dom.window.document
    const row = doc.querySelector('.session[data-session="2"]')!
    const detail = row.querySelector('.session-detail') as HTMLElement
    const checkbox = row.querySelector('.session-summary input[type="checkbox"]') as HTMLInputElement

    checkbox.click()
    expect(checkbox.checked).toBe(true)
    expect(detail.hidden).toBe(true)
  })

  it('shows a paid material with its price', () => {
    const dom = load(renderPlan(fixturePlan))
    const doc = dom.window.document
    ;(doc.querySelector('.session[data-session="2"] .session-summary') as HTMLElement).click()
    const paid = doc.querySelector('.session[data-session="2"] .material-paid')
    expect(paid?.textContent).toContain('$29')
  })

  it('renders no price affordance when a plan has no paid material', () => {
    const plan = clonePlan(fixturePlan)
    for (const session of plan.sessions) {
      for (const material of session.materials) material.paid = false
    }
    const doc = structure(renderPlan(plan))
    expect(doc.querySelector('.material-paid')).toBeNull()
  })

  it('renders a visible warning on a session carrying an unresolved material', () => {
    const doc = structure(renderPlan(fixturePlan))
    // Fixture session 12 has one material with verification status
    // 'unresolved-after-retries'.
    const warned = doc.querySelector('.session[data-session="12"] .session-warning')
    expect(warned).not.toBeNull()
    expect(warned?.textContent).toBeTruthy()
  })

  it('renders no warning on a session with fully verified materials', () => {
    const doc = structure(renderPlan(fixturePlan))
    const clean = doc.querySelector('.session[data-session="1"] .session-warning')
    expect(clean).toBeNull()
  })

  it('renders sessions 6 and 11 as consolidation slots and no others', () => {
    const doc = structure(renderPlan(fixturePlan))
    const allSessions = Array.from(doc.querySelectorAll('.session'))
    const consolidationNumbers: number[] = []
    for (const el of allSessions) {
      const isConsolidation = el.getAttribute('data-consolidation') === 'true'
      const badge = el.querySelector('.session-consolidation')
      expect(Boolean(badge) === isConsolidation).toBe(true)
      if (isConsolidation) {
        const number = Number(el.getAttribute('data-session'))
        consolidationNumbers.push(number)
        expect(badge?.textContent).toBeTruthy()
      }
    }
    expect(consolidationNumbers.sort((a, b) => a - b)).toEqual([6, 11])
  })

  it('shows the high-frequency units each session drills (CAFE repetition)', () => {
    const doc = structure(renderPlan(fixturePlan))
    for (const session of fixturePlan.sessions) {
      const el = doc.querySelector(`.session[data-session="${session.number}"]`)!
      const text = el.textContent ?? ''
      for (const unit of session.highFrequencyUnits) {
        expect(text).toContain(unit)
      }
    }
  })

  it("shows a session's encoding hook when it has one, and nothing in its place when it does not", () => {
    const doc = structure(renderPlan(fixturePlan))
    const withHook = fixturePlan.sessions.find((s) => s.encodingHook)!
    const withoutHook = fixturePlan.sessions.find((s) => !s.encodingHook)!

    const hookEl = doc.querySelector(`.session[data-session="${withHook.number}"] .session-hook`)
    expect(hookEl?.textContent).toContain(withHook.encodingHook!)
    expect(
      doc.querySelector(`.session[data-session="${withoutHook.number}"] .session-hook`)
    ).toBeNull()
  })
})

describe('progress state persists to localStorage (issue 02)', () => {
  it('restores a checked session from storage on load', () => {
    const html = renderPlan(fixturePlan)
    const dom = loadWithStorage(html, { checkboxes: { 3: true } })
    const doc = dom.window.document
    const checked = doc.querySelector(
      '.session[data-session="3"] input[type="checkbox"]'
    ) as HTMLInputElement
    const unchecked = doc.querySelector(
      '.session[data-session="1"] input[type="checkbox"]'
    ) as HTMLInputElement
    expect(checked.checked).toBe(true)
    expect(unchecked.checked).toBe(false)
  })

  it('restores a note from storage on load', () => {
    const html = renderPlan(fixturePlan)
    const dom = loadWithStorage(html, { notes: { 5: 'Review argparse subcommands.' } })
    const textarea = dom.window.document.getElementById('notes-5') as HTMLTextAreaElement
    expect(textarea.value).toBe('Review argparse subcommands.')
  })

  it('restores the stakes field from storage on load', () => {
    const html = renderPlan(fixturePlan)
    const dom = loadWithStorage(html, { stakes: 'Ship or refund my course fee.' })
    const stakes = dom.window.document.getElementById('stakes') as HTMLInputElement
    expect(stakes.value).toBe('Ship or refund my course fee.')
  })

  it('persists a checkbox change to storage, keyed by session number', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const checkbox = dom.window.document.querySelector(
      '.session[data-session="1"] input[type="checkbox"]'
    ) as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new dom.window.Event('change'))
    const saved = JSON.parse(dom.window.localStorage.getItem('studyPlanProgress')!)
    expect(saved.checkboxes['1']).toBe(true)
  })

  it('persists a typed note to storage, keyed by session number', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const textarea = dom.window.document.getElementById('notes-2') as HTMLTextAreaElement
    textarea.value = 'Remember the off-list source needs a paid fallback check.'
    textarea.dispatchEvent(new dom.window.Event('input'))
    const saved = JSON.parse(dom.window.localStorage.getItem('studyPlanProgress')!)
    expect(saved.notes['2']).toBe('Remember the off-list source needs a paid fallback check.')
  })

  it('persists the stakes field to storage', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const stakes = dom.window.document.getElementById('stakes') as HTMLInputElement
    stakes.value = 'No excuses.'
    stakes.dispatchEvent(new dom.window.Event('input'))
    const saved = JSON.parse(dom.window.localStorage.getItem('studyPlanProgress')!)
    expect(saved.stakes).toBe('No excuses.')
  })

  it('shows a progress indicator that reflects the number of checked sessions', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const doc = dom.window.document
    expect(doc.querySelector('.progress-indicator')?.textContent).toBe('0 of 14 sessions complete')
    const checkbox = doc.querySelector(
      '.session[data-session="1"] input[type="checkbox"]'
    ) as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new dom.window.Event('change'))
    expect(doc.querySelector('.progress-indicator')?.textContent).toBe('1 of 14 sessions complete')
  })

  it('renders export and import controls', () => {
    const doc = loadWithStorage(renderPlan(fixturePlan)).window.document
    const exportBtn = Array.from(doc.querySelectorAll('button')).find(
      (b) => b.textContent === 'Export Progress'
    )
    expect(exportBtn).not.toBeUndefined()
    expect(doc.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('expands the lowest-numbered unchecked session on load', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan), { checkboxes: { 1: true, 2: true } })
    const doc = dom.window.document
    const detailFor = (n: number) =>
      doc.querySelector(`.session[data-session="${n}"] .session-detail`) as HTMLElement
    expect(detailFor(3).hidden).toBe(false)
    expect(detailFor(1).hidden).toBe(true)
    expect(detailFor(4).hidden).toBe(true)
  })

  it('force-expands no session once every session is checked', () => {
    const allChecked = Object.fromEntries(fixturePlan.sessions.map((s) => [s.number, true]))
    const dom = loadWithStorage(renderPlan(fixturePlan), { checkboxes: allChecked })
    const doc = dom.window.document
    const details = Array.from(doc.querySelectorAll('.session-detail')) as HTMLElement[]
    expect(details.every((d) => d.hidden)).toBe(true)
  })
})

describe('the renderer is a pure, deterministic function of the plan data', () => {
  it('produces identical output for the same fixture rendered twice', () => {
    expect(renderPlan(fixturePlan)).toBe(renderPlan(fixturePlan))
  })

  it('produces identical output for a structurally equal but distinct plan object', () => {
    expect(renderPlan(clonePlan(fixturePlan))).toBe(renderPlan(fixturePlan))
  })

  it('does not mutate the plan data it is given', () => {
    const plan = clonePlan(fixturePlan)
    const before = JSON.stringify(plan)
    renderPlan(plan)
    expect(JSON.stringify(plan)).toBe(before)
  })

  it('reflects data edits on re-render, proving there is no stale cache', () => {
    const plan = clonePlan(fixturePlan)
    const first = renderPlan(plan)
    plan.sessions[0].title = 'A hand-edited title'
    const second = renderPlan(plan)
    expect(second).not.toBe(first)
    expect(second).toContain('A hand-edited title')
    expect(first).not.toContain('A hand-edited title')
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
