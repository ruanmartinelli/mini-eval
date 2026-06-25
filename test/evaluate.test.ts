import { describe, expect, it } from 'vitest'
import { evaluate } from '../src/evaluate.js'
import type { Case, EvalConfig, Scorer, Task } from '../src/types.js'

type Input = { x: number }
type Output = { y: number; model: string }
type Expected = { y: number }

/** A task that doubles its input and records the model it was routed to. */
const double: Task<Input, Output> = async (input, ctx) => ({ y: input.x * 2, model: ctx.model })

/** Scores 1 when output.y matches expected.y, else 0. */
const exact: Scorer<Input, Output, Expected> = {
  name: 'exact',
  run: ({ output, expected }) => (expected && output.y === expected.y ? 1 : 0),
}

const cases: Case<Input, Expected>[] = [
  { input: { x: 1 }, expected: { y: 2 }, tags: ['small'] },
  { input: { x: 5 }, expected: { y: 10 }, tags: ['small'] },
]

function config(overrides: Partial<EvalConfig<Input, Output, Expected>> = {}): EvalConfig<Input, Output, Expected> {
  return {
    data: cases,
    scorers: [exact],
    models: ['m1'],
    task: double,
    ...overrides,
  }
}

describe('evaluate', () => {
  it('sweeps every model and keys the report by model id', async () => {
    const report = await evaluate('doubling', config({ models: ['m1', 'm2'] }))
    expect(report.name).toBe('doubling')
    expect(Object.keys(report.byModel)).toEqual(['m1', 'm2'])
  })

  it('routes each case to the swept model via ctx.model', async () => {
    const report = await evaluate('doubling', config({ models: ['gpt', 'claude'] }))
    expect(report.byModel.gpt?.cases.map(c => c.output?.model)).toEqual(['gpt', 'gpt'])
    expect(report.byModel.claude?.cases.map(c => c.output?.model)).toEqual(['claude', 'claude'])
  })

  it('scores correct outputs and aggregates an overall of 1', async () => {
    const report = await evaluate('doubling', config())
    const model = report.byModel.m1!
    expect(model.overall).toBe(1)
    expect(model.byTag.small).toBe(1)
    expect(model.cases.map(c => c.score)).toEqual([1, 1])
  })

  it('accepts data as an async factory', async () => {
    const report = await evaluate('doubling', config({ data: async () => cases }))
    expect(report.byModel.m1?.cases).toHaveLength(2)
  })

  it('combines scorers as a weighted mean', async () => {
    const pass: Scorer<Input, Output, Expected> = { name: 'pass', run: () => 1 }
    const fail: Scorer<Input, Output, Expected> = { name: 'fail', weight: 3, run: () => 0 }
    const report = await evaluate('weights', config({ scorers: [pass, fail], data: [cases[0]!] }))
    // (1*1 + 0*3) / (1 + 3) = 0.25
    expect(report.byModel.m1?.cases[0]?.score).toBeCloseTo(0.25)
  })

  it('excludes null-scoring (not-applicable) scorers from the mean', async () => {
    const skip: Scorer<Input, Output, Expected> = { name: 'skip', run: () => null }
    const pass: Scorer<Input, Output, Expected> = { name: 'pass', run: () => 1 }
    const report = await evaluate('skip', config({ scorers: [skip, pass], data: [cases[0]!] }))
    const result = report.byModel.m1?.cases[0]!
    expect(result.score).toBe(1)
    expect(result.scores.map(s => s.name)).toEqual(['pass'])
  })

  it('scores 0 when every scorer is not-applicable', async () => {
    const skip: Scorer<Input, Output, Expected> = { name: 'skip', run: () => null }
    const report = await evaluate('skip', config({ scorers: [skip], data: [cases[0]!] }))
    const result = report.byModel.m1?.cases[0]!
    expect(result.score).toBe(0)
    expect(result.scores).toEqual([])
  })

  it('normalizes a bare-number score and preserves a {score, reason}', async () => {
    const num: Scorer<Input, Output, Expected> = { name: 'num', run: () => 0.5 }
    const obj: Scorer<Input, Output, Expected> = { name: 'obj', run: () => ({ score: 0.5, reason: 'half right' }) }
    const report = await evaluate('shapes', config({ scorers: [num, obj], data: [cases[0]!] }))
    const scores = report.byModel.m1?.cases[0]?.scores!
    expect(scores.find(s => s.name === 'num')).toMatchObject({ score: 0.5, reason: '' })
    expect(scores.find(s => s.name === 'obj')).toMatchObject({ score: 0.5, reason: 'half right' })
  })

  it('records a thrown task as output: null with score 0, without aborting the run', async () => {
    const boom: Task<Input, Output> = async () => {
      throw new Error('task exploded')
    }
    const report = await evaluate('boom', config({ task: boom }))
    const results = report.byModel.m1?.cases!
    expect(results).toHaveLength(2)
    expect(results.every(c => c.output === null && c.score === 0 && c.scores.length === 0)).toBe(true)
  })

  it('records a thrown scorer as score 0 with the error surfaced, without aborting', async () => {
    const judge: Scorer<Input, Output, Expected> = {
      name: 'judge',
      run: () => {
        throw new Error('judge down')
      },
    }
    const report = await evaluate('judge', config({ scorers: [judge], data: [cases[0]!] }))
    const result = report.byModel.m1?.cases[0]!
    expect(result.score).toBe(0)
    expect(result.scores[0]).toMatchObject({ name: 'judge', score: 0, reason: 'scorer threw: judge down' })
  })

  it('keeps task and judge usage separate and rolls cost into the aggregate', async () => {
    const billedTask: Task<Input, Output> = async (input, ctx) => {
      ctx.report({ inputTokens: 100, outputTokens: 20, costUsd: 0.01 })
      return { y: input.x * 2, model: ctx.model }
    }
    const billedJudge: Scorer<Input, Output, Expected> = {
      name: 'judge',
      run: ({ report }) => {
        report({ inputTokens: 50, outputTokens: 10, costUsd: 0.02 })
        return 1
      },
    }
    const report = await evaluate('billing', config({ task: billedTask, scorers: [billedJudge], data: [cases[0]!] }))
    const model = report.byModel.m1!
    expect(model.cost).toEqual({ taskUsd: 0.01, judgeUsd: 0.02 })
    const usage = model.cases[0]?.usage!
    expect(usage.task).toMatchObject({ inputTokens: 100, outputTokens: 20, costUsd: 0.01 })
    expect(usage.judge).toMatchObject({ inputTokens: 50, outputTokens: 10, costUsd: 0.02 })
  })

  it('measures task latency as a non-negative number', async () => {
    const report = await evaluate('latency', config({ data: [cases[0]!] }))
    expect(report.byModel.m1?.cases[0]?.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it.each([
    ['data is required', { data: [] }],
    ['models is required', { models: [] }],
    ['scorers is required', { scorers: [] }],
  ])('rejects when %s', async (message, override) => {
    await expect(evaluate('bad', config(override as Partial<EvalConfig<Input, Output, Expected>>))).rejects.toThrow(message)
  })

  it('rejects when task is missing', async () => {
    const bad = { ...config(), task: undefined } as unknown as EvalConfig<Input, Output, Expected>
    await expect(evaluate('bad', bad)).rejects.toThrow('task is required')
  })
})
