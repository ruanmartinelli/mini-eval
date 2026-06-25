import type { Scorer } from './types.js'

/**
 * Build a {@link Scorer} from a scoring function.
 *
 * @param name scorer name, shown in the report.
 * @param run  the scoring function; may be sync or async.
 * @param opts optional settings; `weight` defaults to 1 and must be > 0.
 * @returns the scorer.
 */
export function scorer<I, O, E>(name: string, run: Scorer<I, O, E>['run'], opts?: { weight?: number }): Scorer<I, O, E> {
  return { name, run, weight: opts?.weight }
}
