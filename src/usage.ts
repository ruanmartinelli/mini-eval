import { Usage } from './types.js'

/**
 * Accumulate a reported call's usage into a running total.
 *
 * @param usage - The usage to accumulate.
 * @returns The accumulated usage.
 */
export function report(acc: Usage, usage: Usage) {
  acc.inputTokens += usage.inputTokens
  acc.outputTokens += usage.outputTokens
  if (usage.costUsd != null) acc.costUsd = (acc.costUsd ?? 0) + usage.costUsd
}
