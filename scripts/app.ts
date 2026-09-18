/**
 * The local app: one Node process serving the plan list, the live plan
 * page, the JSON API over the Planner, and the self-contained export.
 *
 * Usage: npm run app        (PORT=4321 by default; binds 127.0.0.1 only)
 *
 * `STUDY_PLAN_INTELLIGENCE` picks the intelligence adapter. `scripted`
 * (the default) has no provider behind it: generate and curate jobs fail
 * with "no provider configured" while everything else works against the
 * plans already in `plans/`. Ticket 19 adds `claude`.
 *
 * The proxy preload is `--import`ed by the npm script so link verification
 * honours HTTP_PROXY / HTTPS_PROXY exactly as the CLI commands do.
 */
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { UnavailableIntelligence, type Intelligence } from '../src/app/intelligence.ts'
import { FilePlanStore } from '../src/app/plan-store.ts'
import { Planner } from '../src/app/planner.ts'
import { createApp } from '../src/app/server.ts'

const HOST = '127.0.0.1'
const DEFAULT_PORT = 4321

function pickIntelligence(name: string): Intelligence {
  switch (name) {
    case 'scripted':
      return new UnavailableIntelligence()
    default:
      throw new Error(
        `STUDY_PLAN_INTELLIGENCE=${name} is not a known adapter (known: scripted)`
      )
  }
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got ${process.env.PORT}`)
  }
  const liveDir = new URL('../src/app/live/', import.meta.url)
  const live = {
    js: await readFile(new URL('live.js', liveDir), 'utf8'),
    css: await readFile(new URL('live.css', liveDir), 'utf8'),
  }
  const store = new FilePlanStore('plans')
  const intelligence = pickIntelligence(process.env.STUDY_PLAN_INTELLIGENCE ?? 'scripted')
  const planner = new Planner({ store, intelligence, fetch })
  const server = createServer(createApp({ planner, store, live }))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HOST, resolve)
  })
  console.log(`Study plans: http://${HOST}:${port}/`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
