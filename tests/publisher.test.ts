import { isUnfetchableHost, publisherKey } from '../src/publisher'

describe('publisherKey', () => {
  describe('registrable-domain reduction', () => {
    it('collapses www and cdn subdomains of the same registrable domain', () => {
      expect(publisherKey('https://cdn.cboe.com/page')).toBe('cboe.com')
      expect(publisherKey('https://www.cboe.com/page')).toBe('cboe.com')
      expect(publisherKey('https://cboe.com/page')).toBe('cboe.com')
    })

    it('reduces multi-label academic hosts to the registrable domain', () => {
      expect(publisherKey('https://pages.stern.nyu.edu/article')).toBe('nyu.edu')
      expect(publisherKey('https://ocw.mit.edu/course')).toBe('mit.edu')
    })

    it('keeps the last three labels when the last two are a known two-label public suffix', () => {
      expect(publisherKey('https://www.bbc.co.uk/article')).toBe('bbc.co.uk')
      expect(publisherKey('https://www.theguardian.com/')).toBe('theguardian.com')
    })
  })

  describe('subdomain-tenant platforms', () => {
    it('keeps the tenant label on github.io', () => {
      expect(publisherKey('https://ranaroussi.github.io/yfinance/')).toBe('ranaroussi.github.io')
      expect(publisherKey('https://apscheduler.readthedocs.io/en/3.x/')).toBe('apscheduler.readthedocs.io')
    })

    it('treats two different github.io tenants as different publishers', () => {
      const a = publisherKey('https://ranaroussi.github.io/yfinance/')
      const b = publisherKey('https://apscheduler.readthedocs.io/en/3.x/')
      expect(a).not.toBe(b)
    })
  })

  describe('path-tenant platforms', () => {
    it('appends the first path segment on github.com', () => {
      expect(publisherKey('https://github.com/vollib/py_vollib')).toBe('github.com/vollib')
    })

    it('treats different github.com owners as different publishers', () => {
      const a = publisherKey('https://github.com/vollib/py_vollib')
      const b = publisherKey('https://github.com/scikit-learn/scikit-learn')
      expect(a).not.toBe(b)
    })

    it('returns the bare platform key when no path segment is present', () => {
      expect(publisherKey('https://github.com/')).toBe('github.com')
      expect(publisherKey('https://github.com')).toBe('github.com')
    })
  })

  describe('video hosts', () => {
    it('returns null for YouTube watch URLs', () => {
      expect(publisherKey('https://www.youtube.com/watch?v=abc123')).toBeNull()
      expect(publisherKey('https://youtube.com/watch?v=abc123')).toBeNull()
      expect(publisherKey('https://youtu.be/abc123')).toBeNull()
    })

    it('returns null for Vimeo URLs', () => {
      expect(publisherKey('https://vimeo.com/123456')).toBeNull()
    })
  })

  describe('non-http input', () => {
    it('returns null for ftp URLs', () => {
      expect(publisherKey('ftp://example.com/file')).toBeNull()
    })

    it('returns null for unparseable strings', () => {
      expect(publisherKey('not-a-url')).toBeNull()
      expect(publisherKey('')).toBeNull()
    })
  })

  describe('the cap uses publisher keys', () => {
    it('treats a fragment-only difference as identical for the cap', () => {
      // The normalisation of the URL itself lives in validation's distinct-URL
      // set; what matters here is that both URLs map to the same publisher,
      // so the cap groups them.
      expect(publisherKey('https://example.com/page')).toBe(publisherKey('https://example.com/page#frag'))
    })

    it('keeps query-string differences as the same publisher (the cap counts distinct URLs, not publishers alone)', () => {
      expect(publisherKey('https://example.com/page?a=1')).toBe(publisherKey('https://example.com/page?b=2'))
    })
  })
})

describe('isUnfetchableHost', () => {
  it('names x.com and twitter.com, with any subdomain', () => {
    expect(isUnfetchableHost('https://x.com/a/status/1')).toBe(true)
    expect(isUnfetchableHost('https://mobile.twitter.com/a/status/1')).toBe(true)
  })

  it('is false for everything else, including malformed URLs', () => {
    expect(isUnfetchableHost('https://example.com/x.com')).toBe(false)
    expect(isUnfetchableHost('not a url')).toBe(false)
  })
})
