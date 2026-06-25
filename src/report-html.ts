import type { EvalReport, ModelReport } from './types.js'
import { escapeHtml, pct, usd } from './utils.js'

function scoreClass(score: number): string {
  if (score >= 0.8) return 's-good'
  if (score >= 0.5) return 's-ok'
  return 's-bad'
}

function modelRows<O>(byModel: Record<string, ModelReport<O>>): string {
  return Object.entries(byModel)
    .sort(([, a], [, b]) => b.overall - a.overall)
    .map(([model, m]) => {
      const total = m.cost.taskUsd + m.cost.judgeUsd
      const fill = Math.max(0, Math.min(100, m.overall * 100)).toFixed(1)
      return `
      <div class="row">
        <span class="bar" style="width:${fill}%"></span>
        <span class="name mono">${escapeHtml(model)}</span>
        <div class="figs">
          <span class="fig cost" title="task ${usd(m.cost.taskUsd)} · judge ${usd(m.cost.judgeUsd)}">${usd(total)}</span>
          <span class="fig score ${scoreClass(m.overall)}">${pct(m.overall)}</span>
        </div>
      </div>`
    })
    .join('\n')
}

function tagSection<O>(byModel: Record<string, ModelReport<O>>): string {
  const models = Object.keys(byModel)
  const tags = [...new Set(models.flatMap(model => Object.keys(byModel[model]!.byTag)))].sort()
  if (tags.length === 0) return ''

  const head = models.map(model => `<th class="num mono">${escapeHtml(model)}</th>`).join('')
  const rows = tags
    .map(tag => {
      const cells = models
        .map(model => {
          const score = byModel[model]!.byTag[tag]
          if (score == null) return '<td class="num dim">—</td>'
          return `<td class="num"><span class="score ${scoreClass(score)}">${pct(score)}</span></td>`
        })
        .join('')

      return `<tr><td>${escapeHtml(tag)}</td>${cells}</tr>`
    })
    .join('\n')

  return `
      <section>
        <h2>By tag</h2>
        <div class="scroll">
          <table>
            <thead>
              <tr><th>Tag</th>${head}</tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </section>`
}

const STYLES = `
    :root {
      color-scheme: light dark;
      --bg: #fafafa; --fg: #1a1a1a; --muted: #6b7280;
      --hover: rgb(234, 234, 234);
      --good: #15803d; --ok: #b45309; --bad: #b91c1c;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b0d10; --fg: #e6e8eb; --muted: #9aa3af;
        --hover: #1b2027;
        --good: #4ade80; --ok: #fbbf24; --bad: #f87171;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--fg);
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    main { max-width: 1100px; margin: 0 auto; padding: 48px 24px 96px; }
    h1 { font-size: 24px; font-weight: 500; margin: 0 0 4px; letter-spacing: -0.01em; }
    .meta { color: var(--muted); margin: 0; font-size: 14px; }
    section { margin-top: 32px; }
    h2 { font-size: 14px; font-weight: 500;  letter-spacing: 0.05em; color: var(--muted); margin: 0 0 12px; }
    .list { padding: 6px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
    .s-good { color: var(--good); }
    .s-ok { color: var(--ok); }
    .s-bad { color: var(--bad); }
    .dim { color: var(--muted); }

    /* Models — a list of rounded rows, each filled to its score */
    .row { margin: 4px 0; min-height: 2.5rem; position: relative; display: flex; align-items: center; gap: 2px;  padding: 0 16px; border-radius: 10px; corner-shape: superellipse(1.25); }
    .row + .row { margin-top: 2px; }
    .bar { position: absolute; left: 0; top: 0; bottom: 0; background: var(--hover); border-radius: 0.8rem; corner-shape: superellipse(1.25); }
    .name { position: relative; z-index: 1; flex: 1; min-width: 0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .figs { position: relative; z-index: 1; display: flex; align-self: stretch; align-items: stretch; gap: 22px; flex-shrink: 0; }
    .fig { display: flex; align-items: center; font-variant-numeric: tabular-nums; }
    .fig.cost { color: var(--muted); font-size: 13px; }
    .fig.score { font-size: 13px; font-weight: 500; }

    /* Tag matrix — a model comparison grid */
    .scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 12px 16px; white-space: nowrap; }
    thead th { font-weight: 500; font-size: 12px;  color: var(--muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .score { font-weight: 500; }
    .empty { color: var(--muted); padding: 24px 16px; }
    .footer { margin-top: 40px; color: var(--muted); font-size: 12px; }
    .footer a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .footer a:hover { color: var(--fg); }`

/**
 * Render an {@link EvalReport} as a self-contained HTML page: a per-model summary
 * list (cost and score, each row filled to its score) and a tag × model matrix when present.
 *
 * Pure and dependency-free — it returns the HTML as a string and never touches the
 * filesystem; the caller decides whether to write, serve, or print it.
 *
 * @param report the report returned by `evaluate`.
 * @returns a complete HTML document.
 */
export function renderHtml(report: EvalReport): string {
  const models = Object.entries(report.byModel)

  const caseCount = models[0]?.[1].cases.length ?? 0
  const meta = `${models.length} ${models.length === 1 ? 'model' : 'models'} · ${caseCount} ${caseCount === 1 ? 'case' : 'cases'}`

  const modelCard =
    models.length === 0
      ? `<div><p class="empty">No models in this report.</p></div>`
      : `<div class="list">${modelRows(report.byModel)}</div>`

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(report.name)} — eval report</title>
    <style>${STYLES}
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(report.name)}</h1>
        <p class="meta">${meta}</p>
      </header>
      <section>
        <h2>Models</h2>
        ${modelCard}
      </section>${tagSection(report.byModel)}
      <footer class="footer">Generated by <a class="mono" href="https://github.com/ruanmartinelli/mini-eval" target="_blank" rel="noopener noreferrer">mini-eval</a></footer>
    </main>
  </body>
</html>
`
}
