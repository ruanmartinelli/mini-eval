import { describe, expect, it } from 'vitest'
import { gate, loadBaseline } from '../src/gate.js'
import type { EvalReport } from '../src/types.js'

const emptyReport: EvalReport = { name: 'x', byModel: {} }

// gate / loadBaseline are not implemented yet; these tests pin the current
// behavior so they fail loudly once real logic lands, prompting real coverage.
describe('loadBaseline (unimplemented)', () => {
  it('rejects with a TODO marker', async () => {
    await expect(loadBaseline('report.json')).rejects.toThrow('TODO')
  })

  it.todo('parses a saved report from disk')
})

describe('gate (unimplemented)', () => {
  it('throws a TODO marker', () => {
    expect(() => gate(emptyReport, emptyReport)).toThrow('TODO')
  })

  it.todo('reports ok: true when no model regresses against baseline')
  it.todo('lists regressions when overall score drops below baseline')
  it.todo('also gates per-tag scores when opts.byTag is set')
})
