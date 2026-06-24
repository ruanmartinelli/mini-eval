# mini-eval

A tiny, code-first framework for evaluating LLM-powered systems. Hand it your
system as a function plus some scorers; it sweeps models, runs every case, scores
the output, and returns a report.

## Install

```bash
npm install
```

## Quickstart

The smallest thing that works: give `evaluate` a `schema` and a `prompt` and it
builds the one-call task for you.

```ts
import { z } from 'zod'
import { evaluate, scorer } from 'mini-eval'
import { openrouterCaller } from './openrouter-caller.js' // a GenerateImpl — see examples/

const Shipment = z.object({ state: z.string(), zip: z.string().nullable() })
type Shipment = z.infer<typeof Shipment>

const zip = scorer<string, Shipment, Partial<Shipment>>('zip', ({ output, expected }) => {
  if (expected?.zip == null) return null // not applicable → excluded from the mean
  return output.zip === expected.zip ? 1 : { score: 0, reason: `got ${output.zip}` }
})

const report = await evaluate<string, Shipment, Partial<Shipment>>('extraction', {
  models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku'],
  generate: openrouterCaller,
  schema: Shipment,
  prompt: text => `Extract the shipment fields from:\n${text}`,
  data: [
    { input: 'PO Box 42, Reno NV 89501', expected: { state: 'NV', zip: '89501' }, tags: ['po_box'] },
  ],
  scorers: [zip],
})

report.byModel['openai/gpt-4o-mini'].overall // → number in [0,1]
```

For a full pipeline (multiple model calls + a judge), see
[`examples/rate-shopping.eval.ts`](examples/rate-shopping.eval.ts):

```ts
import type { Task } from 'mini-eval'

const task: Task<RateRequest, Decision> = async (input, ctx) => {
  const { quotes } = await ctx.generate({ prompt: extractPrompt(input), schema: Quotes })
  const shortlist = quotes.filter(q => q.etaDays <= 5).sort((a, b) => a.priceUsd - b.priceUsd)
  return ctx.generate({ prompt: choosePrompt(shortlist), schema: DecisionSchema })
}

// a judge is just a scorer that calls a model — pin its `model` so it doesn't
// move across the sweep
const judge = scorer<RateRequest, Decision, Expected>('judge', async ({ output, generate }) => {
  const v = await generate({ model: 'anthropic/claude-3.5-sonnet', schema: Verdict, prompt: `…${JSON.stringify(output)}` })
  return v.ok ? 1 : { score: 0, reason: v.reason }
})
```

## Run the examples

```bash
npm run typecheck            # tsc --noEmit, strict
npm run example:extraction   # tier one: schema + prompt
npm run example:rate-shopping # tier two: custom task + judge
```

The examples make real model calls, so they need `OPENROUTER_API_KEY`.

## API

### `evaluate(name, config)`

```ts
evaluate<I, O, E>(name: string, config: EvalConfig<I, O, E>): Promise<EvalReport<O>>
```

Sweeps `config.models`, runs the task per case, scores the output, and returns
the report. A case whose task throws is recorded with `output: null` and never
aborts the run.

**`EvalConfig<I, O, E>`**

| field         | type                                         | notes                                                      |
| ------------- | -------------------------------------------- | ---------------------------------------------------------- |
| `data`        | `Case<I, E>[]` or `() => Promise<Case[]>`     | test cases, or an async factory                            |
| `scorers`     | `Scorer<I, O, E>[]`                           | one or more scorers                                        |
| `generate`    | `GenerateImpl`                                | **required** — your model caller (see examples)            |
| `models`      | `string[]`                                    | the swept comparison axis                                  |
| `task`        | `Task<I, O>`                                  | the system under test; omit to use `schema` + `prompt`     |
| `schema`      | `ZodType<O>`                                  | output schema for the built-in one-call task               |
| `prompt`      | `(input: I) => string`                        | prompt builder for the built-in one-call task              |

A `Case<I, E>` is `{ input: I; expected?: E; tags?: string[] }`. `expected` and
`tags` are optional — a case can assert just one field and stay silent on the
rest.

**`EvalReport<O>`**

```ts
{
  name: string
  byModel: {
    [model: string]: {
      overall: number                       // mean case score
      byTag: Record<string, number>         // mean score per tag
      cost: { taskUsd: number; judgeUsd: number }
      latency: { p50Ms: number; p95Ms: number }
      cases: CaseResult<O>[]
    }
  }
}
```

### `scorer(name, run, opts?)`

```ts
scorer<I, O, E>(name: string, run: (ctx) => ScoreValue | Promise<ScoreValue>, opts?: { weight?: number })
```

`run` receives `{ input, output, expected, tags, generate }` and returns a
`ScoreValue`:

```ts
type ScoreValue =
  | number                          // score in [0,1]
  | { score: number; reason?: string }  // score + why it scored low
  | null                            // not applicable — excluded from the case's weighted mean
```

`weight` (default `1`) sets how much the scorer counts in the case's weighted
mean. A scorer that calls `ctx.generate` is a judge — there is no separate judge
concept.

### `ctx.generate(args)`

The instrumented model caller injected into tasks and scorers:

```ts
ctx.generate<T>({ prompt: string; schema?: ZodType<T>; model?: string; temperature?: number }): Promise<T>
```

Omit `model` to use the swept model; pass one to pin it (e.g. a judge). With a
`schema`, the result is validated to `T`; without one, it's the model's text.

### Other exports

`instrument`, `aggregate`, `loadBaseline`, `gate`, and the types (`Case`,
`Scorer`, `Task`, `EvalConfig`, `EvalReport`, …). See [`src/types.ts`](src/types.ts)
for the full set.

## Not yet implemented

- **`gate` / `loadBaseline`** — baseline comparison for CI gating.
- **Cost & latency** — plumbed through but not yet accumulated, so they read as
  zero.
- **`concurrency`** — accepted in config but not honored; cases run serially.

## License

MIT — see [LICENSE](LICENSE).
