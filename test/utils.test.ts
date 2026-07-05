import { describe, expect, it } from 'vitest'
import { escapeHtml, mapConcurrent, ms, pct, percentile, to, usd } from '../src/utils.js'

describe('to', () => {
  it('returns [null, result] on success', async () => {
    const [err, result] = await to(Promise.resolve(42))
    expect(err).toBeNull()
    expect(result).toBe(42)
  })

  it('returns [error, undefined] when the promise rejects with an Error', async () => {
    const boom = new Error('boom')
    const [err, result] = await to(Promise.reject(boom))
    expect(err).toBe(boom)
    expect(result).toBeUndefined()
  })

  it('wraps a non-Error rejection in an Error', async () => {
    const [err, result] = await to(Promise.reject('nope'))
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toBe('nope')
    expect(result).toBeUndefined()
  })
})

describe('mapConcurrent', () => {
  it('maps every item and preserves input order', async () => {
    const result = await mapConcurrent([3, 1, 2], 2, async n => {
      await new Promise(resolve => setTimeout(resolve, n))
      return n * 10
    })
    expect(result).toEqual([30, 10, 20])
  })

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let max = 0
    await mapConcurrent([1, 2, 3, 4, 5], 2, async () => {
      inFlight++
      max = Math.max(max, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight--
    })
    expect(max).toBe(2)
  })

  it('passes the item index to the callback', async () => {
    const result = await mapConcurrent(['a', 'b'], 1, async (item, i) => `${item}${i}`)
    expect(result).toEqual(['a0', 'b1'])
  })

  it('resolves to [] for an empty list', async () => {
    await expect(mapConcurrent([], 4, async () => 1)).resolves.toEqual([])
  })

  it('propagates a rejection from the callback', async () => {
    await expect(
      mapConcurrent([1, 2], 2, async n => {
        if (n === 2) throw new Error('boom')
        return n
      }),
    ).rejects.toThrow('boom')
  })
})

describe('percentile', () => {
  it('returns 0 for an empty list', () => {
    expect(percentile([], 50)).toBe(0)
  })

  it('picks the nearest-rank value, ignoring input order', () => {
    expect(percentile([3, 1, 2, 4], 50)).toBe(2)
    expect(percentile([10, 20, 30, 40], 95)).toBe(40)
  })
})

describe('escapeHtml', () => {
  it('escapes the five unsafe characters', () => {
    expect(escapeHtml(`<a href="x" data='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; data=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })

  it('leaves safe text untouched', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123')
  })
})

describe('pct', () => {
  it('formats a ratio as a one-decimal percentage', () => {
    expect(pct(0.875)).toBe('87.5%')
    expect(pct(1)).toBe('100.0%')
    expect(pct(0)).toBe('0.0%')
  })
})

describe('usd', () => {
  it('renders an em dash for exactly zero', () => {
    expect(usd(0)).toBe('—')
  })

  it('formats small and whole amounts as currency', () => {
    expect(usd(0.0123)).toBe('$0.0123')
    expect(usd(1.2)).toBe('$1.20')
  })
})

describe('ms', () => {
  it('rounds and appends a unit, with thousands separators', () => {
    expect(ms(319.6)).toBe('320 ms')
    expect(ms(1234)).toBe('1,234 ms')
  })
})
