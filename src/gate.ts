import type { EvalReport } from "./types.js";

/**
 * Read and parse a saved {@link EvalReport} from `path`, for use as a gating
 * baseline. Not yet implemented.
 *
 * @param path filesystem path to a saved report.
 * @returns the parsed report.
 */
export async function loadBaseline(path: string): Promise<EvalReport> {
  void path;
  throw new Error("TODO: implement");
}

/**
 * Compare a fresh report against a baseline and report any regressions. Not yet
 * implemented.
 *
 * @param report   the fresh report from `evaluate`.
 * @param baseline the report to compare against.
 * @param opts     `byTag` to also gate on per-tag scores.
 * @returns `{ ok, regressions }` — `ok: false` lists every regression found.
 */
export function gate(
  report: EvalReport,
  baseline: EvalReport,
  opts?: { byTag?: boolean },
): { ok: boolean; regressions: string[] } {
  void report;
  void baseline;
  void opts;
  throw new Error("TODO: implement");
}
