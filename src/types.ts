/** mini-eval — public type definitions. */

/** One test case. */
export type Case<I, E> = {
  /** Value passed to the task. */
  input: I;
  /** Partial assertion of the correct output; a case may pin just one field. */
  expected?: E;
  /** Labels used to slice the report by tag. */
  tags?: string[];
};

/**
 * A scorer's verdict for one case: a number in [0,1], a score with a reason, or
 * `null` for not-applicable (excluded from the case's weighted mean).
 */
export type ScoreValue = number | { score: number; reason?: string } | null;

/** Token accounting for a single model call, plus dollar cost if the caller knows it. */
export type Usage = { inputTokens: number; outputTokens: number; costUsd?: number };

/** Context passed to a {@link Task}. */
export type TaskCtx = {
  /** The swept model for this run; the task routes its own call to it. */
  model: string;
  /** Report a model call's usage; counts toward task spend. */
  report: (usage: Usage) => void;
};

/** The system under test: maps an input to an output via one or more model calls. */
export type Task<I, O> = (input: I, ctx: TaskCtx) => Promise<O>;

/** Context passed to a {@link Scorer}'s `run`. */
export type ScorerCtx<I, O, E> = {
  /** The case input. */
  input: I;
  /** The task output. */
  output: O;
  /** The case's expected assertion, if any. */
  expected?: E;
  /** The case's tags. */
  tags: string[];
  /** Report a judge's model-call usage; counts toward judge spend. */
  report: (usage: Usage) => void;
};

/** A named scoring function with an optional weight. */
export type Scorer<I, O, E> = {
  /** Scorer name, shown in the report. */
  name: string;
  /** Relative weight in the case's weighted mean. Default 1; must be > 0. */
  weight?: number;
  /** Scores one case; may be sync or async. */
  run: (ctx: ScorerCtx<I, O, E>) => ScoreValue | Promise<ScoreValue>;
};

/** Configuration passed to `evaluate`. */
export type EvalConfig<I, O, E> = {
  /** Test cases, or an async factory that produces them. */
  data: Case<I, E>[] | (() => Promise<Case<I, E>[]>);
  /** Scorers applied to each case. */
  scorers: Scorer<I, O, E>[];
  /** Models to sweep — at least one. */
  models: string[];
  /** The system under test. */
  task: Task<I, O>;
  /** Max concurrent cases. Not yet honored; cases run serially. */
  concurrency?: number;
  /** Path to a baseline report for gating. Not yet honored. */
  baseline?: string;
};

/** The result for one case under one model. */
export type CaseResult<O> = {
  /** The case's tags. */
  tags: string[];
  /** The task output, or `null` if the task threw. */
  output: O | null;
  /** Weighted mean over applicable (non-`null`) scorers. */
  score: number;
  /** Per-scorer breakdown. */
  scores: Array<{ name: string; score: number; weight: number; reason: string }>;
  /** Usage reported by the task and by judges, kept separate. */
  usage: { task: Usage; judge: Usage };
  /** Task wall-clock latency, in milliseconds. */
  latencyMs: number;
};

/** The aggregated report for one model. */
export type ModelReport<O> = {
  /** Mean case score. */
  overall: number;
  /** Mean score per tag. */
  byTag: Record<string, number>;
  /** Total task and judge spend, summed from reported usage. */
  cost: { taskUsd: number; judgeUsd: number };
  /** Per-case latency percentiles, in milliseconds. */
  latency: { p50Ms: number; p95Ms: number };
  /** Per-case results. */
  cases: CaseResult<O>[];
};

/** The full report returned by `evaluate`, keyed by model id. */
export type EvalReport<O = unknown> = {
  /** The eval name. */
  name: string;
  /** Per-model reports, keyed by model id. */
  byModel: Record<string, ModelReport<O>>;
};
