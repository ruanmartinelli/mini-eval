import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gate, loadBaseline } from '../src/gate.js'
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

describe('loadBaseline', () => {
  async function tempReport(contents: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mini-eval-'))
    const path = join(dir, 'report.json')
    await writeFile(path, contents)
    return path
  }

  it('parses a saved report from disk', async () => {
    const saved = report({ m1: model(0.8, { a: 0.9 }) }, 'extraction')
    const path = await tempReport(JSON.stringify(saved))
    await expect(loadBaseline(path)).resolves.toEqual(saved)
  })

  it('rejects when the file is missing', async () => {
    await expect(loadBaseline(join(tmpdir(), 'mini-eval-does-not-exist.json'))).rejects.toThrow()
  })

  it('rejects invalid JSON with the path in the message', async () => {
    const path = await tempReport('not json')
    await expect(loadBaseline(path)).rejects.toThrow(/not valid JSON/)
  })

  it('rejects JSON that is not shaped like a report', async () => {
    const path = await tempReport(JSON.stringify({ nope: true }))
    await expect(loadBaseline(path)).rejects.toThrow(/not an eval report/)
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
