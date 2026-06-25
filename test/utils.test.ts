import { describe, expect, it } from 'vitest'
import { to } from '../src/utils.js'

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
