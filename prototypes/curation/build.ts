/**
 * PROTOTYPE — throwaway (ticket #19). Renders the real plan through the real
 * renderer, then injects the curation-variant script and styles so the
 * variants are judged against the actual page, not a blank route.
 *
 * Run: node --experimental-strip-types prototypes/curation/build.ts
 * Then open prototypes/curation/index.html (append ?variant=A|B|C).
 */
import { readFile, writeFile } from 'node:fs/promises'
import type { PlanData } from '../../src/plan-types.ts'
import { renderPlan } from '../../src/renderer.ts'

const here = new URL('.', import.meta.url)
const planUrl = new URL('../../plans/building-an-automated-options-trading-system/plan.json', here)
const plan = JSON.parse(await readFile(planUrl, 'utf8')) as PlanData
const css = await readFile(new URL('./prototype.css', here), 'utf8')
const js = await readFile(new URL('./prototype.js', here), 'utf8')

const planJson = JSON.stringify(plan).replace(/</g, '\u003c')
const injection =
  '<style>' + css + '</style>' +
  '<script>window.__PROTO_PLAN__ = ' + planJson + ';</script>' +
  '<script>' + js + '</script>'

const page = renderPlan(plan)
if (!page.includes('</body>')) throw new Error('renderer output has no </body>')
const out = new URL('./index.html', here)
// Function replacer: the injected JS contains `$'`, which a string replacer would expand.
await writeFile(out, page.replace('</body>', () => injection + '</body>'))
console.log('wrote', out.pathname)
