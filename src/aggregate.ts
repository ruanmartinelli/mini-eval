import type { CaseResult, ModelReport } from './types.js'
import { percentile } from './utils.js'

/**
 * Aggregate a model's per-case results into its {@link ModelReport}: overall and
 * per-tag mean scores, summed cost, and latency percentiles.
 *
 * @param cases the per-case results for a single model.
 * @returns the aggregated report for that model.
 */
export function aggregate<O>(cases: CaseResult<O>[]): ModelReport<O> {
  const overall = cases.length === 0 ? 0 : cases.reduce((sum, c) => sum + c.score, 0) / cases.length
  const tagSums: Record<string, { sum: number; count: number }> = {}

  for (const c of cases) {
    for (const tag of new Set(c.tags)) {
      tagSums[tag] ??= { sum: 0, count: 0 }
      tagSums[tag].sum += c.score
      tagSums[tag].count += 1
    }
  }

  const byTag: Record<string, number> = {}
  for (const tag in tagSums) {
    const item = tagSums[tag]
    if (!item) continue
    byTag[tag] = item.sum / item.count
  }

  const cost = cases.reduce(
    (acc, c) => ({
      taskUsd: acc.taskUsd + (c.usage.task.costUsd ?? 0),
      judgeUsd: acc.judgeUsd + (c.usage.judge.costUsd ?? 0),
    }),
    { taskUsd: 0, judgeUsd: 0 },
  )

  const latencies = cases.map(c => c.latencyMs)

  return {
    overall,
    byTag,
    cost,
    latency: { p50Ms: percentile(latencies, 50), p95Ms: percentile(latencies, 95) },
    cases,
  }
}
