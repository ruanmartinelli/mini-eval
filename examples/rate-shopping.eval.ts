/**
 * Tier-two usage: a real `task` pipeline with more than one model call, plus a
 * judge. This demonstrates three things at once:
 *
 *   1. multi-call pipeline   — the task calls `ctx.generate` twice, with plain
 *                              code in between. The framework never owns this
 *                              control flow; it only instruments the calls.
 *   2. judge-as-scorer       — there is no special judge concept; the judge is
 *                              just a scorer that calls `ctx.generate`.
 *   3. pinned judge model    — task calls use the swept `ctx.model`; the judge
 *                              passes an explicit `model`, so it does NOT move
 *                              across the sweep.
 *
 * (Cost attribution — splitting task vs. judge spend — is the intended model,
 * but is not wired up yet, so the printed cost lines currently read as zero.)
 *
 * Run with:  npm run example:rate-shopping
 * (Makes real model calls — needs OPENROUTER_API_KEY in your environment / .env.)
 */
import 'dotenv/config'
import { z } from 'zod'
import { evaluate, scorer } from '../src/index.js'
import type { Task } from '../src/index.js'
import { openrouterCaller } from './openrouter-caller.js'

// --- domain types ---

type RateRequest = { from: string; to: string; weightOz: number }

/** What the pipeline must produce. */
type Decision = { carrier: string; service: string; priceUsd: number; rationale: string }

/** `expected` pins only what we care to assert per case. */
type Expected = { carrier?: string; maxPriceUsd?: number }

// --- schemas for the two model calls inside the task ---

const Quotes = z.object({
  quotes: z.array(
    z.object({
      carrier: z.string(),
      service: z.string(),
      priceUsd: z.number(),
      etaDays: z.number(),
    }),
  ),
})

const DecisionSchema = z.object({
  carrier: z.string(),
  service: z.string(),
  priceUsd: z.number(),
  rationale: z.string(),
})

// --- the system under test: a two-call pipeline with plain code between ---

const task: Task<RateRequest, Decision> = async (input, ctx) => {
  // Call 1 (task spend): extract candidate quotes. Omitting `model` uses the
  // swept model `ctx.model`. `quotes` is typed from the `Quotes` schema.
  const { quotes } = await ctx.generate({
    prompt: `List realistic carrier quotes to ship ${input.weightOz}oz ` + `from ${input.from} to ${input.to}.`,
    schema: Quotes,
  })

  // Plain function between the two model calls — the framework stays out of it.
  const shortlist = quotes
    .filter(q => q.etaDays <= 5)
    .sort((a, b) => a.priceUsd - b.priceUsd)
    .slice(0, 3)

  // Call 2 (task spend): choose from the shortlist, again on the swept model.
  return ctx.generate({
    prompt:
      `Pick the single best option for a customer who wants it within 5 days, ` +
      `and explain why.\n\n${JSON.stringify(shortlist, null, 2)}`,
    schema: DecisionSchema,
  })
}

// --- a cheap, deterministic scorer (counts as task-side correctness) ---

const within_budget = scorer<RateRequest, Decision, Expected>('within_budget', ({ output, expected }) => {
  if (expected?.maxPriceUsd == null) return null // nothing to assert here
  return output.priceUsd <= expected.maxPriceUsd
    ? 1
    : { score: 0, reason: `$${output.priceUsd} over budget $${expected.maxPriceUsd}` }
})

// --- the judge: a scorer that calls a model on a PINNED, off-sweep family ---

/** A different model family than the swept ones, so judging is stable. */
const JUDGE_MODEL = 'anthropic/claude-3.5-sonnet'

const Verdict = z.object({ ok: z.boolean(), reason: z.string() })

const judge_sensible = scorer<RateRequest, Decision, Expected>(
  'judge:sensible',
  async ({ input, output, generate }) => {
    // Explicit `model` here pins the judge so it does NOT drift across the
    // sweep; this call is conceptually `judge` spend, not `task` spend.
    const verdict = await generate({
      model: JUDGE_MODEL,
      schema: Verdict,
      prompt:
        `A shipping assistant chose this for a ${input.weightOz}oz parcel ` +
        `from ${input.from} to ${input.to}:\n${JSON.stringify(output)}\n\n` +
        `Is the rationale internally consistent and the choice sensible? ` +
        `Answer ok=true/false with a short reason.`,
    })
    return verdict.ok ? 1 : { score: 0, reason: verdict.reason }
  },
  { weight: 0.25 }, // a judge carries low weight: it nudges, it doesn't decide
)

// --- the eval: sweep the task model(s); judge stays pinned off-sweep ---

const report = await evaluate<RateRequest, Decision, Expected>('rate-shopping', {
  models: ['openai/gpt-oss-20b'],
  generate: openrouterCaller,
  task,
  data: [
    {
      input: { from: 'Austin, TX', to: 'Reno, NV', weightOz: 12 },
      expected: { maxPriceUsd: 15 },
      tags: ['domestic', 'light'],
    },
    {
      input: { from: 'Austin, TX', to: 'Berlin, DE', weightOz: 64 },
      expected: { carrier: 'DHL', maxPriceUsd: 90 },
      tags: ['international', 'heavy'],
    },
  ],
  scorers: [within_budget, judge_sensible],
})

// The report splits judge spend from task spend, per model.
for (const [model, modelReport] of Object.entries(report.byModel)) {
  const { taskUsd, judgeUsd } = modelReport.cost
  console.log(
    `${model}: overall ${modelReport.overall.toFixed(2)} | ` +
      `task $${taskUsd.toFixed(4)} + judge $${judgeUsd.toFixed(4)}`,
  )
}
