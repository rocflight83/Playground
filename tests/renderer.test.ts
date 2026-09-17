import { JSDOM } from 'jsdom'
import type { PlanData } from '../src/plan-types'
import { renderPlan } from '../src/renderer'
import { validatePlan } from '../src/validation'
import { fixturePlan } from './fixtures/plan-fixture'

function clonePlan(plan: PlanData): PlanData {
  return JSON.parse(JSON.stringify(plan)) as PlanData
}

function giveEveryPhaseAStory(plan: PlanData): PlanData {
  const seed = plan.phases[0].outlierStory!
  for (let i = 1; i < plan.phases.length; i++) {
    plan.phases[i].outlierStory = { ...seed }
  }
  return plan
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
      expect(['preferred', 'practitioner', 'off-list']).toContain(m.sourceType)
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
    // Issue 12: the practitioner tier is exercised end-to-end in the fixture
    // and the gate (per-publisher cap) does not refuse it.
    expect(allMaterials.some((m) => m.sourceType === 'practitioner')).toBe(true)
    expect(validatePlan(fixturePlan)).toEqual([])
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

  it('exercises a deliverable template on a written-artifact session (issue 14)', () => {
    const session = fixturePlan.sessions.find((s) => s.number === 2)!
    const template = session.deliverableTemplate
    expect(template).toBeDefined()
    expect(template!.fields.length).toBeGreaterThanOrEqual(2)
    expect(template!.fields.length).toBeLessThanOrEqual(8)
    expect(template!.fields.some((f) => f.kind === 'paragraph')).toBe(true)
    expect(template!.fields.some((f) => f.kind === 'line')).toBe(true)
    const ids = template!.fields.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const field of template!.fields) {
      expect(field.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(field.label).toBeTruthy()
      expect(field.prompt).toBeTruthy()
    }
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
  it('shows the scope note prominently near the top, naming both the stated and the honest target', () => {
    const html = renderPlan(fixturePlan)
    const doc = structure(html)
    const note = doc.querySelector('.scope-note')
    expect(note).not.toBeNull()
    const text = note!.textContent ?? ''
    expect(text).toContain('You asked for: ' + fixturePlan.meta.targetCapability)
    expect(text).toContain(
      'In 14 sessions at ' + fixturePlan.meta.hoursPerDay + ' hours a day, the honest target is: ' + fixturePlan.meta.honestTarget
    )
    expect(text).toContain(fixturePlan.scopeNote!)
    expect(html.indexOf('scope-note')).toBeLessThan(html.indexOf('class="session"'))
  })

  it('aims the hero target line at the honest target when one exists', () => {
    const doc = structure(renderPlan(fixturePlan))
    const hero = doc.querySelector('.hero-target')?.textContent ?? ''
    expect(hero).toContain(fixturePlan.meta.honestTarget!)
    expect(hero).not.toContain(fixturePlan.meta.targetCapability)
  })

  it('omits the scope note and shows the stated target when the targets do not diverge', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.meta.honestTarget
    delete plan.scopeNote
    const doc = structure(renderPlan(plan))
    expect(doc.querySelector('.scope-note')).toBeNull()
    expect(doc.body.textContent).not.toContain(fixturePlan.scopeNote!)
    expect(doc.body.textContent).not.toContain('You asked for')
    expect(doc.querySelector('.hero-target')?.textContent).toContain(plan.meta.targetCapability)
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

  it('renders an outlier story between its phase band and first session', () => {
    const doc = structure(renderPlan(fixturePlan))
    const main = doc.querySelector('.page')!
    const sequence: string[] = []
    for (const el of Array.from(main.children)) {
      if (el.classList.contains('phase-band')) {
        sequence.push(`band:${el.querySelector('.phase-title')?.textContent ?? ''}`)
      } else if (el.classList.contains('outlier-story')) {
        sequence.push('story')
      } else if (el.classList.contains('session')) {
        sequence.push(`session:${el.getAttribute('data-session')}`)
      }
    }

    expect(sequence.slice(0, 3)).toEqual(['band:Fundamentals', 'story', 'session:1'])
    const story = doc.querySelector('.outlier-story')
    expect(story).not.toBeNull()
    if (!story) return
    const phaseStory = fixturePlan.phases[0].outlierStory!
    expect(story.textContent).toContain(phaseStory.person)
    expect(story.textContent).toContain(phaseStory.approach)
    expect(story.textContent).toContain(phaseStory.principle)
    const citationLink = story.querySelector('.outlier-story-citation a')
    expect(citationLink?.getAttribute('href')).toBe(phaseStory.citation)
    expect(citationLink?.textContent).toBe(phaseStory.citation)
  })

  it('renders a muted placeholder at the phase boundary when the story is absent', () => {
    const plan = giveEveryPhaseAStory(clonePlan(fixturePlan))
    // Copy phase 0's story onto the other two phases so we can delete phase 1's
    // and confirm only that one becomes a placeholder.
    delete plan.phases[1].outlierStory
    const doc = structure(renderPlan(plan))

    // Three phases: phase 0 keeps its real story, phase 1 becomes the
    // placeholder, phase 2 keeps its copy. Three .outlier-story nodes total.
    expect(doc.querySelectorAll('.outlier-story')).toHaveLength(3)
    const placeholders = doc.querySelectorAll('.outlier-story--empty')
    expect(placeholders).toHaveLength(1)

    const applicationBand = Array.from(doc.querySelectorAll('.phase-band')).find((band) =>
      band.textContent?.includes('Application')
    )
    const placeholder = applicationBand?.nextElementSibling
    expect(placeholder?.classList.contains('outlier-story')).toBe(true)
    expect(placeholder?.classList.contains('outlier-story--empty')).toBe(true)
    // The placeholder sits between the band and the first session of the phase.
    expect(placeholder?.nextElementSibling?.classList.contains('session')).toBe(true)
    expect(placeholder?.nextElementSibling?.getAttribute('data-session')).toBe('7')
  })

  it('renders the empty placeholder as a single muted <p> with no heading or link', () => {
    const doc = structure(renderPlan(fixturePlan))
    // Phases 1 and 2 carry no story in the fixture, so two placeholders exist.
    const placeholders = Array.from(doc.querySelectorAll('.outlier-story--empty'))
    expect(placeholders.length).toBeGreaterThan(0)
    for (const placeholder of placeholders) {
      expect(placeholder.querySelector('h3')).toBeNull()
      expect(placeholder.querySelector('a')).toBeNull()
      expect(placeholder.querySelector('.tag')).toBeNull()
      expect(placeholder.children).toHaveLength(1)
      expect(placeholder.firstElementChild?.tagName).toBe('P')
    }
  })

  it('says plainly that no subject-specific outlier case was found', () => {
    const doc = structure(renderPlan(fixturePlan))
    const placeholders = Array.from(doc.querySelectorAll('.outlier-story--empty'))
    expect(placeholders.length).toBeGreaterThan(0)
    for (const placeholder of placeholders) {
      expect(placeholder.textContent?.trim()).toBe('No subject-specific outlier case found for this phase.')
    }
  })

  it('renders one .outlier-story node per phase and no placeholder when every phase has a story', () => {
    const plan = giveEveryPhaseAStory(clonePlan(fixturePlan))
    const doc = structure(renderPlan(plan))

    expect(doc.querySelectorAll('.outlier-story')).toHaveLength(plan.phases.length)
    expect(doc.querySelectorAll('.outlier-story--empty')).toHaveLength(0)
  })

  it('renders the placeholder at the very first phase boundary when phase 0 has no story', () => {
    const plan = clonePlan(fixturePlan)
    delete plan.phases[0].outlierStory
    const doc = structure(renderPlan(plan))

    const main = doc.querySelector('.page')!
    const sequence: string[] = []
    for (const el of Array.from(main.children)) {
      if (el.classList.contains('phase-band')) {
        sequence.push(`band:${el.querySelector('.phase-title')?.textContent ?? ''}`)
      } else if (el.classList.contains('outlier-story')) {
        sequence.push(el.classList.contains('outlier-story--empty') ? 'placeholder' : 'story')
      } else if (el.classList.contains('session')) {
        sequence.push(`session:${el.getAttribute('data-session')}`)
      }
    }

    expect(sequence.slice(0, 3)).toEqual(['band:Fundamentals', 'placeholder', 'session:1'])
  })

  it('escapes every outlier story value, including the citation href and link text', () => {
    const plan = clonePlan(fixturePlan)
    const story = plan.phases[0].outlierStory!
    story.person = '<Ada & friends>'
    story.approach = 'Used <unusual> methods & persisted'
    story.principle = 'Make it &lt;safe&gt; & useful'
    story.citation = 'https://example.com/case?a=1&b=<tag>'

    const html = renderPlan(plan)
    const escapedCitation = 'https://example.com/case?a=1&amp;b=&lt;tag&gt;'
    expect(html).toContain('&lt;Ada &amp; friends&gt;')
    expect(html).toContain('&lt;unusual&gt; methods &amp; persisted')
    expect(html).toContain('&amp;lt;safe&amp;gt; &amp; useful')
    expect(html).toContain(escapedCitation)
    expect(html).not.toMatch(/<Ada\b/i)
    expect(html).not.toContain('<tag>')

    const doc = structure(html)
    const renderedStory = doc.querySelector('.outlier-story')
    expect(renderedStory).not.toBeNull()
    expect(renderedStory?.querySelector('img')).toBeNull()
    expect(renderedStory?.textContent).toContain(story.person)
    expect(renderedStory?.textContent).toContain(story.approach)
    expect(renderedStory?.textContent).toContain(story.principle)
    const citationLink = renderedStory?.querySelector('.outlier-story-citation a')
    expect(citationLink?.getAttribute('href')).toBe(story.citation)
    expect(citationLink?.textContent).toBe(story.citation)
  })

  it('shows a visible warning on the story when the citation verification is unresolved', () => {
    const plan = clonePlan(fixturePlan)
    plan.phases[0].outlierStory!.verification = { status: 'unresolved-after-retries', checkedAt: null }

    const doc = structure(renderPlan(plan))
    const story = doc.querySelector('.outlier-story')
    expect(story).not.toBeNull()
    const warning = story?.querySelector('.outlier-story-warning')
    expect(warning).not.toBeNull()
    expect(warning?.classList.contains('warning')).toBe(true)
    expect(warning?.textContent ?? '').toMatch(/unverified|unresolved|citation/i)
    // The citation link is still rendered so the learner can read what the
    // page claims and decide whether to re-source it.
    expect(story?.querySelector('.outlier-story-citation a')?.getAttribute('href')).toBe(plan.phases[0].outlierStory!.citation)
  })

  it('does not show the warning when the story is healthy or unverified is unset', () => {
    const healthy = clonePlan(fixturePlan)
    healthy.phases[0].outlierStory!.verification = { status: 'verified-by-status', checkedAt: '2026-01-01T00:00:00.000Z' }
    const noVerification = clonePlan(fixturePlan)
    delete noVerification.phases[0].outlierStory!.verification

    expect(structure(renderPlan(healthy)).querySelector('.outlier-story-warning')).toBeNull()
    expect(structure(renderPlan(noVerification)).querySelector('.outlier-story-warning')).toBeNull()
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

describe('a templated session renders an outline the learner can fill in (issue 14)', () => {
  const TEMPLATED_NUMBER = 2

  function templateFields() {
    return fixturePlan.sessions.find((s) => s.number === TEMPLATED_NUMBER)!.deliverableTemplate!
      .fields
  }

  it('renders a .deliverable block with the one-liner as its heading', () => {
    const session = fixturePlan.sessions.find((s) => s.number === TEMPLATED_NUMBER)!
    const doc = structure(renderPlan(fixturePlan))
    const block = doc.querySelector(`.session[data-session="${TEMPLATED_NUMBER}"] .deliverable`)
    expect(block).not.toBeNull()
    expect(block?.getAttribute('data-session')).toBe(String(TEMPLATED_NUMBER))
    const heading = block?.querySelector('.deliverable-heading')
    expect(heading?.textContent).toBe(session.artifactOneLiner)
  })

  it('renders a labelled input per template field with id, label and placeholder', () => {
    const doc = structure(renderPlan(fixturePlan))
    const block = doc.querySelector(`.session[data-session="${TEMPLATED_NUMBER}"] .deliverable`)!
    const inputs = Array.from(block.querySelectorAll('.deliverable-input'))
    const fields = templateFields()
    expect(inputs).toHaveLength(fields.length)
    for (const field of fields) {
      const expectedId = `deliverable-${TEMPLATED_NUMBER}-${field.id}`
      const input = doc.getElementById(expectedId) as HTMLElement | null
      expect(input).not.toBeNull()
      expect(input?.getAttribute('data-session')).toBe(String(TEMPLATED_NUMBER))
      expect(input?.getAttribute('data-field')).toBe(field.id)
      expect(input?.getAttribute('placeholder')).toBe(field.prompt)
      const label = block.querySelector(`label[for="${expectedId}"]`)
      expect(label?.textContent).toBe(field.label)
    }
  })

  it('renders a textarea for a paragraph field and an input[type="text"] for a line field', () => {
    const doc = structure(renderPlan(fixturePlan))
    const fields = templateFields()
    for (const field of fields) {
      const id = `deliverable-${TEMPLATED_NUMBER}-${field.id}`
      const input = doc.getElementById(id) as HTMLElement | null
      expect(input).not.toBeNull()
      const expectedTag = field.kind === 'paragraph' ? 'TEXTAREA' : 'INPUT'
      const expectedType = field.kind === 'line' ? 'text' : null
      expect(input?.tagName).toBe(expectedTag)
      if (expectedType) expect(input?.getAttribute('type')).toBe(expectedType)
    }
  })

  it('renders no .deliverable block on sessions without a template, and keeps their notes-area', () => {
    const doc = structure(renderPlan(fixturePlan))
    const without = fixturePlan.sessions.find((s) => !s.deliverableTemplate)!
    const templated = fixturePlan.sessions.find((s) => s.deliverableTemplate)!
    expect(
      doc.querySelector(`.session[data-session="${without.number}"] .deliverable`)
    ).toBeNull()
    expect(
      doc.querySelector(`.session[data-session="${without.number}"] .notes-area`)
    ).not.toBeNull()
    expect(
      doc.querySelector(`.session[data-session="${templated.number}"] .deliverable`)
    ).not.toBeNull()
    expect(
      doc.querySelector(`.session[data-session="${templated.number}"] .notes-area`)
    ).not.toBeNull()
  })

  it('keeps the same number of .notes-area elements as before (template does not replace notes)', () => {
    const doc = structure(renderPlan(fixturePlan))
    const notes = doc.querySelectorAll('.notes-area')
    expect(notes).toHaveLength(fixturePlan.sessions.length)
  })

  it('renders one .deliverable-download button per templated session', () => {
    const doc = structure(renderPlan(fixturePlan))
    const download = doc.querySelector(
      `.session[data-session="${TEMPLATED_NUMBER}"] .deliverable-download`
    )
    expect(download).not.toBeNull()
    expect(download?.getAttribute('data-session')).toBe(String(TEMPLATED_NUMBER))
    // No download button on untemplated sessions.
    const without = fixturePlan.sessions.find((s) => !s.deliverableTemplate)!
    expect(
      doc.querySelector(`.session[data-session="${without.number}"] .deliverable-download`)
    ).toBeNull()
  })

  it('escapes a label and prompt that contain HTML so a hand-edited plan re-renders safely', () => {
    const plan = clonePlan(fixturePlan)
    const session = plan.sessions.find((s) => s.number === TEMPLATED_NUMBER)!
    session.deliverableTemplate!.fields[0].label = 'A <b>bold</b> label & quote'
    session.deliverableTemplate!.fields[0].prompt = 'Pick <em>one</em> answer & submit.'
    const html = renderPlan(plan)
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; label &amp; quote')
    expect(html).toContain('Pick &lt;em&gt;one&lt;/em&gt; answer &amp; submit.')
    expect(html).not.toContain('A <b>bold')
    expect(html).not.toContain('Pick <em>one')
    const doc = structure(html)
    const block = doc.querySelector(`.session[data-session="${TEMPLATED_NUMBER}"] .deliverable`)!
    expect(block.querySelector('b')).toBeNull()
    expect(block.querySelector('em')).toBeNull()
  })

  it('escapes a field id everywhere it enters an HTML attribute', () => {
    const plan = clonePlan(fixturePlan)
    const session = plan.sessions.find((s) => s.number === TEMPLATED_NUMBER)!
    session.deliverableTemplate!.fields[0].id = 'safe" onfocus="alert(1)'
    const html = renderPlan(plan)
    expect(html).toContain('safe&quot; onfocus=&quot;alert(1)')
    expect(html).not.toContain('id="deliverable-2-safe" onfocus="alert(1)')
  })
})

describe('consumption time appears on the page when measurement disagrees with the estimate (issue 13)', () => {
  function withMeasurement(
    estimatedDuration: number,
    measuredDuration: number,
    measuredBy: 'word-count' | 'video-metadata' | 'stated-read-time',
    sessionNumber = 1
  ): PlanData {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions.find((s) => s.number === sessionNumber)!]
    const material = plan.sessions[0].materials[0]
    material.estimatedDuration = estimatedDuration
    material.verification = {
      ...material.verification,
      measuredDuration,
      measuredBy,
    }
    return plan
  }

  it('renders a measured note beside the stated duration when a word-count measurement mismatches', () => {
    const plan = withMeasurement(60, 15, 'word-count')
    const doc = structure(renderPlan(plan))
    expect(doc.body.textContent).toContain('60 min stated')
    expect(doc.body.textContent).toContain('15 min read')
  })

  it('renders the note as a watch reading when measuredBy is video-metadata', () => {
    const plan = withMeasurement(10, 45, 'video-metadata')
    const doc = structure(renderPlan(plan))
    expect(doc.body.textContent).toContain('10 min stated')
    expect(doc.body.textContent).toContain('45 min watch')
  })

  it('renders no measured note when the measurement is inside the ratio+gap band', () => {
    const plan = withMeasurement(20, 15, 'word-count')
    const doc = structure(renderPlan(plan))
    expect(doc.body.textContent).not.toContain('stated · measured')
  })

  it('renders no measured note when the material has no measurement', () => {
    const plan = clonePlan(fixturePlan)
    plan.sessions = [plan.sessions[0]]
    const doc = structure(renderPlan(plan))
    expect(doc.body.textContent).not.toContain('stated · measured')
  })

  it('keeps both the stated and measured figures in the rendered material', () => {
    const plan = withMeasurement(60, 15, 'word-count')
    const doc = structure(renderPlan(plan))
    expect(doc.body.textContent).toContain('60 min stated')
    expect(doc.body.textContent).toContain('15 min read')
  })
})

describe('every session shows its materials / artifact time split (issue 13)', () => {
  it('renders a budget line for every session', () => {
    const doc = structure(renderPlan(fixturePlan))
    expect((doc.body.textContent?.match(/Budget:/g) ?? []).length).toBe(14)
  })

  it('reports the materials total and the artifact remainder for each session', () => {
    const doc = structure(renderPlan(fixturePlan))
    for (const session of fixturePlan.sessions) {
      const materialsTotal = session.materials.reduce((sum, m) => sum + m.estimatedDuration, 0)
      const remainder = session.estimatedTime - materialsTotal
      expect(doc.body.textContent).toContain(`${materialsTotal} min on materials`)
      expect(doc.body.textContent).toContain(`${remainder} min on the artifact`)
    }
  })

  it('reports "0 min on the artifact" when the materials fill the whole estimatedTime', () => {
    const plan = clonePlan(fixturePlan)
    const target = plan.sessions[11]
    target.materials = [
      { ...target.materials[0], estimatedDuration: 55 },
    ]
    target.estimatedTime = 55

    const text = structure(renderPlan(plan)).body.textContent ?? ''
    expect(text).toContain('55 min on materials')
    expect(text).toContain('0 min on the artifact')
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

describe('deliverable-template fields persist in the page progress store (issue 14)', () => {
  const TEMPLATED_NUMBER = 2
  const SESSION_KEY = String(TEMPLATED_NUMBER)

  function inputsForSession(doc: Document): HTMLInputElement[] {
    return Array.from(
      doc.querySelectorAll(`.session[data-session="${SESSION_KEY}"] .deliverable-input`)
    ) as HTMLInputElement[]
  }

  it('seeds rendered field values from the deliverables store on load', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan), {
      deliverables: { 2: { 'who-pays': 'Market makers short gamma.' } },
    })
    const doc = dom.window.document
    const seeded = doc.getElementById(`deliverable-${SESSION_KEY}-who-pays`) as HTMLInputElement | null
    expect(seeded?.value).toBe('Market makers short gamma.')
    const other = doc.getElementById(`deliverable-${SESSION_KEY}-why-persists`) as HTMLInputElement | null
    expect(other?.value).toBe('')
  })

  it('writes a typed value to deliverables[session][fieldId] on input', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const doc = dom.window.document
    const target = doc.getElementById(`deliverable-${SESSION_KEY}-who-pays`) as HTMLInputElement
    target.value = 'Pension funds'
    target.dispatchEvent(new dom.window.Event('input'))
    const saved = JSON.parse(dom.window.localStorage.getItem('studyPlanProgress')!)
    expect(saved.deliverables[SESSION_KEY]['who-pays']).toBe('Pension funds')
  })

  it('removes the key when a field is cleared, and removes an emptied session object too', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan), {
      deliverables: { 2: { 'who-pays': 'something' } },
    })
    const doc = dom.window.document
    const target = doc.getElementById(`deliverable-${SESSION_KEY}-who-pays`) as HTMLInputElement
    expect(target.value).toBe('something')
    target.value = ''
    target.dispatchEvent(new dom.window.Event('input'))
    const saved = JSON.parse(dom.window.localStorage.getItem('studyPlanProgress')!)
    // The whole session is gone, since its only field is now empty.
    expect(saved.deliverables).toBeUndefined()
  })

  it('leaves seeded values for ids the template does not have, untouched', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan), {
      deliverables: { 2: { 'who-pays': 'kept', 'ghost-id': 'orphan' } },
    })
    const doc = dom.window.document
    // Edit another field; the ghost id should still be in storage.
    const target = doc.getElementById(`deliverable-${SESSION_KEY}-why-persists`) as HTMLInputElement
    target.value = 'still there'
    target.dispatchEvent(new dom.window.Event('input'))
    const saved = JSON.parse(dom.window.localStorage.getItem('studyPlanProgress')!)
    expect(saved.deliverables[SESSION_KEY]['who-pays']).toBe('kept')
    expect(saved.deliverables[SESSION_KEY]['ghost-id']).toBe('orphan')
    expect(saved.deliverables[SESSION_KEY]['why-persists']).toBe('still there')
  })

  it('does not write a deliverables key on load when the store has none', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const saved = JSON.parse(dom.window.localStorage.getItem('studyPlanProgress') ?? 'null')
    expect(saved).toBeNull()
  })

  it('renders the Export Progress button so the filled template rides through export/import', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const doc = dom.window.document
    const exportBtn = Array.from(doc.querySelectorAll('button')).find(
      (b) => b.textContent === 'Export Progress'
    )
    expect(exportBtn).toBeDefined()
  })
})

describe('a templated session has a Download deliverable button (issue 14)', () => {
  const TEMPLATED_NUMBER = 2

  function captureDownload(
    dom: JSDOM,
    sessionNumber: number
  ): { blob: Blob | undefined; filename: string | null; inputValues: Record<string, string> } {
    const win = dom.window as unknown as {
      URL: { createObjectURL: (b: Blob) => string; revokeObjectURL: (s: string) => void }
    }
    let captured: Blob | undefined
    let capturedFilename: string | null = null
    const inputValues: Record<string, string> = {}
    const originalCreate = win.URL.createObjectURL
    const originalRevoke = win.URL.revokeObjectURL
    const blobUrl = 'blob:stub#download'
    win.URL.createObjectURL = (blob: Blob) => {
      captured = blob
      return blobUrl
    }
    win.URL.revokeObjectURL = () => {}
    // Make anchor.click() a no-op so jsdom does not try to follow the link.
    const origCreateElement = dom.window.document.createElement.bind(dom.window.document)
    dom.window.document.createElement = function (name: string) {
      const el = origCreateElement(name)
      if (name === 'a') {
        ;(el as HTMLAnchorElement).click = function () {
          capturedFilename = (el as HTMLAnchorElement).download
        }
      }
      return el
    } as typeof document.createElement
    try {
      const doc = dom.window.document
      const block = doc.querySelector(
        `.session[data-session="${sessionNumber}"] .deliverable`
      ) as HTMLElement
      const inputs = Array.from(
        block.querySelectorAll('.deliverable-input')
      ) as HTMLInputElement[]
      for (const input of inputs) {
        const field = input.getAttribute('data-field')!
        inputValues[field] = input.value
      }
      const button = doc.querySelector(
        `.session[data-session="${sessionNumber}"] .deliverable-download`
      ) as HTMLButtonElement
      button.click()
    } finally {
      win.URL.createObjectURL = originalCreate
      win.URL.revokeObjectURL = originalRevoke
      ;(dom.window.document as unknown as { createElement: typeof document.createElement }).createElement = origCreateElement
    }
    return { blob: captured, filename: capturedFilename, inputValues }
  }

  it('produces a session-NN-deliverable.md whose body is built from the rendered template fields', async () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const session = fixturePlan.sessions.find((s) => s.number === TEMPLATED_NUMBER)!
    const template = session.deliverableTemplate!
    const whoPays = dom.window.document.getElementById(
      `deliverable-${TEMPLATED_NUMBER}-who-pays`
    ) as HTMLInputElement
    const headline = dom.window.document.getElementById(
      `deliverable-${TEMPLATED_NUMBER}-headline`
    ) as HTMLInputElement
    whoPays.value = 'Market makers short gamma.'
    headline.value = 'Premium is rent on volatility insurance.'
    const capture = captureDownload(dom, TEMPLATED_NUMBER)
    expect(capture.filename).toBe(`session-0${TEMPLATED_NUMBER}-deliverable.md`)
    const text = await capture.blob!.text()
    const expectedHeadings = template.fields.map((field) => `## ${field.label}`)
    expect(text).toContain(`# ${session.artifactOneLiner}`)
    expect(text).toContain(`Session ${TEMPLATED_NUMBER}: ${session.title}`)
    for (const heading of expectedHeadings) {
      expect(text).toContain(heading)
    }
    expect(text).toContain('Market makers short gamma.')
    expect(text).toContain('Premium is rent on volatility insurance.')
  })

  it('uses "_(not written)_" for an empty field instead of a blank line', async () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const whoPays = dom.window.document.getElementById(
      `deliverable-${TEMPLATED_NUMBER}-who-pays`
    ) as HTMLInputElement
    whoPays.value = 'written'
    const capture = captureDownload(dom, TEMPLATED_NUMBER)
    const text = await capture.blob!.text()
    expect(text).toContain('written')
    expect(text).toContain('_(not written)_')
  })

  it('preserves a value that contains markdown (no sanitisation)', async () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const whoPays = dom.window.document.getElementById(
      `deliverable-${TEMPLATED_NUMBER}-who-pays`
    ) as HTMLInputElement
    const raw = 'A heading.\n\n## Not really a heading\n\n- a list'
    whoPays.value = raw
    const capture = captureDownload(dom, TEMPLATED_NUMBER)
    const text = await capture.blob!.text()
    expect(text).toContain('A heading.')
    expect(text).toContain('## Not really a heading')
    expect(text).toContain('- a list')
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

describe('the page is a quiet document that supports light and dark (issue 10)', () => {
  const css = () => renderPlan(fixturePlan).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

  it('paints the page background explicitly so it never renders transparent', () => {
    expect(css()).toMatch(/\bbody\s*\{[^}]*background:\s*var\(--paper\)/)
  })

  it('declares palettes for the system default and for an explicit light or dark choice', () => {
    const style = css()
    expect(style).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{[^}]*color-scheme:\s*dark/)
    expect(style).toMatch(/html\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/)
    expect(style).toMatch(/html\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/)
  })

  it('follows the system theme by default and cycles through explicit choices on the toggle', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const root = dom.window.document.documentElement
    const toggle = dom.window.document.getElementById('theme-toggle') as HTMLButtonElement
    expect(root.getAttribute('data-theme')).toBeNull()
    toggle.click()
    expect(root.getAttribute('data-theme')).toBe('light')
    toggle.click()
    expect(root.getAttribute('data-theme')).toBe('dark')
    toggle.click()
    expect(root.getAttribute('data-theme')).toBeNull()
  })

  it('remembers an explicit theme choice across reloads without touching progress state', () => {
    const html = renderPlan(fixturePlan)
    const dom = loadWithStorage(html)
    const toggle = dom.window.document.getElementById('theme-toggle') as HTMLButtonElement
    toggle.click()
    toggle.click()
    expect(dom.window.localStorage.getItem('studyPlanProgress')).toBeNull()
    expect(dom.window.localStorage.getItem('studyPlanTheme')).toBe('dark')

    const reloaded = new JSDOM(html, {
      runScripts: 'dangerously',
      url: 'https://example.com/',
      beforeParse(window) {
        window.localStorage.setItem('studyPlanTheme', 'dark')
      },
    })
    expect(reloaded.window.document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('writes nothing to storage merely by loading', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    expect(dom.window.localStorage.getItem('studyPlanProgress')).toBeNull()
  })

  it('leaves the accordion alone when a session is checked off', () => {
    const dom = loadWithStorage(renderPlan(fixturePlan))
    const doc = dom.window.document
    const detailFor = (n: number) =>
      doc.querySelector(`.session[data-session="${n}"] .session-detail`) as HTMLElement
    const checkbox = doc.querySelector(
      '.session[data-session="1"] input[type="checkbox"]'
    ) as HTMLInputElement
    expect(detailFor(1).hidden).toBe(false)
    checkbox.checked = true
    checkbox.dispatchEvent(new dom.window.Event('change'))
    expect(detailFor(1).hidden).toBe(false)
    expect(detailFor(2).hidden).toBe(true)
  })

  it('labels each phase band with the sessions it spans', () => {
    const doc = structure(renderPlan(fixturePlan))
    const bands = Array.from(doc.querySelectorAll('.phase-band')).map((b) => b.textContent ?? '')
    expect(bands[0]).toContain('Fundamentals')
    expect(bands[0]).toContain('Sessions 1–6')
    expect(bands[2]).toContain('Sessions 12–14')
  })

  it('keeps one persistent, fixed progress spine that carries the indicator', () => {
    const doc = structure(renderPlan(fixturePlan))
    const spine = doc.querySelector('.progress-spine')
    expect(spine).not.toBeNull()
    expect(spine?.querySelector('.progress-indicator')).not.toBeNull()
    expect(doc.querySelectorAll('.progress-indicator').length).toBe(1)
    expect(css()).toMatch(/\.progress-spine\s*\{[^}]*position:\s*fixed/)
  })

  it('states the target capability and level near the top', () => {
    const html = renderPlan(fixturePlan)
    expect(html.indexOf(fixturePlan.meta.targetCapability)).toBeLessThan(html.indexOf('class="session"'))
    expect(html.indexOf(fixturePlan.meta.currentLevel)).toBeLessThan(html.indexOf('class="session"'))
  })
})
