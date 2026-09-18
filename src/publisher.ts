/**
 * Map a material URL to the publisher the per-publisher cap counts.
 *
 * "Publisher" is the registrable domain (so `cdn.cboe.com` and
 * `www.cboe.com` are one), with two carve-outs for hosting platforms:
 *
 *   - On subdomain-tenant platforms (`github.io`, `readthedocs.io`,
 *     `substack.com`, ...) the tenant label immediately left of the
 *     registrable domain *is* the publisher, so two users on the same
 *     platform count separately.
 *   - On path-tenant platforms (`github.com`, `medium.com`, ...) the first
 *     path segment is appended: `github.com/vollib`.
 *
 * Video hosts (`youtube.com`, `youtu.be`, `vimeo.com`) return `null` —
 * the URL does not name the channel, so the shell cannot count it. The
 * skill carries the breadth rule for these by hand.
 *
 * Anything that is not a parseable `http(s)` URL also returns `null`;
 * validation already reports malformed URLs separately.
 */

const TWO_LABEL_PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'co.nz',
  'co.jp',
  'ac.jp',
  'co.in',
  'co.za',
  'com.br',
  'com.mx',
  'com.sg',
])

const SUBDOMAIN_TENANT_PLATFORMS: ReadonlySet<string> = new Set([
  'github.io',
  'gitlab.io',
  'readthedocs.io',
  'netlify.app',
  'vercel.app',
  'pages.dev',
  'substack.com',
  'wordpress.com',
  'blogspot.com',
  'notion.site',
])

const PATH_TENANT_PLATFORMS: ReadonlySet<string> = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'medium.com',
  'huggingface.co',
])

const VIDEO_HOSTS: ReadonlySet<string> = new Set([
  'youtube.com',
  'youtu.be',
  'vimeo.com',
])

/**
 * Hosts where the practitioner tier is never allowed. Forum threads on
 * these sites are admissible off-list when genuinely the best source, but
 * they are not a named practitioner speaking in their own voice, so the
 * `practitioner` tier cannot apply to them.
 */
const FORUM_HOSTS: ReadonlySet<string> = new Set([
  'reddit.com',
  'stackoverflow.com',
  'stackexchange.com',
  'ycombinator.com',
  'quora.com',
])

/**
 * Hosts verification cannot fetch: a post or thread there is never a
 * material, at any tier. The intelligence may read them as a discovery
 * signal and follow them to the blog, talk, video or repo they point at
 * — *that* is the material. Keyed by registrable domain, like the forum
 * set, so subdomains (`mobile.twitter.com`) match.
 */
const UNFETCHABLE_HOSTS: ReadonlySet<string> = new Set(['x.com', 'twitter.com'])

export function isUnfetchableHost(url: string): boolean {
  const key = publisherKey(url)
  if (key === null) return false
  return UNFETCHABLE_HOSTS.has(key)
}

export function isForumHost(url: string): boolean {
  const key = publisherKey(url)
  if (key === null) return false
  return FORUM_HOSTS.has(key)
}

export function publisherKey(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) return null

  const labels = hostname.split('.')
  // Strip any empty labels that result from a trailing dot or odd input.
  const cleanLabels = labels.filter((l) => l.length > 0)
  if (cleanLabels.length < 2) return null

  const lastTwo = cleanLabels.slice(-2).join('.')
  const registrableDomain = TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo) && cleanLabels.length >= 3
    ? cleanLabels.slice(-3).join('.')
    : lastTwo

  if (VIDEO_HOSTS.has(registrableDomain)) return null

  // Subdomain-tenant platforms: keep the tenant label. The host looks like
  // `<tenant>.<platform>` and the cap counts `tenant.platform` as the
  // publisher, so two tenants on the same platform count separately.
  if (cleanLabels.length >= 3 && SUBDOMAIN_TENANT_PLATFORMS.has(lastTwo)) {
    return `${cleanLabels[cleanLabels.length - 3]}.${lastTwo}`
  }
  if (SUBDOMAIN_TENANT_PLATFORMS.has(registrableDomain)) {
    return registrableDomain
  }

  // Path-tenant platforms: append the first path segment. The host alone
  // is too coarse — every user of github.com would otherwise collapse
  // into one bucket — so the first path segment names the tenant.
  if (PATH_TENANT_PLATFORMS.has(registrableDomain)) {
    const firstSegment = parsed.pathname.split('/').filter((s) => s.length > 0)[0]
    return firstSegment ? `${registrableDomain}/${firstSegment.toLowerCase()}` : registrableDomain
  }

  return registrableDomain
}
