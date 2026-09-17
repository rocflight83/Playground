/**
 * Measure a material's consumption time from the body verification already
 * fetched — never makes a second network request. Three bases, tried in
 * order; the first that applies wins. None applying means "unmeasurable":
 * the function returns null and the material's verification record carries
 * no measurement, so a paid storefront or a PDF or a paywall teaser never
 * produces a number the page cannot defend.
 *
 * The three bases:
 *   1. `video-metadata` — page metadata that names the runtime (YouTube
 *      `<meta itemprop="duration">`, JSON-LD `"duration":"PT…"`, og:
 *      video:duration, the player JSON's `lengthSeconds`). A watch page's
 *      body is mostly script, so this runs before the word counter and the
 *      result is exactly the runtime the learner will feel.
 *   2. `stated-read-time` — the publisher's own read-time label
 *      (`N min read`, `N-minute read`, `Reading time: N min`). The publisher
 *      knows the article's real length (images, code blocks, paywalled
 *      remainder) better than a word counter can.
 *   3. `word-count` — `<main>` or `<article>` words at 200 wpm. 200 wpm is
 *      the low end of adult non-fiction reading so a careful reader never
 *      trips the warning; fewer than 100 words means a JS shell, a consent
 *      interstitial, or a teaser, and the function returns null.
 *
 * Pure: no I/O, no Date, no module-level state. The two measurement
 * constants live here because they are measurement mechanics, not plan
 * policy — the skill does not restate them.
 */

export const READING_WORDS_PER_MINUTE = 200
export const MIN_MEASURABLE_WORDS = 100

export type MeasurementBasis = 'video-metadata' | 'stated-read-time' | 'word-count'

export interface DurationMeasurement {
  minutes: number
  basis: MeasurementBasis
  /** Word count when basis === 'word-count', so the page and the skill can judge a teaser. */
  words?: number
}

const ISO8601_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i
const ITEMPROP_DURATION_META =
  /<meta\b[^>]*\bitemprop\s*=\s*"duration"[^>]*\bcontent\s*=\s*"(PT[^"]+)"/i
const JSON_DURATION = /"duration"\s*:\s*"(PT[^"]+)"/i
const OG_VIDEO_DURATION_META =
  /<meta\b[^>]*\bproperty\s*=\s*"og:video:duration"[^>]*\bcontent\s*=\s*"([^"]+)"/i
const LENGTH_SECONDS = /"lengthSeconds"\s*:\s*"(\d+)"/i
const STATED_READ_TIME =
  /(\d+)[\s-]*min(?:ute)?[\s-]*read|reading\s*time\s*:\s*(\d+)\s*min/i

/** Word tokens: each CJK ideograph is one token, runs of Latin letters/digits are one token. */
const WORD_TOKEN =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[\p{L}\p{N}]+/gu

function parseIso8601Duration(text: string): number | null {
  const match = text.match(ISO8601_DURATION)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  if (hours === 0 && minutes === 0 && seconds === 0) return null
  return Math.round(hours * 3600 + minutes * 60 + seconds)
}

function extractVideoSeconds(body: string): number | null {
  const itemprop = body.match(ITEMPROP_DURATION_META)
  if (itemprop) {
    const seconds = parseIso8601Duration(itemprop[1])
    if (seconds !== null) return seconds
  }
  const jsonDuration = body.match(JSON_DURATION)
  if (jsonDuration) {
    const seconds = parseIso8601Duration(jsonDuration[1])
    if (seconds !== null) return seconds
  }
  const ogDuration = body.match(OG_VIDEO_DURATION_META)
  if (ogDuration) {
    const value = ogDuration[1]
    if (value.startsWith('PT')) {
      const seconds = parseIso8601Duration(value)
      if (seconds !== null) return seconds
    } else {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds)
    }
  }
  const lengthSeconds = body.match(LENGTH_SECONDS)
  if (lengthSeconds) {
    const seconds = Number(lengthSeconds[1])
    if (Number.isFinite(seconds) && seconds > 0) return seconds
  }
  return null
}

function extractStatedReadMinutes(body: string): number | null {
  // Strip tags before matching, so the label can be anywhere in the markup.
  const text = body.replace(/<[^>]*>/g, ' ')
  const match = text.match(STATED_READ_TIME)
  if (!match) return null
  const raw = match[1] ?? match[2]
  const minutes = Number(raw)
  return minutes > 0 ? minutes : null
}

function stripBlocks(body: string, tag: string): string {
  return body.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), ' ')
}

function extractMainContent(body: string): string {
  let stripped = body
  for (const tag of ['script', 'style', 'noscript', 'template', 'svg']) {
    stripped = stripBlocks(stripped, tag)
  }
  // If a <main> or <article> is present, count only inside it: site chrome
  // inflates a doc page by 30–50%.
  const main = stripped.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i)
  return main ? main[2] : stripped
}

function countWords(body: string): number {
  const text = extractMainContent(body).replace(/<[^>]*>/g, ' ')
  const matches = text.match(WORD_TOKEN)
  return matches ? matches.length : 0
}

export function measureConsumptionMinutes(url: string, body: string): DurationMeasurement | null {
  if (url.toLowerCase().endsWith('.pdf')) return null
  if (body.trimStart().startsWith('%PDF')) return null

  const videoSeconds = extractVideoSeconds(body)
  if (videoSeconds !== null && videoSeconds > 0) {
    return { minutes: Math.max(1, Math.ceil(videoSeconds / 60)), basis: 'video-metadata' }
  }

  const statedMinutes = extractStatedReadMinutes(body)
  if (statedMinutes !== null) {
    return { minutes: statedMinutes, basis: 'stated-read-time' }
  }

  const words = countWords(body)
  if (words < MIN_MEASURABLE_WORDS) return null
  return {
    minutes: Math.ceil(words / READING_WORDS_PER_MINUTE),
    basis: 'word-count',
    words,
  }
}