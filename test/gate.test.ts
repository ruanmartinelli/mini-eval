import { describe, expect, it } from 'vitest'
import { gate, parseReport } from '../src/gate.js'
import type { EvalReport, ModelReport } from '../src/types.js'

/** Build a ModelReport with the given scores; everything else zeroed. */
function model(overall: number, byTag: Record<string, number> = {}): ModelReport<unknown> {
  return {
    overall,
    byTag,
    cost: { taskUsd: 0, judgeUsd: 0 },
    latency: { p50Ms: 0, p95Ms: 0 },
    cases: [],
  }
}

function report(byModel: EvalReport['byModel'], name = 'x'): EvalReport {
  return { name, byModel }
}

describe('parseReport', () => {
  it('round-trips a report through JSON.stringify', () => {
    const saved = report({ m1: model(0.8, { a: 0.9 }) }, 'extraction')
    expect(parseReport(JSON.stringify(saved))).toEqual(saved)
  })

  it('accepts an already-parsed value', () => {
    const saved = report({ m1: model(0.8) })
    expect(parseReport(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseReport('not json')).toThrow(/not valid JSON/)
  })

  it('throws on a JSON string not shaped like a report', () => {
    expect(() => parseReport(JSON.stringify({ nope: true }))).toThrow(/not an eval report/)
  })

  it.each([null, 42, { name: 7, byModel: {} }, { name: 'x' }])('throws on a malformed parsed value (%j)', value => {
    expect(() => parseReport(value)).toThrow(/not an eval report/)
  })
})

describe('gate', () => {
  it('reports ok: true when no model regresses against baseline', () => {
    const baseline = report({ m1: model(0.8), m2: model(0.5) })
    const fresh = report({ m1: model(0.8), m2: model(0.6) })
    expect(gate(fresh, baseline)).toEqual({ ok: true, regressions: [] })
  })

  it('lists regressions when overall score drops below baseline', () => {
    const baseline = report({ m1: model(0.8), m2: model(0.5) })
    const fresh = report({ m1: model(0.7), m2: model(0.5) })
    const result = gate(fresh, baseline)
    expect(result.ok).toBe(false)
    expect(result.regressions).toEqual(['m1: overall 0.7000 < baseline 0.8000'])
  })

  it('treats a baseline model missing from the report as a regression', () => {
    const result = gate(report({}), report({ m1: model(0.8) }))
    expect(result.ok).toBe(false)
    expect(result.regressions[0]).toMatch(/m1: missing from report/)
  })

  it('ignores models that are new in the fresh report', () => {
    const result = gate(report({ m1: model(0.8), shiny: model(0.1) }), report({ m1: model(0.8) }))
    expect(result.ok).toBe(true)
  })

  it('ignores per-tag drops unless opts.byTag is set', () => {
    const baseline = report({ m1: model(0.8, { a: 0.9 }) })
    const fresh = report({ m1: model(0.8, { a: 0.5 }) })
    expect(gate(fresh, baseline).ok).toBe(true)
  })

  it('also gates per-tag scores when opts.byTag is set', () => {
    const baseline = report({ m1: model(0.8, { a: 0.9, b: 0.5 }) })
    const fresh = report({ m1: model(0.8, { a: 0.5, b: 0.5 }) })
    const result = gate(fresh, baseline, { byTag: true })
    expect(result.ok).toBe(false)
    expect(result.regressions).toEqual(['m1 [a]: 0.5000 < baseline 0.9000'])
  })

  it('treats a baseline tag missing from the report as a regression under byTag', () => {
    const baseline = report({ m1: model(0.8, { a: 0.9 }) })
    const fresh = report({ m1: model(0.8) })
    const result = gate(fresh, baseline, { byTag: true })
    expect(result.ok).toBe(false)
    expect(result.regressions[0]).toMatch(/m1 \[a\]: missing from report/)
  })

  it('forgives drops within tolerance, overall and per tag', () => {
    const baseline = report({ m1: model(0.8, { a: 0.9 }) })
    const fresh = report({ m1: model(0.78, { a: 0.88 }) })
    expect(gate(fresh, baseline, { byTag: true, tolerance: 0.05 }).ok).toBe(true)
    expect(gate(fresh, baseline, { byTag: true, tolerance: 0.01 }).ok).toBe(false)
  })

  it('collects every regression across models, not just the first', () => {
    const baseline = report({ m1: model(0.8), m2: model(0.9) })
    const fresh = report({ m1: model(0.1), m2: model(0.2) })
    expect(gate(fresh, baseline).regressions).toHaveLength(2)
  })

  it('rejects a negative tolerance', () => {
    expect(() => gate(report({}), report({}), { tolerance: -0.1 })).toThrow('tolerance must be >= 0')
  })

  it('is ok against an empty baseline', () => {
    expect(gate(report({ m1: model(0.1) }), report({})).ok).toBe(true)
  })
})
