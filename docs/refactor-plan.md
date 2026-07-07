# Proposal: mini-eval v0.2 — runner, persistence, and reporting

Status: **proposal** — nothing in this document is implemented by this PR.
It exists to be argued with; each phase is a small, independently mergeable PR.

## Where we are

The core loop works and is well tested: `evaluate` sweeps models, runs the
task per case, scores with weighted scorers, tracks usage/cost/latency, and
`renderHtml` produces a clean single-file report. A first batch of small PRs
(gate implementation, concurrency, task-error capture, latency in the report)
fills the most visible gaps.

What's still missing shows up the moment you use mini-eval in a real loop —
"run the eval in CI on every prompt change and fail on regressions":

- A saved report carries no version. `parseReport` (#5) checks the basic
  shape, but a baseline produced by an older, incompatible report shape
  would gate against garbage instead of failing loudly.
- `evaluate` is silent while it runs. A 5-model × 50-case sweep of a slow
  task gives no feedback until it returns.
- One hung model call hangs the whole eval; one flaky 429 scores a case 0.
- The HTML report shows aggregates only. The first question after "the score
  dropped" is "*which case*" — and the report can't answer it.
- `EvalConfig.baseline` is accepted and ignored, and it's not obvious it
  should ever be honored (see phase 2).

## Principles (unchanged from v0.1)

1. **Tiny.** Zero runtime dependencies; a handful of small files.
2. **Code-first.** No YAML, no DSL, no magic discovery. The eval is a script.
3. **Pure core — the library never imports `node:fs`.** `evaluate`,
   `renderHtml`, `gate`, and `parseReport` all work on in-memory values and
   strings; reading and writing files is entirely the caller's job.

## Phases

### Phase 1 — versioned serialization: `serializeReport` + a stricter `parseReport`

The report is the artifact everything else (gating, diffing, history) hangs
off, so make its serialized form versioned — while staying fs-free
(principle 3); the caller keeps writing and reading the file:

```ts
type SerializedReport = EvalReport & {
  schemaVersion: 1
  savedAt: string        // ISO timestamp
  version: string        // mini-eval version that produced it
}

serializeReport(report: EvalReport, opts?: { slim?: boolean }): string
// parseReport learns to check schemaVersion when present (and stays
// lenient about a bare EvalReport, for hand-rolled baselines)
```

```ts
writeFileSync('baseline.json', serializeReport(report))
const baseline = parseReport(readFileSync('baseline.json', 'utf8'))
```

- `schemaVersion` lets future shape changes fail loudly instead of gating
  against garbage.
- Case outputs can be large; `{ slim: true }` strips `output` from cases,
  keeping scores/reasons/usage.

Small, fully pure, unblocks everything below.

### Phase 2 — retire `EvalConfig.baseline`

Two options for the accepted-but-ignored `baseline` option:

- **(a) Wire it up**: `evaluate` loads the baseline, gates, and… then what?
  Throw? Attach `{ gate: { ok, regressions } }` to the report? Either way
  `evaluate` grows I/O, policy (tolerance? byTag?), and a second
  responsibility.
- **(b) Drop it** and bless the explicit three-liner:

  ```ts
  const report = await evaluate('extraction', config)
  const baseline = parseReport(readFileSync('baseline.json', 'utf8'))
  const { ok, regressions } = gate(report, baseline, { tolerance: 0.02 })
  if (!ok) { console.error(regressions.join('\n')); process.exit(1) }
  ```

**Recommendation: (b).** It keeps `evaluate` pure (principle 3), and the
explicit version is exactly as long as the config option while being more
flexible. Deprecate the field in v0.1.x (doc comment), remove in v0.2.

### Phase 3 — progress hooks

One optional callback, called after each case settles:

```ts
type Progress<O> = {
  model: string
  caseIndex: number      // index into data
  totalCases: number
  result: CaseResult<O>
}

// in EvalConfig:
onProgress?: (p: Progress<O>) => void
```

- Enough to build a progress bar, a live cost ticker, or structured logs.
- Deliberately *not* an event-emitter/plugin system: one callback, fire-and-
  forget, errors in it are swallowed. If someone needs more, that's a sign
  it should be a wrapper, not core.

### Phase 4 — timeouts and retries per task call

The two failure modes that actually happen mid-eval: a hung call and a
transient 429/500.

```ts
// in EvalConfig:
timeoutMs?: number   // per task call; a timeout records error: 'timeout after Nms'
retries?: number     // re-run a *thrown* task up to N times; last error wins
```

- Timeout applies to the task, not scorers (a judge scorer already degrades
  to `score: 0, reason: 'scorer threw: …'`).
- Retries only re-run thrown tasks — never re-score a case that returned.
- Usage reported by failed attempts still accumulates (you paid for it).
- Implementation stays inside `runCase`; no new files.

### Phase 5 — per-case drill-down in the HTML report

The report answers "which model"; make it answer "which case". Under the
existing sections, add a per-model `<details>` block with a case table:

- columns: case # · tags · score · per-scorer chips (score + reason on
  hover) · error (if the task threw) · latency · cost
- inputs/outputs rendered as truncated `JSON.stringify` with a `<details>`
  expander — the report stays a single self-contained file with no JS
  beyond what `<details>` gives us for free.
- Sort worst-first: failing cases are what you opened the report to find.

This is the highest-leverage UX change and pairs with the `error` field from
the current PR batch.

### Phase 6 (optional, probably not) — CLI

A `mini-eval` bin (`run`, `--baseline`, `--html out.html`) is tempting but
every eval is already a runnable script, and a CLI drags in arg parsing,
config resolution, and TS execution questions (tsx? node --strip-types?).
**Suggestion: skip it** until the script pattern demonstrably falls short;
if it happens, it's a separate package (`mini-eval-cli`) so the library keeps
zero dependencies.

## Sequencing & size

| phase | change                        | size | depends on |
| ----- | ----------------------------- | ---- | ---------- |
| 1     | serializeReport + versioned parseReport | S | #5     |
| 2     | retire `config.baseline`      | XS   | 1          |
| 3     | `onProgress` hook             | S    | —          |
| 4     | `timeoutMs` / `retries`       | M    | —          |
| 5     | HTML per-case drill-down      | M    | error field (#7) |
| 6     | CLI                           | —    | skipped    |

Phases 1+2, 3, 4, and 5 are each one PR. Nothing here breaks the public API
except the (deprecated-first) removal of `EvalConfig.baseline`; everything
else is additive, so this can all ship as v0.2.

## Non-goals

- Plugin/reporter systems, event emitters, middleware.
- Built-in model callers or provider SDKs — the task owns its own calls.
- Dataset management, storage backends, dashboards.
- Statistical machinery (confidence intervals, significance tests). Worth a
  thought someday; not while the report is still growing basic affordances.

## Open questions

1. Phase 2: comfortable removing `config.baseline`, or would you rather wire
   it up? (The plan argues for removal, but it's your API.)
2. Phase 4: should retried attempts be visible in the report (e.g.
   `attempts: 2` on the case), or is the final result enough?
3. Phase 5: cap the number of cases rendered (e.g. worst 50) to keep huge
   reports openable, or render everything?
