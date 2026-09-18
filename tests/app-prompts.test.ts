import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPrompts } from '../src/app/prompts'

describe('loadPrompts', () => {
  it('reads the four prompt files from prompts/ by default (ticket 16 files)', async () => {
    const prompts = await loadPrompts()
    expect(prompts.policy).toMatch(/Preferred sources/)
    expect(prompts.generate).toMatch(/^# Generate/)
    expect(prompts.replaceSession).toMatch(/^# Replace a session/)
    expect(prompts.replaceMaterial).toMatch(/^# Replace a material/)
  })

  it('reads from a supplied directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'prompts-'))
    await writeFile(join(dir, 'policy.md'), 'P')
    await writeFile(join(dir, 'generate.md'), 'G')
    await writeFile(join(dir, 'replace-session.md'), 'S')
    await writeFile(join(dir, 'replace-material.md'), 'M')
    expect(await loadPrompts(dir)).toEqual({ policy: 'P', generate: 'G', replaceSession: 'S', replaceMaterial: 'M' })
  })
})
