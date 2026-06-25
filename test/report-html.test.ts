import { describe, expect, it } from 'vitest'
import { renderHtml } from '../src/report-html.js'
import type { EvalReport, ModelReport } from '../src/types.js'

/** Build a ModelReport, overriding only the fields a test cares about. */
function modelReport(partial: Partial<ModelReport<unknown>> = {}): ModelReport<unknown> {
  return {
    overall: partial.overall ?? 0,
    byTag: partial.byTag ?? {},
    cost: partial.cost ?? { taskUsd: 0, judgeUsd: 0 },
    latency: partial.latency ?? { p50Ms: 0, p95Ms: 0 },
    cases: partial.cases ?? [],
  }
}

/** Build an EvalReport from a model map. */
function report(byModel: EvalReport['byModel'], name = 'demo'): EvalReport {
  return { name, byModel }
}

describe('renderHtml', () => {
  it('returns a complete, self-contained HTML document', () => {
    const html = renderHtml(report({ 'gpt-4o': modelReport({ overall: 0.9 }) }))
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<style>')
    expect(html).not.toMatch(/<(link|script)\b/)
  })

  it('shows the eval name and a model/case count summary', () => {
    const html = renderHtml(
      report(
        {
          a: modelReport({ cases: [{} as never, {} as never] }),
          b: modelReport({ cases: [{} as never, {} as never] }),
        },
        'extraction',
      ),
    )
    expect(html).toContain('<h1>extraction</h1>')
    expect(html).toContain('2 models · 2 cases')
  })

  it('singularizes a one-model, one-case summary', () => {
    const html = renderHtml(report({ only: modelReport({ cases: [{} as never] }) }))
    expect(html).toContain('1 model · 1 case')
  })

  it('renders one row per model with its score as a percentage', () => {
    const html = renderHtml(
      report({
        'gpt-4o': modelReport({ overall: 0.875 }),
        haiku: modelReport({ overall: 0.5 }),
      }),
    )
    expect(html).toContain('87.5%')
    expect(html).toContain('50.0%')
  })

  it('orders the model rows by score, highest first', () => {
    const html = renderHtml(
      report({
        mid: modelReport({ overall: 0.5 }),
        best: modelReport({ overall: 0.9 }),
        worst: modelReport({ overall: 0.1 }),
      }),
    )
    const order = ['best', 'mid', 'worst'].map(name => html.indexOf(`>${name}<`))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('fills each row left-to-right to its score', () => {
    const html = renderHtml(report({ haiku: modelReport({ overall: 0.43 }) }))
    expect(html).toContain('<span class="bar" style="width:43.0%"></span>')
  })

  it('clamps the row fill to [0, 100]%', () => {
    const html = renderHtml(report({ over: modelReport({ overall: 1.4 }), under: modelReport({ overall: -0.2 }) }))
    expect(html).toContain('width:100.0%')
    expect(html).toContain('width:0.0%')
  })

  it('sums task and judge cost, and shows a dash when nothing was reported', () => {
    const html = renderHtml(
      report({
        paid: modelReport({ cost: { taskUsd: 0.1, judgeUsd: 0.02 } }),
        free: modelReport({ cost: { taskUsd: 0, judgeUsd: 0 } }),
      }),
    )
    expect(html).toContain('$0.12')
    // the free model's cost cell collapses to an em dash
    expect(html).toContain('>—<')
  })

  it('renders a tag × model matrix when tags are present', () => {
    const html = renderHtml(
      report({
        'gpt-4o': modelReport({ byTag: { po_box: 1, intl: 0.5 } }),
        haiku: modelReport({ byTag: { po_box: 0.25 } }),
      }),
    )
    expect(html).toContain('By tag')
    expect(html).toContain('po_box')
    expect(html).toContain('intl')
    // haiku has no `intl` tag → that cell is a dash
    expect(html).toContain('class="num dim">—')
    // the wide matrix scrolls horizontally instead of overflowing
    expect(html).toContain('<div class="scroll">')
  })

  it('omits the tag section when no case carried a tag', () => {
    const html = renderHtml(report({ a: modelReport({ byTag: {} }) }))
    expect(html).not.toContain('<h2>By tag</h2>')
  })

  it('escapes HTML in the eval name, model ids, and tags', () => {
    const html = renderHtml(
      report({ '<script>': modelReport({ byTag: { '<b>tag</b>': 1 } }) }, 'a & b "<x>"'),
    )
    expect(html).toContain('a &amp; b &quot;&lt;x&gt;&quot;')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;tag&lt;/b&gt;')
    // no unescaped injection survives in the body
    expect(html).not.toContain('<script>')
  })

  it('handles an empty report without throwing', () => {
    const html = renderHtml(report({}, 'nothing'))
    expect(html).toContain('No models in this report.')
    expect(html).toContain('0 models · 0 cases')
  })
})
