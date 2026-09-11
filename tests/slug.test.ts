import { slugify } from '../src/slug'

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Python Programming')).toBe('python-programming')
  })

  it('replaces non-alphanumeric characters with dashes', () => {
    expect(slugify('C++ & Systems!')).toBe('c-systems')
  })

  it('collapses runs of dashes and trims them from the ends', () => {
    expect(slugify('  --- foo --- bar ---  ')).toBe('foo-bar')
  })

  it('returns the same slug for the same input on repeated calls (deterministic)', () => {
    expect(slugify('Algorithms & Data Structures')).toBe(
      slugify('Algorithms & Data Structures')
    )
  })

  it('produces a slug that differs for distinct subjects', () => {
    expect(slugify('Python Programming')).not.toBe(slugify('Rust Programming'))
  })

  it('produces only filesystem-safe characters', () => {
    const slug = slugify('Foo / Bar? Baz:Quux')
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).not.toContain('/')
    expect(slug).not.toContain('..')
  })

  it('falls back to "plan" when the subject produces an empty slug', () => {
    expect(slugify('!!!')).toBe('plan')
    expect(slugify('   ')).toBe('plan')
    expect(slugify('///')).toBe('plan')
  })

  it('preserves digits', () => {
    expect(slugify('Top 10 Algorithms')).toBe('top-10-algorithms')
  })
})