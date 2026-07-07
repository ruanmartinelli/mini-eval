import assert from 'node:assert'
import type { EvalReport } from './types.js'

/**
 * Parse and validate a serialized {@link EvalReport}, e.g. one read from a
 * baseline file. Accepts a JSON string or an already-parsed value and checks
 * the basic `{ name, byModel }` shape.
 *
 * Pure — it never touches the filesystem; the caller owns I/O:
 * `parseReport(readFileSync('baseline.json', 'utf8'))`.
 *
 * @param source a JSON string, or a value already parsed from one.
 * @returns the validated report.
 * @throws when the string is not valid JSON or the value is not shaped like a report.
 */
export function parseReport(source: string | unknown): EvalReport {
  let value: unknown = source

  if (typeof source === 'string') {
    try {
      value = JSON.parse(source)
    } catch (err) {
      throw new Error(`report is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const report = value as EvalReport
  const shapeOk =
    typeof report === 'object' && report !== null && typeof report.name === 'string' && typeof report.byModel === 'object' && report.byModel !== null

  assert(shapeOk, 'not an eval report (expected { name, byModel })')

  return report
}

/**
 * Compare a fresh report against a baseline and report any regressions.
 *
 * A regression is a baseline model whose overall score dropped by more than
 * `tolerance`, or that is missing from the fresh report entirely. With
 * `byTag`, each of the baseline model's per-tag scores is held to the same
 * standard. Models (and tags) present only in the fresh report are new, not
 * regressions.
 *
 * @param report   the fresh report from `evaluate`.
 * @param baseline the report to compare against.
 * @param opts     `byTag` to also gate on per-tag scores; `tolerance` (default 0)
 *                 to forgive score drops of at most that much, absorbing eval noise.
 * @returns `{ ok, regressions }` — `ok: false` lists every regression found.
 */
export function gate(
  report: EvalReport,
  baseline: EvalReport,
  opts?: { byTag?: boolean; tolerance?: number },
): { ok: boolean; regressions: string[] } {
  const tolerance = opts?.tolerance ?? 0
  assert(tolerance >= 0, 'tolerance must be >= 0')

  const regressions: string[] = []

  for (const [model, base] of Object.entries(baseline.byModel)) {
    const fresh = report.byModel[model]

    if (!fresh) {
      regressions.push(`${model}: missing from report (baseline overall ${base.overall.toFixed(4)})`)
      continue
    }

    if (fresh.overall < base.overall - tolerance) {
      regressions.push(`${model}: overall ${fresh.overall.toFixed(4)} < baseline ${base.overall.toFixed(4)}`)
    }

    if (!opts?.byTag) continue

    for (const [tag, baseScore] of Object.entries(base.byTag)) {
      const freshScore = fresh.byTag[tag]

      if (freshScore == null) {
        regressions.push(`${model} [${tag}]: missing from report (baseline ${baseScore.toFixed(4)})`)
        continue
      }

      if (freshScore < baseScore - tolerance) {
        regressions.push(`${model} [${tag}]: ${freshScore.toFixed(4)} < baseline ${baseScore.toFixed(4)}`)
      }
    }
  }

  return { ok: regressions.length === 0, regressions }
}
