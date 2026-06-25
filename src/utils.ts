/**
 * Await a promise and return an `[error, result]` tuple instead of throwing.
 *
 * @param promise the promise to await.
 * @returns `[null, result]` on success, `[error, undefined]` on rejection.
 */
export async function to<T>(promise: Promise<T>): Promise<[Error | null, T | undefined]> {
  try {
    const data = await promise
    return [null, data]
  } catch (err) {
    return [err instanceof Error ? err : new Error(String(err)), undefined]
  }
}

/** The p-th percentile (nearest-rank) of `values`, or 0 when empty. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1
  return sorted[idx] ?? 0
}

/** Escape the five characters that are unsafe in HTML text and attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Format a [0,1] ratio as a one-decimal percentage. */
export function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/** Format a dollar amount, or `—` when it is exactly zero. */
export function usd(amount: number): string {
  if (amount === 0) return '—'
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** Format a millisecond duration, rounded with thousands separators. */
export function ms(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} ms`
}
