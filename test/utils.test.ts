import { describe, expect, it } from 'vitest'
import { escapeHtml, ms, pct, percentile, to, usd } from '../src/utils.js'

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
