import { describe, expect, it } from 'vitest'
import { report } from '../src/usage.js'
import type { Usage } from '../src/types.js'

describe('report', () => {
  it('accumulates token counts into the running total', () => {
    const acc: Usage = { inputTokens: 10, outputTokens: 5 }
    report(acc, { inputTokens: 3, outputTokens: 7 })
    expect(acc).toEqual({ inputTokens: 13, outputTokens: 12 })
  })

  it('leaves costUsd unset when no call reports a cost', () => {
    const acc: Usage = { inputTokens: 0, outputTokens: 0 }
    report(acc, { inputTokens: 1, outputTokens: 1 })
    expect(acc.costUsd).toBeUndefined()
  })

  it('sums costUsd across calls, starting from zero', () => {
    const acc: Usage = { inputTokens: 0, outputTokens: 0 }
    report(acc, { inputTokens: 1, outputTokens: 1, costUsd: 0.25 })
    report(acc, { inputTokens: 1, outputTokens: 1, costUsd: 0.75 })
    expect(acc.costUsd).toBeCloseTo(1.0)
  })

  it('treats costUsd: 0 as a reported cost, not absent', () => {
    const acc: Usage = { inputTokens: 0, outputTokens: 0 }
    report(acc, { inputTokens: 1, outputTokens: 1, costUsd: 0 })
    expect(acc.costUsd).toBe(0)
  })
})
