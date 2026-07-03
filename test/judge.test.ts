import { describe, expect, it } from 'vitest'
import { llmJudge } from '../src/judge.js'

describe('llmJudge', () => {
  const judge = llmJudge<{ q: string }, { a: string }, { a: string }>()

  it('scores a correct answer as 1', async () => {
    const value = await judge.run({
      input: { q: 'What is 2 + 2?' },
      output: { a: '4' },
      expected: { a: '4' },
      tags: [],
      report: () => {},
    })
    expect(value).toMatchObject({ score: 1 })
  }, 30_000)

  it('scores an incorrect answer as 0', async () => {
    const value = await judge.run({
      input: { q: 'What is 2 + 2?' },
      output: { a: '5' },
      expected: { a: '4' },
      tags: [],
      report: () => {},
    })
    expect(value).toMatchObject({ score: 0 })
  }, 30_000)
})
