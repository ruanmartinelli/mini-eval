# mini-eval

A tiny library for evaluating LLM-powered systems.

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

| option        | type                                      | notes                              |
| ------------- | ----------------------------------------- | ---------------------------------- |
| `data`        | `Case<I, E>[]` or `() => Promise<Case[]>` | test cases, or an async factory    |
| `scorers`     | `Scorer<I, O, E>[]`                       | one or more scorers                |
| `models`      | `string[]`                                | models to sweep; at least one      |
| `task`        | `Task<I, O>`                              | the system under test              |
| `concurrency` | `number`                                  | optional; accepted, not yet honored |
| `baseline`    | `string`                                  | optional; accepted, not yet honored |

### `scorer(name, run, opts?)`

Builds a named scorer. `run` is called once per case and may be sync or async.

```ts
scorer<I, O, E>(name: string, run, opts?: { weight?: number }): Scorer<I, O, E>
```

| param         | type                                          | notes                                                                |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `name`        | `string`                                      | scorer name, shown in the report                                     |
| `run`         | `(ctx) => ScoreValue \| Promise<ScoreValue>`  | scores one case; returns a number in [0,1], `{ score, reason }`, or `null` to skip |
| `opts.weight` | `number`                                      | optional; relative weight in the case mean (default 1)               |

A scorer that calls a model is a judge: report its usage to count it as judge spend.

### `renderHtml(report)`

Renders a report as a self-contained HTML page. Returns the HTML as a string.

```ts
renderHtml(report: EvalReport): string
```

```ts
import { evaluate, renderHtml } from 'mini-eval'
import { writeFileSync } from 'node:fs'

const report = await evaluate('extraction', { /* ... */ })
writeFileSync('report.html', renderHtml(report))
```

## License

[MIT](LICENSE).
