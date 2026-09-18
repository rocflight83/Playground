/**
 * Limit a fetcher with a per-call timeout and a counting semaphore on
 * in-flight calls. The shell's `verifyPlan` has neither today and must not
 * grow them — they are the caller's concern. `withLimits` is the caller's
 * hook, lifted out so the Planner's call site is one line.
 *
 * The semaphore is fairish: requests are admitted in submit order as slots
 * free up. It is intentionally not a full async queue — a busy fetch does
 * not block unrelated code from running; it only blocks other limited
 * fetches behind the semaphore.
 */

export interface LimitedFetchOptions {
  /** Per-call timeout in milliseconds. Defaults to 15 s. */
  timeoutMs?: number
  /** Maximum number of fetches in flight at once. Defaults to 4. */
  concurrency?: number
}

/**
 * The shape `withLimits` accepts and returns. The Planner hands the shell's
 * `FetchLike` in production and various test stubs in unit tests; a real
 * `fetch` is a two-arg `(input, init?)` so it can be adapted here too.
 *
 * `signal` propagates an external abort alongside the wrapper's own
 * timeout. Either abort trips the inner call.
 */
export interface LimitedFetch {
  (url: string, signal?: AbortSignal): Promise<Response>
}

export interface LimitedFetchFactory {
  (impl: LimitedFetch, options?: LimitedFetchOptions): LimitedFetch
}

/**
 * Wrap a fetcher so every call carries an `AbortSignal.timeout(options.timeoutMs)`
 * and the wrapper holds at most `options.concurrency` in flight. The
 * implementation works against the (url, signal?) shape; a real
 * `typeof fetch` is adapted here too.
 */
export const withLimits: LimitedFetchFactory = (impl, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 15_000
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const semaphore = new CountingSemaphore(concurrency)

  const wrapped: LimitedFetch = async (url, externalSignal) => {
    await semaphore.acquire()
    const timeoutController = new AbortController()
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs)
    const forwardAbort = () => timeoutController.abort()
    if (externalSignal) {
      if (externalSignal.aborted) timeoutController.abort()
      else externalSignal.addEventListener('abort', forwardAbort)
    }
    try {
      return await impl(url, timeoutController.signal)
    } finally {
      clearTimeout(timer)
      if (externalSignal) externalSignal.removeEventListener('abort', forwardAbort)
      semaphore.release()
    }
  }

  return wrapped
}

/**
 * Adapt a `typeof fetch` (or any `(input, init?) => Promise<Response>`) to
 * the `(url, signal?) => Promise<Response>` shape `withLimits` expects.
 * Real fetches already support signal as part of `init.signal`; this just
 * hoists it to a positional argument.
 */
export function adaptToLimited(impl: typeof fetch): LimitedFetch {
  return (url, signal) =>
    impl(url, signal ? { signal } : undefined) as unknown as Promise<Response>
}

/**
 * A non-blocking counting semaphore. `acquire()` resolves when a slot is
 * free; `release()` returns a slot, waking the next waiter if any.
 */
class CountingSemaphore {
  private available: number
  private readonly waiters: Array<() => void> = []

  constructor(concurrency: number) {
    this.available = concurrency
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1
      return
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  release(): void {
    const next = this.waiters.shift()
    if (next) {
      // Hand the slot directly to the next waiter; available stays unchanged.
      next()
    } else {
      this.available += 1
    }
  }
}
