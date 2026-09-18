import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const REPO_ROOT = process.cwd()
const PROMPTS_DIR = join(REPO_ROOT, 'prompts')
const SKILL_MD = join(REPO_ROOT, '.claude', 'skills', 'study-plan', 'SKILL.md')

const PROMPT_FILES = [
  'README.md',
  'policy.md',
  'generate.md',
  'replace-session.md',
  'replace-material.md',
] as const

const DUTY_FILES = [
  'generate.md',
  'replace-session.md',
  'replace-material.md',
] as const

async function readPrompt(name: string): Promise<string> {
  return readFile(join(PROMPTS_DIR, name), 'utf8')
}

describe('prompts/', () => {
  describe('every required file exists and is non-empty', () => {
    for (const name of PROMPT_FILES) {
      it(`prompts/${name} exists and is non-empty`, async () => {
        const content = await readPrompt(name)
        expect(content.length).toBeGreaterThan(0)
      })
    }
  })

  describe('policy.md carries the anchors that survive a move', () => {
    it('contains the honest-target three questions', async () => {
      const policy = await readPrompt('policy.md')
      expect(policy).toMatch(/Physical adaptation/i)
      expect(policy).toMatch(/Credentialing/i)
      expect(policy).toMatch(/(Genuine|Genuinely)[^\n]*mastery/i)
    })

    it('lists the Preferred sources', async () => {
      const policy = await readPrompt('policy.md')
      expect(policy).toContain('Preferred sources')
    })
  })

  describe('SKILL.md is a front door that references every duty file by path', () => {
    it('SKILL.md exists', async () => {
      const skill = await readFile(SKILL_MD, 'utf8')
      expect(skill.length).toBeGreaterThan(0)
    })

    for (const name of DUTY_FILES) {
      it(`SKILL.md references prompts/${name} by path`, async () => {
        const skill = await readFile(SKILL_MD, 'utf8')
        expect(skill).toContain(`prompts/${name}`)
      })
    }
  })

  describe('prompt files are path-neutral', () => {
    for (const name of PROMPT_FILES) {
      it(`prompts/${name} contains neither \`npm \` nor \`plan.json\``, async () => {
        const content = await readPrompt(name)
        expect(content).not.toMatch(/npm\s/)
        expect(content).not.toContain('plan.json')
      })
    }
  })
})