import { describe, expect, it } from 'vitest'
import { aggregate } from '../src/aggregate.js'
import type { CaseResult, Usage } from '../src/types.js'

/** Build a CaseResult, overriding only the fields a test cares about. */
function caseResult(partial: Partial<CaseResult<unknown>> = {}): CaseResult<unknown> {
  const usage: { task: Usage; judge: Usage } = partial.usage ?? {
    task: { inputTokens: 0, outputTokens: 0 },
    judge: { inputTokens: 0, outputTokens: 0 },
  }
  return {
    tags: partial.tags ?? [],
    output: partial.output ?? null,
    score: partial.score ?? 0,
    scores: partial.scores ?? [],
    usage,
    latencyMs: partial.latencyMs ?? 0,
  }
}

describe('aggregate', () => {
  it('returns zeroed defaults for no cases', () => {
    const report = aggregate([])
    expect(report.overall).toBe(0)
    expect(report.byTag).toEqual({})
    expect(report.cost).toEqual({ taskUsd: 0, judgeUsd: 0 })
    expect(report.latency).toEqual({ p50Ms: 0, p95Ms: 0 })
    expect(report.cases).toEqual([])
  })

  it('averages case scores into overall', () => {
    const report = aggregate([caseResult({ score: 1 }), caseResult({ score: 0 }), caseResult({ score: 0.5 })])
    expect(report.overall).toBeCloseTo(0.5)
  })

  it('averages scores per tag, counting a case toward each of its tags', () => {
    const report = aggregate([
      caseResult({ score: 1, tags: ['a', 'b'] }),
      caseResult({ score: 0, tags: ['a'] }),
      caseResult({ score: 0.5, tags: ['c'] }),
    ])
    expect(report.byTag).toEqual({ a: 0.5, b: 1, c: 0.5 })
  })

  it('excludes untagged cases from byTag but keeps them in overall', () => {
    const report = aggregate([caseResult({ score: 1, tags: ['a'] }), caseResult({ score: 0, tags: [] })])
    expect(report.byTag).toEqual({ a: 1 })
    expect(report.overall).toBeCloseTo(0.5)
  })

  it('sums task and judge cost separately, treating missing costUsd as 0', () => {
    const report = aggregate([
      caseResult({
        usage: {
          task: { inputTokens: 0, outputTokens: 0, costUsd: 0.1 },
          judge: { inputTokens: 0, outputTokens: 0, costUsd: 0.02 },
        },
      }),
      caseResult({
        usage: {
          task: { inputTokens: 0, outputTokens: 0, costUsd: 0.3 },
          judge: { inputTokens: 0, outputTokens: 0 },
        },
      }),
    ])
    expect(report.cost.taskUsd).toBeCloseTo(0.4)
    expect(report.cost.judgeUsd).toBeCloseTo(0.02)
  })

  it('computes nearest-rank latency percentiles', () => {
    const report = aggregate([
      caseResult({ latencyMs: 30 }),
      caseResult({ latencyMs: 10 }),
      caseResult({ latencyMs: 40 }),
      caseResult({ latencyMs: 20 }),
    ])
    expect(report.latency.p50Ms).toBe(20)
    expect(report.latency.p95Ms).toBe(40)
  })

  it('passes through the original cases', () => {
    const cases = [caseResult({ score: 1 }), caseResult({ score: 0 })]
    expect(aggregate(cases).cases).toBe(cases)
  })

  it('treats a thrown-task case (score 0, tagged) as a 0 toward its tags', () => {
    const report = aggregate([caseResult({ score: 1, tags: ['t'] }), caseResult({ score: 0, output: null, tags: ['t'] })])
    expect(report.byTag.t).toBeCloseTo(0.5)
  })

  it('should not double-count a tag repeated within a single case', () => {
    const report = aggregate([caseResult({ score: 1, tags: ['a', 'a'] }), caseResult({ score: 0, tags: ['a'] })])
    expect(report.byTag.a).toBeCloseTo(0.5)
  })
})
