import assert from 'node:assert'
import type { CaseResult, EvalConfig, EvalReport } from './types.js'
import { instrument } from './generate.js'
import { to } from './utils.js'
import { aggregate } from './aggregate.js'

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

  const impl = config.generate
  assert(impl, 'generate is required')

  const scorers = config.scorers

  const task =
    config.task ??
    (async (input, ctx) => {
      const output = await ctx.generate({
        prompt: config.prompt!(input),
        schema: config.schema!,
      })

      return output
    })

  const byModel: EvalReport<O>['byModel'] = {}

  for (const model of models) {
    const results: CaseResult<O>[] = []

    const generate = instrument(impl, model, (phase, usage) => {})

    for (const c of cases) {
      const tags = c.tags ?? []
      const input = c.input
      const expected = c.expected

      const [error, result] = await to(task(input, { model, generate }))
      if (error) {
        results.push({
          tags,
          output: null,
          score: 0,
          scores: [],
          usage: {
            task: { inputTokens: 0, outputTokens: 0 },
            judge: { inputTokens: 0, outputTokens: 0 },
          },
        })
        continue
      }

      const output = result!

      const scores: CaseResult<O>['scores'] = []

      for (const scorer of scorers) {
        const value = await scorer.run({ generate, input, tags, expected, output })

        if (value === null) continue
        const normalized = typeof value === 'number' ? { score: value, reason: '' } : value

        scores.push({
          name: scorer.name,
          score: normalized.score,
          weight: scorer.weight ?? 1,
          reason: normalized.reason ?? '',
        })
      }

      let score = 0

      if (scores.length > 0) {
        const sum = scores.reduce((sum, s) => sum + s.score * s.weight, 0)
        const weight = scores.reduce((sum, s) => sum + s.weight, 0)

        score = sum / weight
      }

      results.push({
        tags,
        output,
        score,
        scores,
        usage: {
          task: { inputTokens: 0, outputTokens: 0 },
          judge: { inputTokens: 0, outputTokens: 0 },
        },
      })
    }

    byModel[model] = aggregate(results)
  }

  return { name, byModel }
}
