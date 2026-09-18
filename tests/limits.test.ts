import { describe, expect, it } from 'vitest'
import type { LimitedFetch } from '../src/app/limits'
import { withLimits } from '../src/app/limits'

function okResponse(text = 'OK'): Response {
  return new Response(text, { status: 200 })
}

function failResponse(status: number): Response {
  return new Response('', { status })
}

describe('withLimits', () => {
  it('returns a fetch that passes through the response of the underlying fetch', async () => {
    const underlying: LimitedFetch = async () => okResponse('hello')
    const fetchLimited = withLimits(underlying, { timeoutMs: 1000, concurrency: 2 })
    const response = await fetchLimited('https://example.com/')
    expect(response.ok).toBe(true)
    expect(await response.text()).toBe('hello')
  })

  it('aborts a fetch that does not resolve within the timeout', async () => {
    let abortObserved = false
    const underlying: LimitedFetch = async (_url, signal) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          abortObserved = true
          reject(new Error('aborted'))
        })
        // Keep the request alive forever otherwise.
        setTimeout(() => reject(new Error('still alive')), 30_000)
      })
    }
    const fetchLimited = withLimits(underlying, { timeoutMs: 25, concurrency: 1 })
    await expect(fetchLimited('https://example.com/')).rejects.toThrow()
    expect(abortObserved).toBe(true)
  })

  it('caps concurrency so no more than `concurrency` fetches are in flight at once', async () => {
    let inFlight = 0
    let peakInFlight = 0
    let release: () => void = () => {}
    const ready = new Promise<void>((resolve) => {
      release = resolve
    })

    const underlying: LimitedFetch = async () => {
      inFlight += 1
      peakInFlight = Math.max(peakInFlight, inFlight)
      await ready
      inFlight -= 1
      return okResponse()
    }

    const fetchLimited = withLimits(underlying, { timeoutMs: 5000, concurrency: 2 })
    const fetches = Array.from({ length: 6 }, () => fetchLimited('https://example.com/'))
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(peakInFlight).toBeLessThanOrEqual(2)
    release()
    const responses = await Promise.all(fetches)
    expect(responses.every((r) => r.ok)).toBe(true)
    expect(peakInFlight).toBeLessThanOrEqual(2)
  })

  it('propagates an underlying fetch failure (non-2xx response) without throwing', async () => {
    const underlying: LimitedFetch = async () => failResponse(404)
    const fetchLimited = withLimits(underlying, { timeoutMs: 1000, concurrency: 2 })
    const response = await fetchLimited('https://example.com/')
    expect(response.ok).toBe(false)
    expect(response.status).toBe(404)
  })

  it('propagates an underlying fetch rejection (network error) as a thrown error', async () => {
    const underlying: LimitedFetch = async () => {
      throw new Error('DNS failure')
    }
    const fetchLimited = withLimits(underlying, { timeoutMs: 1000, concurrency: 2 })
    await expect(fetchLimited('https://example.com/')).rejects.toThrow(/DNS/)
  })
})
