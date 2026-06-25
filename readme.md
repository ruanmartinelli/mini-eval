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
import { evaluate, scorer } from 'mini-eval'

const task = () => { /* ... */ }
const zip = scorer(/* ... */)

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

console.log(report) // { byModel: { 'openai/gpt-4o-mini': { ... } }
```

## API

### `evaluate(name, config)`

Sweeps every model, runs the task per case, scores the output, and resolves to a report.

```ts
evaluate<I, O, E>(name: string, config: EvalConfig<I, O, E>): Promise<EvalReport<O>>
```

`EvalConfig<I, O, E>`:

| field         | type                                          | notes                       |
| ------------- | --------------------------------------------- | --------------------------- |
| `data`        | `Case<I, E>[]` or `() => Promise<Case[]>`     | test cases, or an async factory |
| `scorers`     | `Scorer<I, O, E>[]`                           | one or more scorers         |
| `models`      | `string[]`                                    | swept comparison axis; at least one |
| `task`        | `Task<I, O>`                                  | the system under test       |
| `concurrency` | `number`                                      | accepted, not yet honored   |
| `baseline`    | `string`                                      | accepted, not yet honored   |

A `Case<I, E>` is `{ input: I; expected?: E; tags?: string[] }` — `expected` and
`tags` are optional, so a case can pin just one field and stay silent on the rest.

### `scorer(name, run, opts?)`

Builds a named scorer. `run` is called once per case and may be sync or async.

```ts
scorer<I, O, E>(
  name: string,
  run: (ctx: ScorerCtx<I, O, E>) => ScoreValue | Promise<ScoreValue>,
  opts?: { weight?: number },   // relative weight in the case mean; default 1
): Scorer<I, O, E>
```

`run` receives `ScorerCtx` `{ input, output, expected?, tags, report }` and returns a `ScoreValue`:

```ts
type ScoreValue =
  | number                              // score in [0,1]
  | { score: number; reason?: string } // score + why it scored low
  | null                                // not applicable — excluded from the case mean
```

A scorer that calls a model is a judge — `report` its usage to count it as judge spend.

### `Task<I, O>`

The system under test: maps an input to an output via one or more model calls.
Route your call to `ctx.model`, and `ctx.report(usage)` each call to count it as task spend.

```ts
type Task<I, O> = (input: I, ctx: TaskCtx) => Promise<O>

type TaskCtx = { model: string; report: (usage: Usage) => void }
type Usage = { inputTokens: number; outputTokens: number; costUsd?: number }
```

### `EvalReport<O>`

Keyed by model id, so you can diff models on the same axes.

```ts
type EvalReport<O> = { name: string; byModel: Record<string, ModelReport<O>> }
```

`ModelReport<O>`:

| field     | type                              | notes                          |
| --------- | --------------------------------- | ------------------------------ |
| `overall` | `number`                          | mean case score                |
| `byTag`   | `Record<string, number>`          | mean score per tag             |
| `cost`    | `{ taskUsd, judgeUsd }`           | summed from reported usage     |
| `latency` | `{ p50Ms, p95Ms }`                | task wall-clock percentiles    |
| `cases`   | `CaseResult<O>[]`                 | per-case detail                |

`CaseResult<O>`:

| field       | type                                                          | notes                              |
| ----------- | ------------------------------------------------------------ | ---------------------------------- |
| `tags`      | `string[]`                                                   | the case's tags                    |
| `output`    | `O \| null`                                                 | `null` if the task threw           |
| `score`     | `number`                                                     | weighted mean over applicable scorers |
| `scores`    | `Array<{ name, score, weight, reason }>`                     | per-scorer breakdown               |
| `usage`     | `{ task: Usage; judge: Usage }`                             | task and judge spend, kept separate |
| `latencyMs` | `number`                                                     | task wall-clock latency            |

## License

[MIT](LICENSE).
