/**
 * Read the four prompt files once. Kept apart from the adapter so the
 * app's wiring is one line and the adapter itself never touches the
 * filesystem — tests hand it strings.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Prompts {
  policy: string
  generate: string
  replaceSession: string
  replaceMaterial: string
}

export async function loadPrompts(dir = 'prompts'): Promise<Prompts> {
  const read = (name: string) => readFile(join(dir, name), 'utf8')
  const [policy, generate, replaceSession, replaceMaterial] = await Promise.all([
    read('policy.md'),
    read('generate.md'),
    read('replace-session.md'),
    read('replace-material.md'),
  ])
  return { policy, generate, replaceSession, replaceMaterial }
}
