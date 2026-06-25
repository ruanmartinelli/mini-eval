# mini-eval

A tiny, code-first framework for evaluating LLM-powered systems.

## Install

```bash
npm install
```

mini-eval never calls a model itself. You write a `task` that calls your own
client and reports usage via `ctx.report`. The examples include a ready-made
OpenRouter helper ([`examples/openrouter-caller.ts`](examples/openrouter-caller.ts))
— copy it or write your own. To run them, set its key:

```bash
cp .env.example .env   # then fill in OPENROUTER_API_KEY
```

## Quickstart

```ts
import { z } from 'zod'
import { evaluate, scorer } from 'mini-eval'
import { callModel } from './openrouter-caller.js' // your model call — see examples/

const Shipment = z.object({ state: z.string(), zip: z.string().nullable() })
type Shipment = z.infer<typeof Shipment>

const zip = scorer<string, Shipment, Partial<Shipment>>('zip', ({ output, expected }) => {
  if (expected?.zip == null) return null // not applicable → excluded from the mean
  return output.zip === expected.zip ? 1 : { score: 0, reason: `got ${output.zip}` }
})

const report = await evaluate<string, Shipment, Partial<Shipment>>('extraction', {
  models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku'],
  data: [{ input: 'PO Box 42, Reno NV 89501', expected: { state: 'NV', zip: '89501' }, tags: ['po_box'] }],
  scorers: [zip],
  task: async (text, ctx) => {
    const { value, usage } = await callModel<Shipment>(ctx.model, `Extract the shipment fields from:\n${text}`, Shipment)
    ctx.report(usage) // counts as task spend
    return value
  },
})

report.byModel['openai/gpt-4o-mini'].overall // → number in [0,1]
```

`ctx.model` is the model currently being swept; the task routes its own call to
it. For a multi-call pipeline plus a judge, see
[`examples/rate-shopping.eval.ts`](examples/rate-shopping.eval.ts):

```ts
import type { Task } from 'mini-eval'

const task: Task<RateRequest, Decision> = async (input, ctx) => {
  const extracted = await callModel(ctx.model, extractPrompt(input), Quotes)
  ctx.report(extracted.usage)
  const shortlist = extracted.value.quotes.filter(q => q.etaDays <= 5).sort((a, b) => a.priceUsd - b.priceUsd)
  const decision = await callModel(ctx.model, choosePrompt(shortlist), DecisionSchema)
  ctx.report(decision.usage)
  return decision.value
}

// a judge is just a scorer that calls a model — on a pinned model, so it doesn't
// move across the sweep; report its usage to count it as judge spend
const judge = scorer<RateRequest, Decision, Expected>('judge', async ({ output, report }) => {
  const { value: v, usage } = await callModel('anthropic/claude-3.5-sonnet', `…${JSON.stringify(output)}`, Verdict)
  report(usage)
  return v.ok ? 1 : { score: 0, reason: v.reason }
})
```

## Run the examples

```bash
npm run typecheck             # tsc --noEmit, strict
npm run example:extraction    # a one-call task
npm run example:rate-shopping # multi-call task + judge
```

The examples make real model calls, so they need `OPENROUTER_API_KEY`.

## API

### `evaluate(name, config)`

```ts
evaluate<I, O, E>(name: string, config: EvalConfig<I, O, E>): Promise<EvalReport<O>>
```

Sweeps `config.models`, runs the task per case, scores the output, and returns
the report. A case whose task throws is recorded with `output: null` and never
aborts the run; a scorer that throws scores 0 with the error in its `reason`.

**`EvalConfig<I, O, E>`**

| field     | type                                      | notes                                    |
| --------- | ----------------------------------------- | ---------------------------------------- |
| `data`    | `Case<I, E>[]` or `() => Promise<Case[]>` | test cases, or an async factory          |
| `scorers` | `Scorer<I, O, E>[]`                       | one or more scorers                      |
| `models`  | `string[]`                                | the swept comparison axis (at least one) |
| `task`    | `Task<I, O>`                              | the system under test                    |

(`concurrency` and `baseline` are also accepted but not yet honored — see below.)
A `Case<I, E>` is `{ input: I; expected?: E; tags?: string[] }`; `expected` and
`tags` are optional, so a case can assert just one field and stay silent on the rest.

**`Task<I, O>`**

```ts
type Task<I, O> = (input: I, ctx: { model: string; report: (usage: Usage) => void }) => Promise<O>
```

The task calls your model client against `ctx.model` and calls `ctx.report(usage)`
per call (counts as task spend). `Usage` is `{ inputTokens, outputTokens, costUsd? }`.

**`EvalReport<O>`**

```ts
{
  name: string
  byModel: {
    [model: string]: {
      overall: number                              // mean case score
      byTag: Record<string, number>                // mean score per tag
      cost: { taskUsd: number; judgeUsd: number }  // summed from reported usage
      latency: { p50Ms: number; p95Ms: number }    // task wall-clock
      cases: CaseResult<O>[]
    }
  }
}
```

### `scorer(name, run, opts?)`

```ts
scorer<I, O, E>(name: string, run: (ctx) => ScoreValue | Promise<ScoreValue>, opts?: { weight?: number })
```

`run` receives `{ input, output, expected, tags, report }` and returns a
`ScoreValue`:

```ts
type ScoreValue =
  | number // score in [0,1]
  | { score: number; reason?: string } // score + why it scored low
  | null // not applicable — excluded from the case's weighted mean
```

`weight` (default `1`) sets how much the scorer counts in the case's weighted
mean. A scorer that calls a model is a judge — there is no separate judge
concept; report its usage via `ctx.report` to count it as judge spend.

### Other exports

`aggregate`, `loadBaseline`, `gate`, and the types (`Case`, `Scorer`, `Task`,
`Usage`, `EvalConfig`, `EvalReport`, …). See [`src/types.ts`](src/types.ts) for
the full set.

## Not yet implemented

- **`gate` / `loadBaseline`** — baseline comparison for CI gating.
- **`concurrency`** — accepted in config but not honored; cases run serially.

## License

MIT — see [LICENSE](LICENSE).
