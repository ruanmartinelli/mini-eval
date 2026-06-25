import assert from 'node:assert'
import type { CaseResult, EvalConfig, EvalReport, Usage } from './types.js'
import { to } from './utils.js'
import { aggregate } from './aggregate.js'
import { report } from './usage.js'

/**
 * Sweeps `config.models`, runs the task on each case, scores the output, and
 * aggregates per model. A case whose task throws is recorded with `output: null`
 * and does not abort the run.
 *
 * @param name   name for this eval, included in the report.
 * @param config the eval configuration.
 * @returns the report, keyed by model.
 */
export async function evaluate<I, O, E>(name: string, config: EvalConfig<I, O, E>): Promise<EvalReport<O>> {
  const cases = await (typeof config.data === 'function' ? config.data() : config.data)
  assert(cases && cases.length > 0, 'data is required')

  const models = config.models
  assert(models && models.length > 0, 'models is required')

  const scorers = config.scorers
  assert(scorers && scorers.length > 0, 'scorers is required')
  assert(
    scorers.every(s => (s.weight ?? 1) > 0),
    'scorer weight must be > 0',
  )

  const task = config.task
  assert(task, 'task is required')

  const byModel: EvalReport<O>['byModel'] = {}

  for (const model of models) {
    const results: CaseResult<O>[] = []

    for (const c of cases) {
      const tags = c.tags ?? []
      const input = c.input
      const expected = c.expected

      const usage: { task: Usage; judge: Usage } = {
        task: { inputTokens: 0, outputTokens: 0 },
        judge: { inputTokens: 0, outputTokens: 0 },
      }

      const start = performance.now()
      const [error, result] = await to(
        task(input, {
          model,
          report: usg => report(usage.task, usg),
        }),
      )
      const latencyMs = performance.now() - start

      if (error) {
        results.push({
          tags,
          usage,
          latencyMs,
          score: 0,
          scores: [],
          output: null,
        })

        continue
      }

      const output = result!
      const scores: CaseResult<O>['scores'] = []

      for (const scorer of scorers) {
        try {
          const value = await scorer.run({
            input,
            output,
            expected,
            tags,
            report: usg => report(usage.judge, usg),
          })

          if (value === null) continue
          const normalized = typeof value === 'number' ? { score: value, reason: '' } : value

          scores.push({
            name: scorer.name,
            score: normalized.score,
            weight: scorer.weight ?? 1,
            reason: normalized.reason ?? '',
          })
        } catch (err) {
          // A throwing scorer (e.g. a judge whose model call failed) scores 0
          // with the error surfaced, rather than aborting the whole run.
          const message = err instanceof Error ? err.message : String(err)
          scores.push({ name: scorer.name, score: 0, weight: scorer.weight ?? 1, reason: `scorer threw: ${message}` })
        }
      }

      let score = 0

      if (scores.length > 0) {
        const sum = scores.reduce((sum, s) => sum + s.score * s.weight, 0)
        const weight = scores.reduce((sum, s) => sum + s.weight, 0)

        score = sum / weight
      }

      results.push({ tags, output, score, scores, usage, latencyMs })
    }

    byModel[model] = aggregate(results)
  }

  return { name, byModel }
}
