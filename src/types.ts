import type { ZodType } from "zod";

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

/** Arguments for a model call. */
export type GenerateArgs<T> = {
  /** Prompt text. */
  prompt: string;
  /** When present, the result is validated to `T`. */
  schema?: ZodType<T>;
  /** Model id; omit to use the swept model, pass to pin it (e.g. a judge). */
  model?: string;
  /** Sampling temperature. */
  temperature?: number;
};

/** Token accounting for a single model call, plus dollar cost if the caller reports it. */
export type Usage = { inputTokens: number; outputTokens: number; costUsd?: number };

/**
 * A model caller that returns the value plus usage. Supplied per eval via
 * `EvalConfig.generate`; see the examples for one built on OpenRouter.
 */
export type GenerateImpl = <T>(args: GenerateArgs<T>) => Promise<{ value: T; usage?: Usage }>;

/**
 * The instrumented caller injected into tasks and scorers. Returns the value and
 * records usage behind the scenes.
 */
export type GenerateFn = <T>(args: GenerateArgs<T>) => Promise<T>;

/** Context passed to a {@link Task}. */
export type TaskCtx = {
  /** The swept model for this run. */
  model: string;
  /** Instrumented model caller. */
  generate: GenerateFn;
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
  /** Model caller, so a scorer can act as a judge. */
  generate: GenerateFn;
};

/** A named scoring function with an optional weight. */
export type Scorer<I, O, E> = {
  /** Scorer name, shown in the report. */
  name: string;
  /** Relative weight in the case's weighted mean. Default 1. */
  weight?: number;
  /** Scores one case; may be sync or async. */
  run: (ctx: ScorerCtx<I, O, E>) => ScoreValue | Promise<ScoreValue>;
};

/**
 * Configuration passed to `evaluate`. Provide a `task`, or `schema` + `prompt`
 * to build the one-call task.
 */
export type EvalConfig<I, O, E> = {
  /** Test cases, or an async factory that produces them. */
  data: Case<I, E>[] | (() => Promise<Case<I, E>[]>);
  /** Scorers applied to each case. */
  scorers: Scorer<I, O, E>[];
  /** Model caller; see the examples for one built on OpenRouter. */
  generate: GenerateImpl;
  /** Models to sweep. */
  models?: string[];
  /** The system under test; omit to use `schema` + `prompt`. */
  task?: Task<I, O>;
  /** Output schema for the built-in one-call task. */
  schema?: ZodType<O>;
  /** Prompt builder for the built-in one-call task. */
  prompt?: (input: I) => string;
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
  /** Token/cost usage, split into task and judge spend. */
  usage: { task: Usage; judge: Usage };
};

/** The aggregated report for one model. */
export type ModelReport<O> = {
  /** Mean case score. */
  overall: number;
  /** Mean score per tag. */
  byTag: Record<string, number>;
  /** Total task and judge spend. */
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
