export function runWhenIdle(callback: () => void, timeout = 1200) {
  if (typeof window === 'undefined') return () => {}
  const win = window as Window & typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
    cancelIdleCallback?: (handle: number) => void
  }

  if (win.requestIdleCallback && win.cancelIdleCallback) {
    const id = win.requestIdleCallback(callback, { timeout })
    return () => win.cancelIdleCallback?.(id)
  }

  const id = win.setTimeout(callback, timeout)
  return () => win.clearTimeout(id)
}
