import { describe, expect, it } from 'vitest'
import { scorer } from '../src/scorer.js'

describe('scorer', () => {
  it('builds a scorer carrying its name and run function', () => {
    const run = () => 1
    const s = scorer('exact', run)
    expect(s.name).toBe('exact')
    expect(s.run).toBe(run)
  })

  it('leaves weight undefined by default', () => {
    const s = scorer('exact', () => 1)
    expect(s.weight).toBeUndefined()
  })

  it('carries the supplied weight', () => {
    const s = scorer('exact', () => 1, { weight: 3 })
    expect(s.weight).toBe(3)
  })
})
