/**
 * The HTTP surface over the Planner and the store: the plan list, the live
 * plan page, the self-contained export, and a small JSON API. One request
 * handler, Node's `http` module, no framework.
 *
 * The live page is `renderPlan(plan)` plus a layer the server splices in:
 * the stored progress as JSON, the layer's stylesheet, and the layer's
 * script. The layer goes immediately before the page's own inline script
 * (the last element before `</body>`) so `window.StudyPlanStore` exists
 * when that script seeds the page from storage — the renderer is untouched
 * and the layer is the only code that talks to the API. The export at
 * `/plans/:id/export` is `renderPlan(plan)` byte for byte.
 *
 * Every `/api/*` answer is JSON, errors included (`{ error }`); pages
 * answer HTML, or plain text for a 404.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PlanBrief } from './intelligence.ts'
import type { PlanStore, PlanSummary, Progress } from './plan-store.ts'
import { PlanNotFoundError } from './plan-store.ts'
import type { CurateCallerRequest, Planner } from './planner.ts'
import { PlanBusyError } from './planner.ts'
import type { PlanData } from '../plan-types.ts'
import { renderPlan } from '../renderer.ts'
import { validatePlan } from '../validation.ts'

export interface AppDeps {
  planner: Planner
  store: PlanStore
  /** The curation layer's script and stylesheet, read once at startup. */
  live: { js: string; css: string }
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void

/** Request bodies above this size are refused with 413. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024

class HttpError extends Error {
  readonly status: number
  readonly details: Record<string, unknown>
  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

class BodyTooLargeError extends Error {
  constructor() {
    super(`request body exceeds ${MAX_BODY_BYTES} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

export function createApp(deps: AppDeps): RequestHandler {
  const { planner, store, live } = deps

  return (req, res) => {
    void route(req, res).catch((err: unknown) => {
      // Last resort: the route threw after headers went out, or something
      // outside the handlers failed. Never leave the request hanging.
      if (!res.headersSent) {
        sendJson(res, 500, { error: errorMessage(err) })
      } else {
        res.end()
      }
    })
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname

    if (path.startsWith('/api/')) {
      try {
        await routeApi(method, path, req, res)
      } catch (err) {
        sendApiError(res, err)
      }
      return
    }

    let match: RegExpMatchArray | null
    if (method === 'GET' && path === '/') {
      sendHtml(res, 200, await renderPlanList(store))
    } else if (method === 'GET' && path === '/live.js') {
      send(res, 200, 'text/javascript; charset=utf-8', live.js)
    } else if (method === 'GET' && path === '/live.css') {
      send(res, 200, 'text/css; charset=utf-8', live.css)
    } else if (method === 'GET' && (match = path.match(/^\/plans\/([^/]+)\/export$/))) {
      const id = decodeURIComponent(match[1])
      const plan = await readPlanOr404(store, id, res)
      if (!plan) return
      res.setHeader('Content-Disposition', `attachment; filename="${id}.html"`)
      sendHtml(res, 200, renderPlan(plan))
    } else if (method === 'GET' && (match = path.match(/^\/plans\/([^/]+)$/))) {
      const id = decodeURIComponent(match[1])
      const plan = await readPlanOr404(store, id, res)
      if (!plan) return
      const progress = await store.readProgress(id)
      sendHtml(res, 200, renderLivePage(plan, progress))
    } else {
      sendText(res, 404, 'Not found')
    }
  }

  async function routeApi(
    method: string,
    path: string,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    let match: RegExpMatchArray | null
    if (path === '/api/plans') {
      if (method === 'GET') return sendJson(res, 200, await store.list())
      if (method === 'POST') {
        const brief = parseBrief(await readJsonBody(req))
        const job = planner.generate(brief)
        return sendJson(res, 202, { jobId: job.id })
      }
    } else if (path === '/api/plans/import' && method === 'POST') {
      const body = await readJsonBody(req)
      const validationErrors = validatePlan(body as PlanData)
      if (validationErrors.length > 0) {
        return sendJson(res, 400, { error: 'plan failed validation', validationErrors })
      }
      const plan = body as PlanData
      const id = await store.create(plan)
      // `write` renders the export beside the data so the directory is
      // complete from the first request. No verification here; the verify
      // job is the caller's next step.
      await store.write(id, plan)
      return sendJson(res, 201, { id })
    } else if ((match = path.match(/^\/api\/plans\/([^/]+)$/)) && method === 'GET') {
      return sendJson(res, 200, await store.read(decodeURIComponent(match[1])))
    } else if ((match = path.match(/^\/api\/plans\/([^/]+)\/curations$/)) && method === 'POST') {
      const id = decodeURIComponent(match[1])
      const request = parseCurationRequest(await readJsonBody(req))
      await store.read(id)
      const job = planner.curate(id, request)
      return sendJson(res, 202, { jobId: job.id })
    } else if ((match = path.match(/^\/api\/plans\/([^/]+)\/verify$/)) && method === 'POST') {
      const id = decodeURIComponent(match[1])
      await store.read(id)
      const job = planner.verify(id)
      return sendJson(res, 202, { jobId: job.id })
    } else if ((match = path.match(/^\/api\/plans\/([^/]+)\/jobs$/)) && method === 'GET') {
      const id = decodeURIComponent(match[1])
      await store.read(id)
      const jobs = [...planner.jobs(id)].reverse()
      return sendJson(res, 200, jobs)
    } else if ((match = path.match(/^\/api\/plans\/([^/]+)\/progress$/))) {
      const id = decodeURIComponent(match[1])
      if (method === 'GET') return sendJson(res, 200, await store.readProgress(id))
      if (method === 'PUT') {
        const body = await readJsonBody(req)
        if (!isPlainObject(body)) {
          throw new HttpError(400, 'progress must be a JSON object')
        }
        await store.writeProgress(id, body as Progress)
        res.statusCode = 204
        res.end()
        return
      }
    } else if ((match = path.match(/^\/api\/jobs\/([^/]+)$/)) && method === 'GET') {
      const job = planner.job(decodeURIComponent(match[1]))
      if (!job) throw new HttpError(404, `job not found: ${match[1]}`)
      return sendJson(res, 200, job)
    }
    throw new HttpError(404, `no route for ${method} ${path}`)
  }
}

// -- The pages ----------------------------------------------------------------

/** Escape data on its way into HTML (attribute or text). */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * JSON that is safe inside a `<script>` element: `<` becomes `<`, so
 * plan prose or a note containing `</script>` cannot end the element early.
 */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

const LIVE_JS_PATH = '/live.js'
const LIVE_CSS_PATH = '/live.css'

/**
 * `renderPlan(plan)` with the live layer spliced in immediately before the
 * page's inline script — the last `<script>` before `</body>`.
 */
export function renderLivePage(plan: PlanData, progress: Progress): string {
  const page = renderPlan(plan)
  const scriptAt = page.lastIndexOf('<script>')
  if (scriptAt === -1) throw new Error('renderer output has no page script to splice before')
  const layer =
    '<script id="live-progress" type="application/json">' +
    scriptJson(progress) +
    '</script>' +
    `<link rel="stylesheet" href="${LIVE_CSS_PATH}">` +
    `<script src="${LIVE_JS_PATH}"></script>`
  return page.slice(0, scriptAt) + layer + page.slice(scriptAt)
}

function sessionsDone(progress: Progress): number {
  const checkboxes = progress.checkboxes
  if (!isPlainObject(checkboxes)) return 0
  return Object.values(checkboxes).filter((value) => value === true).length
}

const LIST_CSS = `
body { margin: 0; padding: 32px 16px; font: 15px/1.5 ui-sans-serif, system-ui, sans-serif; background: #f4f0e7; color: #26332d; }
main { max-width: 720px; margin: 0 auto; }
h1 { font-family: Georgia, serif; font-weight: 500; font-size: 28px; margin: 0 0 20px; }
h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #56615a; margin: 32px 0 10px; }
ul { list-style: none; padding: 0; margin: 0; }
li { padding: 14px 16px; margin-bottom: 8px; background: #fbf9f4; border: 1px solid #d6cfc1; border-radius: 6px; }
.subject { font-weight: 650; }
.meta { color: #56615a; font-size: 13px; }
a { color: #873f35; }
.links a + a { margin-left: 12px; }
form { padding: 16px; background: #fbf9f4; border: 1px solid #d6cfc1; border-radius: 6px; display: grid; gap: 10px; }
label { display: grid; gap: 4px; font-size: 13px; color: #56615a; }
input, textarea { font: inherit; padding: 6px 8px; border: 1px solid #bdb3a3; border-radius: 4px; background: #fff; }
button { font: inherit; padding: 8px 14px; border: 1px solid #873f35; border-radius: 4px; background: #b45d4d; color: #fff; cursor: pointer; justify-self: start; }
button[disabled] { opacity: .6; cursor: default; }
#new-status { font-size: 13px; color: #56615a; min-height: 1.5em; }
#new-status.error { color: #873f35; }
.empty { color: #737a72; }
`.trim()

// The form's script: post the brief, follow the job until it settles, then
// go to the plan. Runs only on this page; the live page has its own layer.
const LIST_SCRIPT = `
(function () {
  var form = document.getElementById('new-plan');
  var status = document.getElementById('new-status');
  var button = form.querySelector('button');
  function show(text, isError) { status.textContent = text; status.className = isError ? 'error' : ''; }
  function poll(jobId) {
    fetch('/api/jobs/' + encodeURIComponent(jobId)).then(function (r) { return r.json(); }).then(function (job) {
      if (job.stage === 'applied') { window.location.href = '/plans/' + encodeURIComponent(job.result.planId); return; }
      if (job.stage === 'failed') { show('Failed: ' + job.result.error, true); button.disabled = false; return; }
      if (job.stage === 'refused') { show('Refused: ' + job.result.reasons.join('; '), true); button.disabled = false; return; }
      show('Stage: ' + job.stage);
      setTimeout(function () { poll(jobId); }, 1500);
    }).catch(function (err) { show(String(err), true); button.disabled = false; });
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var brief = {
      subject: form.subject.value.trim(),
      currentLevel: form.currentLevel.value.trim(),
      hoursPerDay: Number(form.hoursPerDay.value),
      targetCapability: form.targetCapability.value.trim()
    };
    button.disabled = true;
    show('Requesting…');
    fetch('/api/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brief) })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (answer) {
        if (!answer.ok) { show(answer.body.error || 'Request failed', true); button.disabled = false; return; }
        poll(answer.body.jobId);
      })
      .catch(function (err) { show(String(err), true); button.disabled = false; });
  });
})();
`.trim()

async function renderPlanList(store: PlanStore): Promise<string> {
  const summaries = await store.list()
  const rows: string[] = []
  for (const summary of summaries) {
    rows.push(renderPlanRow(summary, await store.readProgress(summary.id)))
  }
  const list =
    rows.length > 0
      ? '<ul>' + rows.join('') + '</ul>'
      : '<p class="empty">No plans yet. Generate one below, or import a plan.json through the API.</p>'
  return (
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Study plans</title><style>' +
    LIST_CSS +
    '</style></head><body><main>' +
    '<h1>Study plans</h1>' +
    list +
    '<h2>New plan</h2>' +
    '<form id="new-plan">' +
    '<label>Subject<input name="subject" required></label>' +
    '<label>Current level<textarea name="currentLevel" rows="2" required></textarea></label>' +
    '<label>Hours per day<input name="hoursPerDay" type="number" min="0.5" step="0.5" value="2" required></label>' +
    '<label>Target capability<textarea name="targetCapability" rows="2" required></textarea></label>' +
    '<button type="submit">Generate</button>' +
    '<div id="new-status" role="status" aria-live="polite"></div>' +
    '</form></main><script>' +
    LIST_SCRIPT +
    '</script></body></html>'
  )
}

function renderPlanRow(summary: PlanSummary, progress: Progress): string {
  const href = '/plans/' + encodeURIComponent(summary.id)
  const generated = summary.generatedAt.slice(0, 10)
  return (
    '<li><div class="subject"><a href="' +
    esc(href) +
    '">' +
    esc(summary.subject) +
    '</a></div><div class="meta">Generated ' +
    esc(generated) +
    ' · ' +
    sessionsDone(progress) +
    ' / ' +
    summary.sessionsCount +
    ' sessions done</div><div class="links"><a href="' +
    esc(href) +
    '">Open</a><a href="' +
    esc(href + '/export') +
    '" download>Download export</a></div></li>'
  )
}

// -- Request parsing ----------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseBrief(body: unknown): PlanBrief {
  if (
    !isPlainObject(body) ||
    !nonEmptyString(body.subject) ||
    !nonEmptyString(body.currentLevel) ||
    !nonEmptyString(body.targetCapability) ||
    typeof body.hoursPerDay !== 'number' ||
    !(body.hoursPerDay > 0)
  ) {
    throw new HttpError(
      400,
      'a plan brief needs subject, currentLevel, targetCapability (strings) and hoursPerDay (a positive number)'
    )
  }
  return {
    subject: body.subject,
    currentLevel: body.currentLevel,
    hoursPerDay: body.hoursPerDay,
    targetCapability: body.targetCapability,
  }
}

function parseCurationRequest(body: unknown): CurateCallerRequest {
  const bad = (why: string) => new HttpError(400, `invalid curation request: ${why}`)
  if (!isPlainObject(body)) throw bad('body must be a JSON object')
  const sessionNumber = body.sessionNumber
  if (typeof sessionNumber !== 'number' || !Number.isInteger(sessionNumber)) {
    throw bad('sessionNumber must be an integer')
  }
  switch (body.intent) {
    case 'drop-as-known':
      if (!nonEmptyString(body.known)) throw bad('drop-as-known needs known (a string)')
      return { intent: 'drop-as-known', sessionNumber, known: body.known }
    case 'swap-material': {
      if (!nonEmptyString(body.materialUrl)) throw bad('swap-material needs materialUrl')
      const by = body.by
      if (isPlainObject(by) && nonEmptyString(by.reason)) {
        return { intent: 'swap-material', sessionNumber, materialUrl: body.materialUrl, by: { reason: by.reason } }
      }
      if (isPlainObject(by) && nonEmptyString(by.url)) {
        return { intent: 'swap-material', sessionNumber, materialUrl: body.materialUrl, by: { url: by.url } }
      }
      throw bad('swap-material needs by.reason or by.url')
    }
    case 'redo-session': {
      if (body.reason !== undefined && typeof body.reason !== 'string') {
        throw bad('redo-session reason must be a string when present')
      }
      const request: CurateCallerRequest = { intent: 'redo-session', sessionNumber }
      if (nonEmptyString(body.reason)) request.reason = body.reason
      return request
    }
    default:
      throw bad('intent must be drop-as-known, swap-material or redo-session')
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req)
  if (raw.trim() === '') throw new HttpError(400, 'request body must be JSON')
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new HttpError(400, 'request body is not valid JSON')
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        // Keep draining so the client can read the 413 we send at the end.
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) reject(new BodyTooLargeError())
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

// -- Responses ----------------------------------------------------------------

async function readPlanOr404(
  store: PlanStore,
  id: string,
  res: ServerResponse
): Promise<PlanData | null> {
  try {
    return await store.read(id)
  } catch (err) {
    if (err instanceof PlanNotFoundError) {
      sendText(res, 404, `No plan named ${id}`)
      return null
    }
    throw err
  }
}

function sendApiError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) {
    sendJson(res, err.status, { error: err.message, ...err.details })
  } else if (err instanceof PlanNotFoundError) {
    sendJson(res, 404, { error: err.message })
  } else if (err instanceof PlanBusyError) {
    sendJson(res, 409, { error: err.message })
  } else if (err instanceof BodyTooLargeError) {
    sendJson(res, 413, { error: err.message })
  } else {
    sendJson(res, 500, { error: errorMessage(err) })
  }
}

function send(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(body))
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  send(res, status, 'text/html; charset=utf-8', body)
}

function sendText(res: ServerResponse, status: number, body: string): void {
  send(res, status, 'text/plain; charset=utf-8', body)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
