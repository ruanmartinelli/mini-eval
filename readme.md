# mini-eval

A tiny, code-first framework for evaluating LLM-powered systems.

## Install

```bash
npm install mini-eval
```

## Quickstart

### 1. Create a scorer

A scorer is a function that takes an input, output, and expected output, and returns a score.

```ts
import { scorer } from 'mini-eval'

type Address = { zip: string }

const zip = scorer<string, Address, Partial<Address>>('zip', ({ output, expected }) => {
  if (expected?.zip == null) return null
  if (output.zip === expected.zip) return 1
  return { score: 0, reason: `got ${output.zip}` }
})
```

The score value is a number in [0,1], a `{ score, reason }` object, or `null` to skip the case (not applicable).

### 2. Create a task

A task is the function that calls the model and returns the output.

```ts
import { Task } from 'mini-eval'

const task: Task<string, Address> = async (input, ctx) => {
  const model = ctx.model
  const prompt = `Extract the shipment fields from:\n${input}`

  // AI SDK, OpenRouter, etc. to call the model
  const { value, usage } = await callModel({ model, prompt })

  // Optional: report usage to count it as task spend
  ctx.report(usage)

  return value
}
```

### 3. Run the evaluation

An evaluation is a function that takes a name and a configuration, and returns a report.

```ts
import { evaluate } from 'mini-eval'

const task = /* ... */
const zip = /* ... */

const models = ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku']
const scorers = [zip]

const report = await evaluate<string, Address, Partial<Address>>('extraction', {
  models,
  scorers,
  task,
  // Test cases
  data: [
    {
      input: 'PO Box 42, Reno NV 89501',
      expected: { zip: '89501' },
      tags: ['po_box'],
    },
  ],
})

report.byModel['openai/gpt-4o-mini']?.overall // → number in [0,1]
```

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
