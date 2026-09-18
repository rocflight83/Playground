/**
 * Shared wiring for `npm run app` and `npm run dry-run`: pick the
 * `Intelligence` adapter from the environment and build the usage log.
 *
 * `STUDY_PLAN_INTELLIGENCE` names the adapter. When unset it defaults to
 * `xai` if `XAI_API_KEY` is set and to `scripted` (no provider) otherwise.
 * `claude` is reserved for #29's adapter and fails until it is built.
 *
 * Every xAI call appends one JSON line to `plans/.usage.log` so a dry run
 * can be tallied after the fact without instrumenting the console.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import OpenAI from 'openai'
import { UnavailableIntelligence, type Intelligence } from '../src/app/intelligence.ts'
import { createXaiIntelligence, xaiClientOf, type XaiUsage } from '../src/app/intelligence-xai.ts'
import { loadPrompts } from '../src/app/prompts.ts'

export const XAI_BASE_URL = 'https://api.x.ai/v1'
export const USAGE_LOG_PATH = 'plans/.usage.log'

export function intelligenceName(env: NodeJS.ProcessEnv): string {
  return env.STUDY_PLAN_INTELLIGENCE ?? (env.XAI_API_KEY ? 'xai' : 'scripted')
}

/** Append one JSON line per call; the directory is created on first use. */
export function usageLogger(path = USAGE_LOG_PATH, onRecord?: (u: XaiUsage) => void): (u: XaiUsage) => void {
  let ready: Promise<void> | null = null
  return (usage) => {
    onRecord?.(usage)
    ready ??= mkdir(dirname(path), { recursive: true }).then(() => undefined)
    void ready
      .then(() => appendFile(path, JSON.stringify({ at: new Date().toISOString(), ...usage }) + '\n'))
      .catch((err: unknown) => {
        console.error(`usage log: ${err instanceof Error ? err.message : String(err)}`)
      })
  }
}

export async function pickIntelligence(
  env: NodeJS.ProcessEnv,
  onUsage?: (u: XaiUsage) => void
): Promise<Intelligence> {
  const name = intelligenceName(env)
  switch (name) {
    case 'scripted':
      return new UnavailableIntelligence()
    case 'xai': {
      if (!env.XAI_API_KEY) {
        throw new Error('STUDY_PLAN_INTELLIGENCE=xai needs XAI_API_KEY (env or .env)')
      }
      const client = xaiClientOf(new OpenAI({ baseURL: XAI_BASE_URL, apiKey: env.XAI_API_KEY }))
      return createXaiIntelligence({ client, prompts: await loadPrompts(), onUsage: usageLogger(USAGE_LOG_PATH, onUsage) })
    }
    case 'claude':
      throw new Error('STUDY_PLAN_INTELLIGENCE=claude is not built; see #29')
    default:
      throw new Error(`STUDY_PLAN_INTELLIGENCE=${name} is not a known adapter (known: scripted, xai)`)
  }
}
