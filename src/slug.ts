/**
 * Derive a filesystem-safe slug from a subject string. Used by the generator
 * to name each plan's directory so multiple plans accumulate without
 * collision. The slug is deterministic for a given input, contains only
 * `[a-z0-9-]`, never starts or ends with a dash, and falls back to `plan`
 * when the subject produces nothing usable.
 */
export function slugify(subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'plan'
}