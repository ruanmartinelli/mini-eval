/** mini-eval — public API. */

export { evaluate } from "./evaluate.js";
export { scorer } from "./scorer.js";

export { aggregate } from "./aggregate.js";
export { loadBaseline, gate } from "./gate.js";

export type {
  Case,
  ScoreValue,
  Usage,
  TaskCtx,
  Task,
  ScorerCtx,
  Scorer,
  EvalConfig,
  CaseResult,
  ModelReport,
  EvalReport,
} from "./types.js";
