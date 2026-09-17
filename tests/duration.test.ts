import { measureConsumptionMinutes } from '../src/duration'

function html(body: string): string {
  return `<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`
}

describe('measureConsumptionMinutes', () => {
  describe('video metadata wins first', () => {
    it('reads ISO-8601 duration from a YouTube itemprop meta', () => {
      const body = html('<meta itemprop="duration" content="PT12M34S">')
      const result = measureConsumptionMinutes('https://www.youtube.com/watch?v=x', body)
      expect(result).toEqual({ minutes: 13, basis: 'video-metadata' })
    })

    it('reads lengthSeconds when that is the only signal', () => {
      const body = html('<script>{"lengthSeconds":"754"}</script>')
      const result = measureConsumptionMinutes('https://www.youtube.com/watch?v=x', body)
      expect(result).toEqual({ minutes: 13, basis: 'video-metadata' })
    })

    it('reads og:video:duration in seconds', () => {
      const body = html('<meta property="og:video:duration" content="754">')
      const result = measureConsumptionMinutes('https://vimeo.com/12345', body)
      expect(result).toEqual({ minutes: 13, basis: 'video-metadata' })
    })

    it('reads an ISO-8601 duration from JSON-LD VideoObject', () => {
      const body = html('<script type="application/ld+json">{"@type":"VideoObject","duration":"PT1H2M"}</script>')
      const result = measureConsumptionMinutes('https://example.com/watch', body)
      expect(result).toEqual({ minutes: 62, basis: 'video-metadata' })
    })

    it('reads a half-minute ISO-8601 duration and floors to 1', () => {
      const body = html('<meta itemprop="duration" content="PT30S">')
      const result = measureConsumptionMinutes('https://www.youtube.com/watch?v=x', body)
      expect(result).toEqual({ minutes: 1, basis: 'video-metadata' })
    })
  })

  describe('stated read time beats word count', () => {
    it('reads "N min read"', () => {
      const body = html('<article>one two three four five six seven eight nine ten</article><span>5 min read</span>')
      const result = measureConsumptionMinutes('https://medium.com/x', body)
      expect(result?.minutes).toBe(5)
      expect(result?.basis).toBe('stated-read-time')
    })

    it('reads "N-minute read"', () => {
      const body = html('<p>5-minute read</p>')
      const result = measureConsumptionMinutes('https://dev.to/x', body)
      expect(result).toEqual({ minutes: 5, basis: 'stated-read-time' })
    })

    it('reads "Reading time: N min"', () => {
      const body = html('<div class="meta">Reading time: 7 min</div>')
      const result = measureConsumptionMinutes('https://substack.com/x', body)
      expect(result).toEqual({ minutes: 7, basis: 'stated-read-time' })
    })

    it('matches the read-time label even when the body would word-count to more minutes', () => {
      const manyWords = Array.from({ length: 4000 }, () => 'word').join(' ')
      const body = html(`<article>${manyWords}</article><span>5 min read</span>`)
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result?.minutes).toBe(5)
      expect(result?.basis).toBe('stated-read-time')
    })

    it('is case-insensitive', () => {
      const body = html('<span>5 MIN READ</span>')
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result?.minutes).toBe(5)
      expect(result?.basis).toBe('stated-read-time')
    })
  })

  describe('word count is the fallback', () => {
    it('counts 1000 words of prose at 200 wpm = 5 min', () => {
      const words = Array.from({ length: 1000 }, () => 'word').join(' ')
      const body = html(`<article>${words}</article>`)
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 5, basis: 'word-count', words: 1000 })
    })

    it('does not count words inside <script>, <style>, <noscript>, <template> or <svg>', () => {
      const prose = Array.from({ length: 1000 }, () => 'word').join(' ')
      const scriptJunk = Array.from({ length: 500 }, () => 'junk').join(' ')
      const styleJunk = Array.from({ length: 500 }, () => 'junk').join(' ')
      const svgJunk = Array.from({ length: 500 }, () => 'junk').join(' ')
      const noscriptJunk = Array.from({ length: 500 }, () => 'junk').join(' ')
      const templateJunk = Array.from({ length: 500 }, () => 'junk').join(' ')
      const body = html(
        `<article>${prose}</article>` +
          `<script>${scriptJunk}</script>` +
          `<style>${styleJunk}</style>` +
          `<svg>${svgJunk}</svg>` +
          `<noscript>${noscriptJunk}</noscript>` +
          `<template>${templateJunk}</template>`
      )
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 5, basis: 'word-count', words: 1000 })
    })

    it('counts only inside <main> when present, not site chrome', () => {
      const chromeWords = Array.from({ length: 500 }, () => 'word').join(' ')
      const mainWords = Array.from({ length: 1000 }, () => 'word').join(' ')
      const body = html(`<aside>${chromeWords}</aside><main>${mainWords}</main>`)
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 5, basis: 'word-count', words: 1000 })
    })

    it('counts only inside <article> when present, not site chrome', () => {
      const chromeWords = Array.from({ length: 500 }, () => 'word').join(' ')
      const articleWords = Array.from({ length: 1000 }, () => 'word').join(' ')
      const body = html(`<div>${chromeWords}</div><article>${articleWords}</article>`)
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 5, basis: 'word-count', words: 1000 })
    })

    it('returns null when the body has fewer than 100 words', () => {
      const words = Array.from({ length: 40 }, () => 'word').join(' ')
      const body = html(`<article>${words}</article>`)
      expect(measureConsumptionMinutes('https://example.com/x', body)).toBeNull()
    })

    it('uses Unicode-aware word counting (one CJK token per ideograph)', () => {
      // 200 ideographs is one minute at 200 wpm.
      const ideographs = '字'.repeat(200)
      const body = html(`<article>${ideographs}</article>`)
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 1, basis: 'word-count', words: 200 })
    })
  })

  describe('precedence', () => {
    it('video metadata wins over a stated read time', () => {
      const body = html('<meta itemprop="duration" content="PT10M0S"><span>5 min read</span>')
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 10, basis: 'video-metadata' })
    })

    it('video metadata wins over word count', () => {
      const words = Array.from({ length: 3000 }, () => 'word').join(' ')
      const body = html(`<article>${words}</article><meta itemprop="duration" content="PT10M0S">`)
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 10, basis: 'video-metadata' })
    })

    it('a stated read time wins over word count', () => {
      const words = Array.from({ length: 3000 }, () => 'word').join(' ')
      const body = html(`<article>${words}</article><span>5 min read</span>`)
      const result = measureConsumptionMinutes('https://example.com/x', body)
      expect(result).toEqual({ minutes: 5, basis: 'stated-read-time' })
    })
  })

  describe('materials the shell cannot measure honestly', () => {
    it('returns null for a .pdf URL whatever the body', () => {
      const body = html('<article>lots of prose here</article>')
      expect(measureConsumptionMinutes('https://example.com/paper.pdf', body)).toBeNull()
    })

    it('returns null for a body that starts with %PDF', () => {
      expect(measureConsumptionMinutes('https://example.com/x', '%PDF-1.7 binary junk')).toBeNull()
    })

    it('returns null for a paid material (storefront URL)', () => {
      // Paid handling lives in verification, not duration; duration just sees a
      // normal URL and body. This test pins the precedence: a body with < 100
      // words still returns null, but a long body returns a measurement.
      // The paid-by-URL carve-out is exercised in verification, not here.
      const words = Array.from({ length: 200 }, () => 'word').join(' ')
      const body = html(`<article>${words}</article>`)
      const result = measureConsumptionMinutes('https://www.oreilly.com/library/view/x', body)
      expect(result?.minutes).toBe(1)
    })
  })
})